import { test } from "node:test";
import assert from "node:assert/strict";
import { checkContent } from "../scripts/check-content.mjs";

test("study content is consistent", () => {
  const { problems } = checkContent();
  assert.deepEqual(problems, []);
});
