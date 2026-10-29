// @ts-check
/**
 * Lab progress in the progress row: db.labs[id] = { code, at, passed, total, best, runs, started, last, green, sol }.
 * The code is kept so a lab started on the laptop continues on the phone. Dates are YYYY-MM-DD.
 */
import { isoDay } from "./srs.js";

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const MAX_CODE = 20000;

/**
 * Apply one /api/lab request: { id, code?, passed?, total?, solution? } (solution: true = the reference was opened).
 * Returns false when the id is invalid or nothing changed.
 */
export function applyLab(db, b, today = isoDay()) {
  const id = String(b?.id || "");
  if (!/^\d{2}$/.test(id)) return false;
  const d = isDate(today) ? today : isoDay();
  db.labs ||= {};
  const rec = (db.labs[id] ||= { started: d });
  let changed = !rec.last;
  if (typeof b.code === "string" && b.code.length <= MAX_CODE && b.code !== rec.code) {
    rec.code = b.code;
    // when the code was written (client clock, ms): the newer of this and the browser's draft wins
    rec.at = Number.isFinite(Number(b.at)) && Number(b.at) > 0 ? Number(b.at) : Date.now();
    changed = true;
  }
  const p = Number(b.passed),
    t = Number(b.total);
  if (Number.isInteger(p) && Number.isInteger(t) && t > 0 && p >= 0 && p <= t) {
    rec.passed = p;
    rec.total = t;
    rec.best = Math.max(rec.best || 0, p);
    if (p === t && !rec.green) rec.green = d;
    rec.runs = (rec.runs || 0) + 1;
    changed = true;
  }
  if (b.solution && !rec.sol) {
    rec.sol = d;
    changed = true;
  }
  rec.last = d;
  return changed;
}

/** Forget a lab's code and results (start it over); the record goes. */
export function resetLab(db, id) {
  if (!db.labs?.[id]) return false;
  delete db.labs[id];
  return true;
}
