import { describe, expect, it } from "vitest";
import { sparksRouter } from "./sparksRouter";

describe("sparks router validation and access control", () => {
  it("rejects unauthenticated respond calls before any model work", async () => {
    const caller = sparksRouter.createCaller({ req: new Request("http://localhost/"), resHeaders: new Headers() });
    await expect(
      caller.respond({ language: "English", spark: "A real idea worth testing." }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects unauthenticated handwriting recognition before reading an image", async () => {
    const caller = sparksRouter.createCaller({ req: new Request("http://localhost/"), resHeaders: new Headers() });
    await expect(caller.recognize({ language: "English", imageData: "data:image/png;base64,AA==" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("guards billable work behind auth even for invalid input", async () => {
    // requireAuth runs before input parsing, so nothing billable is reachable
    // without a session regardless of payload shape.
    const caller = sparksRouter.createCaller({ req: new Request("http://localhost/"), resHeaders: new Headers() });
    await expect(
      caller.respond({ language: "English", spark: "no" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
