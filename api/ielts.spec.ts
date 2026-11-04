import { describe, expect, it } from "vitest";
import {
  feedbackForKnownQuestions,
  halfBand,
  ieltsRouter,
  normalizeSpeakingQuestions,
  normalizeWritingTask,
  overallBand,
  paperInputSchema,
} from "./ieltsRouter";

const transcript = "A detailed podcast transcript with claims and evidence. ".repeat(8);
const savedMaterial = {
  theme: "Cities should make room for quieter streets.",
  coreArguments: ["Lower traffic can improve everyday public life."],
  evidence: ["The episode compares two neighbourhood trials."],
  expertPerspectives: ["One guest asks for a longer evaluation period."],
};

function validPaper(source: "saved" | "snipd" | "ai") {
  return {
    episodeTitle: "The quiet city",
    showName: "Urban Notes",
    source,
    excerpt: source === "ai" ? transcript : undefined,
    snipdText: source === "snipd" ? "Snipd takeaway: ".padEnd(100, "x") : undefined,
    savedMaterial: source === "saved" ? savedMaterial : undefined,
  };
}

describe("IELTS paper input", () => {
  it.each(["saved", "snipd", "ai"] as const)("accepts a complete %s source", (source) => {
    expect(paperInputSchema.safeParse(validPaper(source)).success).toBe(true);
  });

  it("requires the declared source material and minimum useful length", () => {
    expect(paperInputSchema.safeParse(validPaper("saved")).success).toBe(true);
    expect(paperInputSchema.safeParse({ ...validPaper("saved"), savedMaterial: undefined }).success).toBe(false);
    expect(paperInputSchema.safeParse({ ...validPaper("snipd"), snipdText: "too short" }).success).toBe(false);
    expect(paperInputSchema.safeParse({ ...validPaper("ai"), excerpt: "too short" }).success).toBe(false);
  });
});

describe("IELTS paper and band contracts", () => {
  it("forces three Part 1, one Part 2 and two Part 3 questions with unique ids", () => {
    const questions = normalizeSpeakingQuestions(Array.from({ length: 6 }, (_, index) => ({
      id: "duplicate",
      part: 3 as const,
      prompt: ` Question ${index + 1} `,
      referenceNotes: ` Notes ${index + 1} `,
    })));
    expect(questions.map((question) => question.part)).toEqual([1, 1, 1, 2, 3, 3]);
    expect(new Set(questions.map((question) => question.id)).size).toBe(6);
    expect(questions[0]).toMatchObject({ id: "ielts-s1", prompt: "Question 1", referenceNotes: "Notes 1" });
  });

  it("fixes Writing Task 2 at 250 words and 40 minutes", () => {
    expect(normalizeWritingTask({ prompt: " Discuss both views. ", context: " A debate. " })).toEqual({
      prompt: "Discuss both views.",
      context: "A debate.",
      minimumWords: 250,
      suggestedMinutes: 40,
    });
  });

  it("rounds every dimension and the overall result to half bands", () => {
    expect(halfBand(6.26)).toBe(6.5);
    expect(halfBand(6.24)).toBe(6);
    expect(halfBand(12)).toBe(9);
    expect(halfBand(-2)).toBe(0);
    expect(overallBand([6, 6.5, 7, 7.5])).toBe(7);
  });

  it("drops unknown, duplicate and empty question feedback", () => {
    expect(feedbackForKnownQuestions([
      { questionId: "unknown", feedback: "Discard this." },
      { questionId: "q1", feedback: " Develop the reason. " },
      { questionId: "q1", feedback: "Duplicate." },
      { questionId: "q2", feedback: "   " },
    ], [{ id: "q1" }, { id: "q2" }])).toEqual([{ questionId: "q1", feedback: "Develop the reason." }]);
  });
});

describe("IELTS router access control", () => {
  const caller = ieltsRouter.createCaller({ req: new Request("http://localhost/"), resHeaders: new Headers() });

  it("rejects unauthenticated generation before model work", async () => {
    await expect(caller.generateSpeaking(validPaper("saved"))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.generateWriting(validPaper("saved"))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects unauthenticated grading before model work", async () => {
    const questions = normalizeSpeakingQuestions(Array.from({ length: 6 }, (_, index) => ({
      id: `q${index + 1}`,
      part: 1 as const,
      prompt: `Question ${index + 1}`,
      referenceNotes: "Notes",
    })));
    await expect(caller.gradeSpeaking({
      episodeTitle: "Episode",
      questions,
      answers: questions.map((question) => ({ questionId: question.id, answer: "Answer" })),
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.gradeWriting({
      episodeTitle: "Episode",
      task: { prompt: "Discuss both views.", context: "A debate." },
      answer: "A position with a reason.",
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
