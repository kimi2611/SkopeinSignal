import { z } from "zod";

export const workspacePayloadSchema = z.object({
  version: z.literal(1),
  shows: z.array(z.unknown()),
  episodes: z.array(z.unknown()),
  activities: z.array(z.unknown()),
  dismissedPairs: z.array(z.unknown()),
  settings: z.record(z.string(), z.unknown()),
  feedStatus: z.record(z.string(), z.unknown()),
}).passthrough();

export const workspaceSaveInputSchema = z.object({
  expectedRevision: z.number().int().min(0),
  payload: workspacePayloadSchema,
});

export type WorkspacePayload = z.infer<typeof workspacePayloadSchema>;
