// @ts-check
/**
 * Spaced repetition for drill items: one implementation, used by
 *   - the Vercel function (app/api/[route].js) when progress is saved in the cloud,
 *   - the local server (today.mjs) when progress is saved to queue.json,
 *   - the browser (app/index.html) when it records progress offline and shows what's due.
 *
 * The model is a simplified SM-2:
 *   red    → see it again tomorrow
 *   yellow → in 3 days
 *   green  → in 7 days, and every further green in a row doubles the gap, up to 90 days.
 * A red or yellow resets the gap to its base value.
 */

/** @typedef {"new" | "red" | "yellow" | "green" | "parked"} Status */

/**
 * @typedef {object} Item
 * @property {number} id
 * @property {string} [t]          title
 * @property {Status} [st]         current status
 * @property {string} [last]       date of the last graded attempt, YYYY-MM-DD
 * @property {number} [iv]         current interval in days (missing on old records: falls back to the base interval)
 * @property {string} [lastMode]   game mode of the last attempt (voice, tf, gap, order, exam)
 * @property {string} [lastAnswer] last voice/typed answer, trimmed
 */

/** @typedef {{ d: string, ids: number[], xp?: number }} Day */
/** @typedef {{ items: Item[], history: Day[] }} Db */

/**
 * @typedef {object} Hit       one attempt, as sent by the client
 * @property {number|string} id
 * @property {string} [d]      date, YYYY-MM-DD (defaults to today)
 * @property {Status} [st]     only voice, self-score and exams change the status; quick games leave it out
 * @property {number} [xp]
 * @property {string} [mode]
 * @property {string} [transcript]
 */

/** Base interval in days per status. */
export const INTERVAL = Object.freeze({ red: 1, yellow: 3, green: 7 });
/** Green streak multiplier and cap. */
export const EASE = 2;
export const MAX_IV = 90;

const DAY_MS = 864e5;
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isoDay = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * Next interval after an attempt graded `next`, given the item's state before it.
 * @param {Item} item
 * @param {Status} next
 */
export function nextInterval(item, next) {
  const base = INTERVAL[next];
  const greenAgain = next === "green" && item.st === "green" && item.iv;
  return greenAgain ? Math.min(MAX_IV, Math.round(item.iv * EASE)) : base;
}

/**
 * Record one attempt: counts it in the day's activity and, if graded, moves the item's status and interval.
 * Mutates `db`. Returns false when the item doesn't exist.
 * @param {Db} db
 * @param {Hit} hit
 * @param {string} [today] YYYY-MM-DD, injectable for tests
 */
export function applyHit(db, hit, today = isoDay()) {
  const item = db.items.find((i) => i.id === Number(hit.id));
  if (!item) return false;
  const d = isDate(hit.d) ? hit.d : today;

  let day = db.history.find((h) => h.d === d);
  if (!day) db.history.push((day = { d, ids: [], xp: 0 }));
  if (!day.ids.includes(item.id)) day.ids.push(item.id);
  day.xp = (day.xp || 0) + (Number(hit.xp) || 0);

  if (hit.st && hit.st in INTERVAL) {
    item.iv = nextInterval(item, hit.st);
    item.st = hit.st;
    item.last = d;
  }
  if (hit.mode) item.lastMode = String(hit.mode).slice(0, 20);
  if (hit.transcript) item.lastAnswer = String(hit.transcript).slice(0, 600);
  return true;
}

/** Interval currently in force for an item, or 0 if it isn't scheduled. @param {Item} item */
export const intervalOf = (item) => item.iv || INTERVAL[item.st] || 0;

/** Whole days since a YYYY-MM-DD date (local midnight to local midnight). */
export function daysSince(date, now = new Date()) {
  const [y, m, d] = date.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - then.getTime()) / DAY_MS);
}

/** How many days overdue (0 = due today, negative = not yet). null when not scheduled. @param {Item} item */
export function overdue(item, now = new Date()) {
  const iv = intervalOf(item);
  return item.last && iv ? daysSince(item.last, now) - iv : null;
}

/** @param {Item} item */
export const isDue = (item, now = new Date()) => (overdue(item, now) ?? -1) >= 0;

/** Due items, most overdue first. @param {Item[]} items */
export function dueItems(items, now = new Date()) {
  return items
    .map((i) => ({ ...i, over: overdue(i, now) }))
    .filter((i) => i.over !== null && i.over >= 0)
    .sort((a, b) => b.over - a.over);
}

/** Next review date, YYYY-MM-DD, or null. @param {Item} item */
export function dueDate(item) {
  const iv = intervalOf(item);
  if (!item.last || !iv) return null;
  const [y, m, d] = item.last.split("-").map(Number);
  return isoDay(new Date(Date.UTC(y, m - 1, d + iv)));
}
