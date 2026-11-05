import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { log } from "./lib/logger";
import { resolveAiAccess, type AiAccess } from "./ai/provider";
import { getUserProviderKey } from "./queries/userProviderKeys";
import { decryptByokKey } from "./lib/byok-crypto";

export const BYOK_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  // G9: a procedure that throws never reaches app.onError — the tRPC fetch
  // adapter catches it and returns its own 500 JSON, so the Hono error handler
  // is bypassed entirely. That left the most common real failure (a mutation
  // 500ing) with NO structured record in app.log on the server side; it only
  // appeared if the caller happened to log it in its own catch. This hook is the
  // missing server-side safety net. INTERNAL_SERVER_ERROR only: the TRPCErrors
  // thrown below (UNAUTHORIZED / FORBIDDEN) are deliberate business answers, not
  // crashes, and logging those would drown the file.
  errorFormatter({ shape, error }) {
    if (error.code === "INTERNAL_SERVER_ERROR") {
      log.error("trpc procedure failed", {
        path: shape.data?.path,
        code: error.code,
        error: error.message,
        stack: error.stack,
      });
    }
    return shape;
  },
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRole(role: string) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(requireAuth);
export const adminQuery = authedQuery.use(requireRole("admin"));

// AI 门（D1 裁决：BYOK 显式启用 > owner 服务端 key > 拒绝）。
// 通过时把裁决结果挂在 ctx.aiAccess，调用点按它构造模型。
const requireAiAccess = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  const access: AiAccess = await resolveAiAccess(ctx.user, {
    getEnabledByokKey: async (userId) => {
      const row = await getUserProviderKey(userId, "deepseek");
      if (!row || row.enabled !== 1) return null;
      try {
        return {
          apiKey: decryptByokKey(row.apiKeyEnc),
          baseUrl: BYOK_DEEPSEEK_BASE_URL,
        };
      } catch {
        return null; // 密文损坏/主密钥轮换：视为无 BYOK，不阻断服务端路径
      }
    },
  });
  if (access.kind === "none") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        access.reason === "not_owner" ? "AI_BYOK_REQUIRED" : "AI_MISCONFIGURED",
    });
  }
  return next({ ctx: { ...ctx, aiAccess: access } });
});

export const aiQuery = authedQuery.use(requireAiAccess);
