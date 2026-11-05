import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  UNDERSTANDING_MAX_CHUNKS,
  chunkTranscriptSegments,
  transcriptCharacterCount,
} from "@contracts/understanding";
import { aiQuery, createRouter } from "./middleware";
import { aiModelForAccess, getDefaultModelIdForAccess, type AiAccess } from "./ai/provider";
import { generateObjectWithRetry } from "./ai/resilient";
import { toTrpcAiError } from "./quizRouter";
import {
  buildChunkPrompt,
  buildSummaryPrompt,
  buildSynthesisPrompt,
  buildThemesPrompt,
} from "./ai/prompts/understanding";

const sourceSegment = z.object({
  id: z.string().trim().min(1).max(160),
  start: z.number().finite().nonnegative().nullable(),
  end: z.number().finite().nonnegative().nullable(),
  text: z.string().trim().min(1).max(20000),
});
const sourceSegments = z.array(sourceSegment).min(1).max(5000);

const chunkSchema = z.object({
  title: z.string(),
  summary: z.string(),
  claims: z.array(z.object({
    text: z.string(),
    evidence: z.string(),
    segmentId: z.string(),
  })).min(1).max(6),
});
const synthesisSchema = z.object({
  theme: z.string(),
  coreArguments: z.array(z.string()).min(1).max(10),
  openQuestions: z.array(z.string()).min(1).max(8),
});
const summarySchema = z.object({
  theme: z.string(),
  coreArguments: z.array(z.string()).min(1).max(8),
  evidence: z.array(z.string()).min(1).max(8),
  expertPerspectives: z.array(z.string()).max(6),
});

async function structuredCall<T>(access: AiAccess, schema: z.ZodType<T>, prompt: string) {
  try {
    const modelId = await getDefaultModelIdForAccess(access);
    return await generateObjectWithRetry({ model: aiModelForAccess(access, modelId), schema, prompt });
  } catch (error) {
    throw toTrpcAiError(error);
  }
}

const normalized = (value: string) => value.replace(/\s+/g, " ").trim();

