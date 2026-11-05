// quiz 域 prompt 模板（M2：自 quizRouter.ts 逐字搬迁，行为零变化）。
import { LANGUAGE_NAMES, fenced } from "./shared";

export interface QuizGenerationInput {
  episodeTitle: string;
  showName: string;
  language: "English" | "Deutsch";
  excerpt: string;
  mode: "short" | "long";
  questionCount: number;
}

export function buildGenerationPrompt(input: QuizGenerationInput): string {
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
    ...fenced("Transcript excerpt (possibly truncated)", input.excerpt).split("\n"),
  ].join("\n");
}

export interface QuizGradingPair {
  id: string;
  question: string;
  referenceAnswer: string;
  learnerAnswer: string;
}

export function buildGradingPrompt(input: {
  episodeTitle: string;
  language: "English" | "Deutsch";
  pairs: QuizGradingPair[];
}): string {
  const feedbackLanguage = LANGUAGE_NAMES[input.language];
  return [
    `You are a language-learning tutor grading a listening-comprehension quiz on the podcast episode "${input.episodeTitle}".`,
    `Grade each learner answer against its reference answer. Judge comprehension of the episode, not grammar or pronunciation. The answers were dictated through browser speech recognition: treat recognition noise, missing punctuation, homophone substitutions, and probable misrecognitions as dictation artifacts, never as evidence of misunderstanding. When the intended meaning is reasonably recoverable, grade that meaning; use "missed" only when the answer is substantively wrong, unrelated, or absent.`,
    `verdict: "correct" when the learner captured the substance; "partial" when roughly half right or missing a key element; "missed" when substantively wrong or unrelated.`,
    `feedback: one or two sentences in ${feedbackLanguage}, saying what was good and what was missed. Do not diagnose a comprehension error from wording that could plausibly be a speech-recognition artifact; mention uncertainty instead of asserting a misunderstanding.`,
    `score: an overall 0-100 comprehension score across all questions.`,
    ``,
    ...input.pairs.flatMap((pair, index) => [
      `Q${index + 1} (${pair.id}): ${pair.question}`,
      `Reference: ${pair.referenceAnswer}`,
      `Learner: ${pair.learnerAnswer}`,
      ``,
    ]),
  ].join("\n");
}
