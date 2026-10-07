// Progress tab: readiness (share of tickets you can say cold) overall and per track, exam scores, activity.
import { scoreChart } from "../chart.js";
import { SECTION_LABEL } from "../i18n.js";
import { state } from "../state.js";
import { active, loadAttempts, status, streak, tk } from "../store.js";
import { fmtDate, frame, scoreCls, ui } from "../ui.js";
import { TODAY, dLocal, days, esc, iso } from "../util.js";

/** Tracks in the order they're listed. Keys match ticket.sec. */
const TRACKS = ["llm", "rag", "agents", "sysd", "behav", "js", "ts", "react", "web"];
const ST = ["green", "yellow", "red", "new"];
/** Share of tickets that should be cold before interviews. */
const FINISH = 0.8;
const open = new Set();

const counts = (ts) => {
  const c = { green: 0, yellow: 0, red: 0, new: 0 };
  for (const t of ts) c[status(t.n)]++;
  return c;
};
const bar = (c) =>
  ST.map((st) =>
    c[st] ? `<i class="${st}" style="flex:${c[st]}" data-tip="${c[st]} · ${ui().statuses[st]}"></i>` : "",
  ).join("");

function summary(ts) {
  const c = counts(ts);
  const pct = ts.length ? c.green / ts.length : 0;
  const H = state.db.history.filter((h) => h.tickets?.length);
  const days30 = H.filter((h) => days(h.d) <= 29).length;
  const xs = state.exams.filter((e) => e.kind !== "interview");
  const avg = xs.length ? (xs.reduce((a, e) => a + e.score, 0) / xs.length).toFixed(1) : "—";
  return `<section class="card pg-sum">
    <div class="pg-top"><div class="pg-big">${Math.round(pct * 100)}<small>%</small></div>
      <div class="pg-cap"><b>${ui().readiness}</b><span>${ui().readinessNote}</span></div></div>
    <div class="pg-gauge" role="img" aria-label="${ST.map((st) => `${ui().statuses[st]} ${c[st]}`).join(", ")}">${bar(c)}<span class="fin" style="left:${FINISH * 100}%"></span></div>
    <div class="pg-legend">${ST.map((st) => `<span><i class="${st}"></i>${ui().statuses[st]} <b>${c[st]}</b></span>`).join("")}<span class="fin-l">${ui().finish}</span></div>
    <div class="pg-stats">
      <div><b>${streak()}</b><span>${ui().streakL}</span></div>
      <div><b>${days30}</b><span>${ui().days30}</span></div>
      <div><b>${avg}</b><span>${ui().examAvg}</span></div>
    </div>
  </section>`;
}

function tracks(ts) {
  let h = `<div class="sec"><span>${ui().tracks}</span><span class="r">${ui().trackHint}</span></div><div class="card pg-tracks">`;
  for (const sec of TRACKS) {
    const its = ts.filter((t) => t.sec === sec);
    if (!its.length) continue;
    const c = counts(its),
      isOpen = open.has(sec);
    h += `<button class="pg-trk" data-trk="${sec}" aria-expanded="${isOpen}"><span class="nm">${SECTION_LABEL[sec]}</span><span class="pg-bar">${bar(c)}</span><span class="num"><b>${c.green}</b>/${its.length}</span></button>
      <div class="pg-list" ${isOpen ? "" : "hidden"}>${its.map((t) => `<a href="#t/${t.n}"><span class="sw ${status(t.n)}"></span><span class="tn">${t.n}</span><span class="tt">${esc(t[state.lang].topic)}</span></a>`).join("")}</div>`;
  }
  return h + `</div>`;
}

