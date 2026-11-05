// M2 模板层契约测试：锁定每个 builder 的关键语义短语，防止后续 W2 改写时漂移。
// 注意：这里只断言"关键指令存在"，不做全文快照（全文快照会把措辞调整变成噪音）。
import { describe, expect, it } from "vitest";
import { fenced, LANGUAGE_NAMES } from "./prompts/shared";
import { buildGenerationPrompt, buildGradingPrompt } from "./prompts/quiz";
import { buildCardTestPrompt } from "./prompts/cards";
import {
  buildSpeakingGradePrompt,
  buildSpeakingPaperPrompt,
  buildWritingGradePrompt,
  buildWritingPaperPrompt,
  materialInstructions,
} from "./prompts/ielts";
import { buildComparisonPrompt, buildSearchPlanPrompt } from "./prompts/resources";
import { buildDefendPrompt, buildRecognizeText, buildRespondPrompt } from "./prompts/sparks";
import {
  buildChunkPrompt,
  buildSummaryPrompt,
  buildSynthesisPrompt,
  buildThemesPrompt,
} from "./prompts/understanding";

describe("prompts/shared", () => {
  it("fenced wraps content in triple quotes with a label", () => {
    expect(fenced("Label", "body")).toBe('Label:\n"""\nbody\n"""');
  });

  it("Deutsch maps to German", () => {
    expect(LANGUAGE_NAMES.Deutsch).toBe("German");
  });
});

describe("prompts/quiz", () => {
  const base = {
    episodeTitle: "Ep",
    showName: "Show",
    language: "English" as const,
    excerpt: "A".repeat(300),
    questionCount: 3,
  };

  it("short mode forbids quoting the transcript", () => {
    const prompt = buildGenerationPrompt({ ...base, mode: "short" });
    expect(prompt).toContain("without quoting the transcript");
    expect(prompt).toContain("one or two short spoken sentences");
    expect(prompt).toContain('episode "Ep" from the show "Show"');
    expect(prompt).toContain('"""');
    expect(prompt).toContain("q1, q2");
  });

  it("long mode mandates verbatim quoting", () => {
    const prompt = buildGenerationPrompt({ ...base, mode: "long" });
    expect(prompt).toContain("quote a passage of two to four sentences verbatim");
  });

  it("grading prompt carries the ASR-artifact disclaimer", () => {
    const prompt = buildGradingPrompt({
      episodeTitle: "Ep",
      language: "Deutsch",
      pairs: [
        { id: "q1", question: "Q?", referenceAnswer: "R", learnerAnswer: "A" },
      ],
    });
    expect(prompt).toContain("dictation artifacts");
    expect(prompt).toContain("German");
    expect(prompt).toContain("Q1 (q1): Q?");
    expect(prompt).toContain("Learner: A");
  });
});

describe("prompts/cards", () => {
  const words = [
    { surface: "ephemeral", translation: "短暂的", context: "a ephemeral thing" },
    { surface: "plausible", translation: "可信的" },
  ];

  it("qanda branch asks for quoted-passage questions", () => {
    const prompt = buildCardTestPrompt({
      translationLanguage: "Chinese",
      wantsQanda: true,
      wantsDistractors: true,
      words,
    });
    expect(prompt).toContain('"question" field');
    expect(prompt).toContain("3 plausible but WRONG translations");
    expect(prompt).toContain('1. ephemeral = 短暂的');
    expect(prompt).toContain('context: "a ephemeral thing"');
  });

  it("no-qanda + no-distractors collapses to empty-distractor instruction", () => {
    const prompt = buildCardTestPrompt({
      translationLanguage: "English",
      wantsQanda: false,
      wantsDistractors: false,
      words,
    });
    expect(prompt).toContain('empty "distractors" array');
    expect(prompt).not.toContain('"question" field');
  });
});

