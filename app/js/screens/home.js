// Today: Start (what's due or the next new ticket), today's three, the rest folded away, the next new ticket.
// After a break of more than a week it first asks how to carry on; on pause it only offers to resume.
import { lapse, FORGOTTEN, isDue } from "../../lib/srs.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import {
  breakNow,
  doubts,
  due,
  dueUnread,
  nextNew,
  paused,
  plan as planAction,
  readNew,
  rec,
  status,
  tk,
  words,
  wordsDue,
} from "../store.js";
import { lessonLabel, sessionMinutes } from "../timing.js";
import { fmtDate, frame, kbd, ticketRow, ui } from "../ui.js";
import { sessionPlan } from "../games/session.js";
import { lessonIndex } from "./learn.js";
import { openResetPlan } from "./settings.js";

/** What a ticket in the list needs, in words: no day counts, no guilt. */
function why(n) {
  const r = rec(n);
  if (r.doubt) return ui().doubt;
  if (status(n) === "new") return ui().readNewSub;
  if ((lapse(r) ?? 0) >= FORGOTTEN) return ui().forgot;
  return isDue(r) ? ui().dueToday : "";
}

export function home() {
  if (paused()) return pausedHome();
  const gap = breakNow();
  if (gap) return welcomeBack(gap);
  const plan = sessionPlan();
  const todays = plan.kind === "new" ? [] : plan.tickets;
  const title =
    plan.kind === "review"
      ? ui().reviewN(todays.length)
      : plan.kind === "new"
        ? ui().newTicket
        : ui().allDone;
  const sub =
    plan.kind === "review"
      ? ui().reviewd(sessionMinutes(todays.length))
      : plan.kind === "new"
        ? `${plan.ticket.n}. ${plan.ticket[state.lang].topic}<span id="nnEst"></span>`
        : ui().allDoned;
  let h = `<section class="hero card"><span class="kick">${ui().today} · ${fmtDate()}</span><h1 class="h1">${title}</h1><p class="sub">${sub}</p><button class="btn blue big full" id="go">${ui().start} ${icon.arrow}${kbd("Enter", 1)}</button></section>`;
  if (!state.live)
    h += `<div class="banner">${icon.warn}<span>${ui().offline}${state.pending.length ? ` · <b>${state.pending.length}</b> ${ui().pending}` : ""}</span></div>`;
  if (todays.length && plan.kind === "review")
    h += `<div class="sec"><span>${ui().todayList}</span></div><div class="card list">${todays.map((t) => ticketRow(t, why(t.n))).join("")}</div>`;
  // everything else that wants attention, folded: it's a queue, not a debt
  const inPlan = new Set(todays.map((t) => t.n));
  const queue = [
    ...new Set([...doubts().map((t) => t.n), ...due().map((r) => r.n), ...readNew().map((t) => t.n)]),
  ].filter((n) => !inPlan.has(n));
  if (queue.length)
    h += `<details class="queue"><summary>${ui().queueN(queue.length)}</summary><div class="card list">${queue.map((n) => ticketRow(tk(n), why(n))).join("")}</div></details>`;
  const hidden = dueUnread().length;
  if (hidden)
    h += `<p class="note-unread">${ui().hiddenDue(hidden)} <a href="#tickets" id="showUnread">${ui().showThem}</a></p>`;
  const nn = nextNew();
  if (nn && plan.kind !== "new")
    h += `<div class="sec"><span>${ui().nextNew}</span></div><div class="card list">${ticketRow(nn, ui().path)}</div>`;
  const wd = words().length ? wordsDue().length : 0;
  if (wd)
    h += `<a class="card promo words" href="#wplay"><span class="pi">${icon.book}</span><span class="pt"><b>${ui().wordsCard(Math.min(wd, 15))}</b><small>${ui().wordsCardSub}</small></span>${icon.chev}</a>`;
  h += `<a class="card promo" href="#interview"><span class="pi">${icon.mic}</span><span class="pt"><b>${ui().interview}</b><small>${ui().interviewd}</small></span>${icon.chev}</a>`;
  frame(h);
  if (plan.kind === "new")
    lessonIndex().then((idx) => {
      const el = document.getElementById("nnEst");
      const w = idx[plan.ticket.n]?.[state.lang]?.words;
      if (el && w) el.textContent = ` · ${ui().lessonFirst} ${lessonLabel(w, state.lang === "ru")}`;
    });
  const go = () => (location.hash = plan.href);
  document.getElementById("go").onclick = go;
  const su = document.getElementById("showUnread");
  if (su) su.onclick = () => sessionStorage.setItem("drill.filter", "unread");
  document.onkeydown = (e) => {
    if (e.key === "Enter" && !e.target.closest("button,a,input,textarea,summary")) go();
  };
}

// more than a week without practice: say so, and let the person choose how the schedule carries on
function welcomeBack(gap) {
  const opt = (id, t, d) =>
    `<button class="opt" id="${id}"><b>${t}</b><small>${d}</small>${icon.chev}</button>`;
  frame(`<section class="hero card"><span class="kick">${ui().welcomeKick}</span><h1 class="h1">${ui().awayN(gap)}</h1><p class="sub">${ui().welcomeSub}</p></section>
    <div class="card opts">${opt("cont", ui().optCont, ui().optContD)}${opt("soft", ui().optSoft, ui().optSoftD)}${opt("over", ui().optOver, ui().optOverD)}</div>`);
  const pick = async (a) => {
    await planAction(a);
    home();
  };
  document.getElementById("cont").onclick = () => pick("continue");
  document.getElementById("soft").onclick = () => pick("soft");
  document.getElementById("over").onclick = openResetPlan;
}

function pausedHome() {
  const since = fmtDate(new Date(paused() + "T12:00:00"), { day: "numeric", month: "long" });
  frame(`<section class="hero card"><span class="kick">${ui().pauseKick}</span><h1 class="h1">${ui().pausedSince(since)}</h1><p class="sub">${ui().pausedSub}</p><button class="btn blue big full" id="resume">${ui().resumePlan} ${icon.arrow}</button></section>
    <a class="card promo" href="#learn"><span class="pi">${icon.book}</span><span class="pt"><b>${ui().tabs.learn}</b><small>${ui().pausedLearn}</small></span>${icon.chev}</a>`);
  document.getElementById("resume").onclick = async () => {
    await planAction("resume");
    home();
  };
}
