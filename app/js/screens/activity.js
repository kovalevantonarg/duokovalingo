// Activity card on Home: streak, this week vs target, heatmap of the last weeks and its tooltip.
import { icon } from "../icons.js";
import { state } from "../state.js";
import { byId, streak } from "../store.js";
import { ui } from "../ui.js";
import { $, TODAY, dLocal, days, esc, iso } from "../util.js";

export const ACT_TARGET = 2;

// target: 2 drill days a week
export function activity() {
  const W = innerWidth >= 700 ? 26 : 18,
    loc = state.lang === "ru" ? "ru-RU" : "en-GB";
  const H = Object.fromEntries(state.db.history.filter((x) => x.ids && x.ids.length).map((x) => [x.d, x]));
  const t = dLocal(TODAY),
    mon = new Date(t);
  mon.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  const start = new Date(mon);
  start.setDate(mon.getDate() - 7 * (W - 1));
  const lvl = (c) => (c === 0 ? 0 : c === 1 ? 1 : c <= 3 ? 2 : c <= 6 ? 3 : 4);
  const fmt = (dt, o) =>
    dt.toLocaleDateString(loc, o || { weekday: "short", day: "numeric", month: "short" });
  let cells = "",
    prevM = -1,
    activeDays = 0,
    weekDays = [],
    mlab = [];
  for (let w = 0; w < W; w++) {
    let wd = 0;
    const wk0 = new Date(start);
    wk0.setDate(start.getDate() + w * 7);
    if (wk0.getMonth() !== prevM) {
      mlab.push([w, fmt(wk0, { month: "short" }).replace(".", "")]);
      prevM = wk0.getMonth();
    }
    for (let r = 0; r < 7; r++) {
      const dt = new Date(wk0);
      dt.setDate(wk0.getDate() + r);
      const k = iso(dt);
      const x = H[k];
      const c = x ? x.ids.length : 0;
      if (k > TODAY) {
        cells += `<i class="dy fut"></i>`;
        continue;
      }
      if (c) {
        wd++;
        activeDays++;
      }
      const names = x
        ? x.ids
            .slice(0, 4)
            .map((id) => {
              const it = byId(id);
              return `#${id} ${esc(it ? it.t : "")}`;
            })
            .join("<br>") + (x.ids.length > 4 ? `<br>+${x.ids.length - 4}` : "")
        : "";
      cells += `<i class="dy l${lvl(c)}${k === TODAY ? " today" : ""}" data-tip="${c ? `<b>${c} ${ui().cardsN(c)}${x.xp ? ` · ${x.xp} XP` : ""}</b><br>${names}` : ui().noAct}" data-sub="${esc(fmt(dt))}"></i>`;
    }
    weekDays.push(wd);
  }
  if (mlab.length > 1 && mlab[1][0] - mlab[0][0] < 3) mlab.shift(); // first partial month would collide with the next label
  const monthsRow = mlab.map(([w, m]) => `<span style="grid-column:${w + 1}/span 4">${m}</span>`).join("");
  // best streak over all history
  const ds = Object.keys(H).sort();
  let best = 0,
    run = 0,
    prev = null;
  for (const d of ds) {
    run = prev && days(prev) - days(d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const cur = streak(),
    thisWeek = weekDays[weekDays.length - 1],
    last = ds.length ? days(ds[ds.length - 1]) : null;
  const last30 = state.db.history
      .filter((x) => days(x.d) <= 29)
      .reduce((n, x) => n + (x.ids ? x.ids.length : 0), 0),
    xp30 = state.db.history.filter((x) => days(x.d) <= 29).reduce((n, x) => n + (x.xp || 0), 0);
  const metWeeks = weekDays.slice(-4).filter((x) => x >= ACT_TARGET).length;
  const dl =
    state.lang === "ru" ? ["Пн", "", "Ср", "", "Пт", "", "Вс"] : ["Mon", "", "Wed", "", "Fri", "", "Sun"];
  return `<div class="sec"><span>${ui().act}</span><span class="r">${activeDays} ${ui().actDays} · ${W} ${ui().wk}</span></div>
  <div class="card actv">
    <div class="astats">
      <div class="ast"><div class="v fire">${icon.flame}${cur}</div><div class="l">${ui().streakL}<span>${ui().best} ${best}</span></div></div>
      <div class="ast"><div class="v">${thisWeek}<small>/${ACT_TARGET}</small></div><div class="l">${ui().thisWeek}<span>${metWeeks} ${ui().ofw} 4 ${ui().weeksMet}</span></div><div class="mini"><i style="width:${Math.min(1, thisWeek / ACT_TARGET) * 100}%"></i></div></div>
      <div class="ast"><div class="v">${last30}</div><div class="l">${ui().cards30}<span>${xp30} XP</span></div></div>
      <div class="ast"><div class="v">${last === null ? "—" : last === 0 ? ui().todayW : last + ui().days}</div><div class="l">${ui().lastS}<span>${last === null ? "" : last === 0 ? "" : ui().ago}</span></div></div>
    </div>
    <div class="hgrid" style="--w:${W}">
      <span></span><div class="hmonths">${monthsRow}</div>
      <div class="hdows">${dl.map((x) => `<span>${x}</span>`).join("")}</div><div class="hcells">${cells}</div>
    </div>
    <div class="hleg"><span>${ui().lessA}</span><i class="dy l0"></i><i class="dy l1"></i><i class="dy l2"></i><i class="dy l3"></i><i class="dy l4"></i><span>${ui().moreA}</span></div>
  </div>`;
}

// tooltip for the activity grid: hover with a mouse, tap on touch
export function tipShow(el, x, y) {
  const tp = $("#tip");
  if (!tp) return;
  tp.innerHTML = (el.dataset.sub ? `<small>${el.dataset.sub}</small>` : "") + el.dataset.tip;
  const w = tp.offsetWidth,
    hh = tp.offsetHeight;
  tp.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + "px";
  tp.style.top = Math.max(8, y - hh - 12) + "px";
  tp.classList.add("on");
}

export const tipHide = () => {
  const tp = $("#tip");
  if (tp) tp.classList.remove("on");
};
