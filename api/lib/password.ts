import { createHash } from "node:crypto";

export {
  PASSWORD_MAX,
  PASSWORD_MIN,
  passwordStrength,
  validateNewPassword,
  type PasswordChange,
  type PasswordErrorCode,
  type StrengthLevel,
} from "@contracts/password";

/**
 * A session version bound to the current password hash.
 *
 * Sessions are stateless HS256 JWTs, so there is no server-side table to clear
 * when a password changes. Instead every local session carries an `sv` claim
 * derived from the bcrypt hash it was issued under; changing the password
 * changes the hash, and every token minted before that moment stops matching.
 * No schema change, no session store, still "all devices signed out".
 */
export function sessionVersionFor(passwordHash: string | null | undefined): string | null {
  if (!passwordHash) return null;
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 24);
}
