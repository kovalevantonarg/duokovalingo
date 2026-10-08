// True/False game over the tickets' curated statements (content/tickets: drills.tf).
import { finish, sheet, wireSheet } from "../screens/verdict.js";
import { beep } from "../sound.js";
import { state } from "../state.js";
import { tk } from "../store.js";
import { exitRound, kbd, mkQ, roundFrame, rtop, setCombo, setProg, ui, wireQuit } from "../ui.js";
import { $, codify, esc, shuffle } from "../util.js";

/** A ticket's curated true/false statements (drills.tf): each one standalone, with a short "why". */
export function tfQs(t) {
  const tf = window.DRILLS[t.n]?.tf;
  if (!tf) return [];
  return tf.ru.map((q, k) => {
    const x = mkQ({ ru: q.s, en: tf.en[k]?.s }, t, q.ok);
    x.W = { ru: q.why, en: tf.en[k]?.why };
    return x;
  });
}

export const clozeQs = (t) => {
  const d = window.DRILLS[t.n] || {};
  return (d.cloze?.[state.lang] || []).map((x, k) => mkQ({ ru: d.cloze.ru?.[k], en: d.cloze.en?.[k] }, t));
};

/** n statements over the given tickets, about half false, spread evenly across the tickets. */
export function buildTF(ns, n = 10) {
  const per = ns
    .map(tk)
    .filter(Boolean)
    .map((t) => {
      const qs = tfQs(t);
      const f = shuffle(qs.filter((q) => !q.ok)),
        tr = shuffle(qs.filter((q) => q.ok));
      return shuffle(f.flatMap((q, i) => [q, tr[i]]).filter(Boolean)); // alternate so any prefix is balanced
    });
  const out = [];
  for (let i = 0; out.length < n && per.some((p) => p[i]); i++)
    for (const p of per) if (p[i] && out.length < n) out.push(p[i]);
  return shuffle(out);
}

export function tfScreen(title, q, i, n) {
  return `<div class="round">${rtop(Math.round((i / n) * 100))}<div class="body swipe" id="sw"><span class="tag">${esc(q.t[state.lang].topic)}</span><p class="stmt">${codify(q.s)}</p><span class="swl">${ui().false}</span><span class="swr">${ui().true}</span></div>
  <div class="act"><div class="pair"><button class="ans" id="f">${kbd("←", 1).replace('class="kbd dk"', 'class="kbd dk" style="left:14px"')}${ui().false}</button><button class="ans" id="t">${ui().true}${kbd("→", 1).replace('class="kbd dk"', 'class="kbd dk" style="right:14px"')}</button></div><div class="hint"><span class="touch">${ui().hintSwipe}</span><span>${kbd("Enter")} ${ui().hintNext}</span><span>${kbd("Esc")} ${ui().hintQuit}</span></div></div><div id="sheetSlot"></div></div>`;
}

export function runTF(qs, onDone, title, acc) {
  let i = 0;
  acc = acc || { correct: 0, xp: 0, missedQ: [] };
  const step = () => {
    if (i >= qs.length) {
      state.rerender = null;
      return onDone(acc);
    }
    const q = qs[i];
    let ans = null;
    const show = (v, redraw) => {
      const ok = v === q.ok;
      const picked = $(v ? "#t" : "#f"),
        oth = $(v ? "#f" : "#t");
      picked.classList.add("pick");
      if (!ok) picked.classList.add("bad");
      oth.classList.add("dim");
      picked.disabled = oth.disabled = true;
      setProg(i + 1, qs.length);
      $("#sheetSlot").innerHTML = sheet({
        ok,
        title: ok ? ui().resok : ui().resbad,
        sub: q.ok ? ui().true : ui().false,
        text: q.W ? codify(q.W[state.lang] || q.W.ru || "") : "",
        q,
        btn: ok ? "green" : "red",
        btnLabel: ui().next,
      });
      wireSheet(q, q.s, () => {
        i++;
        step();
      });
    };
    const answer = (v) => {
      if (ans !== null) return;
      ans = v;
      const ok = v === q.ok;
      beep(ok);
      setCombo(ok ? state.combo + 1 : 0);
      if (ok) {
        acc.correct++;
        acc.xp += 1;
      } else {
        acc.missedQ.push({ kind: "tf", q });
      }
      show(v, false);
    };
    const draw = () => {
      roundFrame(tfScreen(title, q, i, qs.length));
      wireQuit();
      setCombo(state.combo);
      if (ans !== null) return show(ans, true);
      $("#t").onclick = () => answer(true);
      $("#f").onclick = () => answer(false);
      swipe($("#sw"), answer);
      document.onkeydown = (e) => {
        if (e.key === "ArrowRight") answer(true);
        else if (e.key === "ArrowLeft") answer(false);
        else if (e.key === "Escape") exitRound();
      };
    };
    state.rerender = draw;
    draw();
  };
  step();
}

/** Drag the statement right for true, left for false. */
function swipe(el, answer) {
  let x0 = null,
    dx = 0;
  el.onpointerdown = (e) => {
    if (e.pointerType === "mouse") return;
    x0 = e.clientX;
    dx = 0;
    el.setPointerCapture(e.pointerId);
    el.classList.add("drag");
  };
  el.onpointermove = (e) => {
    if (x0 === null) return;
    dx = e.clientX - x0;
    el.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
    el.classList.toggle("toR", dx > 40);
    el.classList.toggle("toL", dx < -40);
  };
  el.onpointerup = el.onpointercancel = () => {
    if (x0 === null) return;
    x0 = null;
    el.classList.remove("drag", "toR", "toL");
    el.style.transform = "";
    if (Math.abs(dx) > 90) answer(dx > 0);
  };
}

export function playTF(n) {
  state.combo = 0;
  const qs = buildTF([n]);
  runTF(
    qs,
    (acc) =>
      finish(
        n,
        "tf",
        acc.correct,
        qs.length,
        acc.xp + (acc.correct === qs.length ? 3 : 0),
        null,
        acc.missedQ,
      ),
    ui().tf,
  );
}
