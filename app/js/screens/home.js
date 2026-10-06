// Home (today's queue, sections, knowledge map / lesson links) and the single-item screen.
import { SECTION_LABEL } from "../i18n.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import { byId, due, isDue, ivOf, nextNew, ticketFor } from "../store.js";
import { app, chips, fmtDate, header, itemRow, kbd, ui, wireHeader } from "../ui.js";
import { days, esc } from "../util.js";
import { activity } from "./activity.js";

export function home() {
  const d = due(),
    nn = nextNew();
  const top = d.slice(0, 2);
  const active = state.db.items.filter((i) => i.st !== "parked");
  const n = (s) => active.filter((i) => i.st === s).length;
  let h =
    header() +
    `<div class="page"><a class="rmlink" href="map.html"><span class="rmt">${ui().knowledgeMap}</span><span class="rms">${ui().knowledgeMapNote}</span>${icon.arrow}</a><a class="rmlink" href="learn.html"><span class="rmt">${ui().learn}</span><span class="rms">${ui().learnd}</span>${icon.arrow}</a><div class="sec"><span>${ui().today}</span><span class="r">${fmtDate()}</span></div><div class="card">`;
  h += top.length
    ? top
        .map((i) => itemRow(i, `${ui().due} · <span class="ov">${i.over}${ui().days} ${ui().overdue}</span>`))
        .join("")
    : `<div class="item"><div class="it"><div class="s">${ui().nothing}</div></div></div>`;
  if (nn) h += itemRow(nn, ui().newi);
  if (state.db.today_overrides?.ship)
    h += `<div class="item" style="align-items:center"><span class="sw ship" style="margin-top:0"></span><div class="it"><div class="t"><span class="id">${ui().ship}</span>${esc(state.db.today_overrides.ship)}</div></div></div>`;
  h += `</div>`;
  h += `<div class="card quick"><div class="qi"><div class="qt">${ui().quick}<span>${ui().quickm}</span></div><p class="sub">${ui().quickd}</p></div>${kbd("Enter", 1)}<button class="btn blue big" onclick="location.hash='quick'">${ui().start} ${icon.arrow}</button></div>`;
  if (!state.live)
    h += `<div class="banner">${icon.warn}<span>${ui().offline}${state.pending.length ? ` · <b>${state.pending.length}</b> ${ui().pending}` : ""}</span></div>`;
  h += `<div class="sec"><span>${ui().wall}</span><span class="r">${n("green")} ${ui().cold} · ${n("yellow")} ${ui().shaky} · ${n("new")} ${ui().neww} · ${state.db.items.length - active.length} ${ui().statuses.parked}</span></div><div class="card wall">`;
  for (const s of ["llm", "rag", "agents", "sysd", "behav", "js", "ts", "react", "web", "bonus", "meta"]) {
    const its = state.db.items.filter((i) => i.s === s);
    if (!its.length) continue;
    const g = its.filter((i) => i.st === "green").length;
    const parked = its.every((i) => i.st === "parked");
    h +=
      `<div class="wsec"><div class="wlab"><span>${SECTION_LABEL[s]} <span class="c">${parked ? ui().statuses.parked : g + "/" + its.length}</span></span></div><div class="cells">` +
      its
        .map(
          (i) =>
            `<button class="cell ${i.st}${isDue(i) ? " due" : ""}${state.lastChanged === i.id ? " pop" : ""}" title="#${i.id} ${esc(i.t)} · ${ui().statuses[i.st]}" onclick="location.hash='item/${i.id}'">${i.id}</button>`,
        )
        .join("") +
      `</div></div>`;
  }
  h += `</div>`;
  h += activity() + `</div>`;
  app.innerHTML = h;
  wireHeader();
  state.lastChanged = null;
  document.onkeydown = (e) => {
    if (e.key === "Enter" && !e.target.closest("button,a,input")) {
      location.hash = "quick";
    }
  };
}

export function itemScreen(id) {
  const i = byId(id);
  if (!i) return home();
  const t = ticketFor(id);
  const st = i.st || "new";
  const lastTxt = i.last ? `${days(i.last)}${ui().days} ${ui().ago}` : ui().never;
  const dueTxt = isDue(i)
    ? `${days(i.last) - ivOf(i)}${ui().days} ${ui().overdue}`
    : i.last && ivOf(i)
      ? `${ivOf(i) - days(i.last)}${ui().days}`
      : "—";
  app.innerHTML =
    header() +
    `<div class="page" style="max-width:704px"><a href="#home" class="btn ghost" style="align-self:flex-start;text-transform:none;letter-spacing:0;font-size:15px;margin-left:-8px;height:40px">${icon.home}${ui().home} ${kbd("Esc", 1)}</a>
    <div class="card" style="padding:24px"><div class="stt"><span class="sw ${st}" style="margin-top:0"></span>${ui().statuses[st]}${isDue(i) ? `<span style="color:var(--dim3)">·</span><span style="color:var(--warn)">${dueTxt}</span>` : ""}</div>
    <h2 class="h2" style="margin-top:8px"><span style="color:var(--dim2);margin-right:8px">#${i.id}</span>${esc(i.t)}</h2>
    <p class="sub" style="margin-top:6px">${SECTION_LABEL[i.s] || ""}${t ? ` · ${ui().ticket.toLowerCase()} ${t.n} · ${esc(t[state.lang].topic)}` : ""}${i.why ? ` · ${esc(i.why)}` : ""}</p>
    <div class="meta"><div><span class="k">${ui().last}</span><span class="v">${lastTxt}</span></div><div><span class="k">${ui().dueh}</span><span class="v${isDue(i) ? " ov" : ""}">${dueTxt}</span></div><div><span class="k">${ui().interval}</span><span class="v">${ivOf(i) ? ivOf(i) + ui().days + " · " + ui().statuses[st] : "—"}</span></div><div><span class="k">${ui().lastmode}</span><span class="v">${i.lastMode || "—"}</span></div></div>
    <div style="margin-top:22px"><span class="h3">${ui().drill}</span>${t ? chips(id, "voice").replace('class="chips"', 'class="chips" style="display:flex"') : ""}</div></div></div>`;
  wireHeader();
  document.onkeydown = (e) => {
    if (e.key === "Escape") location.hash = "home";
  };
}
