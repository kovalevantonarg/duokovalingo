// Feedback after each answer (verdict sheet, "More", "Explain differently") and the end-of-round screen.
import { runGap } from "../games/fill-gap.js";
import { runTF } from "../games/true-false.js";
import { icon } from "../icons.js";
import { route } from "../router.js";
import { state } from "../state.js";
import { post, streak, xpToday } from "../store.js";
import { exitRound, kbd, roundFrame, rtop, ui, wireQuit } from "../ui.js";
import { $, codify, esc } from "../util.js";

// which reference paragraph explains this statement: rare shared words (idf over the 3 paragraphs), shared word pairs, and the paragraph's own label
export function bestPara(t, text) {
  const tok = (x) =>
    (x.toLowerCase().match(/[a-zа-яё0-9_]+(?:\.[0-9]+)?/g) || []).filter(
      (w) => w.length >= 3 || /\d/.test(w),
    );
  const q = tok(text),
    qs = new Set(q),
    paras = t[state.lang].a.map((a) => ({ a, w: tok(a.t), l: new Set(tok(a.q)) }));
  const df = (w) => paras.filter((p) => p.w.includes(w)).length || 1,
    bi = (ws) => new Set(ws.slice(1).map((w, i) => ws[i] + " " + w)),
    qb = bi(q);
  let best = paras[0].a,
    bs = -1;
  for (const p of paras) {
    const ps = new Set(p.w),
      pb = bi(p.w);
    let sc = 0;
    for (const w of qs) {
      if (ps.has(w)) sc += Math.log(1 + paras.length / df(w));
      if (p.l.has(w)) sc += 2;
    }
    for (const b of qb) if (pb.has(b)) sc += 1.5;
    if (sc > bs) {
      bs = sc;
      best = p.a;
    }
  }
  return best;
}

export function sheet({ ok, title, sub, text, q, btn, btnLabel }) {
  return `<div class="sheet ${ok ? "ok" : "bad"}" id="sheet"><div style="display:flex;flex-direction:column;gap:10px"><div class="h"><span class="mark">${ok ? icon.check : icon.xs}</span><span>${title}</span>${sub ? `<span class="sep">·</span><span>${sub}</span>` : ""}</div>${text ? `<p class="vp">${text}</p>` : ""}</div>
    <div class="links"><button id="more">${ui().more}</button>${state.db.explain && state.live && q ? `<button id="expl">${icon.spark}${ui().explain}</button>` : ""}${q ? `<a href="#t/${q.t.n}" style="margin-left:auto">${ui().ticket} ${q.t.n} →</a>` : ""}</div><div id="moreBox" style="display:contents"></div>
    <button class="btn ${btn} full big" id="nx" style="margin-top:6px">${btnLabel} ${kbd("Enter", 1)}</button></div>`;
}

export function wireSheet(q, stmt, next, morePara) {
  $("#nx").onclick = next;
  setTimeout(() => $("#nx") && $("#nx").scrollIntoView({ block: "nearest", behavior: "smooth" }), 120);
  const m = $("#more");
  m.onclick = () => {
    const p = morePara || bestPara(q.t, stmt);
    $("#moreBox").insertAdjacentHTML(
      "beforeend",
      `<div class="ref"><span class="rq">${esc(p.q)} · ${esc(q.t[state.lang].topic)}</span><p>${codify(p.t)}</p></div>`,
    );
    m.disabled = true;
    m.classList.add("on");
  };
  const ex = $("#expl");
  if (ex)
    ex.onclick = async () => {
      ex.disabled = true;
      ex.classList.add("wait");
      ex.innerHTML = icon.spark + ui().thinking;
      const p = morePara || bestPara(q.t, stmt);
      try {
        const r = await fetch("/api/explain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            stmt,
            ok: q.ok !== false,
            topic: q.t[state.lang].topic,
            ref: p.t,
            kill: q.t[state.lang].kill.replace(/<[^>]+>/g, ""),
            lang: state.lang,
          }),
        });
        const j = await r.json();
        $("#moreBox").insertAdjacentHTML(
          "beforeend",
          `<div class="ref"><span class="rq">${ui().explain}${j.cached ? `<span class="cache">· cache</span>` : ""}</span><p>${codify(j.text || "✗ " + (j.error === "limit" ? ui().aiLimit(j.limit) : j.error))}</p></div>`,
        );
      } catch (e) {
        $("#moreBox").insertAdjacentHTML("beforeend", `<div class="ref"><p>✗ ${esc(e.message)}</p></div>`);
      }
      ex.classList.remove("wait");
      ex.classList.add("on");
      ex.innerHTML = icon.spark + ui().explain;
    };
  document.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      next();
    } else if (e.key === "m" || e.key === "M" || e.key === "ь") {
      if (!m.disabled) m.click();
    } else if (e.key === "Escape") exitRound();
  };
}

