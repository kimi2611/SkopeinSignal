// M2 模板层共享件（api/ai/prompts/）。
// 红线：prompt 文本逐字搬迁自各 router（零行为变化）；schema 一律留在 router；
// deepSeekJsonGuard 统一注入 "json" 字样和 schema 原文，模板里不要再手写 schema 字段清单。

export type PromptLanguage = "Chinese" | "English" | "Deutsch";

export const LANGUAGE_NAMES: Record<PromptLanguage, string> = {
  Chinese: "Chinese",
  English: "English",
  Deutsch: "German",
};

/** 接地围栏：把摘录/数据包进三引号块，prompt 统一用它包 grounding 内容。 */
export function fenced(label: string, content: string): string {
  return `${label}:\n"""\n${content}\n"""`;
}
