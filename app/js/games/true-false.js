// True/False game: sentences from the reference answers plus the ticket's lies.
import { finish, sheet, wireSheet } from "../screens/verdict.js";
import { beep } from "../sound.js";
import { state } from "../state.js";
import { ticketFor } from "../store.js";
import { app, kbd, mkQ, other, rtop, setCombo, setProg, ui, wireQuit } from "../ui.js";
import { $, codify, esc, shuffle } from "../util.js";

export const splitS = (x) =>
  x
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

export const okS = (s) => {
  const w = s.split(/\s+/).length;
  return (
    w >= 8 &&
    w <= 28 &&
    /^[A-ZА-ЯЁ]/.test(s) &&
    !/^(Поэтому|Потому|И |А |Плюс|Отсюда|So |And |But |Because|Which|That's|Plus|Then )/.test(s)
  );
};

export function sentences(t) {
  return t[state.lang].a.flatMap((a) => splitS(a.t)).filter(okS);
}

// true statements with a twin in the other language: same paragraph, nearest position. Any sentence of that paragraph is still true.
export function trueQs(t) {
  const o = other(),
    out = [];
  t[state.lang].a.forEach((a, p) => {
    const A = splitS(a.t),
      B = splitS((t[o].a[p] || { t: "" }).t);
    A.forEach((x, k) => {
      if (!okS(x)) return;
      let tw = null;
      if (B.length) {
        const j = A.length > 1 && B.length > 1 ? Math.round((k / (A.length - 1)) * (B.length - 1)) : 0;
        for (let d = 0; d < B.length && !tw; d++) {
          for (const c of [j - d, j + d]) if (!tw && B[c] && okS(B[c])) tw = B[c];
        }
        tw = tw || B[Math.min(j, B.length - 1)];
      }
      out.push(mkQ({ [state.lang]: x, [o]: tw || x }, t, true));
    });
  });
  return out;
}

export const liesQs = (t) => {
  const d = window.DRILLS[t.n] || {};
  return (d.lies?.[state.lang] || []).map((x, k) =>
    mkQ({ ru: d.lies.ru?.[k], en: d.lies.en?.[k] }, t, false),
  );
};

export const clozeQs = (t) => {
  const d = window.DRILLS[t.n] || {};
  return (d.cloze?.[state.lang] || []).map((x, k) => mkQ({ ru: d.cloze.ru?.[k], en: d.cloze.en?.[k] }, t));
};

export function buildTF(ids, n = 10) {
  const ts = ids.map(ticketFor).filter(Boolean);
  if (!ts.length) return [];
  const pool = [];
  for (const t of ts) {
    liesQs(t).forEach((q) => pool.push(q));
    shuffle(trueQs(t))
      .slice(0, 6)
      .forEach((q) => pool.push(q));
  }
  const secs = new Set(ts.map((t) => t.sec));
  const extra = shuffle(window.TICKETS.filter((t) => secs.has(t.sec) && !ts.includes(t))).slice(0, 3);
  for (const t of extra)
    liesQs(t)
      .slice(0, 1)
      .forEach((q) => pool.push(q));
  const f = shuffle(pool.filter((p) => !p.ok)).slice(0, Math.ceil(n * 0.4));
  const tr = shuffle(pool.filter((p) => p.ok)).slice(0, n - f.length);
  return shuffle(f.concat(tr));
}

export function tfScreen(title, q, i, n) {
  return `<div class="round">${rtop(Math.round((i / n) * 100))}<div class="body"><span class="tag">${esc(q.t[state.lang].topic)}</span><p class="stmt">${codify(q.s)}</p></div>
  <div class="act"><div class="pair"><button class="ans" id="f">${kbd("←", 1).replace('class="kbd dk"', 'class="kbd dk" style="left:14px"')}${ui().false}</button><button class="ans" id="t">${ui().true}${kbd("→", 1).replace('class="kbd dk"', 'class="kbd dk" style="right:14px"')}</button></div><div class="hint"><span>${kbd("Enter")} ${ui().hintNext}</span><span>${kbd("M")} ${ui().hintMore}</span><span>${kbd("Esc")} ${ui().hintQuit}</span></div></div><div id="sheetSlot"></div></div>`;
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
    let ans = null,
      moreOpen = false;
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
        text: "",
        q,
        btn: ok ? "green" : "red",
        btnLabel: ui().next,
      });
      wireSheet(q, q.s, () => {
        i++;
        step();
      });
      const m = $("#more"),
        open = m.onclick;
      m.onclick = () => {
        moreOpen = true;
        open();
      };
      if (moreOpen || (!ok && !redraw)) m.click();
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
      app.innerHTML = tfScreen(title, q, i, qs.length);
      wireQuit();
      setCombo(state.combo);
      if (ans !== null) return show(ans, true);
      $("#t").onclick = () => answer(true);
      $("#f").onclick = () => answer(false);
      document.onkeydown = (e) => {
        if (e.key === "ArrowRight") answer(true);
        else if (e.key === "ArrowLeft") answer(false);
        else if (e.key === "Escape") location.hash = "home";
      };
    };
    state.rerender = draw;
    draw();
  };
  step();
}

export function playTF(id) {
  state.combo = 0;
  const qs = buildTF([id]);
  runTF(
    qs,
    (acc) =>
      finish(
        id,
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
