// Progress data: loading it from the API, saving attempts (or queueing them offline), and queries over tickets.
import { applyHit, dueTickets, migrate, recOf, setDoubt, statusOf } from "../lib/srs.js";
import { persist, state } from "./state.js";
import { TODAY, dLocal, iso } from "./util.js";

/** Tickets in the order new ones are introduced: LLM basics and the stories first, the rest by number. */
const FIRST = [23, 24, 11, 6, 12, 14, 15, 16, 17, 18, 19, 25, 20, 21, 22];

/** All tickets (window.TICKETS from tickets.js). */
export const tickets = () => window.TICKETS || [];
/** Ticket by number. */
export const tk = (n) => tickets().find((t) => t.n === Number(n));
/** Tickets that take part in sessions and readiness (the parked quick-check ones don't). */
export const active = () => tickets().filter((t) => t.sec !== "parked");

export const rec = (n) => recOf(state.db, n);
export const status = (n) => statusOf(state.db, n);
export const due = () => dueTickets(state.db);
export const doubts = () => active().filter((t) => rec(t.n).doubt);
export const nextNew = () => {
  const order = [
    ...FIRST,
    ...active()
      .map((t) => t.n)
      .filter((n) => !FIRST.includes(n)),
  ];
  return order.map(tk).find((t) => t && t.sec !== "parked" && status(t.n) === "new" && !rec(t.n).doubt);
};

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
      setDb(await r.json());
      state.live = true;
    } else if (r.status === 401) {
      state.needLogin = true;
    }
  } catch {}
  migrate(state.db);
  // offline: the cached progress plus whatever was recorded since
  if (!state.live && !state.needLogin) for (const p of state.pending) applyLocal(p);
}

// offline: record the attempt locally with the same rules the server uses (lib/srs.js)
export const applyLocal = (p) =>
  p.path === "/api/flag" ? setDoubt(state.db, p.n, !!p.doubt) : applyHit(state.db, p, TODAY);

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
