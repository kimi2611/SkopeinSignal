import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authedQuery, createRouter, BYOK_DEEPSEEK_BASE_URL } from "./middleware";
import {
  getUserProviderKey,
  upsertUserProviderKey,
  setUserProviderKeyEnabled,
  deleteUserProviderKey,
} from "./queries/userProviderKeys";
import {
  byokReady,
  decryptByokKey,
  encryptByokKey,
  maskKeyTail,
} from "./lib/byok-crypto";
import { fetchDefaultModelId } from "./ai/provider";

// BYOK 设置（D1：显式启用才切换「用户 key > 服务端」）。
// 明文 key 只在本过程内存出现；落库 AES-256-GCM 密文；status 只回掩码尾号。

const providerEnum = z.enum(["deepseek"]);

export const settingsRouter = createRouter({
  byokStatus: authedQuery.query(async ({ ctx }) => {
    const row = ctx.user?.id
      ? await getUserProviderKey(ctx.user.id, "deepseek")
      : null;
    if (!row) {
      return { ready: byokReady(), configured: false, enabled: false, keyTail: null };
    }
    let keyTail: string | null = null;
    try {
      keyTail = maskKeyTail(decryptByokKey(row.apiKeyEnc));
    } catch {
      keyTail = "••••????";
    }
    return {
      ready: byokReady(),
      configured: true,
      enabled: row.enabled === 1,
      keyTail,
    };
  }),

  byokSaveKey: authedQuery
    .input(
      z.object({
        provider: providerEnum,
        apiKey: z.string().trim().min(10).max(200),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!byokReady()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "BYOK_SECRET_MISSING",
        });
      }
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
      // 换新 key 即停用（D1 显式原则：必须重新打开启用开关才切换）
      await upsertUserProviderKey(ctx.user.id, input.provider, encryptByokKey(input.apiKey));
      return { ok: true, keyTail: maskKeyTail(input.apiKey) };
    }),

  byokSetEnabled: authedQuery
    .input(z.object({ provider: providerEnum, enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (input.enabled) {
        if (!byokReady()) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "BYOK_SECRET_MISSING" });
        }
        const row = await getUserProviderKey(ctx.user.id, input.provider);
        if (!row) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "BYOK_KEY_REQUIRED" });
        }
      }
      await setUserProviderKeyEnabled(ctx.user.id, input.provider, input.enabled);
      return { ok: true, enabled: input.enabled };
    }),

  byokDelete: authedQuery
    .input(z.object({ provider: providerEnum }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
      await deleteUserProviderKey(ctx.user.id, input.provider);
      return { ok: true };
    }),

  byokTest: authedQuery
    .input(z.object({ provider: providerEnum }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
      const row = await getUserProviderKey(ctx.user.id, input.provider);
      if (!row) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "BYOK_KEY_REQUIRED" });
      }
      try {
        const modelId = await fetchDefaultModelId(
          BYOK_DEEPSEEK_BASE_URL,
          decryptByokKey(row.apiKeyEnc),
        );
        return { ok: true, modelId };
      } catch {
        throw new TRPCError({ code: "BAD_GATEWAY", message: "BYOK_TEST_FAILED" });
      }
    }),
});
