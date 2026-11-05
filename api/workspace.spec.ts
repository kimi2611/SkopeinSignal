import { describe, expect, it } from "vitest";
import { workspacePayloadSchema, workspaceSaveInputSchema } from "@contracts/workspace";

const payload = {
  version: 1 as const,
  shows: [],
  episodes: [],
  activities: [],
  dismissedPairs: [],
  settings: {},
  feedStatus: {},
};

describe("workspace sync contract", () => {
  it("accepts a versioned workspace and preserves current extension fields", () => {
    const parsed = workspacePayloadSchema.parse({ ...payload, vocabulary: [], seedRevision: 4 });
    expect(parsed.version).toBe(1);
    expect(parsed.seedRevision).toBe(4);
  });

  it("rejects unsupported or incomplete payloads", () => {
    expect(workspacePayloadSchema.safeParse({ ...payload, version: 2 }).success).toBe(false);
    const missingEpisodes = Object.fromEntries(Object.entries(payload).filter(([k]) => k !== 'episodes'));
    expect(workspacePayloadSchema.safeParse(missingEpisodes).success).toBe(false);
  });

  it("requires a nonnegative integer optimistic-concurrency revision", () => {
    expect(workspaceSaveInputSchema.safeParse({ expectedRevision: 0, payload }).success).toBe(true);
    expect(workspaceSaveInputSchema.safeParse({ expectedRevision: -1, payload }).success).toBe(false);
    expect(workspaceSaveInputSchema.safeParse({ expectedRevision: 1.5, payload }).success).toBe(false);
  });
});
