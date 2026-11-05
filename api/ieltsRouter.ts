import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { aiQuery, createRouter } from "./middleware";
import { aiModelForAccess, getDefaultModelIdForAccess, type AiAccess } from "./ai/provider";
import { generateObjectWithRetry } from "./ai/resilient";
import { toTrpcAiError } from "./quizRouter";
import {
  buildSpeakingGradePrompt,
  buildSpeakingPaperPrompt,
  buildWritingGradePrompt,
  buildWritingPaperPrompt,
  type SpeakingGradeQuestion,
} from "./ai/prompts/ielts";

const materialSchema = z.object({
  theme: z.string().trim().min(1).max(1200),
  coreArguments: z.array(z.string().trim().min(1).max(1200)).min(1).max(8),
  evidence: z.array(z.string().trim().min(1).max(1200)).max(10),
  expertPerspectives: z.array(z.string().trim().min(1).max(1200)).max(8),
});

export const paperInputSchema = z.object({
  episodeTitle: z.string().trim().min(1).max(400),
  showName: z.string().trim().min(1).max(200),
  source: z.enum(["saved", "snipd", "ai"]),
  excerpt: z.string().trim().max(8000).optional(),
  snipdText: z.string().trim().max(12000).optional(),
  instruction: z.string().trim().max(600).optional(),
  savedMaterial: materialSchema.optional(),
}).superRefine((input, context) => {
  if (input.source === "saved" && !input.savedMaterial) context.addIssue({ code: "custom", message: "Saved material is required" });
  if (input.source === "snipd" && (!input.snipdText || input.snipdText.length < 80)) context.addIssue({ code: "custom", message: "Snipd notes are too short" });
  if (input.source === "ai" && (!input.excerpt || input.excerpt.length < 200)) context.addIssue({ code: "custom", message: "A transcript excerpt is required" });
});

const speakingQuestionSchema = z.object({
  id: z.string(),
  part: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  prompt: z.string(),
  referenceNotes: z.string(),
});

const speakingPaperSchema = z.object({
  material: materialSchema,
  questions: z.array(speakingQuestionSchema).length(6),
});

const writingPaperSchema = z.object({
  material: materialSchema,
  task: z.object({
    prompt: z.string(),
    context: z.string(),
    minimumWords: z.number().int().min(200).max(300),
    suggestedMinutes: z.number().int().min(30).max(50),
  }),
});

const band = z.number().min(0).max(9);

const speakingGradeSchema = z.object({
  fluencyCoherence: band,
  lexicalResource: band,
  grammaticalRangeAccuracy: band,
  pronunciationNote: z.string(),
  questionFeedback: z.array(z.object({ questionId: z.string(), feedback: z.string() })).min(1).max(6),
  nextSteps: z.array(z.string()).min(2).max(4),
});

const writingGradeSchema = z.object({
  taskResponse: band,
  coherenceCohesion: band,
  lexicalResource: band,
  grammaticalRangeAccuracy: band,
  generalFeedback: z.string(),
  nextSteps: z.array(z.string()).min(2).max(4),
});

/** 材料来源说明已迁至 api/ai/prompts/ielts.ts（materialInstructions）。 */

function cleanMaterial(material: z.infer<typeof materialSchema>) {
  return {
    theme: material.theme.trim(),
    coreArguments: material.coreArguments.map((item) => item.trim()).filter(Boolean).slice(0, 8),
    evidence: material.evidence.map((item) => item.trim()).filter(Boolean).slice(0, 10),
    expertPerspectives: material.expertPerspectives.map((item) => item.trim()).filter(Boolean).slice(0, 8),
  };
}

export function halfBand(value: number): number {
  return Math.round(Math.min(9, Math.max(0, value)) * 2) / 2;
}

export function overallBand(scores: number[]): number {
  return halfBand(scores.reduce((total, score) => total + halfBand(score), 0) / scores.length);
}

/** Enforce the paper contract even if a model returns parts or ids out of order. */
export function normalizeSpeakingQuestions(
  questions: Array<z.infer<typeof speakingQuestionSchema>>,
): Array<z.infer<typeof speakingQuestionSchema>> {
  const parts = [1, 1, 1, 2, 3, 3] as const;
  return questions.map((question, index) => ({
    id: `ielts-s${index + 1}`,
    part: parts[index],
    prompt: question.prompt.trim(),
    referenceNotes: question.referenceNotes.trim(),
  }));
}

export function normalizeWritingTask(task: { prompt: string; context: string }) {
  return {
    prompt: task.prompt.trim(),
    context: task.context.trim(),
    minimumWords: 250,
    suggestedMinutes: 40,
  };
}

