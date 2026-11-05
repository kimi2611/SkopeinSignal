import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// BYOK 密钥加密（AES-256-GCM）：用户自带的 provider key 落库前加密。
// 加密主密钥来自 env BYOK_SECRET（不落库、不进镜像层、不进日志）。
// 格式：v1:<iv>:<authTag>:<ciphertext>（均 base64）。无 BYOK_SECRET 时拒绝加解密。

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;

function deriveKey(): Buffer {
  // 调用时直读 env，避免模块加载时快照导致测试/运行时 stale
  const secret = process.env.BYOK_SECRET ?? "";
  if (!secret) {
    throw new Error("BYOK_SECRET_MISSING");
  }
  return scryptSync(secret, "skopein-byok-v1", KEY_LEN);
}

export function encryptByokKey(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, deriveKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptByokKey(stored: string): string {
  const [ver, ivB64, tagB64, ctB64] = stored.split(":");
  if (ver !== "v1" || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("BYOK_CIPHER_FORMAT");
  }
  const decipher = createDecipheriv(ALGO, deriveKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskKeyTail(plain: string): string {
  const tail = plain.slice(-4);
  return `••••${tail}`;
}

export function byokReady(): boolean {
  return Boolean(process.env.BYOK_SECRET);
}
