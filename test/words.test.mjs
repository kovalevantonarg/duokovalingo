import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addWord,
  applyLookup,
  dueWords,
  gradeWord,
  savable,
  updateWord,
  wordKey,
  wordOp,
} from "../app/lib/words.js";

test("what can be saved and how it's keyed", () => {
  assert.equal(savable("throughput"), true);
  assert.equal(savable("back pressure"), true);
  assert.equal(savable("пропускная способность"), false, "no Latin letters");
  assert.equal(savable("a b c d e f"), false, "too many words");
  assert.equal(wordKey("  Throughput, "), "throughput");
  assert.equal(wordKey("“Idempotent”."), "idempotent");
});

test("add, dedupe, edit, grade, due order", () => {
  const db = { tickets: {}, history: [] };
  assert.equal(
    addWord(db, { w: "Throughput", ctx: "Throughput is tokens per second.", n: 3 }, "2026-10-14"),
    "throughput",
  );
  assert.equal(addWord(db, { w: "throughput" }, "2026-10-15"), "throughput", "same word again");
  assert.equal(Object.keys(db.words).length, 1);
  assert.deepEqual(db.words.throughput, {
    w: "Throughput",
    added: "2026-10-14",
    ctx: "Throughput is tokens per second.",
    n: 3,
  });
  assert.equal(addWord(db, { w: "латиница нет" }), null);
  updateWord(db, "throughput", { tr: "пропускная способность", def: "", ipa: "ˈθruːpʊt" });
  assert.equal(db.words.throughput.tr, "пропускная способность");
  addWord(db, { w: "backoff" }, "2026-10-13");
  assert.deepEqual(
    dueWords(db).map((w) => w.key),
    ["backoff", "throughput"],
    "new words, oldest first",
  );
  gradeWord(db, "backoff", "yellow", "2026-10-10");
  assert.deepEqual(
    dueWords(db, new Date(2026, 9, 14)).map((w) => w.key),
    ["backoff", "throughput"],
    "due first",
  );
  assert.deepEqual(
    dueWords(db, new Date(2026, 9, 11)).map((w) => w.key),
    ["throughput"],
    "not due yet",
  );
  assert.deepEqual(wordOp(db, { op: "remove", key: "backoff" }), { ok: true, key: "backoff" });
  assert.equal(wordOp(db, { op: "grade", key: "throughput", st: "purple" }).ok, false);
});

test("a lookup fills empty fields only and files the word under its base form", () => {
  const db = { tickets: {}, history: [] };
  addWord(db, { w: "tokens", ctx: "Count the tokens." }, "2026-10-14");
  updateWord(db, "tokens", { note: "моя заметка" });
  const key = applyLookup(db, "tokens", {
    lemma: "token",
    tr: "токен",
    def: "a unit of text",
    ipa: "",
    note: "other",
  });
  assert.equal(key, "token");
  assert.equal(db.words.tokens, undefined);
  assert.equal(db.words.token.w, "token");
  assert.equal(db.words.token.tr, "токен");
  assert.equal(db.words.token.note, "моя заметка", "own edits win");
  assert.equal(db.words.token.ctx, "Count the tokens.");
  // base form already saved: keep both rather than merge silently
  addWord(db, { w: "tokenized" }, "2026-10-14");
  assert.equal(applyLookup(db, "tokenized", { lemma: "token", tr: "x" }), "tokenized");
});
