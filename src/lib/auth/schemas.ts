import { z } from "zod";
import {
  isValidEmail,
  isValidMobileDigits,
  normalizePhoneDigits,
} from "@/lib/auth/identifiers";

/* Request contracts for the citizen auth routes. The messages are user-facing
   (they land in the auth card's inline field errors), so they read like the
   form's own copy rather than a stack trace. */

/** scrypt's cost scales with input length, so an unbounded password would turn
    every login attempt into a memory-and-time charge. */
export const PASSWORD_MAX_LENGTH = 200;

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Enter your full name as printed on your CNIC.")
    .max(120),
  email: z
    .string()
    .trim()
    .refine(isValidEmail, "Enter a valid email — e.g. name@gmail.com."),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => isValidMobileDigits(normalizePhoneDigits(value)),
      "Enter a valid mobile number (e.g. 300 1234567).",
    ),
  district: z
    .string()
    .trim()
    .min(1, "Pick your city or district.")
    .max(80),
  password: z
    .string()
    .min(8, "Choose a password of at least 8 characters.")
    .max(PASSWORD_MAX_LENGTH, "That password is too long."),
});

export const signinSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, "Enter your email or mobile number.")
    .max(160),
  // Sign-in stays permissive on length — an existing account may predate any
  // current rule, and the message must not hint at how long the secret is.
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX_LENGTH, "That password is too long."),
  remember: z.boolean().default(false),
});

/** Preference document a citizen may write. Identity fields land on their
    columns; anything absent here (the derived counters, the account id, the
    email) is server-owned and stripped from the patch. */
export const settingsDocumentSchema = z.object({
  name: z.string().trim().min(3, "Enter your full name.").max(120).optional(),
  phone: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" || isValidMobileDigits(normalizePhoneDigits(value)),
      "Enter a valid mobile number (e.g. 300 1234567).",
    )
    .optional(),
  district: z.string().trim().min(1).max(80).optional(),
  name_ur: z.string().trim().max(120).optional(),
  home_locality_id: z.string().trim().max(80).optional(),
  home_locality_name: z.string().trim().max(160).optional(),
  jurisdiction: z.string().trim().max(160).optional(),
  nearby_landmark: z.string().trim().max(200).optional(),
  radius_meters: z.number().int().min(100).max(50_000).optional(),
  whatsapp_updates: z.boolean().optional(),
  resolution_proofs: z.boolean().optional(),
  weekly_digest: z.boolean().optional(),
  anonymous_default: z.boolean().optional(),
  hide_phone_from_crew: z.boolean().optional(),
  leaderboard_visible: z.boolean().optional(),
  /* No avatar_url here: the portrait is its own column and is written by
     POST /api/auth/avatar, so a multi-megabyte base64 blob never rides along
     on every preference save. */
  cnic: z
    .string()
    .trim()
    .regex(/^$|^\d{5}-?\d{7}-?\d$/, "Enter your CNIC as 12345-1234567-1.")
    .optional(),
});

/** Portrait upload body — the canvas-downscaled square from the picker. The
    cap is on the raw base64 length, far above what a 400px JPEG reaches. */
export const avatarUploadSchema = z.object({
  image: z
    .string()
    .min(1, "Pick a JPG, PNG or WEBP image.")
    .max(8_000_000, "That image is too large — pick a smaller one.")
    .refine(
      (value) => value.startsWith("data:image/"),
      "Pick a JPG, PNG or WEBP image."
    ),
});

/** First issue per field → message, keyed for the card's error chips. */
export function fieldErrorsFrom(
  error: z.ZodError,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}
