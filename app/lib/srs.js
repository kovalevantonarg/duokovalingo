// @ts-check
/**
 * Spaced repetition over interview tickets. One implementation, used by
 *   - the Vercel function (app/api/[route].js) when progress is saved in the cloud,
 *   - the local server (today.mjs) when progress is saved to queue.json,
 *   - the browser when it records progress offline and shows what's due.
 *
 * The unit of progress is a ticket (content/tickets/NN-*.json, see lib/catalog.js).
 * The model is a simplified SM-2:
 *   red    → see it again tomorrow
 *   yellow → in 3 days
 *   green  → in 7 days, and every further green in a row doubles the gap, up to 90 days.
 * A red or yellow resets the gap to its base value.
 */
import { CATALOG } from "./catalog.js";

/** @typedef {"new" | "red" | "yellow" | "green"} Status */

/**
 * Progress on one ticket. A ticket without a record is new.
 * @typedef {object} Rec
 * @property {Status} [st]       current status
 * @property {string} [last]     date of the last graded attempt, YYYY-MM-DD
 * @property {number} [iv]       current interval in days
 * @property {string} [mode]     game mode of the last attempt (voice, tf, gap, order, exam)
 * @property {string} [answer]   last voice/typed answer, trimmed
 * @property {boolean} [doubt]   flagged "not sure": goes first in the next session
 * @property {string} [read]     date the lesson was marked read, YYYY-MM-DD (training can be limited to read tickets)
 * @property {string} [practiced] date of the last practice round (true/false, gaps, order, session warm-up)
 */

/** @typedef {{ d: string, tickets: number[], xp?: number }} Day */
/**
 * @typedef {{ schema: 2, tickets: Record<string, Rec>, history: Day[], paused?: string, breakSeen?: string,
 *   legacy?: object, exams?: object[] }} Db
 * paused: date a pause began (schedule frozen until resumed); breakSeen: date the "welcome back" choice was made.
 */

/**
 * @typedef {object} Hit       one attempt, as sent by the client
 * @property {number|string} [n]   ticket number
 * @property {number|string} [id]  old clients: an item id, mapped to its ticket
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
export const SCHEMA = 2;
/** Modes that count as the "practice" step of a ticket's path (tf, gap, order and their review rounds, session). */
const PRACTICE = /^(tf|gap|order|session)(-review)?$/;

const DAY_MS = 864e5;
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isoDay = (d = new Date()) => d.toISOString().slice(0, 10);

const BY_N = new Map(CATALOG.map((t) => [t.n, t]));
/** Is `n` a ticket in the catalog? */
export const isTicket = (n) => BY_N.has(Number(n));

/** The ticket an old item id belongs to: the first active ticket listing it in `core`, else any. */
export function ticketOfItem(id) {
  const all = CATALOG.filter((t) => t.core.includes(Number(id)));
  return (all.find((t) => t.sec !== "parked") || all[0])?.n ?? null;
}

/** Ticket number a hit refers to, or null. */
export function resolveTicket(hit) {
  if (hit.n != null && hit.n !== "") return isTicket(hit.n) ? Number(hit.n) : null;
  if (hit.id != null) return ticketOfItem(hit.id);
  return null;
}

export const emptyDb = () => /** @type {Db} */ ({ schema: SCHEMA, tickets: {}, history: [] });

/** @param {Db} db @param {number} n @returns {Rec} */
export const recOf = (db, n) => db.tickets[n] || {};
/** @param {Db} db @param {number} n @returns {Status} */
export const statusOf = (db, n) => recOf(db, n).st || "new";

/**
 * Next interval after an attempt graded `next`, given the record before it.
 * @param {Rec} rec
 * @param {Status} next
 */
export function nextInterval(rec, next) {
  const base = INTERVAL[next];
  const greenAgain = next === "green" && rec.st === "green" && rec.iv;
  return greenAgain ? Math.min(MAX_IV, Math.round(rec.iv * EASE)) : base;
}

/**
 * Record one attempt: counts it in the day's activity and, if graded, moves the ticket's status and interval.
 * Mutates `db`. Returns false when the ticket doesn't exist.
 * @param {Db} db
 * @param {Hit} hit
 * @param {string} [today] YYYY-MM-DD, injectable for tests
 */
export function applyHit(db, hit, today = isoDay()) {
  const n = resolveTicket(hit);
  if (n === null) return false;
  const d = isDate(hit.d) ? hit.d : today;

  let day = db.history.find((h) => h.d === d);
  if (!day) db.history.push((day = { d, tickets: [], xp: 0 }));
  if (!day.tickets.includes(n)) day.tickets.push(n);
  day.xp = (day.xp || 0) + (Number(hit.xp) || 0);

  const rec = (db.tickets[n] ||= {});
  if (hit.st && hit.st in INTERVAL) {
    rec.iv = nextInterval(rec, hit.st);
    rec.st = hit.st;
    rec.last = d;
    delete rec.doubt; // a fresh grade answers the doubt
  }
  if (hit.mode) rec.mode = String(hit.mode).slice(0, 20);
  if (PRACTICE.test(String(hit.mode || ""))) rec.practiced = d;
  if (hit.transcript) rec.answer = String(hit.transcript).slice(0, 600);
  return true;
}

