// Tickets tab: search and filter every ticket, draw a random one; and one ticket's page (its path:
// lesson → practice → exam, status, questions, exam scores).
import { SECTION_LABEL } from "../i18n.js";
import { icon } from "../icons.js";
import { dueDate, intervalOf, isDue } from "../../lib/srs.js";
import { scoreChart } from "../chart.js";
import { state } from "../state.js";
import { attemptsOf, flagDoubt, loadAttempts, rec, status, tickets, tk } from "../store.js";
import { MODE_ICON, fmtDate, frame, ticketRow, ui } from "../ui.js";
import { $, days, esc } from "../util.js";
import { drawTicket } from "./exam.js";
import { isRead, lessonIndex } from "./learn.js";

const ORDER = ["llm", "rag", "agents", "sysd", "behav", "js", "ts", "react", "web", "bonus", "parked"];
const FILTERS = ["all", "weak", "new", "doubt"];
const view = { q: "", f: "all" };

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/<[^>]+>/g, "");

/** Text a ticket can be found by: topics, questions and answers in both languages, lesson titles. */
function haystack(t, idx) {
  const L = (l) =>
    [t[l].topic, ...t[l].qs, ...t[l].a.map((a) => a.q + " " + a.t), idx[t.n]?.[l]?.title || ""].join(" ");
  return norm(L("ru") + " " + L("en") + " " + t.tag);
}

function statusLine(n) {
  const r = rec(n),
    st = status(n);
  if (st === "new") return ui().statuses.new;
  const dd = dueDate(r);
  const when = isDue(r)
    ? ui().dueToday
    : dd
      ? `${ui().nextOn} ${fmtDate(new Date(dd + "T12:00:00"), { day: "numeric", month: "short" })}`
      : "";
  return `${ui().statuses[st]}${when ? " · " + when : ""}`;
}

export async function ticketList() {
  const page =
    frame(`<div class="sec"><span>${ui().tabs.tickets}</span><span class="r">${tickets().length}</span></div>
    <div class="tbar"><label class="search">${icon.search}<input id="q" type="search" placeholder="${ui().searchPh}" value="${esc(view.q)}" autocomplete="off"></label><button class="btn line" id="draw">${icon.shuffle}<span>${ui().draw}</span></button></div>
    <div class="fchips">${FILTERS.map((f) => `<button data-f="${f}" class="${view.f === f ? "on" : ""}">${ui().filters[f]}</button>`).join("")}</div>
    <div id="list"></div>`);
  const idx = await lessonIndex().catch(() => ({}));
  if (!page.isConnected) return;
  const hay = new Map(tickets().map((t) => [t.n, haystack(t, idx)]));
  const draw = () => {
    const words = norm(view.q).split(/\s+/).filter(Boolean);
    const pass = (t) => {
      const st = status(t.n);
      if (view.f === "weak" && !(st === "red" || st === "yellow")) return false;
      if (view.f === "new" && st !== "new") return false;
      if (view.f === "doubt" && !rec(t.n).doubt) return false;
      const n = String(t.n);
      return words.every((w) => w === n || hay.get(t.n).includes(w));
    };
    let h = "";
    for (const sec of ORDER) {
      const ts = tickets().filter((t) => t.sec === sec && pass(t));
      if (!ts.length) continue;
      const green = ts.filter((t) => status(t.n) === "green").length;
      h += `<div class="sec"><span>${SECTION_LABEL[sec] || ui().quickCheck}</span><span class="r">${green}/${ts.length}</span></div><div class="card list">${ts.map((t) => ticketRow(t, statusLine(t.n))).join("")}</div>`;
    }
    $("#list").innerHTML = h || `<p class="empty">${ui().nothingFound}</p>`;
  };
  $("#q").oninput = (e) => {
    view.q = e.target.value;
    draw();
  };
  page.querySelectorAll("[data-f]").forEach(
    (b) =>
      (b.onclick = () => {
        view.f = b.dataset.f;
        page.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("on", x === b));
        draw();
      }),
  );
  $("#draw").onclick = () => (location.hash = "exam/" + drawTicket());
  draw();
  document.onkeydown = (e) => {
    if (e.key === "/" && e.target.tagName !== "INPUT") {
      e.preventDefault();
      $("#q").focus();
    }
  };
}

