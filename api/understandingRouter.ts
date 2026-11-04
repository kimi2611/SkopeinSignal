import { TRPCError } from "@trpc/server";
import { generateObject } from "ai";
import { z } from "zod";
import {
  UNDERSTANDING_MAX_CHUNKS,
  chunkTranscriptSegments,
  transcriptCharacterCount,
} from "@contracts/understanding";
import { authedQuery, createRouter } from "./middleware";
import { getDefaultModelId, kimiGw } from "./ai/provider";
import { toTrpcAiError } from "./quizRouter";

const LANGUAGE_NAMES = { Chinese: "Chinese", English: "English", Deutsch: "German" } as const;
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

async function structuredCall<T>(schema: z.ZodType<T>, prompt: string) {
  try {
    const modelId = await getDefaultModelId();
    return await generateObject({ model: kimiGw(modelId), schema, prompt, maxRetries: 0 });
  } catch (error) {
    throw toTrpcAiError(error);
  }
}

const normalized = (value: string) => value.replace(/\s+/g, " ").trim();

export const understandingRouter = createRouter({
  summarize: authedQuery.input(z.object({
    episodeTitle: z.string().trim().min(1).max(400),
    language: z.enum(["Chinese", "English", "Deutsch"]),
    segments: sourceSegments,
  })).mutation(async ({ input }) => {
    if (transcriptCharacterCount(input.segments) > 120_000) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "SUMMARY_TOO_LARGE" });
    }
    const result = await structuredCall(summarySchema, [
      `Answer in ${LANGUAGE_NAMES[input.language]}. Create a four-part content summary of the podcast "${input.episodeTitle}" using only the supplied transcript.`,
      "theme states the central topic or research question. coreArguments explain the important claims and their reasoning. evidence lists concrete examples, data, first-hand accounts, or supporting reasons actually present in the transcript; do not invent citations, quotations, studies, or facts. expertPerspectives distinguishes viewpoints actually expressed by identified speakers; return an empty array when the transcript contains no distinct expert perspective, and never infer a speaker's name from the episode title.",
      "Treat the transcript as an imperfect speech-recognition record: do not turn an ambiguous recognition error into a factual claim. Do not use outside knowledge or claim to have heard the audio.",
      `Transcript:\n${JSON.stringify(input.segments)}`,
    ].join("\n\n"));
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

  analyze: authedQuery.input(z.object({
    episodeTitle: z.string().trim().min(1).max(400),
    language: z.enum(["Chinese", "English", "Deutsch"]),
    scope: z.enum(["full", "opening", "middle", "closing"]),
    sourceCharacters: z.number().int().nonnegative().max(5_000_000),
    sourceSegments: z.number().int().positive().max(5000),
    segments: sourceSegments,
  })).mutation(async ({ input }) => {
    const chunks = chunkTranscriptSegments(input.segments);
    if (chunks.length > UNDERSTANDING_MAX_CHUNKS) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "UNDERSTANDING_TOO_LARGE" });
    }
    const chapters = [];
    for (const chunk of chunks) {
      const result = await structuredCall(chunkSchema, [
        `Answer in ${LANGUAGE_NAMES[input.language]}. Analyse one chunk of the podcast "${input.episodeTitle}" for evidence-grounded understanding.`,
        "Use only the supplied transcript. title names the local topic; summary explains the reasoning rather than merely listing subjects.",
        "Return 1–6 consequential claims. evidence MUST be one consecutive verbatim passage copied from the named segmentId, not a paraphrase. text explains the claim supported by that passage. Do not invent speakers, facts, citations, or timestamps.",
        `Transcript chunk ${chunk.index + 1} of ${chunks.length}:\n${JSON.stringify(chunk.segments)}`,
      ].join("\n\n"));
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
    const synthesis = await structuredCall(synthesisSchema, [
      `Answer in ${LANGUAGE_NAMES[input.language]}. Synthesise the supplied evidence-grounded chapter analyses of "${input.episodeTitle}".`,
      "theme states the central question. coreArguments trace the argument across chapters without adding facts. openQuestions identify genuine unresolved assumptions, missing evidence, or productive counterarguments. Do not claim coverage beyond these chapters.",
      JSON.stringify(chapters),
    ].join("\n\n"));
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

  themes: authedQuery.input(z.object({
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
  })).mutation(async ({ input }) => {
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
    const result = await structuredCall(schema, [
      `Answer in ${LANGUAGE_NAMES[input.language]}. Build cross-episode theme maps using only the supplied podcast claims and evidence.`,
      "Group claims by a meaningful shared research question, not superficial keywords. Include contrast where the premises or conclusions genuinely differ. Every claim reference must exactly reuse a supplied claimId and episodeId. Never merge different episodes into an unattributed statement.",
      JSON.stringify(input.records),
    ].join("\n\n"));
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