describe("prompts/ielts", () => {
  it("saved source embeds material verbatim", () => {
    const material = { theme: "T", coreArguments: ["a"], evidence: [], expertPerspectives: [] };
    const text = materialInstructions({ source: "saved", savedMaterial: material });
    expect(text).toContain("verbatim as the factual basis");
    expect(text).toContain(JSON.stringify(material));
  });

  it("snipd source fences the import", () => {
    const text = materialInstructions({ source: "snipd", snipdText: "notes" });
    expect(text).toContain('"""\nnotes\n"""');
    expect(text).toContain("only source material");
  });

  it("ai source carries the learner instruction when present", () => {
    const text = materialInstructions({ source: "ai", excerpt: "ex", instruction: "focus on trade" });
    expect(text).toContain("summarisation instruction: focus on trade");
    const fallback = materialInstructions({ source: "ai", excerpt: "ex" });
    expect(fallback).toContain("without copying the episode wording");
  });

  it("speaking paper keeps the six-question contract", () => {
    const prompt = buildSpeakingPaperPrompt({
      source: "ai", episodeTitle: "Ep", showName: "Show", excerpt: "e".repeat(300),
    });
    expect(prompt).toContain("unofficial practice, not an actual IELTS test");
    expect(prompt).toContain("three Part 1 questions, one Part 2 individual-long-turn cue card, then two Part 3");
  });

  it("writing grade fences the learner essay", () => {
    const prompt = buildWritingGradePrompt({
      episodeTitle: "Ep", taskContext: "ctx", taskPrompt: "task", answer: "essay",
    });
    expect(prompt).toContain('Learner essay:\n"""\nessay\n"""');
    expect(prompt).toContain("Task Response");
  });

  it("speaking grade forbids pronunciation band", () => {
    const prompt = buildSpeakingGradePrompt({
      episodeTitle: "Ep",
      questions: [
        { id: "s1", part: 1 as const, prompt: "p", referenceNotes: "n", learnerTranscript: "t" },
      ],
    });
    expect(prompt).toContain("Do NOT award a pronunciation band");
    expect(prompt).toContain("Learner speech-recognition transcript: t");
  });
});

describe("prompts/resources", () => {
  it("search plan constrains query length and anti-fabrication", () => {
    const prompt = buildSearchPlanPrompt({ spark: "idea", episodeTitle: "Ep" });
    expect(prompt).toContain("4–14 content words");
    expect(prompt).toContain("data, not an instruction");
  });

  it("comparison prompt demands one comparison per record", () => {
    const prompt = buildComparisonPrompt({
      language: "Chinese", spark: "idea", focus: "f", records: [{ id: "r1" }],
    });
    expect(prompt).toContain("exactly one comparison with its exact id");
    expect(prompt).toContain('Live database records:\n[{"id":"r1"}]');
  });
});

describe("prompts/sparks", () => {
  it("recognize text marks unclear words", () => {
    expect(buildRecognizeText("Chinese")).toContain("[unclear]");
  });

  it("defend prompt serializes evolution as JSON", () => {
    const prompt = buildDefendPrompt({
      language: "English", spark: "idea", episodeTitle: "Ep",
      evolution: [{ kind: "refine", text: "v2" }],
    });
    expect(prompt).toContain('[{"kind":"refine","text":"v2"}]');
    expect(prompt).toContain("not fabricated citations");
  });

  it("respond prompt includes grounding excerpt only when supplied", () => {
    const withExcerpt = buildRespondPrompt({ language: "English", spark: "idea", excerpt: "ground" });
    expect(withExcerpt).toContain("grounding, possibly truncated");
    const without = buildRespondPrompt({ language: "English", spark: "idea" });
    expect(without).not.toContain("grounding");
  });
});

describe("prompts/understanding", () => {
  const segments = [{ id: "s1", start: 0, end: 1, text: "hello" }];

  it("summary prompt forbids inventing citations", () => {
    const prompt = buildSummaryPrompt({ language: "English", episodeTitle: "Ep", segments });
    expect(prompt).toContain("do not invent citations");
  });

  it("chunk prompt requires verbatim evidence with chunk numbering", () => {
    const prompt = buildChunkPrompt({
      language: "English", episodeTitle: "Ep", chunkIndex: 2, chunkCount: 5, segments,
    });
    expect(prompt).toContain("Transcript chunk 3 of 5");
    expect(prompt).toContain("verbatim passage");
  });

  it("synthesis and themes pass JSON payloads through", () => {
    expect(buildSynthesisPrompt({ language: "English", episodeTitle: "Ep", chapters: [{ id: "c1" }] }))
      .toContain('[{"id":"c1"}]');
    expect(buildThemesPrompt({ language: "English", records: [{ episodeId: "e1" }] }))
      .toContain('[{"episodeId":"e1"}]');
  });
});
