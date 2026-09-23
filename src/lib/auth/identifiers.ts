/* Contact identifiers shared by the auth card (client) and the account store
   (server). Pure functions only — importing this module must never pull in
   Node built-ins, so it stays safe for a client component.

   Pakistani mobile numbers are stored in one canonical shape: 10 local digits
   with the trunk prefix and the +92 country code removed, because citizens
   type "0300 1234567", "+92 300 1234567" and "300-1234567" interchangeably and
   all three must resolve to the same account. */

/** Keypad noise → "300 1234567": digits only, trunk 0 dropped, capped at 10,
    grouped to match the input's placeholder. */
export function toLocalMobile(raw: string): string {
  const digits = raw
    .replace(/\D/g, "")
    .replace(/^0+/, "")
    .slice(0, 10);
  return digits.length <= 3 ? digits : `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

/** Any accepted spelling → the canonical 10 local digits ("" if unrecognised). */
export function normalizePhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("92")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return "";
}

/** Local mobile parts run 3XX-XXXXXXX — the leading 3 is load-bearing. */
export function isValidMobileDigits(digits: string): boolean {
  return digits.length === 10 && digits.startsWith("3");
}

/** Canonical form stored on the account and stamped onto reports. */
export function formatDisplayPhone(digits: string): string {
  return `+92 ${toLocalMobile(digits)}`;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
