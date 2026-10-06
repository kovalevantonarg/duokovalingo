// The daily session behind "Start": a short true/false + gaps warm-up over the due tickets, then each ticket
// answered out loud and graded (self-score or AI). With nothing due, Start opens the next new ticket instead.
import { icon } from "../icons.js";
import { momTiles } from "../screens/verdict.js";
import { state } from "../state.js";
import { active, doubts, due, nextNew, post, rec, streak, tk, xpToday } from "../store.js";
import { kbd, roundFrame, rtop, ui, wireQuit, exitRound } from "../ui.js";
import { $, esc, shuffle } from "../util.js";
import { runGap } from "./fill-gap.js";
import { buildTF, clozeQs, runTF } from "./true-false.js";
import { playVoice } from "./voice.js";

const SIZE = 3;

/** What Start does right now. */
export function sessionPlan() {
  const ns = [...new Set([...doubts().map((t) => t.n), ...due().map((r) => r.n)])].slice(0, SIZE);
  if (ns.length) return { kind: "review", tickets: ns.map(tk), href: "session" };
  const nn = nextNew();
  if (nn) return { kind: "new", ticket: nn, href: `t/${nn.n}` };
  // everything graded and nothing due: get ahead on the ones drilled longest ago
  const old = active()
    .filter((t) => rec(t.n).last)
    .sort((a, b) => (rec(a.n).last < rec(b.n).last ? -1 : 1))
    .slice(0, SIZE);
  return { kind: "ahead", tickets: old, href: "session" };
}

export function session() {
  const plan = sessionPlan();
  if (!plan.tickets?.length) return void (location.hash = plan.href || "home");
  const ts = plan.tickets,
    ns = ts.map((t) => t.n);
  const was = streak(),
    xpWas = xpToday();
  const results = [];
  state.combo = 0;
  const qs = buildTF(ns, 8);
  runTF(
    qs,
    (acc) => {
      const gq = shuffle(ts.flatMap((t) => clozeQs(t))).slice(0, 4);
      runGap(gq, (g) => {
        const warm = { correct: acc.correct + g.correct, total: qs.length + g.total, xp: acc.xp + g.xp };
        ns.forEach((n, k) => post("/api/log", { n, mode: "session", xp: k === 0 ? warm.xp : 0 }));
        const recall = (i) => {
          if (i >= ns.length) return summary(warm);
          playVoice(ns[i], {
            step: `${i + 1} / ${ns.length}`,
            onDone: (st) => {
              results.push({ n: ns[i], st });
              recall(i + 1);
            },
          });
        };
        intro(warm, () => recall(0));
      });
    },
    ui().warmup,
  );

  // between the warm-up and the out-loud part
  function intro(warm, next) {
    roundFrame(`<div class="round">${rtop(100, true)}<div class="res"><span class="tag">${ui().warmup}</span><div class="n" style="margin-top:20px">${warm.correct}<small>/${warm.total}</small></div><p class="sub" style="max-width:420px;margin:14px auto 0">${ui().nowAloud(ns.length)}</p></div>
      <div class="act" style="margin-top:28px"><button class="btn blue full big" id="nx">${ui().next} ${kbd("Enter", 1)}</button></div></div>`);
    wireQuit();
    $("#nx").onclick = next;
    document.onkeydown = (e) => {
      if (e.key === "Enter") next();
      else if (e.key === "Escape") exitRound();
    };
  }

  function summary(warm) {
    const mark = { green: "✓", yellow: "~", red: "✗" };
    roundFrame(`<div class="round">${rtop(100, true)}<div class="res"><span class="tag">${ui().sessionDone}</span>
      <div class="slist">${results.map((r) => `<div class="srow2"><span class="sw ${r.st}"></span><span class="tn">${r.n}</span><span class="tt">${esc(tk(r.n)[state.lang].topic)}</span><b class="st-${r.st}">${mark[r.st]} ${ui().statuses[r.st]}</b></div>`).join("")}</div>
      <p class="sub">${ui().warmup}: ${warm.correct}/${warm.total}</p><div class="mom">${momTiles(was, xpWas)}</div></div>
      <div class="act" style="flex-direction:row;gap:12px;margin-top:28px"><button class="btn green full big" id="hm">${icon.check}${ui().done} ${kbd("Enter", 1)}</button></div></div>`);
    wireQuit();
    $("#hm").onclick = () => (location.hash = "home");
    document.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === "Escape") location.hash = "home";
    };
  }
}
