import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

/* Password hashing with Node's built-in scrypt (RFC 7914) — a memory-hard KDF,
   so the pilot gets a real password store without adding a dependency.

   The digest is self-describing (`scrypt:N:r:p:salt:hash`) so the work factors
   can be raised later without a migration: verification reads the parameters
   back out of the stored string, and old hashes keep working. */

/** `promisify` collapses scrypt's overloads onto the 3-argument form, so the
    options parameter is restored by hand. */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylength: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** scrypt needs 128 * N * r bytes; at N=32768/r=8 that is 32 MiB, at Node's
 * 32 MiB default ceiling, so maxmem is pinned explicitly on both paths. */
const CRYPT_PARAMS: ScryptOptions = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

/** NFKC-normalise first: without it, visually identical passwords with
    different Unicode encodings hash differently and logins silently fail. */
const normalize = (password: string) => password.normalize("NFKC");

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = (await scryptAsync(
    normalize(password),
    salt,
    KEY_LENGTH,
    CRYPT_PARAMS,
  )) as Buffer;
  return [
    "scrypt",
    CRYPT_PARAMS.N,
    CRYPT_PARAMS.r,
    CRYPT_PARAMS.p,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join(":");
}

/** False for a malformed or unknown-format stored hash — callers treat that
    the same as a wrong password. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, n, r, p, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt") return false;
  const salt = Buffer.from(saltHex ?? "", "hex");
  const expected = Buffer.from(hashHex ?? "", "hex");
  const cost = Number(n);
  const blockSize = Number(r);
  const parallelization = Number(p);
  if (
    expected.length === 0 ||
    !Number.isInteger(cost) ||
    cost < 2 ||
    (cost & (cost - 1)) !== 0 ||
    !Number.isInteger(blockSize) ||
    blockSize < 1 ||
    !Number.isInteger(parallelization) ||
    parallelization < 1
  ) {
    return false;
  }
  try {
    const derived = (await scryptAsync(normalize(password), salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 64 * 1024 * 1024,
    })) as Buffer;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
