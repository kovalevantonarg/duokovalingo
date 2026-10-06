// Progress tab: readiness (share of tickets said cold) per track, exam score history, activity heatmap.
import { scoreChart } from "../chart.js";
import { state } from "../state.js";
import { active, loadAttempts, status, tk } from "../store.js";
import { fmtDate, frame, ui } from "../ui.js";
import { esc } from "../util.js";
import { activity } from "./activity.js";

/** Tracks grouped into the stages of the plan. Keys match ticket.sec. */
const STAGES = [
  {
    ru: "Фундамент фронта · твоя база, но recall",
    en: "Frontend core · your base, but recall",
    secs: ["js", "ts", "react", "web"],
  },
  { ru: "Фаза 1 · LLM", en: "Phase 1 · LLM", secs: ["llm"] },
  { ru: "Фаза 2 · RAG и агенты", en: "Phase 2 · RAG and agents", secs: ["rag", "agents"] },
  { ru: "Фаза 3 · System design", en: "Phase 3 · System design", secs: ["sysd"] },
  { ru: "Всегда · Behavioral", en: "Always · Behavioral", secs: ["behav"] },
];
const LABEL = {
  llm: "LLM",
  rag: "RAG",
  agents: "Agents",
  sysd: "System design",
  behav: "Behavioral",
  js: "JavaScript",
  ts: "TypeScript",
  react: "React",
  web: "Browser",
};
const ST_CLASS = { green: "st-g", yellow: "st-y", red: "st-r", new: "st-nf" };
/** Share of tickets that should be cold before interviews. */
const FINISH = 0.8;
const open = new Set();

const counts = (ts) => {
  const c = { green: 0, yellow: 0, red: 0, new: 0 };
  for (const t of ts) c[status(t.n)]++;
  return c;
};
const bar = (c) =>
  Object.entries(c)
    .map(([st, k]) =>
      k ? `<i class="${ST_CLASS[st]}" style="flex:${k}" data-tip="${k} · ${ui().statuses[st]}"></i>` : "",
    )
    .join("");

function readiness() {
  const ts = active().filter((t) => t.sec !== "bonus");
  const total = counts(ts);
  const pct = ts.length ? total.green / ts.length : 0;
  let h = `<div class="sec"><span>${ui().readiness}</span><span class="r">${ui().trackHint}</span></div>
  <div class="card ready">
    <div class="row"><div class="big">${Math.round(pct * 100)}<small>%</small></div>
      <div class="legend">${["green", "yellow", "red", "new"].map((st) => `<span><i class="sw ${ST_CLASS[st]}"></i>${ui().statuses[st]} ${total[st]}</span>`).join("")}</div></div>
    <div class="gauge" role="img" aria-label="${["green", "yellow", "red", "new"].map((st) => `${ui().statuses[st]} ${total[st]}`).join(", ")}">${bar(total)}<span class="fin" style="left:${FINISH * 100}%"><b>${ui().finish}</b></span></div>
    <p class="note">${ui().readinessNote}</p>`;
  for (const stage of STAGES) {
    h += `<div class="stage"><h3><span>${stage[state.lang]}</span></h3>`;
    for (const sec of stage.secs) {
      const its = ts.filter((t) => t.sec === sec);
      if (!its.length) continue;
      const c = counts(its),
        isOpen = open.has(sec);
      h += `<button class="trk" data-trk="${sec}" aria-expanded="${isOpen}"><span class="nm">${LABEL[sec]}</span><span class="bar" role="img" aria-label="${LABEL[sec]}: ${c.green}/${its.length}">${bar(c)}</span><span class="num"><b>${c.green}</b>/${its.length}</span></button>
      <div class="cells" ${isOpen ? "" : "hidden"}>${its.map((t) => `<a class="cell" href="#t/${t.n}"><i class="sw ${ST_CLASS[status(t.n)].replace("st-nf", "st-nw")}"></i><span class="id">${t.n}</span><span class="tt">${esc(t[state.lang].topic)}</span></a>`).join("")}</div>`;
    }
    h += `</div>`;
  }
  return h + `</div>`;
}

function examHistory() {
  const xs = state.exams.filter((e) => e.kind !== "interview").slice(-40);
  const iv = state.exams.filter((e) => e.kind === "interview");
  if (!xs.length && !iv.length)
    return `<div class="sec"><span>${ui().examHistory}</span></div><div class="card scores"><p class="sub">${ui().noScores}</p></div>`;
  const avg = (a) => (a.reduce((s, e) => s + e.score, 0) / a.length).toFixed(1);
  const recent = xs.slice(-6).reverse();
  return `<div class="sec"><span>${ui().examHistory}</span><span class="r">${xs.length ? `${ui().avg} ${avg(xs)} · ${xs.length}` : ""}</span></div>
  <div class="card scores">${scoreChart(xs, (e) => `${e.n}. ${tk(e.n)?.[state.lang].topic || ""} · ${e.d} · ${e.score}`)}
    <div class="recent">${recent.map((e) => `<a href="#t/${e.n}"><span class="scb ${e.score >= 8 ? "g" : e.score >= 5 ? "y" : "r"}">${e.score}</span><span class="tt">${e.n}. ${esc(tk(e.n)?.[state.lang].topic || "")}</span><small>${fmtDate(new Date(e.d + "T12:00:00"), { day: "numeric", month: "short" })}</small></a>`).join("")}</div>
    ${iv.length ? `<p class="sub">${ui().interview}: ${iv.length} · ${ui().avg} ${avg(iv)}</p>` : ""}</div>`;
}

export function progress() {
  const draw = () => {
    const page = frame(`<div class="v-map">${readiness()}</div>${examHistory()}${activity()}`);
    document.title = `duokovalingo · ${ui().tabs.progress.toLowerCase()}`;
    page.querySelectorAll("[data-trk]").forEach(
      (btn) =>
        (btn.onclick = () => {
          const sec = btn.dataset.trk;
          open.has(sec) ? open.delete(sec) : open.add(sec);
          btn.setAttribute("aria-expanded", open.has(sec));
          btn.nextElementSibling.hidden = !open.has(sec);
        }),
    );
  };
  draw();
  loadAttempts().then(() => {
    if (location.hash === "#progress") draw();
  });
}
