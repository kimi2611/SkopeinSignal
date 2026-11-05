// understanding 域 prompt 模板（M2：自 understandingRouter.ts 逐字搬迁）。
// 架构事实：analyze = map（逐 chunk），themes = reduce（跨集）；W2 的分块压缩
// formalize 这套既有形态，不用新造。
import { LANGUAGE_NAMES, type PromptLanguage } from "./shared";

export interface SourceSegmentLike {
  id: string;
  start: number | null;
  end: number | null;
  text: string;
}

export function buildSummaryPrompt(input: {
  language: PromptLanguage;
  episodeTitle: string;
  segments: SourceSegmentLike[];
}): string {
  return [
    `Answer in ${LANGUAGE_NAMES[input.language]}. Create a four-part content summary of the podcast "${input.episodeTitle}" using only the supplied transcript.`,
    "theme states the central topic or research question. coreArguments explain the important claims and their reasoning. evidence lists concrete examples, data, first-hand accounts, or supporting reasons actually present in the transcript; do not invent citations, quotations, studies, or facts. expertPerspectives distinguishes viewpoints actually expressed by identified speakers; return an empty array when the transcript contains no distinct expert perspective, and never infer a speaker's name from the episode title.",
    "Treat the transcript as an imperfect speech-recognition record: do not turn an ambiguous recognition error into a factual claim. Do not use outside knowledge or claim to have heard the audio.",
    `Transcript:\n${JSON.stringify(input.segments)}`,
  ].join("\n\n");
}

export function buildChunkPrompt(input: {
  language: PromptLanguage;
  episodeTitle: string;
  chunkIndex: number;
  chunkCount: number;
  segments: SourceSegmentLike[];
}): string {
  return [
    `Answer in ${LANGUAGE_NAMES[input.language]}. Analyse one chunk of the podcast "${input.episodeTitle}" for evidence-grounded understanding.`,
    "Use only the supplied transcript. title names the local topic; summary explains the reasoning rather than merely listing subjects.",
    "Return 1–6 consequential claims. evidence MUST be one consecutive verbatim passage copied from the named segmentId, not a paraphrase. text explains the claim supported by that passage. Do not invent speakers, facts, citations, or timestamps.",
    `Transcript chunk ${input.chunkIndex + 1} of ${input.chunkCount}:\n${JSON.stringify(input.segments)}`,
  ].join("\n\n");
}

export function buildSynthesisPrompt(input: {
  language: PromptLanguage;
  episodeTitle: string;
  chapters: unknown;
}): string {
  return [
    `Answer in ${LANGUAGE_NAMES[input.language]}. Synthesise the supplied evidence-grounded chapter analyses of "${input.episodeTitle}".`,
    "theme states the central question. coreArguments trace the argument across chapters without adding facts. openQuestions identify genuine unresolved assumptions, missing evidence, or productive counterarguments. Do not claim coverage beyond these chapters.",
    JSON.stringify(input.chapters),
  ].join("\n\n");
}

export function buildThemesPrompt(input: {
  language: PromptLanguage;
  records: unknown;
}): string {
  return [
    `Answer in ${LANGUAGE_NAMES[input.language]}. Build cross-episode theme maps using only the supplied podcast claims and evidence.`,
    "Group claims by a meaningful shared research question, not superficial keywords. Include contrast where the premises or conclusions genuinely differ. Every claim reference must exactly reuse a supplied claimId and episodeId. Never merge different episodes into an unattributed statement.",
    JSON.stringify(input.records),
  ].join("\n\n");
}

export { LANGUAGE_NAMES };
