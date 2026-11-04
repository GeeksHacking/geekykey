import { describe, expect, it } from "vitest";

import type { Question } from "@/api/types";
import { answerAllSentence, nextQuestion, questionPosition } from "@/features/passport/answers";

const questions: Question[] = [
  {
    id: "drink",
    text: "Tea or coffee?",
    choices: [
      { id: "tea", text: "Tea" },
      { id: "coffee", text: "Coffee" },
    ],
  },
  {
    id: "hours",
    text: "Night owl or early bird?",
    choices: [
      { id: "night_owl", text: "Night owl" },
      { id: "early_bird", text: "Early bird" },
    ],
  },
];

describe("the questions' order and the skip set", () => {
  it("asks the first question the user hasn't answered", () => {
    expect(nextQuestion(questions, {}, new Set())?.id).toBe("drink");
    expect(nextQuestion(questions, { drink: "tea" }, new Set())?.id).toBe("hours");
  });

  it("passes over a question skipped for now", () => {
    expect(nextQuestion(questions, {}, new Set(["drink"]))?.id).toBe("hours");
  });

  it("has nothing to ask when every question left is skipped", () => {
    expect(nextQuestion(questions, {}, new Set(["drink", "hours"]))).toBeNull();
    expect(nextQuestion(questions, { drink: "tea" }, new Set(["hours"]))).toBeNull();
  });

  it("gives a question's place from 1, and 0 for one off the list", () => {
    expect(questionPosition(questions, "drink")).toBe(1);
    expect(questionPosition(questions, "hours")).toBe(2);
    expect(questionPosition(questions, "removed")).toBe(0);
  });

  it("uses the question count in agreement 0.13's sentence", () => {
    expect(answerAllSentence(5)).toBe("Answer all 5 to get your match when you connect.");
  });
});
