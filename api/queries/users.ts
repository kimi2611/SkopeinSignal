import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertUser } from "@db/schema";
import { getDb } from "./connection";
import { env } from "../lib/env";

export async function findUserByUnionId(unionId: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.unionId, unionId))
    .limit(1);
  return rows.at(0);
}

export async function upsertUser(data: InsertUser) {
  const values = { ...data };
  const updateSet: Partial<InsertUser> = {
    lastSignInAt: new Date(),
    ...data,
  };

  if (
    values.role === undefined &&
    values.unionId &&
    values.unionId === env.ownerUnionId
  ) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await getDb()
    .insert(schema.users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

// 显示名独立更新：不触碰 lastSignInAt，改名 ≠ 登录。
export async function updateUserName(unionId: string, name: string) {
  await getDb()
    .update(schema.users)
    .set({ name })
    .where(eq(schema.users.unionId, unionId));
}

// 密码独立更新：只换 hash，不碰 lastSignInAt。旧 session 因 sv 失配自然失效。
export async function updateUserPassword(unionId: string, passwordHash: string) {
  await getDb()
    .update(schema.users)
    .set({ passwordHash })
    .where(eq(schema.users.unionId, unionId));
}
