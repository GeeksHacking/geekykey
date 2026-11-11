import assert from "node:assert/strict";
import { test } from "vitest";
import { showcaseQuestions } from "./questions.ts";

test("the showcase asks 5 questions, each with 2 to 4 choices", () => {
  assert.equal(showcaseQuestions.length, 5);
  for (const question of showcaseQuestions) {
    assert.ok(question.choices.length >= 2 && question.choices.length <= 4, question.id);
  }
});

test("each question's ID, and each choice's within its question, is used once", () => {
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  assert.ok(unique(showcaseQuestions.map((question) => question.id)));
  for (const question of showcaseQuestions) {
    assert.ok(unique(question.choices.map((choice) => choice.id)), question.id);
  }
});
