// @ts-check
/**
 * The personal dictionary: English words and phrases saved from lessons and tickets, reviewed as flashcards.
 * Lives in the progress row as db.words, keyed by the normalised word. Same spaced-repetition rules as tickets
 * (lib/srs.js): red → tomorrow, yellow → 3 days, green → 7 days and doubling.
 */
import { INTERVAL, isoDay, nextInterval, overdue } from "./srs.js";

/**
 * @typedef {object} Word
 * @property {string} w        the word or phrase as saved (lemma once looked up)
 * @property {string} [tr]     Russian translation, short
 * @property {string} [def]    plain-English definition
 * @property {string} [ipa]    pronunciation
 * @property {string} [note]   usage note
 * @property {string} [ctx]    the sentence it was found in
 * @property {number} [n]      ticket it came from
 * @property {string} added    YYYY-MM-DD
 * @property {"red"|"yellow"|"green"} [st]
 * @property {number} [iv]
 * @property {string} [last]
 */

export const MAX_WORDS = 1000;
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (s, max) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Normalised key: lower case, single spaces, no surrounding punctuation. */
export const wordKey = (w) =>
  str(w, 80)
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** Is this selection worth offering to save? Latin letters, 1–5 words, not too long. */
export function savable(text) {
  const t = str(text, 200);
  return t.length >= 2 && t.length <= 60 && /[A-Za-z]/.test(t) && t.split(" ").length <= 5;
}

/** Add a word (or refresh its context). Returns the key, or null when invalid or the dictionary is full. */
export function addWord(db, { w, ctx, n }, today = isoDay()) {
  const key = wordKey(w);
  if (!key || !savable(w)) return null;
  db.words ||= {};
  const cur = db.words[key];
  if (cur) {
    if (ctx && !cur.ctx) cur.ctx = str(ctx, 300);
    return key;
  }
  if (Object.keys(db.words).length >= MAX_WORDS) return null;
  /** @type {Word} */
  const word = { w: str(w, 80), added: isDate(today) ? today : isoDay() };
  if (ctx) word.ctx = str(ctx, 300);
  if (Number.isInteger(Number(n)) && Number(n) > 0) word.n = Number(n);
  db.words[key] = word;
  return key;
}

/** Fill or edit the text fields (translation, definition, …). Empty string clears a field. */
export function updateWord(db, key, fields) {
  const word = db.words?.[key];
  if (!word) return false;
  const max = { w: 80, tr: 120, def: 200, ipa: 60, note: 200, ctx: 300 };
  let changed = false;
  for (const k of Object.keys(max)) {
    if (fields[k] === undefined) continue;
    const v = str(fields[k], max[k]);
    if (k === "w" && !v) continue;
    if (v) word[k] = v;
    else delete word[k];
    changed = true;
  }
  return changed;
}

export function removeWord(db, key) {
  if (!db.words?.[key]) return false;
  delete db.words[key];
  return true;
}

/** Self-grade after a flashcard: moves the word along the same intervals as tickets. */
export function gradeWord(db, key, st, today = isoDay()) {
  const word = db.words?.[key];
  if (!word || !(st in INTERVAL)) return false;
  const d = isDate(today) ? today : isoDay();
  word.iv = nextInterval(word, st);
  word.st = st;
  word.last = d;
  word.reps = (word.reps || 0) + 1;
  if (st === "red") word.miss = (word.miss || 0) + 1;
  // reviews per day, for the stats: { d, n reviews, ok "know it" answers }; the last 120 days
  db.wordLog ||= [];
  let day = db.wordLog.find((x) => x.d === d);
  if (!day) {
    db.wordLog.push((day = { d, n: 0, ok: 0 }));
    db.wordLog.sort((a, b) => (a.d < b.d ? -1 : 1));
    if (db.wordLog.length > 120) db.wordLog.splice(0, db.wordLog.length - 120);
  }
  day.n++;
  if (st === "green") day.ok++;
  return true;
}

/**
 * Numbers for the dictionary screen: words by status, reviews and additions over the last week, the share of
 * "know it" answers over 30 days, reviews per day for the last 14 days, and the words forgotten most often.
 */
export function wordStats(db, now = new Date()) {
  const all = Object.entries(db.words || {}).map(([key, w]) => ({ key, ...w }));
  const by = { green: 0, yellow: 0, red: 0, new: 0 };
  for (const w of all) by[w.st || "new"]++;
  // local calendar days, like the dates the app writes
  const ago = (k) => {
    const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() - k);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const log = db.wordLog || [];
  const since = (k) => log.filter((x) => x.d >= ago(k));
  const sum = (xs, f) => xs.reduce((a, x) => a + (x[f] || 0), 0);
  const m30 = since(29);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = ago(13 - i);
    return { d, n: log.find((x) => x.d === d)?.n || 0 };
  });
  const hard = all
    .filter((w) => w.miss && w.st !== "green")
    .sort((a, b) => b.miss - a.miss || (a.last < b.last ? 1 : -1))
    .slice(0, 6);
  return {
    total: all.length,
    by,
    due: dueWords(db, now).length,
    reviewed7: sum(since(6), "n"),
    added7: all.filter((w) => w.added >= ago(6)).length,
    acc30: sum(m30, "n") ? sum(m30, "ok") / sum(m30, "n") : null,
    days,
    hard,
  };
}

/** Words to review now: never reviewed ones (oldest first) after the due ones (most overdue first). */
export function dueWords(db, now = new Date()) {
  const all = Object.entries(db.words || {}).map(([key, w]) => ({ key, ...w, over: overdue(w, now) }));
  const due = all.filter((w) => w.over !== null && w.over >= 0).sort((a, b) => b.over - a.over);
  const fresh = all.filter((w) => !w.last).sort((a, b) => (a.added < b.added ? -1 : 1));
  return [...due, ...fresh];
}