export function missRecap(missedQ) {
  if (!missedQ || !missedQ.length) return "";
  const rows = missedQ
    .map(({ kind, q }) => {
      const txt = kind === "gap" ? q.s.replace(/\[\[(.+?)\]\]/g, (_, a) => a.split("|")[0]) : q.s;
      return `<div class="missrow"><span class="tag">${esc(q.t[state.lang].topic)}</span><p>${codify(txt)}</p></div>`;
    })
    .join("");
  return `<div class="card" style="margin-top:20px;padding:16px;display:flex;flex-direction:column;gap:6px;text-align:left"><span class="h3">${ui().missedTitle} · ${missedQ.length}</span>${rows}</div>`;
}

export function retryMisses(missedQ, onAllDone) {
  const tfQs = missedQ.filter((m) => m.kind === "tf").map((m) => m.q),
    gapQs = missedQ.filter((m) => m.kind === "gap").map((m) => m.q);
  const afterGap = (c, x) => {
    if (!gapQs.length) return onAllDone(c, tfQs.length, x);
    runGap(gapQs, (g) => onAllDone(c + g.correct, tfQs.length + g.total, x + g.xp));
  };
  if (tfQs.length) return runTF(tfQs, (acc) => afterGap(acc.correct, acc.xp), ui().reviewMisses);
  afterGap(0, 0);
}

export function finish(id, mode, correct, total, xp, ids, missedQ) {
  const pct = total ? correct / total : 1;
  const msg = pct === 1 ? ui().perfect : pct >= 0.7 ? ui().good : ui().meh;
  const was = streak(),
    xpWas = xpToday();
  const all = ids || [id];
  Promise.all(
    all.map((cid, k) => post("/api/log", { n: cid, mode, xp: k === 0 ? xp : 0, correct, total })),
  ).then(() => {
    const m = $("#mom");
    if (m) m.innerHTML = momTiles(was, xpWas);
  });
  const hasMiss = missedQ && missedQ.length;
  const draw = () => {
    const msg = pct === 1 ? ui().perfect : pct >= 0.7 ? ui().good : ui().meh;
    roundFrame(`<div class="round">${rtop(100, true)}<div class="res"><span class="tag">${ui().roundOver} · ${all.map((x) => "#" + x).join(", ")}</span><div class="n" style="margin-top:24px">${correct}<small>/${total}</small></div><div class="v">${msg}</div><div class="xp">+${xp} XP</div><div class="mom" id="mom">${momTiles(was, xpWas)}</div>${missRecap(missedQ)}</div>
    ${hasMiss ? `<div class="act" style="flex-direction:row;margin-top:20px"><button class="btn blue full" id="rv">${ui().reviewMisses} · ${missedQ.length}</button></div>` : ""}
    <div class="act" style="flex-direction:row;gap:12px;margin-top:${hasMiss ? "12" : "36"}px"><button class="btn line" id="ag" style="flex:1">${ui().again} ${kbd("R", 1)}</button><button class="btn green" id="hm" style="flex:1.4">${ui().done} ${kbd("Enter", 1)}</button></div></div>`);
    wireQuit();
    const again = () => {
      const h = `play/${id}/${mode.replace("-review", "")}`;
      if (location.hash.slice(1) === h) route();
      else location.hash = h;
    };
    $("#ag").onclick = again;
    $("#hm").onclick = exitRound;
    if (hasMiss)
      $("#rv").onclick = () => retryMisses(missedQ, (c, t, x) => finish(id, mode + "-review", c, t, x, ids));
    document.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === "Escape") exitRound();
      else if (e.key === "r" || e.key === "R" || e.key === "к") again();
    };
  };
  state.rerender = draw;
  draw();
}

export function momTiles(was, xpWas) {
  const s = streak(),
    x = xpToday();
  return `<div><b style="color:var(--fire)">${icon.flame}${s}</b><span>${ui().streak}${s !== was ? ` · ${ui().was} ${was}` : ""}</span></div><div><b style="color:var(--warn)">${icon.bolt}${x}</b><span>${ui().xpt}</span></div><div><b><span class="dy l1" style="width:14px;height:14px"></span>${ui().todayw}</b><span>${ui().onmap}</span></div>`;
}
