import { describe, expect, it } from "vitest";
import { buildGenerationPrompt } from "./ai/prompts/quiz";
import { quizRouter, toTrpcAiError } from "./quizRouter";

const validGenerateInput = {
  episodeTitle: "Episode",
  showName: "Show",
  language: "English" as const,
  excerpt: "word ".repeat(80),
  mode: "short" as const,
  questionCount: 4,
};

describe("quiz ai error mapping", () => {
  it("maps quota exhaustion to AI_QUOTA_EXHAUSTED (terminal)", () => {
    const err = toTrpcAiError({
      status: 403,
      data: { error: { type: "access_terminated_error", message: "quota" } },
    });
    expect(err.message).toBe("AI_QUOTA_EXHAUSTED");
  });

  it("maps bad credentials to AI_MISCONFIGURED and rate limits to AI_TRANSIENT", () => {
    expect(toTrpcAiError({ status: 401, data: {} }).message).toBe("AI_MISCONFIGURED");
    expect(toTrpcAiError({ status: 429, data: { error: { type: "rate_limit_reached_error" } } }).message).toBe("AI_TRANSIENT");
  });

  it("maps moderation refusals to AI_CONTENT_REJECTED", () => {
    expect(toTrpcAiError({ status: 403, data: { error: { type: "content_moderation", message: "no" } } }).message).toBe("AI_CONTENT_REJECTED");
  });
});

describe("separate speaking exercise modes", () => {
  it("keeps short spoken answers concise and free of long transcript quotations", () => {
    const prompt = buildGenerationPrompt(validGenerateInput);
    expect(prompt).toContain("one or two short spoken sentences");
    expect(prompt).toContain("without quoting the transcript");
    expect(prompt).not.toContain("AI LONG-FORM QUESTION");
  });

  it("uses quoted passages and developed paragraphs only in AI long-form questioning", () => {
    const prompt = buildGenerationPrompt({ ...validGenerateInput, mode: "long", questionCount: 3 });
    expect(prompt).toContain("AI LONG-FORM QUESTION");
    expect(prompt).toContain("two to four sentences verbatim");
    expect(prompt).toContain("developed spoken paragraph");
    expect(prompt).not.toContain("one or two short spoken sentences");
  });
});

describe("quiz router access control", () => {
  it("rejects unauthenticated generate calls before any model work", async () => {
    const caller = quizRouter.createCaller({ req: new Request("http://localhost/"), resHeaders: new Headers() });
    await expect(caller.generate(validGenerateInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects unauthenticated grade calls as well", async () => {
    const caller = quizRouter.createCaller({ req: new Request("http://localhost/"), resHeaders: new Headers() });
    await expect(
      caller.grade({
        episodeTitle: "Episode",
        language: "English",
        questions: [{ id: "q1", prompt: "What happened?", referenceAnswer: "Something." }],
        answers: [{ questionId: "q1", answer: "Something happened." }],
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
