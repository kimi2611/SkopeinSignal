/**
 * Password rules shared by the server check and the account form, so the hint
 * shown to the user and the rule enforced on write can never drift apart.
 * Pure on purpose: imported by both the browser bundle and the API.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export type PasswordErrorCode =
  | "missing_current"
  | "too_short"
  | "too_long"
  | "same_as_current"
  | "no_password";

export type PasswordChange = { ok: true } | { ok: false; code: PasswordErrorCode };

const charLength = (value: string) => [...value].length;

export function validateNewPassword(current: string, next: string): PasswordChange {
  if (!current) return { ok: false, code: "missing_current" };
  if (charLength(next) < PASSWORD_MIN) return { ok: false, code: "too_short" };
  if (charLength(next) > PASSWORD_MAX) return { ok: false, code: "too_long" };
  if (next === current) return { ok: false, code: "same_as_current" };
  return { ok: true };
}

export type StrengthLevel = 0 | 1 | 2 | 3;

/** 0 too weak / 1 fair / 2 good / 3 strong — a hint, never a gate. */
export function passwordStrength(value: string): StrengthLevel {
  if (!value) return 0;
  const length = charLength(value);
  let score = 0;
  if (length >= PASSWORD_MIN) score += 1;
  if (length >= 12) score += 1;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  if (kinds >= 2) score += 1;
  if (kinds >= 3 && length >= 10) score += 1;
  return Math.min(3, score) as StrengthLevel;
}
