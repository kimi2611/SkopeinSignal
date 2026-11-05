import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { aiQuery, createRouter } from "./middleware";
import {
  AiInvalidRequest,
  AiMisconfigured,
  AiTransient,
  AiUnavailable,
  ContentRejected,
  classifyAiError,
} from "./ai/ai-client";
import { aiModelForAccess, getDefaultModelIdForAccess, invalidateModelCache } from "./ai/provider";
import { generateObjectWithRetry } from "./ai/resilient";
import { buildGenerationPrompt, buildGradingPrompt } from "./ai/prompts/quiz";
import { log } from "./lib/logger";

// The voice quiz turns an episode transcript into comprehension questions and
// grades the learner's spoken answers. Both directions are billable model
// calls, so they sit behind sign-in (the same gate as cloud sync) and are
// never auto-retried — see website-ai: retrying a billed call can double-charge.

const MAX_EXCERPT_CHARS = 8000;
const MAX_ANSWER_CHARS = 2000;

const generateInputSchema = z.object({
  episodeTitle: z.string().trim().min(1).max(400),
  showName: z.string().trim().min(1).max(200),
  language: z.enum(["English", "Deutsch"]),
  excerpt: z.string().trim().min(200).max(MAX_EXCERPT_CHARS),
  mode: z.enum(["short", "long"]),
  questionCount: z.number().int().min(2).max(6),
});

const gradeInputSchema = z.object({
  episodeTitle: z.string().trim().min(1).max(400),
  language: z.enum(["English", "Deutsch"]),
  questions: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        prompt: z.string().trim().min(1).max(1200),
        referenceAnswer: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(8),
  answers: z
    .array(
      z.object({
        questionId: z.string().trim().min(1).max(60),
        answer: z.string().trim().min(1).max(MAX_ANSWER_CHARS),
      }),
    )
    .min(1)
    .max(8),
});

const generatedQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string(),
        prompt: z.string(),
        referenceAnswer: z.string(),
      }),
    )
    .min(1)
    .max(8),
});

const gradingSchema = z.object({
  verdicts: z
    .array(
      z.object({
        questionId: z.string(),
        verdict: z.enum(["correct", "partial", "missed"]),
        feedback: z.string(),
      }),
    )
    .min(1)
    .max(8),
  score: z.number().min(0).max(100),
});

/** Map a classified gateway error to a TRPCError with a stable machine code. */
export function toTrpcAiError(err: unknown): TRPCError {
  const classified = classifyAiError(err);
  if (classified instanceof AiUnavailable) {
    return new TRPCError({ code: "FORBIDDEN", message: "AI_QUOTA_EXHAUSTED" });
  }
  if (classified instanceof ContentRejected) {
    return new TRPCError({ code: "BAD_REQUEST", message: "AI_CONTENT_REJECTED" });
  }
  if (classified instanceof AiMisconfigured) {
    return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_MISCONFIGURED" });
  }
  if (classified instanceof AiInvalidRequest) {
    // Developer error — keep it visible in the server log.
    log.error("quiz ai invalid request", { error: classified.message });
    return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_INVALID_REQUEST" });
  }
  if (classified instanceof AiTransient) {
    return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_TRANSIENT" });
  }
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_TRANSIENT" });
}

export const quizRouter = createRouter({
  generate: aiQuery.input(generateInputSchema).mutation(async ({ input, ctx }) => {
    let result;
    try {
      const modelId = await getDefaultModelIdForAccess(ctx.aiAccess);
      result = await generateObjectWithRetry({
        model: aiModelForAccess(ctx.aiAccess, modelId),
        schema: generatedQuestionsSchema,
        prompt: buildGenerationPrompt(input),
        maxRetries: 0,
      });
    } catch (err) {
      invalidateModelCache();
      throw toTrpcAiError(err);
    }

    const questions = result.object.questions
      .map((question, index) => ({
        id: question.id.trim() || `q${index + 1}`,
        prompt: question.prompt.trim(),
        referenceAnswer: question.referenceAnswer.trim(),
      }))
      .filter((question) => question.prompt && question.referenceAnswer)
      .slice(0, input.questionCount);
    if (!questions.length) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_EMPTY_RESULT" });
    }
    return { questions };
  }),

  grade: aiQuery.input(gradeInputSchema).mutation(async ({ input, ctx }) => {
    const answerByQuestion = new Map(input.answers.map((answer) => [answer.questionId, answer.answer]));

    let result;
    try {
      const modelId = await getDefaultModelIdForAccess(ctx.aiAccess);
      result = await generateObjectWithRetry({
        model: aiModelForAccess(ctx.aiAccess, modelId),
        schema: gradingSchema,
        maxRetries: 0,
        prompt: buildGradingPrompt({
          episodeTitle: input.episodeTitle,
          language: input.language,
          pairs: input.questions.map((question) => ({
            id: question.id,
            question: question.prompt,
            referenceAnswer: question.referenceAnswer,
            learnerAnswer: answerByQuestion.get(question.id) ?? "",
          })),
        }),
      });
    } catch (err) {
      throw toTrpcAiError(err);
    }

    const knownIds = new Set(input.questions.map((question) => question.id));
    const verdicts = result.object.verdicts
      .filter((verdict) => knownIds.has(verdict.questionId))
      .map((verdict) => ({
        questionId: verdict.questionId,
        verdict: verdict.verdict,
        feedback: verdict.feedback.trim(),
      }));
    if (!verdicts.length) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_EMPTY_RESULT" });
    }
    return { verdicts, score: Math.round(result.object.score) };
  }),
});