/** Apply one /api/words request body to db. Returns { ok, key } (ok false = nothing changed or invalid). */
export function wordOp(db, b, today = isoDay()) {
  if (b.op === "add") {
    const key = addWord(db, b, today);
    return { ok: !!key, key };
  }
  const key = wordKey(b.key || b.w || "");
  if (b.op === "update") return { ok: updateWord(db, key, b), key };
  if (b.op === "remove") return { ok: removeWord(db, key), key };
  if (b.op === "grade") return { ok: gradeWord(db, key, b.st, today), key };
  return { ok: false, key };
}

/**
 * Store a dictionary lookup on a word: fills empty fields (never overwrites the person's own edits) and, when the
 * lookup found a different base form ("tokens" → "token"), files the word under it. Returns the final key.
 * @param {{ lemma?: string, tr?: string, def?: string, ipa?: string, note?: string }} info
 */
export function applyLookup(db, key, info) {
  const word = db.words?.[key];
  if (!word || !info) return key;
  const fill = {};
  for (const k of ["tr", "def", "ipa", "note"]) if (!word[k] && info[k]) fill[k] = info[k];
  updateWord(db, key, fill);
  const lk = wordKey(info.lemma || "");
  if (lk && lk !== key && !db.words[lk] && savable(info.lemma)) {
    db.words[lk] = { ...word, w: str(info.lemma, 80) };
    delete db.words[key];
    return lk;
  }
  return key;
}

// ---- the word trainer: exercises that check you, not a self-grade ----

/** Common engineering words with translations: extra wrong options while the dictionary is small. */
export const FILLER = [
  ["latency", "задержка"],
  ["throughput", "пропускная способность"],
  ["retry", "повторная попытка"],
  ["bottleneck", "узкое место"],
  ["trade-off", "компромисс"],
  ["rollback", "откат"],
  ["deployment", "развёртывание"],
  ["dependency", "зависимость"],
  ["fallback", "запасной вариант"],
  ["overhead", "накладные расходы"],
  ["consistency", "согласованность"],
  ["redundancy", "избыточность"],
  ["deprecated", "устаревший"],
  ["batch", "пакет"],
  ["queue", "очередь"],
  ["timeout", "тайм-аут"],
  ["benchmark", "эталонный тест"],
  ["outage", "сбой"],
  ["scalability", "масштабируемость"],
  ["accuracy", "точность"],
  ["leverage", "использовать с выгодой"],
  ["mitigate", "смягчить"],
  ["ensure", "гарантировать"],
  ["assumption", "допущение"],
  ["requirement", "требование"],
  ["constraint", "ограничение"],
  ["feasible", "осуществимый"],
  ["robust", "надёжный"],
  ["straightforward", "простой"],
  ["ambiguous", "неоднозначный"],
];

/** Where the word stands in its sentence, as written there ("tokens" for "token"): { at, form } or null. */
export function formIn(ctx, w) {
  if (!ctx || !w) return null;
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?:s|es|d|ed|ing)?(?![\\p{L}\\p{N}])`, "iu").exec(ctx);
  return m ? { at: m.index, form: m[0] } : null;
}

export function editDistance(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return d[b.length];
}

/** A typed answer against the accepted spellings: "ok", "almost" (one typo in a longer word) or "no". */
export function checkTyped(input, answers) {
  const norm = (s) => wordKey(s).replace(/[-\s]+/g, " ");
  const a = norm(input);
  if (!a) return "no";
  const want = answers.filter(Boolean).map(norm);
  if (want.includes(a)) return "ok";
  return want.some((x) => x.length >= 5 && editDistance(a, x) === 1) ? "almost" : "no";
}

const LEVEL = ["pickTr", "pickW", "gap", "type"];

/** Which exercise fits how well the word is known: new or forgotten → recognise it; shaky → recall it in
 * context; known → type it. Falls back to what the word's data allows (no translation → no choice of
 * translations); with neither a translation nor a sentence, only the self-graded card is left. */
export function exerciseKind(word) {
  const can = {
    pickTr: !!word.tr,
    pickW: !!word.tr,
    gap: !!formIn(word.ctx, word.w),
    type: !!word.tr || !!formIn(word.ctx, word.w),
  };
  const want = !word.reps || word.st === "red" ? 0 : word.st === "yellow" ? 2 : word.st === "green" ? 3 : 1;
  for (const k of [want, want - 1, want + 1, want - 2, want + 2, want - 3, want + 3])
    if (LEVEL[k] && can[LEVEL[k]]) return LEVEL[k];
  return "flip";
}

/** Four options: the right one and three others from the dictionary, topped up from FILLER. */
export function options(right, others, filler, rnd = Math.random) {
  const seen = new Set([right.toLowerCase()]);
  const pool = [];
  for (const x of [...shuffled(others, rnd), ...shuffled(filler, rnd)]) {
    if (!x || seen.has(x.toLowerCase())) continue;
    seen.add(x.toLowerCase());
    pool.push(x);
    if (pool.length === 3) break;
  }
  return shuffled([right, ...pool], rnd);
}
function shuffled(xs, rnd) {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The grade an exercise result gives the word: a miss is red, a near miss yellow; a right answer counts
 * for more the harder the exercise was (recognising it isn't knowing it). */
export function gradeFor(kind, result, st) {
  if (result === "no") return "red";
  if (result === "almost") return "yellow";
  if (kind === "type") return "green";
  if (kind === "pickW" || kind === "gap") return st === "yellow" || st === "green" ? "green" : "yellow";
  return "yellow";
}
