import { and, eq } from "drizzle-orm";
import { workspaces } from "@db/schema";
import type { WorkspacePayload } from "@contracts/workspace";
import { getDb } from "./connection";

export async function findWorkspaceByUser(userId: number) {
  return getDb().query.workspaces.findFirst({
    where: eq(workspaces.userId, userId),
  });
}

export type WorkspaceSaveResult =
  | { ok: true; revision: number; updatedAt: string }
  | { ok: false; reason: "conflict"; revision: number; payload: unknown; updatedAt: string | null };

export async function saveWorkspaceForUser(
  userId: number,
  payload: WorkspacePayload,
  expectedRevision: number,
): Promise<WorkspaceSaveResult> {
  const db = getDb();
  const now = new Date();

  if (expectedRevision > 0) {
    const result = await db
      .update(workspaces)
      .set({ payload, revision: expectedRevision + 1, updatedAt: now })
      .where(and(eq(workspaces.userId, userId), eq(workspaces.revision, expectedRevision)));
    const header = (Array.isArray(result) ? result[0] : result) as { affectedRows?: number };
    if (header.affectedRows === 1) {
      return { ok: true, revision: expectedRevision + 1, updatedAt: now.toISOString() };
    }
  } else {
    const existing = await findWorkspaceByUser(userId);
    if (!existing) {
      try {
        await db.insert(workspaces).values({ userId, payload, revision: 1, updatedAt: now });
        return { ok: true, revision: 1, updatedAt: now.toISOString() };
      } catch {
        // A concurrent first save may have won the unique userId race. Read it
        // below and return a conflict rather than overwriting that workspace.
      }
    }
  }

  const current = await findWorkspaceByUser(userId);
  return {
    ok: false,
    reason: "conflict",
    revision: current?.revision ?? 0,
    payload: current?.payload ?? null,
    updatedAt: current?.updatedAt.toISOString() ?? null,
  };
}
