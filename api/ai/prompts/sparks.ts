// sparks 域 prompt 模板（M2：自 sparksRouter.ts 逐字搬迁）。
// recognize 是唯一的视觉多模态调用：模板只产出文本指令，messages 数组（含图片）
// 仍在 router 组装。
import { LANGUAGE_NAMES, fenced, type PromptLanguage } from "./shared";

export function buildRecognizeText(language: PromptLanguage): string {
  return `Transcribe the handwritten note in this image. The likely language is ${LANGUAGE_NAMES[language]}, but preserve the actual language(s) you see. Reproduce only visible handwriting; do not summarise, complete, correct, or invent ideas. Ignore printed page titles and ruled lines. Preserve paragraph breaks where legible. Mark genuinely unreadable words as [unclear] and list them in uncertainSegments. Return plain text without a title.`;
}

export interface SparkEvolutionEntry {
  kind: string;
  text: string;
}

export function buildDefendPrompt(input: {
  language: PromptLanguage;
  spark: string;
  episodeTitle?: string;
  evolution: SparkEvolutionEntry[];
}): string {
  return [
    `Answer in ${LANGUAGE_NAMES[input.language]}. You are a rigorous but constructive research mentor.`,
    "Turn the listener's idea and its recorded evolution into a self-defense exercise. Do not declare the idea true or false and do not invent research findings.",
    "challenge identifies the most consequential unsupported assumption. defensePrompt asks the listener to defend the revised claim in one developed spoken or written paragraph. evidenceNeeded lists specific kinds of evidence, not fabricated citations. counterargument presents the strongest reasonable opposing position.",
    input.episodeTitle ? `Related episode: ${input.episodeTitle}` : "No specific episode is linked.",
    `Original idea:\n${input.spark}`,
    `Evolution so far:\n${JSON.stringify(input.evolution)}`,
  ].join("\n\n");
}

export function buildRespondPrompt(input: {
  language: PromptLanguage;
  spark: string;
  episodeTitle?: string;
  excerpt?: string;
}): string {
  const replyLanguage = LANGUAGE_NAMES[input.language];
  return [
    `You are a research mentor inside a private podcast atelier.`,
    `The listener has just finished ${input.episodeTitle ? `the episode "${input.episodeTitle}"` : "a podcast episode"} and captured a raw idea (a "spark").`,
    `Answer in ${replyLanguage}. Be honest and specific — praise only what is genuinely strong.`,
    `evaluation: two or three sentences judging the idea's substance and originality, tying it back to what the episode actually argued.`,
    `strengths: one to four short bullet phrases naming what works.`,
    `suggestions: one to four concrete next steps to test, sharpen, or extend the idea (a question to research, a source type to consult, a counterargument to check).`,
    `followUp: one question that would most deepen this spark if the listener answered it next.`,
    `Do not invent facts about the episode beyond the excerpt provided; if the spark drifts from the episode, say so in the evaluation.`,
    ``,
    ...fenced("The listener's spark", input.spark).split("\n"),
    ...(input.excerpt ? ["", ...fenced("Episode transcript excerpt (grounding, possibly truncated)", input.excerpt).split("\n")] : []),
  ].join("\n");
}

export { LANGUAGE_NAMES };