/**
 * Set a ticket's flags: `doubt` ("not sure") and/or `read` (lesson read). Fields left undefined aren't touched.
 * Returns false for an unknown ticket or when nothing changed. @param {Db} db
 * @param {{ doubt?: boolean, read?: boolean }} flags
 */
export function setFlags(db, n, { doubt, read }, today = isoDay()) {
  if (!isTicket(n)) return false;
  const rec = (db.tickets[Number(n)] ||= {});
  let changed = false;
  if (doubt !== undefined && !!rec.doubt !== !!doubt) {
    if (doubt) rec.doubt = true;
    else delete rec.doubt;
    changed = true;
  }
  if (read !== undefined && !!rec.read !== !!read) {
    if (read) rec.read = isDate(today) ? today : isoDay();
    else delete rec.read;
    changed = true;
  }
  return changed;
}
/** Flag or unflag a ticket as "not sure". @param {Db} db */
export const setDoubt = (db, n, on) => setFlags(db, n, { doubt: !!on });

/**
 * Forget a ticket: back to "new" (status, interval, last date, doubt, last answer go). The lesson stays marked read;
 * activity history and exam attempts are kept. Returns false when there was nothing to reset. @param {Db} db
 */
export function resetTicket(db, n) {
  const rec = db.tickets[Number(n)];
  if (!isTicket(n) || !rec) return false;
  const keep = rec.read ? { read: rec.read } : null;
  if (keep) db.tickets[Number(n)] = keep;
  else delete db.tickets[Number(n)];
  return !!(rec.st || rec.doubt || rec.mode || rec.answer || rec.iv || rec.last);
}

/** Interval currently in force, or 0 if not scheduled. @param {Rec} rec */
export const intervalOf = (rec) => rec.iv || INTERVAL[rec.st] || 0;

/** Whole days since a YYYY-MM-DD date (local midnight to local midnight). */
export function daysSince(date, now = new Date()) {
  const [y, m, d] = date.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - then.getTime()) / DAY_MS);
}

/** How many days overdue (0 = due today, negative = not yet). null when not scheduled. @param {Rec} rec */
export function overdue(rec, now = new Date()) {
  const iv = intervalOf(rec);
  return rec.last && iv ? daysSince(rec.last, now) - iv : null;
}

/** @param {Rec} rec */
export const isDue = (rec, now = new Date()) => (overdue(rec, now) ?? -1) >= 0;

/**
 * How far past its interval a ticket is: days since the last grade / interval. 1 = due today; above 2 it has
 * most likely been forgotten. null when not scheduled. @param {Rec} rec
 */
export function lapse(rec, now = new Date()) {
  const iv = intervalOf(rec);
  return rec.last && iv ? daysSince(rec.last, now) / iv : null;
}
export const FORGOTTEN = 2;

/**
 * Due tickets, the ones most likely forgotten first (by lapse, not raw days overdue): [{ n, over, lapse, ...rec }].
 * Parked tickets are left out; nothing is due while the schedule is paused. @param {Db} db
 */
export function dueTickets(db, now = new Date()) {
  if (db.paused) return [];
  return Object.entries(db.tickets)
    .map(([n, rec]) => ({ ...rec, n: Number(n), over: overdue(rec, now), lapse: lapse(rec, now) }))
    .filter((r) => r.over !== null && r.over >= 0 && BY_N.get(r.n)?.sec !== "parked")
    .sort((a, b) => b.lapse - a.lapse || a.n - b.n);
}

// ---- breaks: pause, "welcome back", start over ----

const addDays = (date, k) => {
  const [y, m, d] = date.split("-").map(Number);
  return isoDay(new Date(Date.UTC(y, m - 1, d + k)));
};
/** Last day with any practice, or null. @param {Db} db */
export const lastActivity = (db) =>
  db.history.filter((h) => h.tickets?.length && isDate(h.d)).reduce((a, h) => (a && a > h.d ? a : h.d), null);

/** Days without practice that count as a break (the "welcome back" screen offers a choice after it). */
export const BREAK_DAYS = 7;
/**
 * Length of the current break in days, or 0. Counted from the last practice or the last welcome-back choice,
 * whichever is later; a paused schedule isn't a break. @param {Db} db
 */
