import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { aiQuery, createRouter } from "./middleware";
import { aiModelForAccess, getDefaultModelIdForAccess, getVisionModelIdForAccess } from "./ai/provider";
import { generateObjectWithRetry } from "./ai/resilient";
import { toTrpcAiError } from "./quizRouter";
import { buildDefendPrompt, buildRecognizeText, buildRespondPrompt } from "./ai/prompts/sparks";

// Sparks: after an episode lands, the listener captures a raw idea and the
// atelier's AI answers with an honest evaluation and concrete suggestions.
// Same billing discipline as the voice quiz: sign-in required, and billable
// calls are never auto-retried.

const MAX_SPARK_CHARS = 1500;
const MAX_EXCERPT_CHARS = 8000;

const respondInputSchema = z.object({
  language: z.enum(["Chinese", "English", "Deutsch"]),
  spark: z.string().trim().min(4).max(MAX_SPARK_CHARS),
  episodeTitle: z.string().trim().min(1).max(400).optional(),
  excerpt: z.string().trim().min(200).max(MAX_EXCERPT_CHARS).optional(),
});

const sparkReplySchema = z.object({
  evaluation: z.string(),
  strengths: z.array(z.string()).min(1).max(4),
  suggestions: z.array(z.string()).min(1).max(4),
  followUp: z.string(),
});

async function structuredDefendCall(access: import("./ai/provider").AiAccess, input: {
  language: "Chinese" | "English" | "Deutsch";
  spark: string;
  episodeTitle?: string;
  evolution: Array<{ kind: string; text: string }>;
}) {
  try {
    const modelId = await getDefaultModelIdForAccess(access);
    const result = await generateObjectWithRetry({
      model: aiModelForAccess(access, modelId),
      schema: z.object({
        challenge: z.string(),
        defensePrompt: z.string(),
        evidenceNeeded: z.array(z.string()).min(1).max(4),
        counterargument: z.string(),
      }),
      maxRetries: 0,
      prompt: buildDefendPrompt(input),
    });
    return {
      challenge: result.object.challenge.trim(),
      defensePrompt: result.object.defensePrompt.trim(),
      evidenceNeeded: result.object.evidenceNeeded.map((item) => item.trim()).filter(Boolean),
      counterargument: result.object.counterargument.trim(),
    };
  } catch (error) {
    throw toTrpcAiError(error);
  }
}

export const sparksRouter = createRouter({
  recognize: aiQuery.input(z.object({
    language: z.enum(["Chinese", "English", "Deutsch"]),
    imageData: z.string().regex(/^data:image\/png;base64,/).max(7_000_000),
  })).mutation(async ({ input, ctx }) => {
    try {
      const modelId = await getVisionModelIdForAccess(ctx.aiAccess);
      if (!modelId) throw new TRPCError({ code: "BAD_REQUEST", message: "AI_VISION_UNAVAILABLE" });
      const result = await generateObjectWithRetry({
        model: aiModelForAccess(ctx.aiAccess, modelId),
        schema: z.object({
          transcript: z.string(),
          confidence: z.enum(["high", "medium", "low"]),
          uncertainSegments: z.array(z.string()).max(8),
        }),
        maxRetries: 0,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: buildRecognizeText(input.language) },
            { type: "image", image: input.imageData },
          ],
        }],
      });
      const transcript = result.object.transcript.trim();
      if (!transcript) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_EMPTY_RESULT" });
      return {
        transcript,
        confidence: result.object.confidence,
        uncertainSegments: result.object.uncertainSegments.map((item) => item.trim()).filter(Boolean),
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw toTrpcAiError(error);
    }
  }),

  defend: aiQuery.input(z.object({
    language: z.enum(["Chinese", "English", "Deutsch"]),
    spark: z.string().trim().min(4).max(1500),
    episodeTitle: z.string().trim().min(1).max(400).optional(),
    evolution: z.array(z.object({ kind: z.string(), text: z.string().trim().min(1).max(8000) })).max(30),
  })).mutation(async ({ input, ctx }) => {
    const result = await structuredDefendCall(ctx.aiAccess, input);
    return result;
  }),

  respond: aiQuery.input(respondInputSchema).mutation(async ({ input, ctx }) => {
    let result;
    try {
      const modelId = await getDefaultModelIdForAccess(ctx.aiAccess);
      result = await generateObjectWithRetry({
        model: aiModelForAccess(ctx.aiAccess, modelId),
        schema: sparkReplySchema,
        maxRetries: 0,
        prompt: buildRespondPrompt({
          language: input.language,
          spark: input.spark,
          episodeTitle: input.episodeTitle,
          excerpt: input.excerpt,
        }),
      });
    } catch (error) {
      throw toTrpcAiError(error);
    }

    const reply = {
      evaluation: result.object.evaluation.trim(),
      strengths: result.object.strengths.map((item) => item.trim()).filter(Boolean).slice(0, 4),
      suggestions: result.object.suggestions.map((item) => item.trim()).filter(Boolean).slice(0, 4),
      followUp: result.object.followUp.trim(),
    };
    if (!reply.evaluation || !reply.suggestions.length) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_EMPTY_RESULT" });
    }
    return reply;
  }),
});
