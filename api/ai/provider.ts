import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import { createHash } from "node:crypto";
import { listModels } from "./ai-client";
import { env } from "../lib/env";

// One provider per server process; the gateway URL + key are platform-injected
// (KIMI_AGENTGW_* in .env) and must never reach the browser.
//
// DeepSeek 兼容层（2026-11-05 实测敲定，勿回退）：
// 1. ai-sdk 只在 supportsStructuredOutputs=true 时下发 response_format；DeepSeek
//    拒收 json_schema（400），只认 json_object → 用 custom fetch 在出栈前改写。
// 2. DeepSeek 要求 prompt 含 "json" 字样才允许 json_object → deepSeekJsonGuard 前置。
export const deepSeekResponseFormatFetch: typeof fetch = async (url, init) => {
  let body = init?.body;
  if (typeof body === "string" && body.includes('"response_format"')) {
    try {
      const parsed = JSON.parse(body) as {
        response_format?: { type?: string };
      };
      if (parsed.response_format?.type === "json_schema") {
        parsed.response_format = { type: "json_object" };
        body = JSON.stringify(parsed);
        init = { ...init, body };
      }
    } catch {
      // 非 JSON body（流式/FormData 等）原样透传
    }
  }
  return fetch(url, init);
};

const rawProvider = createOpenAICompatible({
  name: "kimi-gw",
  baseURL: process.env.KIMI_AGENTGW_BASE_URL ?? "",
  apiKey: process.env.KIMI_AGENTGW_API_KEY ?? "",
  includeUsage: true,
  supportsStructuredOutputs: true, // 让 ai-sdk 下发 response_format；实际格式由上面的 fetch 改写为 json_object
  fetch: deepSeekResponseFormatFetch,
});

// DeepSeek 的 json_object 硬性要求：prompt 里必须出现 "json" 字样，否则 400。
// 且 json_object 模式下模型看不到 schema（平台网关时代靠 json_schema 下发），
// 必须在指令里把 schema 原文喂给它，否则它瞎猜键名（实测返回 {"question":…}
// 对不上 {"questions":[…]}）。transformParams 能拿到 responseFormat.schema，
// 此处统一注入，9 个调用点零改动（W2 模板化后此守卫仍生效）。
export const deepSeekJsonGuard: LanguageModelMiddleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => {
    if (params.responseFormat?.type !== "json") return params;
    const schemaText = params.responseFormat.schema
      ? ` It must match this JSON schema exactly: ${JSON.stringify(params.responseFormat.schema)}`
      : "";
    return {
      ...params,
      prompt: [
        {
          role: "system" as const,
          content: `Your entire response must be a single valid JSON document.${schemaText} No prose, no markdown fences.`,
        },
        ...params.prompt,
      ],
    };
  },
};

// 调用签名与原 provider 一致（kimiGw(modelId)），9 个调用点零改动。
export const kimiGw = (modelId: string) =>
  wrapLanguageModel({
    model: rawProvider(modelId),
    middleware: deepSeekJsonGuard,
  });

// Model ids are never hardcoded: availability is per-site and changes without
// notice. Cache the default for 5 minutes to avoid a /models round-trip on
// every quiz call; a stale id fails loudly on the next listModels refresh.
let cached: { id: string; at: number } | null = null;
const MODEL_CACHE_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// AI 访问裁决（阶段3 第0步硬性约束，用户 2026-11-05 批准时追加；M1 扩展 BYOK）：
// 优先级（D1 拍板）：某 provider 上用户显式启用 BYOK → 用用户 key；
// 否则 owner（OWNER_UNION_ID）→ 用服务端注入 key；其余 → 拒绝（BYOK 或提示未配置）。
// 绝不让服务端 key 变成全站公有。
// ---------------------------------------------------------------------------
export type AiAccess =
  | { kind: "server" }
  | { kind: "byok"; apiKey: string; baseUrl: string }
  | { kind: "none"; reason: "not_owner" | "not_configured" };

export function serverKeyConfigured(): boolean {
  return Boolean(
    process.env.KIMI_AGENTGW_API_KEY && process.env.KIMI_AGENTGW_BASE_URL,
  );
}

type EnabledByokKey = { apiKey: string; baseUrl: string };

