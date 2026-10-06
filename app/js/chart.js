// Exam score chart: scores 0-10 over attempts, with the yellow (5) and green (8) thresholds. Inline SVG.
import { esc } from "./util.js";

const COLOR = (s) => (s >= 8 ? "var(--green)" : s >= 5 ? "var(--amber)" : "var(--red)");

/** @param {{score:number, d:string, n?:number}[]} xs attempts, oldest first @param {(e)=>string} [tip] */
export function scoreChart(xs, tip = (e) => `${e.d} · ${e.score}`) {
  if (!xs.length) return "";
  const W = 320,
    H = 120,
    P = 10;
  const x = (i) => (xs.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (xs.length - 1));
  const y = (s) => H - P - (s / 10) * (H - 2 * P);
  const line = xs.map((e, i) => `${x(i).toFixed(1)},${y(e.score).toFixed(1)}`).join(" ");
  const avg = xs.reduce((a, e) => a + e.score, 0) / xs.length;
  return `<svg class="schart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="avg ${avg.toFixed(1)}">
    <line x1="0" x2="${W}" y1="${y(8)}" y2="${y(8)}" class="th g"/><line x1="0" x2="${W}" y1="${y(5)}" y2="${y(5)}" class="th y"/>
    ${xs.length > 1 ? `<polyline points="${line}" fill="none" stroke="var(--dim2)" stroke-width="2" vector-effect="non-scaling-stroke"/>` : ""}
    ${xs.map((e, i) => `<circle cx="${x(i)}" cy="${y(e.score)}" r="4.5" fill="${COLOR(e.score)}" vector-effect="non-scaling-stroke"><title>${esc(tip(e))}</title></circle>`).join("")}
  </svg>`;
}
