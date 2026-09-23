import { randomBytes } from "node:crypto";
import { ensureSchema, query } from "@/lib/pg";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  formatDisplayPhone,
  normalizeEmail,
  normalizePhoneDigits,
} from "@/lib/auth/identifiers";
import {
  NEUTRAL_CITIZEN_SETTINGS,
  normalizeCitizenSettings,
  renderableAvatarUrl,
} from "@/lib/citizenSettings";
import type { CitizenProfileSettings } from "@/types/civic";

/* Server-only Neon store for citizen accounts (`citizen_users`).

   Identity lives in columns — email, phone, name, district are credentials and
   attribution data, and they are what the unique indexes guard. Everything the
   citizen tweaks in /settings that is NOT identity lives in the `settings`
   JSONB document, so the two can never drift out of agreement: reads overlay
   the columns on top of the document, writes split it back apart. */

export interface CitizenUser {
  id: string;
  email: string;
  /** Display form on file for crews: "+92 300 1234567". */
  phone: string;
  /** Canonical 10 local digits; "" when the account has no phone. */
  phoneDigits: string;
  name: string;
  district: string;
  /** Cloudinary CDN URL of the portrait; "" for the initials monogram. */
  avatarUrl: string;
  emailVerified: boolean;
  createdAt: string;
}

/** Raised for an email or phone that already belongs to an account. The route
    turns this into a 409 — it must never leak which identifier matched, so
    callers get one generic conflict message. */
export class DuplicateContactError extends Error {
  constructor() {
    super("An account already uses those details.");
    this.name = "DuplicateContactError";
  }
}

/** Node-postgres surfaces a unique-index violation as a coded error; only the
    two contact indexes are treated as a conflict. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

function mintUserId(): string {
  return `cit_${randomBytes(9).toString("hex")}`;
}

interface UserRow {
  id: string;
  email: string;
  phone: string;
  phone_digits: string;
  name: string;
  district: string;
  avatar_url: string;
  email_verified: boolean;
  created_at: Date | string;
}

const USER_COLUMNS = `id, email, phone, phone_digits, name, district, avatar_url,
  email_verified, created_at`;

function rowToUser(row: UserRow): CitizenUser {
  const created = row.created_at;
  return {
    id: String(row.id),
    email: String(row.email),
    phone: String(row.phone ?? ""),
    phoneDigits: String(row.phone_digits ?? ""),
    name: String(row.name ?? ""),
    district: String(row.district ?? ""),
    avatarUrl: String(row.avatar_url ?? ""),
    emailVerified: row.email_verified === true,
    createdAt:
      created instanceof Date ? created.toISOString() : String(created ?? ""),
  };
}

async function selectUser(
  clause: string,
  args: readonly unknown[],
): Promise<CitizenUser | null> {
  await ensureSchema();
  const rows = await query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM citizen_users WHERE ${clause} LIMIT 1`,
    args,
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

export function getCitizenUserById(id: string): Promise<CitizenUser | null> {
  return selectUser("id = $1", [id]);
}

export function getCitizenUserByEmail(email: string): Promise<CitizenUser | null> {
  return selectUser("lower(email) = $1", [normalizeEmail(email)]);
}

export function getCitizenUserByPhone(
  phone: string,
): Promise<CitizenUser | null> {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return Promise.resolve(null);
  return selectUser("phone_digits = $1", [digits]);
}

/** Sign-in accepts either identifier, so the route does not have to guess
    which one the citizen typed. */
export async function findCitizenUserByIdentifier(
  identifier: string,
): Promise<CitizenUser | null> {
  const value = identifier.trim();
  if (value.includes("@")) return getCitizenUserByEmail(value);
  return getCitizenUserByPhone(value);
}

export interface NewCitizenUser {
  name: string;
  email: string;
  /** Raw phone in any accepted spelling; canonicalised here. */
  phone: string;
  district: string;
  password: string;
}

