import assert from "node:assert/strict";
import { test } from "vitest";
import { gradTeaQuestions } from "./questions.ts";

// The grad tea team rewords the list by Mon 9 Nov, so these keep its shape (BAC-119).

test("the grad tea asks 5 questions, each with 2 to 4 choices", () => {
  assert.equal(gradTeaQuestions.length, 5);
  for (const question of gradTeaQuestions) {
    assert.ok(question.choices.length >= 2 && question.choices.length <= 4, question.id);
  }
});

test("each question's ID, and each choice's within its question, is used once", () => {
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  assert.ok(unique(gradTeaQuestions.map((question) => question.id)));
  for (const question of gradTeaQuestions) {
    assert.ok(unique(question.choices.map((choice) => choice.id)), question.id);
  }
});
