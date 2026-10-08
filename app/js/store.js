// Progress data: loading it from the API, saving attempts (or queueing them offline), and queries over tickets.
import {
  applyHit,
  dueTickets,
  migrate,
  recOf,
  resetTicket as resetLocal,
  setFlags,
  statusOf,
} from "../lib/srs.js";
import { persist, state } from "./state.js";
import { TODAY, dLocal, iso } from "./util.js";

/** All tickets (window.TICKETS from tickets.js). */
export const tickets = () => window.TICKETS || [];
/** Ticket by number. */
export const tk = (n) => tickets().find((t) => t.n === Number(n));
/** Tickets that take part in sessions and readiness (the parked quick-check ones don't). */
export const active = () => tickets().filter((t) => t.sec !== "parked");

export const rec = (n) => recOf(state.db, n);
export const status = (n) => statusOf(state.db, n);
export const isRead = (n) => !!rec(n).read;

/** Setting: train only tickets whose lesson is marked read (on by default). */
export const onlyRead = () => {
  try {
    return localStorage.getItem("drill.onlyRead") !== "0";
  } catch {
    return true;
  }
};
export const setOnlyRead = (on) => persist("drill.onlyRead", on ? "1" : "0");
/** May this ticket come up in sessions, interview mode and random draws? */
export const trainable = (n) => !onlyRead() || isRead(n);

/** Due tickets that may be trained (see onlyRead). */
export const due = () => dueTickets(state.db).filter((r) => trainable(r.n));
/** Due tickets hidden because their lesson isn't read yet. */
export const dueUnread = () => (onlyRead() ? dueTickets(state.db).filter((r) => !isRead(r.n)) : []);
export const doubts = () => active().filter((t) => rec(t.n).doubt && trainable(t.n));
/** Read but never graded: ready for a first session. */
export const readNew = () => active().filter((t) => isRead(t.n) && status(t.n) === "new");
/** The next ticket to start: the first one, by number, that is neither read nor graded. */
export const nextNew = () => active().find((t) => status(t.n) === "new" && !rec(t.n).doubt && !isRead(t.n));

function setDb(db) {
  migrate(db);
  state.db = db;
  const { auth, explain, push, ...keep } = db;
  persist("drill.db", keep);
}

export async function loadState() {
  state.needLogin = false;
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.ok) {
      const db = await r.json();
      forgetOtherUser(db.user?.email || "");
      setDb(db);
      state.live = true;
    } else if (r.status === 401) {
      state.needLogin = true;
    }
  } catch {}
  migrate(state.db);
  // offline: the cached progress plus whatever was recorded since
  if (!state.live && !state.needLogin) for (const p of state.pending) applyLocal(p);
}

/** Another account signed in on this browser: drop the previous one's offline queue and cached scores. */
function forgetOtherUser(who) {
  let was = null;
  try {
    was = localStorage.getItem("drill.user");
  } catch {}
  if (was === who) return;
  if (was !== null) {
    state.pending = [];
    state.exams = [];
    persist("drill.pending", []);
    persist("exam.attempts", []);
  }
  persist("drill.user", who);
}

// offline: record the attempt locally with the same rules the server uses (lib/srs.js)
export function applyLocal(p) {
  if (p.path === "/api/reset") return resetLocal(state.db, p.n);
  if (p.path === "/api/flag") {
    const flags = {};
    if ("doubt" in p) flags.doubt = !!p.doubt;
    if ("read" in p) flags.read = !!p.read;
    return setFlags(state.db, p.n, flags, TODAY);
  }
  return applyHit(state.db, p, TODAY);
}

export async function post(path, body) {
  body.d = TODAY;
  if (state.live) {
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setDb(await r.json());
        return true;
      }
    } catch {}
    state.live = false;
  }
  state.pending.push({ ...body, path });
  persist("drill.pending", state.pending);
  applyLocal({ ...body, path });
  return false;
}

export async function flushPending() {
  if (!state.live || !state.pending.length) return;
  for (const p of state.pending.slice()) {
    try {
      const r = await fetch(p.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p),
      });
      if (r.ok) setDb(await r.json());
      // a 4xx won't succeed later either: drop it; network errors stop the replay
      if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 401)) state.pending.shift();
      else break;
    } catch {
      break;
    }
  }
  persist("drill.pending", state.pending);
}

/** Mark a ticket "not sure" (it goes first in the next session) or clear the mark. */
export const flagDoubt = (n, on) => post("/api/flag", { n, doubt: !!on });
/** Mark a ticket's lesson read or unread (synced, so it holds on every device). */
export const flagRead = (n, on) => post("/api/flag", { n, read: !!on });
/** Forget a ticket: back to "new"; the read mark and exam history stay. */
export const resetTicket = (n) => post("/api/reset", { n });

/** Lessons marked read before the mark was synced lived in this browser only: send them up once. */
export async function syncLocalReads() {
  let local = [];
  try {
    local = JSON.parse(localStorage.getItem("learn.read") || "[]");
  } catch {}
  if (!state.live || !local.length) return;
  for (const n of local) if (!isRead(n)) await flagRead(n, true);
  try {
    localStorage.removeItem("learn.read");
  } catch {}
}

/** Days with activity in a row, ending today or yesterday. */
export function streak() {
  const set = new Set(state.db.history.filter((h) => h.tickets && h.tickets.length).map((h) => h.d));
  let n = 0,
    d = dLocal(TODAY);
  if (!set.has(TODAY)) d.setDate(d.getDate() - 1);
  while (set.has(iso(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export const xpToday = () => (state.db.history.find((h) => h.d === TODAY) || {}).xp || 0;

// ---- exam attempts ----

/** Merge attempts from the server into the local copy; the same ticket+time is updated in place. */
export function mergeAttempts(list) {
  if (!Array.isArray(list)) return;
  const key = (e) => e.n + "|" + (e.t || e.d);
  const byKey = new Map(state.exams.map((e) => [key(e), e]));
  for (const e of list) byKey.set(key(e), { ...byKey.get(key(e)), ...e });
  state.exams = [...byKey.values()].sort((a, b) => (a.t || 0) - (b.t || 0)).slice(-400);
  persist("exam.attempts", state.exams);
}

/** Every attempt's score (no texts). With a ticket number: that ticket's attempts with answer and verdict. */
export async function loadAttempts(n = null) {
  try {
    const r = await fetch("/api/exams" + (n ? "?n=" + n : ""), { cache: "no-store" });
    if (r.ok) mergeAttempts(await r.json());
  } catch {}
}

/** A ticket's exam attempts (not interview answers), oldest first. */
export const attemptsOf = (n) => state.exams.filter((e) => e.n === Number(n) && e.kind !== "interview");
export const lastScore = (n) => attemptsOf(n).slice(-1)[0]?.score;
