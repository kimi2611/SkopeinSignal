import { eq, and } from "drizzle-orm";
import { getDb } from "./connection";
import { userProviderKeys, type InsertUserProviderKey } from "@db/schema";

// BYOK 用户自带 key 的存取。明文 key 只在内存中出现，落库一律密文。

export async function getUserProviderKey(userId: number, provider: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(userProviderKeys)
    .where(and(eq(userProviderKeys.userId, userId), eq(userProviderKeys.provider, provider)))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertUserProviderKey(
  userId: number,
  provider: string,
  apiKeyEnc: string,
) {
  const db = getDb();
  const existing = await getUserProviderKey(userId, provider);
  if (existing) {
    await db
      .update(userProviderKeys)
      .set({ apiKeyEnc, enabled: 0 })
      .where(eq(userProviderKeys.id, existing.id));
    return;
  }
  const insert: InsertUserProviderKey = { userId, provider, apiKeyEnc, enabled: 0 };
  await db.insert(userProviderKeys).values(insert);
}

export async function setUserProviderKeyEnabled(
  userId: number,
  provider: string,
  enabled: boolean,
) {
  const db = getDb();
  await db
    .update(userProviderKeys)
    .set({ enabled: enabled ? 1 : 0 })
    .where(and(eq(userProviderKeys.userId, userId), eq(userProviderKeys.provider, provider)));
}

export async function deleteUserProviderKey(userId: number, provider: string) {
  const db = getDb();
  await db
    .delete(userProviderKeys)
    .where(and(eq(userProviderKeys.userId, userId), eq(userProviderKeys.provider, provider)));
}
