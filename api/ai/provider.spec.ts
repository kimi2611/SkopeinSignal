import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deepSeekJsonGuard,
  deepSeekResponseFormatFetch,
  resolveAiAccess,
  serverKeyConfigured,
} from "./provider";

const OWNER = "local:owner@example.test";

async function withGatewayEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prevKey = process.env.KIMI_AGENTGW_API_KEY;
  const prevUrl = process.env.KIMI_AGENTGW_BASE_URL;
  process.env.KIMI_AGENTGW_API_KEY = "test-key";
  process.env.KIMI_AGENTGW_BASE_URL = "https://gw.example.test/v1";
  try {
    return await fn();
  } finally {
    if (prevKey === undefined) delete process.env.KIMI_AGENTGW_API_KEY;
    else process.env.KIMI_AGENTGW_API_KEY = prevKey;
    if (prevUrl === undefined) delete process.env.KIMI_AGENTGW_BASE_URL;
    else process.env.KIMI_AGENTGW_BASE_URL = prevUrl;
  }
}

afterEach(() => {
  delete process.env.KIMI_AGENTGW_API_KEY;
  delete process.env.KIMI_AGENTGW_BASE_URL;
});

describe("resolveAiAccess — D1 优先级：BYOK 显式启用 > owner 服务端 key > 拒绝", () => {
  it("owner 账号（无 BYOK）拿到 server 访问权", async () => {
    await withGatewayEnv(async () => {
      const access = await resolveAiAccess({ id: 2, unionId: OWNER }, { ownerUnionId: OWNER });
      expect(access).toEqual({ kind: "server" });
    });
  });

  it("启用 BYOK 的非 owner 走自己的 key（不碰服务端 key）", async () => {
    await withGatewayEnv(async () => {
      const access = await resolveAiAccess(
        { id: 14, unionId: "local:intruder@example.test" },
        {
          ownerUnionId: OWNER,
          getEnabledByokKey: async () => ({
            apiKey: "user-own-key",
            baseUrl: "https://api.deepseek.com/v1",
          }),
        },
      );
      expect(access).toEqual({
        kind: "byok",
        apiKey: "user-own-key",
        baseUrl: "https://api.deepseek.com/v1",
      });
    });
  });

  it("owner 显式启用 BYOK 时也优先用自己的 key（D1 per-provider 原则）", async () => {
    await withGatewayEnv(async () => {
      const access = await resolveAiAccess(
        { id: 2, unionId: OWNER },
        {
          ownerUnionId: OWNER,
          getEnabledByokKey: async () => ({ apiKey: "k", baseUrl: "https://b" }),
        },
      );
      expect(access.kind).toBe("byok");
    });
  });

  it("有 BYOK 记录但未启用 → 非 owner 仍拒绝，owner 回退 server", async () => {
    await withGatewayEnv(async () => {
      const noKey = async () => null;
      expect(
        await resolveAiAccess(
          { id: 14, unionId: "local:x@example.test" },
          { ownerUnionId: OWNER, getEnabledByokKey: noKey },
        ),
      ).toEqual({ kind: "none", reason: "not_owner" });
      expect(
        await resolveAiAccess({ id: 2, unionId: OWNER }, { ownerUnionId: OWNER, getEnabledByokKey: noKey }),
      ).toEqual({ kind: "server" });
    });
  });

  it("非 owner 账号无 BYOK 一律拒绝（reason=not_owner），即使服务端 key 已配置", async () => {
    await withGatewayEnv(async () => {
      const access = await resolveAiAccess(
        { id: 14, unionId: "local:intruder@example.test" },
        { ownerUnionId: OWNER },
      );
      expect(access).toEqual({ kind: "none", reason: "not_owner" });
    });
  });

  it("服务端 key 未配置时，owner 也只拿到 not_configured", async () => {
    expect(serverKeyConfigured()).toBe(false);
    const access = await resolveAiAccess({ id: 2, unionId: OWNER }, { ownerUnionId: OWNER });
    expect(access).toEqual({ kind: "none", reason: "not_configured" });
  });

  it("key 与 baseURL 任一缺失都视为未配置", () => {
    process.env.KIMI_AGENTGW_API_KEY = "only-key";
    expect(serverKeyConfigured()).toBe(false);
  });
});

describe("deepSeekJsonGuard — DeepSeek json_object 必须 prompt 含 json 字样", () => {
  it("responseFormat 为 json 时前置 system 指令（含 schema 原文），且原 prompt 保留", async () => {
    const params = {
      prompt: [
        { role: "user" as const, content: [{ type: "text" as const, text: "word ".repeat(80) }] },
      ],
      responseFormat: {
        type: "json" as const,
        schema: {
          type: "object",
          properties: { questions: { type: "array" } },
          required: ["questions"],
        },
      },
    };
    const out = await deepSeekJsonGuard.transformParams!({
      type: "generate",
      params: params as never,
      model: {} as never,
    });
    const prompt = (out as { prompt: { role: string; content: string }[] }).prompt;
    expect(prompt[0].role).toBe("system");
    expect(prompt[0].content).toMatch(/json/i);
    expect(prompt[0].content).toContain('"questions"');
    expect(prompt[1]).toEqual(params.prompt[0]);
  });

  it("纯文本调用不注入指令", async () => {
    const params = {
      prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "hi" }] }],
      responseFormat: { type: "text" as const },
    };
    const out = await deepSeekJsonGuard.transformParams!({
      type: "generate",
      params: params as never,
      model: {} as never,
    });
    expect((out as { prompt: unknown[] }).prompt).toHaveLength(1);
  });
});

describe("deepSeekResponseFormatFetch — 出栈前把 json_schema 改写为 json_object", () => {
  it("json_schema 请求体被改写，其余字段原样保留", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", ((_url: unknown, init?: RequestInit) => {
      capturedBody = String(init?.body ?? "");
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch);
    await deepSeekResponseFormatFetch("https://gw.example.test/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "deepseek-flash",
        response_format: { type: "json_schema", json_schema: { name: "q" } },
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    vi.unstubAllGlobals();
    const sent = JSON.parse(capturedBody) as { response_format: { type: string }; model: string };
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(sent.model).toBe("deepseek-flash");
  });

  it("无 response_format 或非 JSON body 原样透传", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", ((_url: unknown, init?: RequestInit) => {
      capturedBody = String(init?.body ?? "");
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch);
    const original = JSON.stringify({ model: "m", messages: [] });
    await deepSeekResponseFormatFetch("https://gw.example.test/v1/chat/completions", {
      method: "POST",
      body: original,
    });
    vi.unstubAllGlobals();
    expect(capturedBody).toBe(original);
  });
});