export const understandingRouter = createRouter({
  summarize: aiQuery.input(z.object({
    episodeTitle: z.string().trim().min(1).max(400),
    language: z.enum(["Chinese", "English", "Deutsch"]),
    segments: sourceSegments,
  })).mutation(async ({ input, ctx }) => {
    if (transcriptCharacterCount(input.segments) > 120_000) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "SUMMARY_TOO_LARGE" });
    }
    const result = await structuredCall(ctx.aiAccess, summarySchema, buildSummaryPrompt({
      language: input.language,
      episodeTitle: input.episodeTitle,
      segments: input.segments,
    }));
    const summary = {
      theme: result.object.theme.trim(),
      coreArguments: result.object.coreArguments.map((item) => item.trim()).filter(Boolean),
      evidence: result.object.evidence.map((item) => item.trim()).filter(Boolean),
      expertPerspectives: result.object.expertPerspectives.map((item) => item.trim()).filter(Boolean),
    };
    if (!summary.theme || !summary.coreArguments.length || !summary.evidence.length) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_EMPTY_RESULT" });
    }
    return summary;
  }),

  analyze: aiQuery.input(z.object({
    episodeTitle: z.string().trim().min(1).max(400),
    language: z.enum(["Chinese", "English", "Deutsch"]),
    scope: z.enum(["full", "opening", "middle", "closing"]),
    sourceCharacters: z.number().int().nonnegative().max(5_000_000),
    sourceSegments: z.number().int().positive().max(5000),
    segments: sourceSegments,
  })).mutation(async ({ input, ctx }) => {
    const chunks = chunkTranscriptSegments(input.segments);
    if (chunks.length > UNDERSTANDING_MAX_CHUNKS) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "UNDERSTANDING_TOO_LARGE" });
    }
    const chapters = [];
    for (const chunk of chunks) {
      const result = await structuredCall(ctx.aiAccess, chunkSchema, buildChunkPrompt({
        language: input.language,
        episodeTitle: input.episodeTitle,
        chunkIndex: chunk.index,
        chunkCount: chunks.length,
        segments: chunk.segments,
      }));
      const byId = new Map(chunk.segments.map((segment) => [segment.id, segment]));
      const claims = result.object.claims.flatMap((claim, claimIndex) => {
        const segment = byId.get(claim.segmentId);
        const evidence = normalized(claim.evidence);
        const text = claim.text.trim();
        if (!segment || !text || evidence.length < 8 || !normalized(segment.text).includes(evidence)) return [];
        return [{
          id: `u-${chunk.index + 1}-${claimIndex + 1}`,
          text,
          evidence,
          segmentId: segment.id,
          startSeconds: segment.start,
        }];
      });
      if (!claims.length) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_EVIDENCE_NOT_GROUNDED" });
      }
      chapters.push({
        id: `chapter-${chunk.index + 1}`,
        title: result.object.title.trim() || `Part ${chunk.index + 1}`,
        summary: result.object.summary.trim(),
        claims,
      });
    }
    const synthesis = await structuredCall(ctx.aiAccess, synthesisSchema, buildSynthesisPrompt({
      language: input.language,
      episodeTitle: input.episodeTitle,
      chapters,
    }));
    const coreArguments = synthesis.object.coreArguments.map((item) => item.trim()).filter(Boolean);
    const openQuestions = synthesis.object.openQuestions.map((item) => item.trim()).filter(Boolean);
    const theme = synthesis.object.theme.trim();
    if (!theme || !coreArguments.length || !openQuestions.length) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_EMPTY_RESULT" });
    }
    return {
      scope: input.scope,
      sourceCharacters: input.sourceCharacters,
      coveredCharacters: transcriptCharacterCount(input.segments),
      sourceSegments: input.sourceSegments,
      coveredSegments: input.segments.length,
      chunkCount: chunks.length,
      theme,
      coreArguments,
      openQuestions,
      chapters,
    };
  }),

  themes: aiQuery.input(z.object({
    language: z.enum(["Chinese", "English", "Deutsch"]),
    records: z.array(z.object({
      episodeId: z.string().trim().min(1).max(160),
      episodeTitle: z.string().trim().min(1).max(400),
      claims: z.array(z.object({
        id: z.string().trim().min(1).max(160),
        text: z.string().trim().min(1).max(4000),
        evidence: z.string().trim().min(1).max(5000),
      })).min(1).max(60),
    })).min(2).max(12),
  })).mutation(async ({ input, ctx }) => {
    const schema = z.object({
      themes: z.array(z.object({
        title: z.string(),
        synthesis: z.string(),
        questions: z.array(z.string()).min(1).max(4),
        claims: z.array(z.object({
          claimId: z.string(),
          episodeId: z.string(),
          role: z.enum(["support", "contrast", "question"]),
        })).min(2).max(30),
      })).min(1).max(4),
    });
    const result = await structuredCall(ctx.aiAccess, schema, buildThemesPrompt({
      language: input.language,
      records: input.records,
    }));
    const known = new Map<string, string>(input.records.flatMap((record) => record.claims.map((claim) => [`${record.episodeId}\u0000${claim.id}`, record.episodeId] as const)));
    const themes = result.object.themes.flatMap((theme) => {
      const seen = new Set<string>();
      const claims = theme.claims.flatMap((claim) => {
        const key = `${claim.episodeId}\u0000${claim.claimId}`;
        if (!known.has(key) || seen.has(key)) return [];
        seen.add(key);
        return [{ claimId: claim.claimId, episodeId: claim.episodeId, role: claim.role }];
      });
      const episodeIds = Array.from(new Set(claims.map((claim) => claim.episodeId)));
      if (claims.length < 2 || episodeIds.length < 2 || !theme.title.trim() || !theme.synthesis.trim()) return [];
      return [{
        title: theme.title.trim(),
        synthesis: theme.synthesis.trim(),
        questions: theme.questions.map((item) => item.trim()).filter(Boolean).slice(0, 4),
        claims,
        episodeIds,
      }];
    });
    if (!themes.length) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_EMPTY_RESULT" });
    return { themes };
  }),
});