export async function createCitizenUser(
  input: NewCitizenUser,
): Promise<CitizenUser> {
  const email = normalizeEmail(input.email);
  const phoneDigits = normalizePhoneDigits(input.phone);
  const passwordHash = await hashPassword(input.password);
  await ensureSchema();

  const id = mintUserId();
  try {
    await query(
      `INSERT INTO citizen_users
         (id, email, phone, phone_digits, name, district, password_hash, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        id,
        email,
        phoneDigits ? formatDisplayPhone(phoneDigits) : "",
        phoneDigits,
        input.name.trim().slice(0, 120),
        input.district.trim().slice(0, 80),
        passwordHash,
        JSON.stringify({ ...NEUTRAL_CITIZEN_SETTINGS, id }),
      ],
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateContactError();
    throw error;
  }
  const user = await getCitizenUserById(id);
  if (!user) throw new Error("Account could not be read back after creation.");
  return user;
}

/** Returns the account on a matching password, null otherwise. A missing
    account still pays a scrypt round (against a throwaway hash) so response
    timing does not tell an attacker whether the identifier is registered. */
export async function authenticateCitizenUser(
  identifier: string,
  password: string,
): Promise<CitizenUser | null> {
  const user = await findCitizenUserByIdentifier(identifier);
  if (!user) {
    await hashPassword(password);
    return null;
  }
  await ensureSchema();
  const rows = await query<{ password_hash: string }>(
    "SELECT password_hash FROM citizen_users WHERE id = $1 LIMIT 1",
    [user.id],
  );
  const stored = rows[0]?.password_hash;
  if (!stored) return null;
  return (await verifyPassword(password, stored)) ? user : null;
}

/** The full settings document for a signed-in citizen: stored preferences with
    the authoritative identity columns overlaid, so email/phone/name/district
    and the portrait can never be spoofed by a stale document. */
export async function getCitizenSettings(
  user: CitizenUser,
): Promise<CitizenProfileSettings> {
  await ensureSchema();
  const rows = await query<{ settings: unknown }>(
    "SELECT settings FROM citizen_users WHERE id = $1 LIMIT 1",
    [user.id],
  );
  const merged = normalizeCitizenSettings(rows[0]?.settings);
  return {
    ...merged,
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    district: user.district,
    avatar_url: renderableAvatarUrl(user.avatarUrl),
  };
}

/** Persist edits from /settings or the wizard's contact step. Identity fields
    move to their columns (and the phone's canonical digits are recomputed);
    the rest is stored verbatim as the document. */
export async function updateCitizenSettings(
  user: CitizenUser,
  patch: Partial<CitizenProfileSettings>,
): Promise<CitizenProfileSettings> {
  const current = await getCitizenSettings(user);
  const next = normalizeCitizenSettings({ ...current, ...patch });

  const name = typeof patch.name === "string" ? patch.name.trim().slice(0, 120) : user.name;
  const district =
    typeof patch.district === "string" ? patch.district.trim().slice(0, 80) : user.district;

  /* A phone edit arrives in display form; recompute the canonical digits and
     refuse a malformed one rather than silently unsetting the account's
     contact number. */
  let phoneDigits = user.phoneDigits;
  let phone = user.phone;
  if (typeof patch.phone === "string" && patch.phone.trim() !== user.phone) {
    const digits = normalizePhoneDigits(patch.phone);
    if (digits) {
      phoneDigits = digits;
      phone = formatDisplayPhone(digits);
    } else if (patch.phone.trim() === "") {
      phoneDigits = "";
      phone = "";
    }
  }

  await ensureSchema();
  const stored: CitizenProfileSettings = {
    ...next,
    id: user.id,
    name,
    email: user.email,
    phone,
    district,
    // The portrait belongs to its own column; keep it out of the document.
    avatar_url: undefined,
  };
  try {
    await query(
      `UPDATE citizen_users
         SET name = $2, district = $3, phone = $4, phone_digits = $5,
             settings = $6::jsonb, updated_at = now()
       WHERE id = $1`,
      [user.id, name, district, phone, phoneDigits, JSON.stringify(stored)],
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateContactError();
    throw error;
  }
  const updated = await getCitizenUserById(user.id);
  if (!updated) throw new Error("Account disappeared during the update.");
  return getCitizenSettings(updated);
}

/** Replace the account's portrait, or clear it back to the initials monogram
    with "". Returns the refreshed document so the caller can hand the citizen
    the CDN URL in the same roundtrip. */
export async function setCitizenAvatarUrl(
  user: CitizenUser,
  url: string,
): Promise<CitizenProfileSettings> {
  await ensureSchema();
  await query(
    "UPDATE citizen_users SET avatar_url = $2, updated_at = now() WHERE id = $1",
    [user.id, url],
  );
  const updated = await getCitizenUserById(user.id);
  if (!updated) throw new Error("Account disappeared during the update.");
  return getCitizenSettings(updated);
}
