import { TRPCError } from "@trpc/server";
import { generateObject } from "ai";
import { z } from "zod";
import { authedQuery, createRouter } from "./middleware";
import { getDefaultModelId, kimiGw } from "./ai/provider";
import { toTrpcAiError } from "./quizRouter";

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

type PaperInput = z.infer<typeof paperInputSchema>;

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

function materialInstructions(input: PaperInput): string {
  if (input.source === "saved") {
    return [
      "Use the saved material below verbatim as the factual basis. Do not add claims to it.",
      JSON.stringify(input.savedMaterial),
    ].join("\n");
  }
  if (input.source === "snipd") {
    return [
      "The listener imported these Snipd summary/key-takeaway notes. Treat them as the only source material; do not claim access to private Snipd data or add outside facts.",
      "Distil the theme, core arguments, evidence, and expert perspectives from these notes.",
      `Snipd import:\n"""\n${input.snipdText}\n"""`,
    ].join("\n");
  }
  return [
    "Summarise the podcast transcript excerpt into theme, core arguments, evidence, and expert perspectives. Use only claims supported by the excerpt.",
    input.instruction ? `The listener's summarisation instruction: ${input.instruction}` : "Focus on claims and evidence that can support an IELTS discussion without copying the episode wording.",
    `Transcript excerpt (possibly truncated):\n"""\n${input.excerpt}\n"""`,
  ].join("\n");
}

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

async function structuredCall<T>(schema: z.ZodType<T>, prompt: string) {
  try {
    const modelId = await getDefaultModelId();
    return await generateObject({ model: kimiGw(modelId), schema, prompt, maxRetries: 0 });
  } catch (error) {
    throw toTrpcAiError(error);
  }
}

export const ieltsRouter = createRouter({
  generateSpeaking: authedQuery.input(paperInputSchema).mutation(async ({ input }) => {
    const result = await structuredCall(speakingPaperSchema, [
      "You design rigorous IELTS-style Speaking practice from podcast material. This is unofficial practice, not an actual IELTS test.",
      `Episode: "${input.episodeTitle}" from "${input.showName}".`,
      materialInstructions(input),
      "Return the material and exactly six English questions in this order: three Part 1 questions, one Part 2 individual-long-turn cue card, then two Part 3 discussion questions.",
      "Part 1 answers should take 20–30 seconds each. Part 2 must ask for a 1–2 minute talk and include three or four short cue points in the prompt. Part 3 must probe the core arguments, evidence, trade-offs, or implications rather than personal recall.",
      "The questions must be original IELTS-style prompts inspired by the material, not comprehension questions asking what the host said. referenceNotes should briefly identify the material and a strong line of discussion for later feedback.",
    ].join("\n\n"));
    const material = input.source === "saved" && input.savedMaterial ? cleanMaterial(input.savedMaterial) : cleanMaterial(result.object.material);
    const questions = normalizeSpeakingQuestions(result.object.questions);
    if (questions.some((question) => !question.prompt || !question.referenceNotes)) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_EMPTY_RESULT" });
    return { material, questions, source: input.source };
  }),

  generateWriting: authedQuery.input(paperInputSchema).mutation(async ({ input }) => {
    const result = await structuredCall(writingPaperSchema, [
      "You design rigorous IELTS Academic Writing Task 2 practice from podcast material. This is unofficial practice, not an actual IELTS test.",
      `Episode: "${input.episodeTitle}" from "${input.showName}".`,
      materialInstructions(input),
      "Create one original English Task 2 essay prompt about a debatable issue raised by the material. Use a familiar IELTS Task 2 form such as opinion, discussion, advantages/disadvantages, or problem/solution.",
      "The short context may paraphrase the core debate but must not prescribe the writer's position. The prompt must require at least 250 words and suggest 40 minutes. Do not ask the writer to summarise the podcast.",
      "Return the distilled material as well as the task so the learner can inspect the source basis.",
    ].join("\n\n"));
    const material = input.source === "saved" && input.savedMaterial ? cleanMaterial(input.savedMaterial) : cleanMaterial(result.object.material);
    const task = normalizeWritingTask(result.object.task);
    if (!task.prompt || !task.context) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_EMPTY_RESULT" });
    return { material, task, source: input.source };
  }),

  gradeSpeaking: authedQuery.input(z.object({
    episodeTitle: z.string().trim().min(1).max(400),
    questions: z.array(speakingQuestionSchema).length(6),
    answers: z.array(z.object({ questionId: z.string(), answer: z.string().trim().max(4000) })).length(6),
  })).mutation(async ({ input }) => {
    const answerById = new Map(input.answers.map((answer) => [answer.questionId, answer.answer]));
    const transcript = input.questions.map((question, index) => [
      `Q${index + 1} / Part ${question.part} / ${question.id}: ${question.prompt}`,
      `Reference notes: ${question.referenceNotes}`,
      `Learner speech-recognition transcript: ${answerById.get(question.id) ?? ""}`,
    ].join("\n")).join("\n\n");
    const result = await structuredCall(speakingGradeSchema, [
      `Assess this unofficial IELTS-style Speaking practice for "${input.episodeTitle}".`,
      "Use the public IELTS Speaking dimensions of Fluency and Coherence, Lexical Resource, and Grammatical Range and Accuracy. Give each a 0–9 band in 0.5 increments based only on the speech-recognition transcripts.",
      "Do NOT award a pronunciation band: audio is unavailable and recognition errors are not pronunciation evidence. Speech-recognition noise, homophone substitutions, and missing punctuation are dictation artifacts, not comprehension or fluency evidence; assess the recoverable intended meaning, and state uncertainty instead of treating a possible misrecognition as an understanding error. pronunciationNote must explain that limitation and offer at most one cautious observation about clarity of wording.",
      "Give concise, specific feedback for every question, including unanswered ones. Judge content development as part of fluency/coherence, not whether the learner agrees with the podcast. End with 2–4 concrete next steps.",
      transcript,
    ].join("\n\n"));
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

  gradeWriting: authedQuery.input(z.object({
    episodeTitle: z.string().trim().min(1).max(400),
    task: z.object({ prompt: z.string().trim().min(1).max(3000), context: z.string().trim().min(1).max(3000) }),
    answer: z.string().trim().min(1).max(24000),
  })).mutation(async ({ input }) => {
    const result = await structuredCall(writingGradeSchema, [
      `Assess this unofficial IELTS Academic Writing Task 2 practice for "${input.episodeTitle}".`,
      `Context: ${input.task.context}`,
      `Task: ${input.task.prompt}`,
      "Use the four public IELTS Writing Task 2 dimensions: Task Response, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy. Give each a 0–9 band in 0.5 increments.",
      "Reward a clear position, developed reasoning, paragraphing, and precise language. Do not require agreement with the source podcast. Account for an under-length answer in Task Response without inventing a mechanical formula.",
      "generalFeedback should be specific and concise. nextSteps should contain 2–4 actionable revisions; do not write a replacement essay for the learner.",
      `Learner essay:\n"""\n${input.answer}\n"""`,
    ].join("\n\n"));
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