export async function hub(n) {
  const t = tk(n),
    d = t[state.lang],
    r = rec(n),
    st = status(n);
  const drills = window.DRILLS[n] || {};
  const read = isRead(n);
  const practiced = st !== "new" || ["tf", "gap", "order", "session", "voice"].includes(r.mode);
  const examined = attemptsOf(n).length > 0 || (st !== "new" && r.mode === "exam");
  const nextStep = !read ? 1 : !practiced ? 2 : 3;
  const stepCls = (k, done) => `step${done ? " done" : ""}${k === nextStep ? " next" : ""}`;
  const chip = (m, label) => `<a class="chip" href="#play/${n}/${m}">${MODE_ICON[m]}${label}</a>`;
  const lastTxt = r.last ? `${days(r.last)}${ui().days} ${ui().ago}` : ui().never;
  const page = frame(
    `<section class="card thead"><span class="kick">${ui().ticket} ${n} · ${esc(t.tag)}</span><h1 class="h1">${esc(d.topic)}</h1>
      <div class="stt"><span class="sw ${st}${isDue(r) ? " due" : ""}"></span>${statusLine(n)}</div>
      <button class="dbtn${r.doubt ? " on" : ""}" id="doubt" aria-pressed="${!!r.doubt}"><b>?</b>${ui().doubtBtn}</button></section>
    <div class="sec"><span>${ui().pathTitle}</span></div>
    <div class="card path">
      <a class="${stepCls(1, read)}" href="#learn/${n}"><span class="k">${read ? icon.check : 1}</span><span class="tt"><b>${ui().step1}</b><small>${read ? ui().readDone : ui().step1d}</small></span>${icon.chev}</a>
      <div class="${stepCls(2, practiced)}"><span class="k">${practiced ? icon.check : 2}</span><span class="tt"><b>${ui().step2}</b><small>${ui().step2d}</small><span class="chips">${chip("tf", ui().tf)}${drills.cloze ? chip("gap", ui().gap) : ""}${drills.steps ? chip("order", ui().order) : ""}</span></span></div>
      <a class="${stepCls(3, examined)}" href="#exam/${n}"><span class="k">${examined ? icon.check : 3}</span><span class="tt"><b>${ui().step3}</b><small>${ui().step3d}</small></span>${icon.chev}</a>
      <a class="step alt" href="#play/${n}/voice"><span class="k">${icon.mic14}</span><span class="tt"><b>${ui().aloud}</b><small>${ui().aloudd}</small></span>${icon.chev}</a>
    </div>
    <div class="sec"><span>${ui().questions}</span></div>
    <div class="card qlist"><ol>${d.qs.map((q) => `<li>${esc(q)}</li>`).join("")}</ol></div>
    <div class="sec"><span>${ui().scores}</span><span class="r" id="avg"></span></div>
    <div class="card scores" id="scores"></div>
    <div class="meta card"><div><span class="k">${ui().last}</span><span class="v">${lastTxt}</span></div><div><span class="k">${ui().interval}</span><span class="v">${intervalOf(r) ? intervalOf(r) + ui().days : "—"}</span></div><div><span class="k">${ui().lastmode}</span><span class="v">${r.mode || "—"}</span></div></div>`,
    { back: { href: "tickets", label: ui().tabs.tickets } },
  );
  document.title = `${n}. ${d.topic}`;
  const drawScores = () => {
    const xs = attemptsOf(n);
    const box = $("#scores");
    if (!box) return;
    box.innerHTML = xs.length
      ? scoreChart(xs) +
        `<p class="sub">${xs
          .slice(-3)
          .reverse()
          .map(
            (e) =>
              `${fmtDate(new Date(e.d + "T12:00:00"), { day: "numeric", month: "short" })} · <b>${e.score}</b>`,
          )
          .join(" &nbsp; ")}</p>`
      : `<p class="sub">${ui().noScores}</p>`;
    $("#avg").textContent = xs.length
      ? `${ui().avg} ${(xs.reduce((a, e) => a + e.score, 0) / xs.length).toFixed(1)}`
      : "";
  };
  drawScores();
  loadAttempts(n).then(drawScores);
  $("#doubt").onclick = async (e) => {
    const b = e.currentTarget,
      on = !b.classList.contains("on");
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
    await flagDoubt(n, on);
  };
  document.onkeydown = (e) => {
    if (e.key === "Escape") location.hash = "tickets";
  };
  void page;
}