export async function resolveAiAccess(
  user: { id?: number | null; unionId?: string | null } | null | undefined,
  deps: {
    ownerUnionId?: string;
    getEnabledByokKey?: (
      userId: number,
    ) => Promise<EnabledByokKey | null>;
  } = {},
): Promise<AiAccess> {
  const userId = user?.id;
  if (typeof userId === "number" && deps.getEnabledByokKey) {
    const byok = await deps.getEnabledByokKey(userId);
    if (byok) return { kind: "byok", ...byok };
  }
  if (!serverKeyConfigured()) return { kind: "none", reason: "not_configured" };
  if (user?.unionId && user.unionId === (deps.ownerUnionId ?? env.ownerUnionId)) {
    return { kind: "server" };
  }
  return { kind: "none", reason: "not_owner" };
}

// ---------------------------------------------------------------------------
// 按访问权构造模型实例：server 走环境单例；byok 用用户自带 key 现场建 provider
// （同 DeepSeek 兼容层：json_schema 改写 + json 守卫）。模型 id 不硬编码：
// 按 access 各自的 /models 列表取 default_model_id ?? 第一个。
// ---------------------------------------------------------------------------
const byokModelCache = new Map<string, { id: string; at: number }>();

export async function fetchDefaultModelId(baseUrl: string, apiKey: string): Promise<string> {
  const fp = createHash("sha256").update(`${baseUrl}|${apiKey}`).digest("hex").slice(0, 16);
  const hit = byokModelCache.get(fp);
  if (hit && Date.now() - hit.at < MODEL_CACHE_MS) return hit.id;
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`BYOK_MODELS_HTTP_${res.status}`);
  const body = (await res.json()) as {
    default_model_id?: string;
    data?: { id?: string }[];
  };
  const id = body.default_model_id ?? body.data?.[0]?.id;
  if (!id) throw new Error("BYOK_MODELS_EMPTY");
  byokModelCache.set(fp, { id, at: Date.now() });
  return id;
}

export async function getDefaultModelIdForAccess(access: AiAccess): Promise<string> {
  if (access.kind === "byok") {
    return fetchDefaultModelId(access.baseUrl, access.apiKey);
  }
  if (access.kind === "server") return getDefaultModelId();
  throw new Error("AI_ACCESS_NONE");
}

// BYOK 的视觉路径：DeepSeek 的 deepseek-flash 支持 image 输入（/models 实测），
// 故 byok 直接复用其默认模型 id；server 维持原 vision 清单逻辑。
export async function getVisionModelIdForAccess(access: AiAccess): Promise<string | null> {
  if (access.kind === "byok") {
    try {
      return await fetchDefaultModelId(access.baseUrl, access.apiKey);
    } catch {
      return null;
    }
  }
  if (access.kind === "server") return getVisionModelId();
  return null;
}

export function aiModelForAccess(access: AiAccess, modelId: string) {
  if (access.kind === "server") return kimiGw(modelId);
  if (access.kind === "byok") {
    const userProvider = createOpenAICompatible({
      name: "byok-deepseek",
      baseURL: access.baseUrl,
      apiKey: access.apiKey,
      includeUsage: true,
      supportsStructuredOutputs: true, // 与 server 同策略：下发 json_schema，fetch 改写 json_object
      fetch: deepSeekResponseFormatFetch,
    });
    return wrapLanguageModel({
      model: userProvider(modelId),
      middleware: deepSeekJsonGuard,
    });
  }
  throw new Error("AI_ACCESS_NONE");
}

export async function getDefaultModelId(): Promise<string> {
  if (cached && Date.now() - cached.at < MODEL_CACHE_MS) return cached.id;
  const { defaultModelId } = await listModels();
  cached = { id: defaultModelId, at: Date.now() };
  return defaultModelId;
}

export function invalidateModelCache(): void {
  cached = null;
}

/** Pick an image-capable model advertised by the live gateway, never a hardcoded id. */
export async function getVisionModelId(): Promise<string | null> {
  const { models, defaultModelId } = await listModels();
  const defaultModel = models.find((model) => model.id === defaultModelId);
  if (defaultModel?.supportsImageIn) return defaultModel.id;
  return models.find((model) => model.supportsImageIn)?.id ?? null;
}
