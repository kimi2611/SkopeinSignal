import { TRPCError } from "@trpc/server";
import { generateObject } from "ai";
import { z } from "zod";
import { authedQuery, createRouter } from "./middleware";
import {
  AiInvalidRequest,
  AiMisconfigured,
  AiTransient,
  AiUnavailable,
  ContentRejected,
  classifyAiError,
} from "./ai/ai-client";
import { getDefaultModelId, invalidateModelCache, kimiGw } from "./ai/provider";
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

const LANGUAGE_NAMES: Record<"English" | "Deutsch", string> = {
  English: "English",
  Deutsch: "German",
};

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

export function buildGenerationPrompt(input: z.infer<typeof generateInputSchema>): string {
  const questionLanguage = LANGUAGE_NAMES[input.language];
  const modeInstructions = input.mode === "short"
    ? [
        `Write concise, self-contained comprehension questions without quoting the transcript.`,
        `Each question must be answerable in one or two short spoken sentences. Focus on one main claim, supporting detail, example, or cause at a time; do not ask for a long explanation or combine several questions.`,
      ]
    : [
        `Every question must be an AI LONG-FORM QUESTION: quote a passage of two to four sentences verbatim from the excerpt, then ask the learner to interpret the speaker's reasoning, explain why the passage matters, or connect it to the episode's broader argument.`,
        `Each question should invite a developed spoken paragraph rather than a one-sentence answer. Do not turn the mode back into a set of short factual questions.`,
      ];
  return [
    `You are a language-learning tutor building a listening-comprehension speaking exercise.`,
    `The learner has just listened to the podcast episode "${input.episodeTitle}" from the show "${input.showName}".`,
    `Write exactly ${input.questionCount} open questions about the episode, based ONLY on the transcript excerpt below — do not invent facts that are not in it.`,
    ...modeInstructions,
    `Never write yes/no, true/false, or multiple-choice questions. Write the questions and the reference answers in ${questionLanguage}.`,
    `Give each question a short stable id (q1, q2, ...). The referenceAnswer is the concise ideal answer used later for grading.`,
    ``,
    `Transcript excerpt (possibly truncated):`,
    `"""`,
    input.excerpt,
    `"""`,
  ].join("\n");
}

export const quizRouter = createRouter({
  generate: authedQuery.input(generateInputSchema).mutation(async ({ input }) => {
    let result;
    try {
      const modelId = await getDefaultModelId();
      result = await generateObject({
        model: kimiGw(modelId),
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

  grade: authedQuery.input(gradeInputSchema).mutation(async ({ input }) => {
    const feedbackLanguage = LANGUAGE_NAMES[input.language];
    const answerByQuestion = new Map(input.answers.map((answer) => [answer.questionId, answer.answer]));
    const pairs = input.questions.map((question) => ({
      id: question.id,
      question: question.prompt,
      referenceAnswer: question.referenceAnswer,
      learnerAnswer: answerByQuestion.get(question.id) ?? "",
    }));

    let result;
    try {
      const modelId = await getDefaultModelId();
      result = await generateObject({
        model: kimiGw(modelId),
        schema: gradingSchema,
        maxRetries: 0,
        prompt: [
          `You are a language-learning tutor grading a listening-comprehension quiz on the podcast episode "${input.episodeTitle}".`,
          `Grade each learner answer against its reference answer. Judge comprehension of the episode, not grammar or pronunciation. The answers were dictated through browser speech recognition: treat recognition noise, missing punctuation, homophone substitutions, and probable misrecognitions as dictation artifacts, never as evidence of misunderstanding. When the intended meaning is reasonably recoverable, grade that meaning; use "missed" only when the answer is substantively wrong, unrelated, or absent.`,
          `verdict: "correct" when the learner captured the substance; "partial" when roughly half right or missing a key element; "missed" when substantively wrong or unrelated.`,
          `feedback: one or two sentences in ${feedbackLanguage}, saying what was good and what was missed. Do not diagnose a comprehension error from wording that could plausibly be a speech-recognition artifact; mention uncertainty instead of asserting a misunderstanding.`,
          `score: an overall 0-100 comprehension score across all questions.`,
          ``,
          ...pairs.flatMap((pair, index) => [
            `Q${index + 1} (${pair.id}): ${pair.question}`,
            `Reference: ${pair.referenceAnswer}`,
            `Learner: ${pair.learnerAnswer}`,
            ``,
          ]),
        ].join("\n"),
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
