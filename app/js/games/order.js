// Order-the-steps game.
import { icon } from "../icons.js";
import { bestPara, finish, sheet, wireSheet } from "../screens/verdict.js";
import { beep } from "../sound.js";
import { state } from "../state.js";
import { tk } from "../store.js";
import { app, exitRound, kbd, roundFrame, rtop, setCombo, ui, wireQuit } from "../ui.js";
import { $, codify, esc, shuffle } from "../util.js";

export function playOrder(n) {
  const t = tk(n);
  const st0 = window.DRILLS[t.n]?.steps?.[state.lang];
  if (!st0) return exitRound();
  state.combo = 0;
  const ST = () => window.DRILLS[t.n]?.steps?.[state.lang] || st0;
  let cur = shuffle(st0.items.map((s, i) => i));
  if (cur.every((v, i) => v === i)) cur.reverse();
  let sel = null,
    tries = 0,
    lastRes = null;
  const render = (result) => {
    const st = ST();
    roundFrame(`<div class="round">${rtop(result && result.ok ? 100 : 0, result && result.ok)}<div class="body"><span class="tag">${esc(t[state.lang].topic)}</span><p class="q">${esc(st.title)}</p>
      <div class="steps">${cur.map((idx, pos) => `<div class="step${sel === pos ? " sel" : ""}${result ? (idx === pos ? " ok" : " bad") : ""}" data-pos="${pos}" draggable="${!result}"><span class="n">${pos + 1}</span><span class="sx">${codify(st.items[idx])}</span><span class="mv"><button data-up="${pos}" aria-label="up">${icon.up}</button><button data-dn="${pos}" aria-label="down">${icon.down}</button></span></div>`).join("")}</div></div>
      ${result ? "" : `<div class="act"><button class="btn blue full big" id="chk">${ui().check} ${kbd("Enter", 1)}</button><div class="hint"><span>${kbd("↑")}${kbd("↓")} ${ui().hintMove}</span><span>${kbd("Enter")} ${ui().hintCheck}</span></div></div>`}<div id="sheetSlot"></div></div>`);
    wireQuit();
    const move = (a, b) => {
      if (b < 0 || b >= cur.length) return;
      const v = cur.splice(a, 1)[0];
      cur.splice(b, 0, v);
      sel = b;
      render();
    };
    app.querySelectorAll("[data-up]").forEach(
      (b) =>
        (b.onclick = (e) => {
          e.stopPropagation();
          move(+b.dataset.up, +b.dataset.up - 1);
        }),
    );
    app.querySelectorAll("[data-dn]").forEach(
      (b) =>
        (b.onclick = (e) => {
          e.stopPropagation();
          move(+b.dataset.dn, +b.dataset.dn + 1);
        }),
    );
    app.querySelectorAll(".step").forEach((li) => {
      const pos = +li.dataset.pos;
      li.onclick = () => {
        if (result) return;
        if (sel === null) {
          sel = pos;
          render();
        } else if (sel === pos) {
          sel = null;
          render();
        } else move(sel, pos);
      };
      li.ondragstart = (e) => {
        e.dataTransfer.setData("text", pos);
      };
      li.ondragover = (e) => e.preventDefault();
      li.ondrop = (e) => {
        e.preventDefault();
        move(+e.dataTransfer.getData("text"), pos);
      };
    });
    const check = () => {
      tries++;
      const n = cur.filter((v, i) => v === i).length;
      const ok = n === cur.length;
      beep(ok);
      setCombo(ok ? state.combo + 1 : 0);
      drawResult({ ok, n });
    };
    if ($("#chk")) $("#chk").onclick = check;
    if (!result)
      document.onkeydown = (e) => {
        if (e.key === "Enter") check();
        else if (e.key === "ArrowUp" && sel !== null) {
          e.preventDefault();
          move(sel, sel - 1);
        } else if (e.key === "ArrowDown" && sel !== null) {
          e.preventDefault();
          move(sel, sel + 1);
        } else if (e.key === "Escape") exitRound();
      };
  };
  const drawResult = ({ ok, n }) => {
    lastRes = { ok, n };
    render({ ok, n });
    const st = ST();
    const wrong = cur.map((v, i) => (v !== i ? i + 1 : null)).filter(Boolean);
    $("#sheetSlot").innerHTML = sheet({
      ok,
      title: ok ? ui().resok : ui().resbad,
      sub: `${n} ${ui().of} ${cur.length} ${ui().inplace}`,
      text: ok ? "" : `${ui().swapped}: ${wrong.join(", ")}`,
      q: { t, ok: true },
      btn: ok ? "green" : "red",
      btnLabel: ok ? ui().next : ui().tryagain,
    });
    wireSheet(
      { t, ok: true },
      st.title,
      ok
        ? () => {
            state.rerender = null;
            finish(n, "order", 1, 1, tries === 1 ? 5 : 2);
          }
        : () => {
            lastRes = null;
            render();
          },
      bestPara(t, st.title),
    );
  };
  state.rerender = () => (lastRes ? drawResult(lastRes) : render());
  render();
}
