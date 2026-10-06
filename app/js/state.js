// Mutable app state shared by every screen. One object so modules can read and reassign fields (db, lang, …) without circular `let` exports.
export const state = {
  /** UI language, persisted */
  lang: localStorage.getItem("drill.lang") || "ru",
  /** progress: { items, history, … } from /api/state */
  db: { items: [], history: [] },
  /** true when the API answered; false = offline mode */
  live: false,
  /** attempts recorded offline, replayed by flushPending() */
  pending: JSON.parse(localStorage.getItem("drill.pending") || "[]"),
  /** the API answered 401 */
  needLogin: false,
  /** item id to animate on Home after a round */
  lastChanged: null,
  /** redraws the current round in place (used by the RU/EN switch) */
  rerender: null,
  /** correct answers in a row in the current round */
  combo: 0,
};
