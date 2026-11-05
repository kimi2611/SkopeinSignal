// ielts 域 prompt 模板（M2：自 ieltsRouter.ts 逐字搬迁）。
import { LANGUAGE_NAMES, fenced } from "./shared";

export interface IeltsMaterial {
  theme: string;
  coreArguments: string[];
  evidence: string[];
  expertPerspectives: string[];
}

export type PaperSource = "saved" | "snipd" | "ai";

export interface PaperMaterialInput {
  source: PaperSource;
  excerpt?: string;
  snipdText?: string;
  instruction?: string;
  savedMaterial?: IeltsMaterial;
}

/** 材料来源三分支（saved / snipd / ai transcript），文本逐字搬迁。 */
export function materialInstructions(input: PaperMaterialInput): string {
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
      fenced("Snipd import", input.snipdText ?? ""),
    ].join("\n");
  }
  return [
    "Summarise the podcast transcript excerpt into theme, core arguments, evidence, and expert perspectives. Use only claims supported by the excerpt.",
    input.instruction ? `The listener's summarisation instruction: ${input.instruction}` : "Focus on claims and evidence that can support an IELTS discussion without copying the episode wording.",
    fenced("Transcript excerpt (possibly truncated)", input.excerpt ?? ""),
  ].join("\n");
}

export function buildSpeakingPaperPrompt(input: PaperMaterialInput & {
  episodeTitle: string;
  showName: string;
}): string {
  return [
    "You design rigorous IELTS-style Speaking practice from podcast material. This is unofficial practice, not an actual IELTS test.",
    `Episode: "${input.episodeTitle}" from "${input.showName}".`,
    materialInstructions(input),
    "Return the material and exactly six English questions in this order: three Part 1 questions, one Part 2 individual-long-turn cue card, then two Part 3 discussion questions.",
    "Part 1 answers should take 20–30 seconds each. Part 2 must ask for a 1–2 minute talk and include three or four short cue points in the prompt. Part 3 must probe the core arguments, evidence, trade-offs, or implications rather than personal recall.",
    "The questions must be original IELTS-style prompts inspired by the material, not comprehension questions asking what the host said. referenceNotes should briefly identify the material and a strong line of discussion for later feedback.",
  ].join("\n\n");
}

export function buildWritingPaperPrompt(input: PaperMaterialInput & {
  episodeTitle: string;
  showName: string;
}): string {
  return [
    "You design rigorous IELTS Academic Writing Task 2 practice from podcast material. This is unofficial practice, not an actual IELTS test.",
    `Episode: "${input.episodeTitle}" from "${input.showName}".`,
    materialInstructions(input),
    "Create one original English Task 2 essay prompt about a debatable issue raised by the material. Use a familiar IELTS Task 2 form such as opinion, discussion, advantages/disadvantages, or problem/solution.",
    "The short context may paraphrase the core debate but must not prescribe the writer's position. The prompt must require at least 250 words and suggest 40 minutes. Do not ask the writer to summarise the podcast.",
    "Return the distilled material as well as the task so the learner can inspect the source basis.",
  ].join("\n\n");
}

export interface SpeakingGradeQuestion {
  id: string;
  part: 1 | 2 | 3;
  prompt: string;
  referenceNotes: string;
  learnerTranscript: string;
}

export function buildSpeakingGradePrompt(input: {
  episodeTitle: string;
  questions: SpeakingGradeQuestion[];
}): string {
  const transcript = input.questions.map((question, index) => [
    `Q${index + 1} / Part ${question.part} / ${question.id}: ${question.prompt}`,
    `Reference notes: ${question.referenceNotes}`,
    `Learner speech-recognition transcript: ${question.learnerTranscript}`,
  ].join("\n")).join("\n\n");
  return [
    `Assess this unofficial IELTS-style Speaking practice for "${input.episodeTitle}".`,
    "Use the public IELTS Speaking dimensions of Fluency and Coherence, Lexical Resource, and Grammatical Range and Accuracy. Give each a 0–9 band in 0.5 increments based only on the speech-recognition transcripts.",
    "Do NOT award a pronunciation band: audio is unavailable and recognition errors are not pronunciation evidence. Speech-recognition noise, homophone substitutions, and missing punctuation are dictation artifacts, not comprehension or fluency evidence; assess the recoverable intended meaning, and state uncertainty instead of treating a possible misrecognition as an understanding error. pronunciationNote must explain that limitation and offer at most one cautious observation about clarity of wording.",
    "Give concise, specific feedback for every question, including unanswered ones. Judge content development as part of fluency/coherence, not whether the learner agrees with the podcast. End with 2–4 concrete next steps.",
    transcript,
  ].join("\n\n");
}

export function buildWritingGradePrompt(input: {
  episodeTitle: string;
  taskContext: string;
  taskPrompt: string;
  answer: string;
}): string {
  return [
    `Assess this unofficial IELTS Academic Writing Task 2 practice for "${input.episodeTitle}".`,
    `Context: ${input.taskContext}`,
    `Task: ${input.taskPrompt}`,
    "Use the four public IELTS Writing Task 2 dimensions: Task Response, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy. Give each a 0–9 band in 0.5 increments.",
    "Reward a clear position, developed reasoning, paragraphing, and precise language. Do not require agreement with the source podcast. Account for an under-length answer in Task Response without inventing a mechanical formula.",
    "generalFeedback should be specific and concise. nextSteps should contain 2–4 actionable revisions; do not write a replacement essay for the learner.",
    fenced("Learner essay", input.answer),
  ].join("\n\n");
}

export { LANGUAGE_NAMES };
