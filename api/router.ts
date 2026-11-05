import { authRouter } from "./auth-router";
import { cardsRouter } from "./cardsRouter";
import { ieltsRouter } from "./ieltsRouter";
import { createRouter, publicQuery } from "./middleware";
import { quizRouter } from "./quizRouter";
import { resourcesRouter } from "./resourcesRouter";
import { settingsRouter } from "./settingsRouter";
import { snipdRouter } from "./snipdRouter";
import { sparksRouter } from "./sparksRouter";
import { workspaceRouter } from "./workspaceRouter";
import { understandingRouter } from "./understandingRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  workspace: workspaceRouter,
  quiz: quizRouter,
  ielts: ieltsRouter,
  sparks: sparksRouter,
  resources: resourcesRouter,
  cards: cardsRouter,
  snipd: snipdRouter,
  understanding: understandingRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
