import { APICallError, generateObject, type FlexibleSchema, type InferSchema } from "ai";
import { log } from "../lib/logger";

// W1 容错重试（阶段3 批准版，兼容 quizRouter 防重复计费行规）：
// 只重试「未计费」的瞬时故障——
//   · 429（限流，未产生 token）
//   · 5xx / 408 / 409（provider 错误响应，无 usage 不计费）
//   · 网络层断连（请求未到达，不计费）
// 不重试：成功解析类错误（NoObjectGeneratedError 等模型已产出 token 的场景）、
// 4xx 请求错误（400/401/403/404/422 重试无意义）。
// 引入流式输出后此规则另行立规（批准方案修正条款）。

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 2;

export function isRetryableAiError(err: unknown): boolean {
  if (err instanceof APICallError) {
    return err.statusCode != null && RETRYABLE_STATUS.has(err.statusCode);
  }
  // 网络层：fetch 断连 / DNS / socket 错误（ai-sdk 包装后通常仍是 TypeError）
  if (err instanceof TypeError) return true;
  const name = (err as { name?: string } | null)?.name ?? "";
  return ["FetchError", "SocketError", "ConnectTimeoutError"].includes(name);
}

type GenerateObjectArgs<SCHEMA extends FlexibleSchema<unknown>> = Parameters<typeof generateObject<SCHEMA>>[0];

// SCHEMA 泛型贯穿：args.schema 决定 object 形状（原 generateObject 的推导语义）。
// 不重试语义见文件头注释；调用点传参形状与 generateObject 完全兼容。
export async function generateObjectWithRetry<SCHEMA extends FlexibleSchema<unknown>>(
  args: GenerateObjectArgs<SCHEMA>,
): Promise<{ object: InferSchema<SCHEMA> }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // maxRetries 恒 0：重试策略由本函数统一执掌，避免 ai-sdk 内置重试叠加重试
      // as never：ai-sdk v6 的 options 是条件联合，展开后类型身份对不上（双份 provider-utils），
      // 运行语义零变化——schema 由 zod 在下游兜底校验。
      return (await generateObject({ ...args, maxRetries: 0 } as never)) as {
        object: InferSchema<SCHEMA>;
      };
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_ATTEMPTS || !isRetryableAiError(err)) throw err;
      const delayMs = err instanceof APICallError && err.statusCode === 429 ? 1500 : 800;
      log.warn("ai retry scheduled", { attempt, delayMs });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}
