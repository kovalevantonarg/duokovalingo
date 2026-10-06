import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPrompt, parseJson, GRADE_BODY, GRADE_SCHEMA } from "../app/api/_grade.js";

const input = {
  lang: "ru",
  topic: "Токены",
  qs: ["a", "b", "c"],
  answer: "x".repeat(60),
  ref: [{ q: "Определение", t: "..." }],
  kill: "k",
};

test("prompt carries questions, answer and hidden reference", () => {
  const { sys, user } = checkPrompt(input);
  assert.match(sys, /Russian/);
  assert.match(user, /1\. a\n2\. b\n3\. c/);
  assert.match(user, /Reference answer/);
});

test("request uses structured output with every schema key required", () => {
  const body = GRADE_BODY("claude-sonnet-5-5", "s", "u");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.deepEqual([...GRADE_SCHEMA.required].sort(), Object.keys(GRADE_SCHEMA.properties).sort());
});

test("parser clamps scores and tolerates code fences", () => {
  const g = parseJson(
    '```json\n{"score": 12.6, "verdict": "ok", "covered": [], "missing": [], "wrong": [{"said": "s", "actually": "a"}], "questions": [11, -1, 4.4], "followup": "", "language": [], "next": ""}\n```',
  );
  assert.equal(g.score, 10);
  assert.deepEqual(g.questions, [10, 0, 4]);
  assert.deepEqual(g.wrong, [{ said: "s", actually: "a" }]);
});

test("parser rejects non-JSON", () => {
  assert.throws(() => parseJson("I think the answer is fine."));
});