function exams() {
  const xs = state.exams.filter((e) => e.kind !== "interview").slice(-40);
  const iv = state.exams.filter((e) => e.kind === "interview");
  const head = `<div class="sec"><span>${ui().examHistory}</span><span class="r">${xs.length || ""}</span></div>`;
  if (!xs.length && !iv.length)
    return head + `<div class="card pg-ex"><p class="sub">${ui().noScores}</p></div>`;
  const avg = (a) => (a.reduce((s, e) => s + e.score, 0) / a.length).toFixed(1);
  return (
    head +
    `<div class="card pg-ex">${scoreChart(xs, (e) => `${e.n}. ${tk(e.n)?.[state.lang].topic || ""} · ${e.d} · ${e.score}`)}
    <div class="recent">${xs
      .slice(-5)
      .reverse()
      .map(
        (e) =>
          `<a href="#t/${e.n}"><span class="scb ${scoreCls(e.score)}">${e.score}</span><span class="tt">${e.n}. ${esc(tk(e.n)?.[state.lang].topic || "")}</span><small>${fmtDate(new Date(e.d + "T12:00:00"), { day: "numeric", month: "short" })}</small></a>`,
      )
      .join("")}</div>
    ${iv.length ? `<p class="sub">${ui().interview}: ${iv.length} · ${ui().avg} ${avg(iv)}</p>` : ""}</div>`
  );
}

/** Heatmap of practice days: columns are weeks (Monday on top), the last column is this week. */
function activity() {
  const W = innerWidth >= 700 ? 26 : 16;
  const loc = state.lang === "ru" ? "ru-RU" : "en-GB";
  const byDay = Object.fromEntries(state.db.history.filter((h) => h.tickets?.length).map((h) => [h.d, h]));
  const today = dLocal(TODAY);
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7 * (W - 1));
  const lvl = (c) => (c === 0 ? 0 : c === 1 ? 1 : c <= 3 ? 2 : c <= 6 ? 3 : 4);
  let cells = "",
    months = "",
    prevM = -1,
    lastLabel = -3,
    total = 0;
  for (let w = 0; w < W; w++) {
    const wk = new Date(start);
    wk.setDate(start.getDate() + w * 7);
    // a label where a month starts, unless it would crowd the previous one
    if (wk.getMonth() !== prevM) {
      if (w - lastLabel >= 3 && w < W - 1)
        ((months += `<span style="grid-column:${w + 1}">${wk.toLocaleDateString(loc, { month: "short" }).replace(".", "")}</span>`),
          (lastLabel = w));
      prevM = wk.getMonth();
    }
    for (let r = 0; r < 7; r++) {
      const dt = new Date(wk);
      dt.setDate(wk.getDate() + r);
      const k = iso(dt);
      if (k > TODAY) {
        cells += `<i class="fut"></i>`;
        continue;
      }
      const x = byDay[k],
        c = x ? x.tickets.length : 0;
      if (c) total++;
      const names = x
        ? x.tickets
            .slice(0, 4)
            .map((n) => `${n}. ${esc(tk(n)?.[state.lang].topic || "")}`)
            .join("<br>") + (c > 4 ? `<br>+${c - 4}` : "")
        : "";
      cells += `<i class="l${lvl(c)}${k === TODAY ? " today" : ""}" data-sub="${esc(dt.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" }))}" data-tip="${c ? `<b>${c} ${ui().cardsN(c)}${x.xp ? ` · ${x.xp} XP` : ""}</b><br>${names}` : ui().noAct}"></i>`;
    }
  }
  const dl = state.lang === "ru" ? ["Пн", "", "Ср", "", "Пт", "", ""] : ["Mon", "", "Wed", "", "Fri", "", ""];
  return `<div class="sec"><span>${ui().act}</span><span class="r">${total} ${ui().actDays} · ${W} ${ui().wk}</span></div>
  <div class="card pg-act"><div class="pg-heat" style="--w:${W}">
    <span></span><div class="pg-months">${months}</div>
    <div class="pg-dows">${dl.map((d) => `<span>${d}</span>`).join("")}</div><div class="pg-cells">${cells}</div>
  </div>
  <div class="pg-hleg"><span>${ui().lessA}</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>${ui().moreA}</span></div></div>`;
}

export function progress() {
  const draw = () => {
    const ts = active().filter((t) => t.sec !== "bonus");
    const page = frame(summary(ts) + tracks(ts) + exams() + activity());
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
  loadAttempts().then(() => location.hash === "#progress" && draw());
}
