import { describe, expect, it } from "vitest";
import { validateDisplayName } from "./auth-local";

describe("validateDisplayName", () => {
  it("trims outer whitespace and collapses inner runs", () => {
    expect(validateDisplayName("  沙箱   925  ")).toEqual({ ok: true, name: "沙箱 925" });
    expect(validateDisplayName(" nightly curator ")).toEqual({ ok: true, name: "nightly curator" });
  });

  it("rejects empty and missing names", () => {
    expect(validateDisplayName("   ").ok).toBe(false);
    expect(validateDisplayName("").ok).toBe(false);
    expect(validateDisplayName(undefined).ok).toBe(false);
    expect(validateDisplayName(null).ok).toBe(false);
  });

  it("rejects names over 50 characters and accepts exactly 50", () => {
    expect(validateDisplayName("a".repeat(51)).ok).toBe(false);
    const atLimit = validateDisplayName("a".repeat(50));
    expect(atLimit).toEqual({ ok: true, name: "a".repeat(50) });
  });

  it("folds full-width ideographic spaces into a single ASCII space", () => {
    expect(validateDisplayName("沙箱　925")).toEqual({ ok: true, name: "沙箱 925" });
  });
});
