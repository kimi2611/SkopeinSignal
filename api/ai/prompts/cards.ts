// cards 域 prompt 模板（M2：自 cardsRouter.ts 逐字搬迁）。
// 纯 written 卷的本地组装旁路（charged:false）留在 router，不走 AI。
import { LANGUAGE_NAMES, type PromptLanguage } from "./shared";

export interface CardTestPromptWord {
  surface: string;
  translation: string;
  context?: string;
}

export function buildCardTestPrompt(input: {
  translationLanguage: PromptLanguage;
  wantsQanda: boolean;
  wantsDistractors: boolean;
  words: CardTestPromptWord[];
}): string {
  return [
    `You are building a vocabulary test for a podcast-language learner.`,
    input.wantsQanda
      ? `For each word below, write the "question" field: a longer quoted-passage question (one to two full sentences) in the word's own language. Quote or closely paraphrase the word's episode context with the target word replaced by "_____", and ask which word completes the passage. The expected answer is always the target word itself. When no context line is given, write a definition-style question in full sentences instead — never a bare "what does X mean".`
      : "",
    input.wantsDistractors
      ? `Also invent 3 plausible but WRONG translations in the "distractors" field, in ${input.translationLanguage === "Deutsch" ? "German" : input.translationLanguage}. A good distractor is believable: same part of speech, same register, semantically close enough to make a learner hesitate — but clearly wrong to someone who knows the word. Never repeat the correct translation, never repeat another distractor for the same word, and keep each distractor short (a word or a brief phrase).`
      : `Return an empty "distractors" array for every word.`,
    `Echo each source word back exactly in the "word" field.`,
    ``,
    ...input.words.map((word, index) =>
      `${index + 1}. ${word.surface} = ${word.translation}${word.context ? `\n   context: "${word.context}"` : ""}`,
    ),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

// re-export 供 router 复用，避免 LANGUAGE_NAMES 三处定义漂移
export { LANGUAGE_NAMES };
