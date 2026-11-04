import { beforeEach, describe, expect, it, vi } from "vitest";
import { listModels } from "./ai/ai-client";
import { getVisionModelId } from "./ai/provider";

vi.mock("./ai/ai-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ai/ai-client")>();
  return { ...actual, listModels: vi.fn() };
});

beforeEach(() => {
  vi.mocked(listModels).mockReset();
});

describe("live vision-model selection", () => {
  it("prefers the advertised default when it accepts images", async () => {
    vi.mocked(listModels).mockResolvedValue({ defaultModelId: "default-live", models: [
      { id: "default-live", supportsImageIn: true },
      { id: "other-live", supportsImageIn: true },
    ] });
    await expect(getVisionModelId()).resolves.toBe("default-live");
  });

  it("uses another advertised image model when the default is text-only", async () => {
    vi.mocked(listModels).mockResolvedValue({ defaultModelId: "text-live", models: [
      { id: "text-live", supportsImageIn: false },
      { id: "vision-live", supportsImageIn: true },
    ] });
    await expect(getVisionModelId()).resolves.toBe("vision-live");
  });

  it("reports no vision capability instead of guessing a model id", async () => {
    vi.mocked(listModels).mockResolvedValue({ defaultModelId: "text-live", models: [{ id: "text-live", supportsImageIn: false }] });
    await expect(getVisionModelId()).resolves.toBeNull();
  });
});
