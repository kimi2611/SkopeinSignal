import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { listModels } from "./ai-client";

// One provider per server process; the gateway URL + key are platform-injected
// (KIMI_AGENTGW_* in .env) and must never reach the browser.
export const kimiGw = createOpenAICompatible({
  name: "kimi-gw",
  baseURL: process.env.KIMI_AGENTGW_BASE_URL ?? "",
  apiKey: process.env.KIMI_AGENTGW_API_KEY ?? "",
  includeUsage: true,
  supportsStructuredOutputs: true,
});

// Model ids are never hardcoded: availability is per-site and changes without
// notice. Cache the default for 5 minutes to avoid a /models round-trip on
// every quiz call; a stale id fails loudly on the next listModels refresh.
let cached: { id: string; at: number } | null = null;
const MODEL_CACHE_MS = 5 * 60 * 1000;

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
