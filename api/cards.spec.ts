import { describe, expect, it } from "vitest";
import { assembleCardTest, cardsRouter } from "./cardsRouter";

const words = [
  { surface: "die Strömung", translation: "current" },
  { surface: "der Auftrieb", translation: "buoyancy" },
  { surface: "die Tide", translation: "tide" },
  { surface: "das Watt", translation: "mudflat" },
];

describe("assembleCardTest", () => {
  it("builds a choice question with the AI distractors and a valid correct index", () => {
    const distractors = new Map([["die strömung", ["tide", "buoyancy", "salt"]]]);
    const [question] = assembleCardTest(words.slice(0, 1), distractors, ["choice"], () => 0.9);
    expect(question.kind).toBe("choice");
    expect(question.options).toHaveLength(4);
    expect(question.options[question.correctIndex]).toBe("current");
    expect(question.options).toContain("tide");
    expect(question.options).toContain("salt");
  });

  it("falls back to the deck's own translations when AI distractors are missing", () => {
    const questions = assembleCardTest(words, new Map(), ["choice"], () => 0.9);
    for (const question of questions) {
      expect(question.kind).toBe("choice");
      expect(question.options).toHaveLength(4);
      expect(question.options[question.correctIndex]).toBe(question.translation);
    }
    expect(questions[0].options).toContain("tide");
  });

  it("drops AI distractors that merely restate the correct translation", () => {
    const distractors = new Map([["die strömung", ["Current", " current ", "flow"]]]);
    const [question] = assembleCardTest(words.slice(0, 1), distractors, ["choice"], () => 0.9, words.map((word) => word.translation));
    expect(question.options.filter((option) => option.toLowerCase().trim() === "current")).toHaveLength(1);
    expect(question.options).toContain("flow");
  });

  it("downgrades to a written question when no distractor exists at all", () => {
    const [question] = assembleCardTest([{ surface: "das Meer", translation: "sea" }], new Map(), ["choice"], () => 0.5);
    expect(question.kind).toBe("written");
  });

  it("marks a true/false proposal honestly", () => {
    const distractors = new Map([["die strömung", ["mountain"]]]);
    const [question] = assembleCardTest(words.slice(0, 1), distractors, ["truefalse"], () => 0.9);
    expect(question.kind).toBe("truefalse");
    expect(question.proposalIsCorrect).toBe(false);
    expect(question.proposed).toBe("mountain");
  });
});

describe("cards router access control", () => {
  it("rejects unauthenticated generateTest calls before any model work", async () => {
    const caller = cardsRouter.createCaller({ req: new Request("http://localhost/"), resHeaders: new Headers() });
    await expect(
      caller.generateTest({ translationLanguage: "English", words, types: ["choice"] }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("guards billable work behind auth even for invalid input", async () => {
    const caller = cardsRouter.createCaller({ req: new Request("http://localhost/"), resHeaders: new Headers() });
    await expect(
      caller.generateTest({ translationLanguage: "English", words: [], types: [] }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