export function breakDays(db, today = isoDay()) {
  if (db.paused) return 0;
  const since = [lastActivity(db), db.breakSeen].filter(Boolean).sort().pop();
  const scheduled = Object.values(db.tickets).some((r) => r.last);
  if (!since || !scheduled) return 0;
  const gap = Math.round((Date.parse(today) - Date.parse(since)) / DAY_MS);
  return gap > BREAK_DAYS ? gap : 0;
}

/** Move every scheduled date forward by `days`, as if that time hadn't passed. @param {Db} db */
function shift(db, days) {
  for (const r of Object.values(db.tickets)) if (r.last) r.last = addDays(r.last, days);
}
const DOWN = { green: "yellow", yellow: "red", red: "red" };

/**
 * Change the schedule as a whole. Returns false when nothing changed. @param {Db} db
 * @param {{ action: "continue"|"soft"|"reset"|"pause"|"resume", keepRead?: boolean, keepHistory?: boolean }} p
 *   continue  after a break: shift all dates by the break, so only what was overdue before it is overdue now
 *   soft      after a break: tickets far past their interval drop one level (green → yellow → red) and are due today
 *   reset     start over: every ticket back to new; optionally keep read marks and the activity history
 *   pause     freeze the schedule from today (nothing comes due, no reminders)
 *   resume    unfreeze: dates shift by the length of the pause
 */
export function planAction(db, p, today = isoDay()) {
  const a = p && p.action;
  if (a === "continue" || a === "soft") {
    const gap = breakDays(db, today);
    if (a === "continue" && gap) shift(db, gap - 1);
    if (a === "soft")
      for (const r of Object.values(db.tickets)) {
        if (!r.st || r.st === "new" || (lapse(r, new Date(today + "T12:00:00")) ?? 0) < FORGOTTEN) continue;
        r.st = DOWN[r.st];
        r.iv = INTERVAL[r.st];
        r.last = addDays(today, -r.iv);
      }
    db.breakSeen = today;
    return true;
  }
  if (a === "reset") {
    for (const [n, r] of Object.entries(db.tickets)) {
      if (p.keepRead !== false && r.read) db.tickets[n] = { read: r.read };
      else delete db.tickets[n];
    }
    if (p.keepHistory === false) db.history = [];
    delete db.paused;
    db.breakSeen = today;
    return true;
  }
  if (a === "pause") {
    if (db.paused) return false;
    db.paused = today;
    return true;
  }
  if (a === "resume") {
    if (!db.paused) return false;
    const days = Math.round((Date.parse(today) - Date.parse(db.paused)) / DAY_MS);
    if (days > 0) shift(db, days);
    delete db.paused;
    db.breakSeen = today;
    return true;
  }
  return false;
}

/** Next review date, YYYY-MM-DD, or null. @param {Rec} rec */
export function dueDate(rec) {
  const iv = intervalOf(rec);
  if (!rec.last || !iv) return null;
  const [y, m, d] = rec.last.split("-").map(Number);
  return isoDay(new Date(Date.UTC(y, m - 1, d + iv)));
}

const RANK = { red: 0, yellow: 1, green: 2 };

/**
 * Bring progress saved by older versions (one record per drill item) to the ticket model, in place.
 * Each ticket takes the status of its most recently graded core item (on a tie, the weaker one).
 * Day history maps item ids to their tickets. The old data is kept under `legacy`.
 * Returns true when it changed something.
 * @param {any} db
 */
export function migrate(db) {
  if (db.schema === SCHEMA && db.tickets && Array.isArray(db.history)) return false;
  const { exams, ...old } = db;
  const items = Array.isArray(old.items) ? old.items : [];
  const byId = new Map(items.map((i) => [i.id, i]));
  /** @type {Record<string, Rec>} */
  const tickets = {};
  for (const t of CATALOG) {
    const graded = t.core
      .map((id) => byId.get(id))
      .filter((i) => i && i.st in INTERVAL && isDate(i.last))
      .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : RANK[a.st] - RANK[b.st]));
    const top = graded[0];
    if (!top) continue;
    /** @type {Rec} */
    const rec = { st: top.st, last: top.last, iv: top.iv || INTERVAL[top.st] };
    if (top.lastMode) rec.mode = top.lastMode;
    if (top.lastAnswer) rec.answer = top.lastAnswer;
    tickets[t.n] = rec;
  }
  /** @type {Day[]} */
  const history = (Array.isArray(old.history) ? old.history : [])
    .filter((h) => h && isDate(h.d))
    .map((h) => {
      const ns = new Set();
      for (const id of h.ids || []) {
        const n = ticketOfItem(id);
        if (n !== null) ns.add(n);
      }
      return { d: h.d, tickets: [...ns], xp: h.xp || 0 };
    });
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, { schema: SCHEMA, tickets, history });
  if (items.length || (old.history || []).length) db.legacy = old;
  if (exams) db.exams = exams;
  return true;
}
