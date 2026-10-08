// Today: one Start button for whatever is due (or the next new ticket), the due list, the next new ticket, interview mode.
import { icon } from "../icons.js";
import { state } from "../state.js";
import { doubts, due, dueUnread, nextNew, readNew } from "../store.js";
import { fmtDate, frame, kbd, ticketRow, ui } from "../ui.js";
import { sessionPlan } from "../games/session.js";

export function home() {
  const plan = sessionPlan();
  const d = due(),
    dbt = doubts().filter((t) => !d.some((x) => x.n === t.n)),
    nn = nextNew();
  const title =
    plan.kind === "review"
      ? ui().reviewN(plan.tickets.length)
      : plan.kind === "new"
        ? ui().newTicket
        : ui().allDone;
  const sub =
    plan.kind === "review"
      ? ui().reviewd
      : plan.kind === "new"
        ? `${plan.ticket.n}. ${plan.ticket[state.lang].topic}`
        : ui().allDoned;
  let h = `<section class="hero card"><span class="kick">${ui().today} · ${fmtDate()}</span><h1 class="h1">${title}</h1><p class="sub">${sub}</p><button class="btn blue big full" id="go">${ui().start} ${icon.arrow}${kbd("Enter", 1)}</button></section>`;
  if (!state.live)
    h += `<div class="banner">${icon.warn}<span>${ui().offline}${state.pending.length ? ` · <b>${state.pending.length}</b> ${ui().pending}` : ""}</span></div>`;
  if (d.length || dbt.length) {
    h += `<div class="sec"><span>${ui().dueList}</span><span class="r">${d.length}</span></div><div class="card list">`;
    h += d
      .map((r) =>
        ticketRow(
          window.TICKETS.find((t) => t.n === r.n),
          r.over ? `${ui().overdue} ${r.over}${ui().days}` : ui().dueToday,
        ),
      )
      .join("");
    h += dbt.map((t) => ticketRow(t, ui().doubt)).join("");
    h += `</div>`;
  }
  const rn = readNew().filter((t) => !d.some((x) => x.n === t.n));
  if (rn.length)
    h += `<div class="sec"><span>${ui().readNewList}</span><span class="r">${rn.length}</span></div><div class="card list">${rn
      .slice(0, 5)
      .map((t) => ticketRow(t, ui().readNewSub))
      .join("")}</div>`;
  const hidden = dueUnread().length;
  if (hidden)
    h += `<p class="note-unread">${ui().hiddenDue(hidden)} <a href="#tickets" id="showUnread">${ui().showThem}</a></p>`;
  if (nn && !(plan.kind === "new" && d.length === 0)) {
    h += `<div class="sec"><span>${ui().nextNew}</span></div><div class="card list">${ticketRow(nn, ui().path)}</div>`;
  }
  h += `<a class="card promo" href="#interview"><span class="pi">${icon.mic}</span><span class="pt"><b>${ui().interview}</b><small>${ui().interviewd}</small></span>${icon.chev}</a>`;
  frame(h);
  const go = () => (location.hash = plan.href);
  document.getElementById("go").onclick = go;
  const su = document.getElementById("showUnread");
  if (su) su.onclick = () => sessionStorage.setItem("drill.filter", "unread");
  document.onkeydown = (e) => {
    if (e.key === "Enter" && !e.target.closest("button,a,input,textarea")) go();
  };
}
