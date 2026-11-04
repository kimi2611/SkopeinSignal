import { TRPCError } from "@trpc/server";
import { generateObject } from "ai";
import { z } from "zod";
import { authedQuery, createRouter } from "./middleware";
import { getDefaultModelId, getVisionModelId, kimiGw } from "./ai/provider";
import { toTrpcAiError } from "./quizRouter";

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

const LANGUAGE_NAMES: Record<"Chinese" | "English" | "Deutsch", string> = {
  Chinese: "Chinese",
  English: "English",
  Deutsch: "German",
};

async function structuredDefendCall(input: {
  language: "Chinese" | "English" | "Deutsch";
  spark: string;
  episodeTitle?: string;
  evolution: Array<{ kind: string; text: string }>;
}) {
  try {
    const modelId = await getDefaultModelId();
    const result = await generateObject({
      model: kimiGw(modelId),
      schema: z.object({
        challenge: z.string(),
        defensePrompt: z.string(),
        evidenceNeeded: z.array(z.string()).min(1).max(4),
        counterargument: z.string(),
      }),
      maxRetries: 0,
      prompt: [
        `Answer in ${LANGUAGE_NAMES[input.language]}. You are a rigorous but constructive research mentor.`,
        "Turn the listener's idea and its recorded evolution into a self-defense exercise. Do not declare the idea true or false and do not invent research findings.",
        "challenge identifies the most consequential unsupported assumption. defensePrompt asks the listener to defend the revised claim in one developed spoken or written paragraph. evidenceNeeded lists specific kinds of evidence, not fabricated citations. counterargument presents the strongest reasonable opposing position.",
        input.episodeTitle ? `Related episode: ${input.episodeTitle}` : "No specific episode is linked.",
        `Original idea:\n${input.spark}`,
        `Evolution so far:\n${JSON.stringify(input.evolution)}`,
      ].join("\n\n"),
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
  recognize: authedQuery.input(z.object({
    language: z.enum(["Chinese", "English", "Deutsch"]),
    imageData: z.string().regex(/^data:image\/png;base64,/).max(7_000_000),
  })).mutation(async ({ input }) => {
    try {
      const modelId = await getVisionModelId();
      if (!modelId) throw new TRPCError({ code: "BAD_REQUEST", message: "AI_VISION_UNAVAILABLE" });
      const result = await generateObject({
        model: kimiGw(modelId),
        schema: z.object({
          transcript: z.string(),
          confidence: z.enum(["high", "medium", "low"]),
          uncertainSegments: z.array(z.string()).max(8),
        }),
        maxRetries: 0,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Transcribe the handwritten note in this image. The likely language is ${LANGUAGE_NAMES[input.language]}, but preserve the actual language(s) you see. Reproduce only visible handwriting; do not summarise, complete, correct, or invent ideas. Ignore printed page titles and ruled lines. Preserve paragraph breaks where legible. Mark genuinely unreadable words as [unclear] and list them in uncertainSegments. Return plain text without a title.` },
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

  defend: authedQuery.input(z.object({
    language: z.enum(["Chinese", "English", "Deutsch"]),
    spark: z.string().trim().min(4).max(1500),
    episodeTitle: z.string().trim().min(1).max(400).optional(),
    evolution: z.array(z.object({ kind: z.string(), text: z.string().trim().min(1).max(8000) })).max(30),
  })).mutation(async ({ input }) => {
    const result = await structuredDefendCall(input);
    return result;
  }),

  respond: authedQuery.input(respondInputSchema).mutation(async ({ input }) => {
    const replyLanguage = LANGUAGE_NAMES[input.language];
    let result;
    try {
      const modelId = await getDefaultModelId();
      result = await generateObject({
        model: kimiGw(modelId),
        schema: sparkReplySchema,
        maxRetries: 0,
        prompt: [
          `You are a research mentor inside a private podcast atelier.`,
          `The listener has just finished ${input.episodeTitle ? `the episode "${input.episodeTitle}"` : "a podcast episode"} and captured a raw idea (a "spark").`,
          `Answer in ${replyLanguage}. Be honest and specific — praise only what is genuinely strong.`,
          `evaluation: two or three sentences judging the idea's substance and originality, tying it back to what the episode actually argued.`,
          `strengths: one to four short bullet phrases naming what works.`,
          `suggestions: one to four concrete next steps to test, sharpen, or extend the idea (a question to research, a source type to consult, a counterargument to check).`,
          `followUp: one question that would most deepen this spark if the listener answered it next.`,
          `Do not invent facts about the episode beyond the excerpt provided; if the spark drifts from the episode, say so in the evaluation.`,
          ``,
          `The listener's spark:`,
          `"""`,
          input.spark,
          `"""`,
          ...(input.excerpt ? [``, `Episode transcript excerpt (grounding, possibly truncated):`, `"""`, input.excerpt, `"""`] : []),
        ].join("\n"),
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