export function feedbackForKnownQuestions(
  feedback: Array<{ questionId: string; feedback: string }>,
  questions: Array<{ id: string }>,
): Array<{ questionId: string; feedback: string }> {
  const knownIds = new Set(questions.map((question) => question.id));
  const seen = new Set<string>();
  return feedback.flatMap((item) => {
    const questionId = item.questionId.trim();
    const text = item.feedback.trim();
    if (!knownIds.has(questionId) || seen.has(questionId) || !text) return [];
    seen.add(questionId);
    return [{ questionId, feedback: text }];
  });
}

async function structuredCall<T>(access: AiAccess, schema: z.ZodType<T>, prompt: string) {
  try {
    const modelId = await getDefaultModelIdForAccess(access);
    return await generateObjectWithRetry({ model: aiModelForAccess(access, modelId), schema, prompt });
  } catch (error) {
    throw toTrpcAiError(error);
  }
}

export const ieltsRouter = createRouter({
  generateSpeaking: aiQuery.input(paperInputSchema).mutation(async ({ input, ctx }) => {
    const result = await structuredCall(ctx.aiAccess, speakingPaperSchema, buildSpeakingPaperPrompt(input));
    const material = input.source === "saved" && input.savedMaterial ? cleanMaterial(input.savedMaterial) : cleanMaterial(result.object.material);
    const questions = normalizeSpeakingQuestions(result.object.questions);
    if (questions.some((question) => !question.prompt || !question.referenceNotes)) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_EMPTY_RESULT" });
    return { material, questions, source: input.source };
  }),

  generateWriting: aiQuery.input(paperInputSchema).mutation(async ({ input, ctx }) => {
    const result = await structuredCall(ctx.aiAccess, writingPaperSchema, buildWritingPaperPrompt(input));
    const material = input.source === "saved" && input.savedMaterial ? cleanMaterial(input.savedMaterial) : cleanMaterial(result.object.material);
    const task = normalizeWritingTask(result.object.task);
    if (!task.prompt || !task.context) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_EMPTY_RESULT" });
    return { material, task, source: input.source };
  }),

  gradeSpeaking: aiQuery.input(z.object({
    episodeTitle: z.string().trim().min(1).max(400),
    questions: z.array(speakingQuestionSchema).length(6),
    answers: z.array(z.object({ questionId: z.string(), answer: z.string().trim().max(4000) })).length(6),
  })).mutation(async ({ input, ctx }) => {
    const answerById = new Map(input.answers.map((answer) => [answer.questionId, answer.answer]));
    const questions: SpeakingGradeQuestion[] = input.questions.map((question) => ({
      id: question.id,
      part: question.part,
      prompt: question.prompt,
      referenceNotes: question.referenceNotes,
      learnerTranscript: answerById.get(question.id) ?? "",
    }));
    const result = await structuredCall(ctx.aiAccess, speakingGradeSchema, buildSpeakingGradePrompt({
      episodeTitle: input.episodeTitle,
      questions,
    }));
    const questionFeedback = feedbackForKnownQuestions(result.object.questionFeedback, input.questions);
    const scores = [result.object.fluencyCoherence, result.object.lexicalResource, result.object.grammaticalRangeAccuracy].map(halfBand);
    return {
      overallBand: overallBand(scores),
      fluencyCoherence: scores[0],
      lexicalResource: scores[1],
      grammaticalRangeAccuracy: scores[2],
      pronunciationNote: result.object.pronunciationNote.trim(),
      questionFeedback,
      nextSteps: result.object.nextSteps.map((item) => item.trim()).filter(Boolean).slice(0, 4),
    };
  }),

  gradeWriting: aiQuery.input(z.object({
    episodeTitle: z.string().trim().min(1).max(400),
    task: z.object({ prompt: z.string().trim().min(1).max(3000), context: z.string().trim().min(1).max(3000) }),
    answer: z.string().trim().min(1).max(24000),
  })).mutation(async ({ input, ctx }) => {
    const result = await structuredCall(ctx.aiAccess, writingGradeSchema, buildWritingGradePrompt({
      episodeTitle: input.episodeTitle,
      taskContext: input.task.context,
      taskPrompt: input.task.prompt,
      answer: input.answer,
    }));
    const scores = [result.object.taskResponse, result.object.coherenceCohesion, result.object.lexicalResource, result.object.grammaticalRangeAccuracy].map(halfBand);
    return {
      overallBand: overallBand(scores),
      taskResponse: scores[0],
      coherenceCohesion: scores[1],
      lexicalResource: scores[2],
      grammaticalRangeAccuracy: scores[3],
      generalFeedback: result.object.generalFeedback.trim(),
      nextSteps: result.object.nextSteps.map((item) => item.trim()).filter(Boolean).slice(0, 4),
    };
  }),
});
