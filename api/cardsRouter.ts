import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { aiQuery, createRouter } from "./middleware";
import { aiModelForAccess, getDefaultModelIdForAccess, invalidateModelCache } from "./ai/provider";
import { generateObjectWithRetry } from "./ai/resilient";
import { buildCardTestPrompt } from "./ai/prompts/cards";
import { toTrpcAiError } from "./quizRouter";

// Word-deck tests are built locally by default (free, offline). This endpoint
// is the OPTIONAL AI upgrade: the model writes plausible distractors for each
// tested word, which makes multiple-choice and true/false questions noticeably
// harder to game than sampling random other translations. Question assembly
// and grading stay deterministic and local — the model only invents
// distractors. Billable discipline matches the voice quiz: sign-in required,
// one call per test, never auto-retried (one narrow stale-model recovery).

const MAX_WORDS = 40;
const MAX_DISTRACTOR_CHARS = 300;
const MAX_QUESTION_CHARS = 600;

export type CardTestKind = "choice" | "truefalse" | "written" | "qanda";

export interface CardTestWord {
  surface: string;
  translation: string;
  context?: string;
}

export interface AssembledQuestion {
  kind: CardTestKind;
  surface: string;
  translation: string;
  /** Long-form quoted-passage question text for qanda items; "" otherwise. */
  question: string;
  options: string[];
  correctIndex: number;
  proposed: string;
  proposalIsCorrect: boolean;
}

const generateTestInputSchema = z.object({
  translationLanguage: z.enum(["Chinese", "English", "Deutsch"]),
  words: z
    .array(
      z.object({
        surface: z.string().trim().min(1).max(160),
        translation: z.string().trim().min(1).max(MAX_DISTRACTOR_CHARS),
        context: z.string().trim().max(500).optional(),
      }),
    )
    .min(2)
    .max(MAX_WORDS),
  types: z.array(z.enum(["choice", "truefalse", "written", "qanda"])).min(1).max(4),
  pool: z.array(z.string().trim().min(1).max(MAX_DISTRACTOR_CHARS)).max(200).optional(),
});

