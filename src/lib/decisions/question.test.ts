import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuestion, QUESTION_MAX } from "./question.ts";

test("a plain question passes, trimmed", () => {
  assert.deepEqual(parseQuestion({ question: "  What does option 2 cost?  " }), { ok: true, question: "What does option 2 cost?" });
});

test("missing, empty, non-string or too long is refused", () => {
  for (const raw of [null, {}, { question: "" }, { question: "   " }, { question: 7 }, { question: "x".repeat(QUESTION_MAX + 1) }]) {
    assert.deepEqual(parseQuestion(raw), { ok: false, error: "question" });
  }
});

test("health detail is refused, not stored", () => {
  assert.deepEqual(parseQuestion({ question: "Can this wait until after my MRI?" }), { ok: false, error: "health" });
});
