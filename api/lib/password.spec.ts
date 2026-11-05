import { describe, expect, it } from "vitest";
import { passwordStrength, validateNewPassword } from "@contracts/password";
import { sessionVersionFor } from "./password";

describe("validateNewPassword", () => {
  it("requires the current password to be present", () => {
    expect(validateNewPassword("", "a-long-enough-one")).toEqual({ ok: false, code: "missing_current" });
  });

  it("rejects anything shorter than eight characters", () => {
    expect(validateNewPassword("old-pass-1", "short7!")).toEqual({ ok: false, code: "too_short" });
    expect(validateNewPassword("old-pass-1", "exactly8")).toEqual({ ok: true });
  });

  it("counts characters, not UTF-16 units, so emoji do not sneak past the minimum", () => {
    expect(validateNewPassword("old-pass-1", "😀😀😀😀😀😀😀").ok).toBe(false);
    expect(validateNewPassword("old-pass-1", "😀😀😀😀😀😀😀😀").ok).toBe(true);
  });

  it("rejects reusing the current password verbatim", () => {
    expect(validateNewPassword("same-pass-1", "same-pass-1")).toEqual({ ok: false, code: "same_as_current" });
  });

  it("caps length so a bcrypt call cannot be fed a megabyte", () => {
    expect(validateNewPassword("old-pass-1", "a".repeat(201))).toEqual({ ok: false, code: "too_long" });
    expect(validateNewPassword("old-pass-1", "a".repeat(200)).ok).toBe(true);
  });
});

describe("passwordStrength", () => {
  it("is zero for an empty field", () => {
    expect(passwordStrength("")).toBe(0);
  });

  it("stays low for a long but one-note password", () => {
    expect(passwordStrength("aaaaaaaaaaaa")).toBe(2);
    expect(passwordStrength("aaaa")).toBe(0);
  });

  it("climbs with length and character variety", () => {
    expect(passwordStrength("abcdefgh")).toBe(1);
    expect(passwordStrength("abcdefg1")).toBe(2);
    expect(passwordStrength("Abcdefg1!xyz")).toBe(3);
  });

  it("never exceeds three bars", () => {
    expect(passwordStrength("A-very-long-password-with-everything-123!")).toBe(3);
  });
});

describe("sessionVersionFor", () => {
  it("is null when the account has no password (OAuth-only accounts)", () => {
    expect(sessionVersionFor(null)).toBeNull();
    expect(sessionVersionFor(undefined)).toBeNull();
  });

  it("is stable for the same hash", () => {
    expect(sessionVersionFor("$2b$10$abc")).toBe(sessionVersionFor("$2b$10$abc"));
  });

  it("changes when the password hash changes — this is what signs other devices out", () => {
    expect(sessionVersionFor("$2b$10$abc")).not.toBe(sessionVersionFor("$2b$10$def"));
  });

  it("never leaks the hash it was derived from", () => {
    const hash = "$2b$10$abcdefghijklmnopqrstuv";
    const version = sessionVersionFor(hash) ?? "";
    expect(version).toHaveLength(24);
    expect(hash.includes(version)).toBe(false);
  });
});
