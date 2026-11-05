import { afterEach, describe, expect, it } from "vitest";

// 加密主密钥走 env.byokSecret（读 process.env.BYOK_SECRET），测试内注入。

describe("byok-crypto — AES-256-GCM 往返 + 掩码", () => {
  afterEach(() => {
    delete process.env.BYOK_SECRET;
  });

  it("加密→解密往返一致", async () => {
    process.env.BYOK_SECRET = "test-secret-for-byok";
    const { encryptByokKey, decryptByokKey } = await import("./byok-crypto");
    const plain = "sk-testabcdef1234567890";
    const stored = encryptByokKey(plain);
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain(plain);
    expect(decryptByokKey(stored)).toBe(plain);
  });

  it("两次加密同一明文得到不同密文（随机 IV）", async () => {
    process.env.BYOK_SECRET = "test-secret-for-byok";
    const { encryptByokKey } = await import("./byok-crypto");
    const a = encryptByokKey("sk-samekey");
    const b = encryptByokKey("sk-samekey");
    expect(a).not.toBe(b);
  });

  it("无主密钥时加解密抛 BYOK_SECRET_MISSING，不静默降级", async () => {
    const { encryptByokKey, decryptByokKey, byokReady } = await import("./byok-crypto");
    expect(byokReady()).toBe(false);
    expect(() => encryptByokKey("sk-x")).toThrow("BYOK_SECRET_MISSING");
    expect(() => decryptByokKey("v1:a:b:c")).toThrow("BYOK_SECRET_MISSING");
  });

  it("密文格式损坏时报 BYOK_CIPHER_FORMAT", async () => {
    process.env.BYOK_SECRET = "test-secret-for-byok";
    const { decryptByokKey } = await import("./byok-crypto");
    expect(() => decryptByokKey("garbage")).toThrow("BYOK_CIPHER_FORMAT");
  });

  it("掩码只露尾 4 位", async () => {
    const { maskKeyTail } = await import("./byok-crypto");
    expect(maskKeyTail("sk-abcdefghij1234")).toBe("••••1234");
  });
});
