import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { workspaceSaveInputSchema } from "@contracts/workspace";
import { authedQuery, createRouter } from "./middleware";
import { findWorkspaceByUser, saveWorkspaceForUser } from "./queries/workspaces";

const MAX_WORKSPACE_BYTES = 12 * 1024 * 1024;

export const workspaceRouter = createRouter({
  get: authedQuery.input(z.object({ ownerId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    if (input.ownerId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Workspace owner does not match the signed-in account." });
    }
    const record = await findWorkspaceByUser(ctx.user.id);
    return {
      ownerId: ctx.user.id,
      payload: record?.payload ?? null,
      revision: record?.revision ?? 0,
      updatedAt: record?.updatedAt.toISOString() ?? null,
    };
  }),
  save: authedQuery
    .input(workspaceSaveInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (Buffer.byteLength(JSON.stringify(input.payload), "utf8") > MAX_WORKSPACE_BYTES) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Workspace JSON exceeds the 12 MB sync limit. Export a backup and remove old transcripts before retrying." });
      }
      return saveWorkspaceForUser(ctx.user.id, input.payload, input.expectedRevision);
    }),
});