const aiTestSchema = z.object({
  items: z
    .array(
      z.object({
        word: z.string(),
        distractors: z.array(z.string()).max(5).default([]),
        question: z.string().max(MAX_QUESTION_CHARS).optional(),
      }),
    )
    .min(1)
    .max(MAX_WORDS),
});

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s ]+/g, " ")
    .replace(/^[.,;:!?'"„“”‘’()[\]-]+|[.,;:!?'"“”‘’()[\]-]+$/g, "");
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

/**
 * Open answer-first rotation: written and qanda kinds each occupy two slots
 * per cycle, so choice/true-false can never outnumber real Q&A in a mixed
 * test. Exported for unit tests.
 */
export function weightedTypeCycle(types: CardTestKind[]): CardTestKind[] {
  const cycle = [...types];
  for (const kind of types) {
    if (kind === "written" || kind === "qanda") cycle.push(kind);
  }
  return cycle;
}

/** Blank the target word's first occurrence in its context sentence. */
function blankInContext(surface: string, context: string): string {
  const index = context.toLocaleLowerCase().indexOf(surface.toLocaleLowerCase());
  if (index < 0) return "";
  return `${context.slice(0, index)}_____${context.slice(index + surface.length)}`.trim();
}

/**
 * Deterministic assembly of a test from per-word AI distractors and long-form
 * questions. Exported for unit tests. Falls back to the word list's own
 * translations when the model produced too few usable distractors, and to a
 * locally blanked context passage when no AI question arrived for a qanda slot.
 */
export function assembleCardTest(
  words: CardTestWord[],
  distractorsByWord: Map<string, string[]>,
  types: CardTestKind[],
  random: () => number = Math.random,
  extraPool: string[] = [],
  questionsByWord: Map<string, string> = new Map(),
): AssembledQuestion[] {
  const cycle = weightedTypeCycle(types);
  const translationPool = [...new Set([...words.map((word) => word.translation.trim()), ...extraPool.map((item) => item.trim())].filter(Boolean))];
  return words.map((word, index) => {
    const kind = cycle[index % cycle.length];
    const aiDistractors = (distractorsByWord.get(normalize(word.surface)) ?? [])
      .map((item) => item.trim().slice(0, MAX_DISTRACTOR_CHARS))
      .filter((item) => item && normalize(item) !== normalize(word.translation));
    const uniqueAi = [...new Set(aiDistractors.map((item) => item))];
    const poolFallback = shuffle(translationPool.filter((translation) => normalize(translation) !== normalize(word.translation)));
    const distractors = [...uniqueAi];
    for (const fallback of poolFallback) {
      if (distractors.length >= 3) break;
      if (!distractors.some((item) => normalize(item) === normalize(fallback))) distractors.push(fallback);
    }

    if (kind === "choice" && distractors.length >= 3) {
      const options = shuffle([word.translation, ...distractors.slice(0, 3)]);
      return {
        kind,
        surface: word.surface,
        translation: word.translation,
        question: "",
        options,
        correctIndex: options.findIndex((option) => option === word.translation),
        proposed: "",
        proposalIsCorrect: true,
      };
    }
    if (kind === "truefalse" && distractors.length >= 1) {
      const proposalIsCorrect = random() < 0.5;
      return {
        kind,
        surface: word.surface,
        translation: word.translation,
        question: "",
        options: [],
        correctIndex: -1,
        proposed: proposalIsCorrect ? word.translation : distractors[0],
        proposalIsCorrect,
      };
    }
    if (kind === "qanda") {
      const aiQuestion = (questionsByWord.get(normalize(word.surface)) ?? "").trim().slice(0, MAX_QUESTION_CHARS);
      const localQuestion = word.context ? blankInContext(word.surface, word.context) : "";
      const question = aiQuestion || localQuestion;
      if (question) {
        return { kind, surface: word.surface, translation: word.translation, question, options: [], correctIndex: -1, proposed: "", proposalIsCorrect: true };
      }
    }
    return { kind: "written", surface: word.surface, translation: word.translation, question: "", options: [], correctIndex: -1, proposed: "", proposalIsCorrect: true };
  });
}

export const cardsRouter = createRouter({
  generateTest: aiQuery.input(generateTestInputSchema).mutation(async ({ input, ctx }) => {
    // Written-only tests need no distractors at all, so calling the model
    // would bill the owner for nothing. Assemble locally and say so.
    if (input.types.every((kind) => kind === "written")) {
      return { questions: assembleCardTest(input.words, new Map(), input.types, Math.random, input.pool ?? []), charged: false };
    }

    const wantsDistractors = input.types.some((kind) => kind === "choice" || kind === "truefalse");
    const wantsQanda = input.types.includes("qanda");

    const run = async () => {
      const modelId = await getDefaultModelIdForAccess(ctx.aiAccess);
      return generateObjectWithRetry({
        model: aiModelForAccess(ctx.aiAccess, modelId),
        schema: aiTestSchema,
        prompt: buildCardTestPrompt({
          translationLanguage: input.translationLanguage,
          wantsDistractors,
          wantsQanda,
          words: input.words,
        }),
      });
    };

    let result;
    try {
      result = await run();
    } catch (first) {
      invalidateModelCache();
      const mapped = toTrpcAiError(first);
      if (mapped.message !== "AI_TRANSIENT") throw mapped;
      try {
        result = await run();
      } catch (second) {
        throw toTrpcAiError(second);
      }
    }

    const known = new Map(input.words.map((word) => [normalize(word.surface), word.translation]));
    const distractorsByWord = new Map<string, string[]>();
    const questionsByWord = new Map<string, string>();
    for (const item of result.object.items) {
      const key = normalize(item.word ?? "");
      if (!key || !known.has(key)) continue;
      distractorsByWord.set(
        key,
        (Array.isArray(item.distractors) ? item.distractors : [])
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .slice(0, 5),
      );
      if (typeof item.question === "string" && item.question.trim()) {
        questionsByWord.set(key, item.question.trim().slice(0, MAX_QUESTION_CHARS));
      }
    }

    const questions = assembleCardTest(input.words, distractorsByWord, input.types, Math.random, input.pool ?? [], questionsByWord);
    if (!questions.length) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_EMPTY_RESULT" });
    }
    return { questions, charged: true };
  }),
});
