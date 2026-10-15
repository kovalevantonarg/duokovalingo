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
  wordStats,
  formIn,
  checkTyped,
  exerciseKind,
  options,
  gradeFor,
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

test("stats: statuses, reviews per day, accuracy, hard words", () => {
  const db = { tickets: {}, history: [] };
  for (const w of ["alpha", "beta", "gamma", "delta"]) addWord(db, { w }, "2026-10-01");
  addWord(db, { w: "epsilon" }, "2026-10-13");
  gradeWord(db, "alpha", "green", "2026-10-12");
  gradeWord(db, "beta", "red", "2026-10-12");
  gradeWord(db, "beta", "red", "2026-10-13");
  gradeWord(db, "gamma", "yellow", "2026-10-13");
  const s = wordStats(db, new Date(2026, 9, 14, 12));
  assert.deepEqual(s.by, { green: 1, yellow: 1, red: 1, new: 2 });
  assert.equal(s.total, 5);
  assert.equal(s.reviewed7, 4);
  assert.equal(s.added7, 1);
  assert.equal(s.acc30, 0.25);
  assert.equal(s.days.length, 14);
  assert.deepEqual(s.days.slice(-3), [
    { d: "2026-10-12", n: 2 },
    { d: "2026-10-13", n: 2 },
    { d: "2026-10-14", n: 0 },
  ]);
  assert.deepEqual(
    s.hard.map((w) => w.key),
    ["beta"],
  );
  assert.equal(db.words.beta.miss, 2);
  assert.equal(db.words.beta.reps, 2);
});

test("trainer: exercise choice, typed answers, options, grades", () => {
  assert.deepEqual(formIn("Count the Tokens first.", "token"), { at: 10, form: "Tokens" });
  assert.equal(formIn("No match here", "token"), null);
  assert.equal(checkTyped(" Tokens ", ["Tokens", "token"]), "ok");
  assert.equal(checkTyped("throughpt", ["throughput"]), "almost");
  assert.equal(checkTyped("thru", ["throughput"]), "no");
  assert.equal(checkTyped("cat", ["car"]), "no", "short words need the exact spelling");
  const w = { w: "token", tr: "токен", ctx: "Count the tokens." };
  assert.equal(exerciseKind(w), "pickTr", "new word: recognise it");
  assert.equal(exerciseKind({ ...w, reps: 2, st: "yellow" }), "gap");
  assert.equal(exerciseKind({ ...w, reps: 3, st: "green" }), "type");
  assert.equal(
    exerciseKind({ w: "token", ctx: "Count the tokens.", reps: 1, st: "red" }),
    "gap",
    "no translation: the sentence",
  );
  assert.equal(exerciseKind({ w: "token" }), "flip");
  const opts = options("токен", ["токен", "задержка"], ["очередь", "откат", "пакет"], () => 0.3);
  assert.equal(opts.length, 4);
  assert.ok(opts.includes("токен") && opts.includes("задержка"));
  assert.equal(new Set(opts).size, 4);
  assert.equal(gradeFor("pickTr", "ok", undefined), "yellow");
  assert.equal(gradeFor("gap", "ok", "yellow"), "green");
  assert.equal(gradeFor("type", "ok", "green"), "green");
  assert.equal(gradeFor("type", "almost", "green"), "yellow");
  assert.equal(gradeFor("pickW", "no", "green"), "red");
});
