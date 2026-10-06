// Mutable app state shared by every screen. One object so modules can read and reassign fields (db, lang, …) without circular `let` exports.
import { emptyDb } from "../lib/srs.js";

const read = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};

export const state = {
  /** UI language, persisted */
  lang: (() => {
    try {
      return localStorage.getItem("drill.lang") || "ru";
    } catch {
      return "ru";
    }
  })(),
  /** progress: { schema, tickets, history } from /api/state (see lib/srs.js) */
  db: read("drill.db", null) || emptyDb(),
  /** true when the API answered; false = offline mode */
  live: false,
  /** attempts recorded offline, replayed by flushPending() */
  pending: read("drill.pending", []),
  /** graded exam attempts {n, d, t, score, q, answer?, verdict?, kind?}: cloud copy from /api/exams, mirrored locally */
  exams: read("exam.attempts", []),
  /** the API answered 401 */
  needLogin: false,
  /** ticket to animate after a round */
  lastChanged: null,
  /** redraws the current round in place (used by the RU/EN switch) */
  rerender: null,
  /** correct answers in a row in the current round */
  combo: 0,
  /** where a round returns to when it ends or is closed */
  back: "home",
};

/** localStorage write that never throws (private mode, quota). */
export function persist(k, v) {
  try {
    localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  } catch {}
}
