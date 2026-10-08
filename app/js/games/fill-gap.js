// Fill-the-gap game over the ticket's cloze sentences.
import { bestPara, finish, sheet, wireSheet } from "../screens/verdict.js";
import { beep } from "../sound.js";
import { state } from "../state.js";
import { tk } from "../store.js";
import { exitRound, kbd, roundFrame, rtop, setCombo, setProg, ui, wireQuit } from "../ui.js";
import { $, esc, shuffle } from "../util.js";
import { clozeQs } from "./true-false.js";

export const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[«»"'`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .trim();

export function gapScreen(q, i, n) {
  const answers = [];
  let k = 0;
  const html = esc(q.s).replace(/\[\[(.+?)\]\]/g, (_, a) => {
    const alts = a.split("|").map((x) => x.trim());
    answers.push(alts);
    const w = Math.min(280, Math.max(96, alts[0].length * 13 + 34));
    return `<input class="inp" id="g${k++}" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:${w}px">`;
  });
  return {
    answers,
    html: `<div class="round">${rtop(Math.round((i / n) * 100))}<div class="body"><span class="tag">${esc(q.t[state.lang].topic)}</span><p class="cloze">${html}</p></div><div class="act"><button class="btn blue full big" id="chk">${ui().check} ${kbd("Enter", 1)}</button></div><div id="sheetSlot"></div></div>`,
  };
}

export function runGap(qs, onDone, acc) {
  let i = 0;
  acc = acc || { correct: 0, total: 0, xp: 0, missedQ: [] };
  const step = () => {
    if (i >= qs.length) {
      state.rerender = null;
      return onDone(acc);
    }
    const q = qs[i];
    let res = null;
    const typed = [];
    const show = (answers, redraw) => {
      const { all, per, misses } = res;
      answers.forEach((alts, j) => {
        const el = $("#g" + j);
        if (!el) return;
        const ok = per[j] !== false;
        el.classList.add(ok ? "ok" : "bad");
        el.disabled = true;
        if (!ok || !el.value) el.value = ok ? typed[j] || alts[0] : alts[0];
      });
      setProg(i + 1, qs.length);
      $("#chk").closest(".act").style.display = "none";
      const text = all
        ? ""
        : misses
            .map(
              ([v, j]) =>
                `${ui().youwrote} <code>${esc(v || "—")}</code> — ${ui().correctis} <b>${esc((answers[j] || [""])[0])}</b>`,
            )
            .join("<br>");
      const okN = per.filter((x) => x).length;
      $("#sheetSlot").innerHTML = sheet({
        ok: all,
        title: all ? ui().resok : ui().resbad,
        sub: per.length > 1 ? `${okN} ${ui().of} ${per.length}` : "",
        text,
        q,
        btn: all ? "green" : "red",
        btnLabel: ui().next,
      });
      wireSheet(
        q,
        q.s.replace(/\[\[(.+?)\]\]/g, (_, a) => a.split("|")[0]),
        () => {
          i++;
          step();
        },
        bestPara(
          q.t,
          q.s.replace(/\[\[(.+?)\]\]/g, (_, a) => a.replace(/\|/g, " ")),
        ),
      );
    };
    const check = (answers) => {
      if (res) return;
      let all = true;
      const per = [],
        misses = [];
      answers.forEach((alts, j) => {
        const el = $("#g" + j);
        const raw = el.value;
        typed[j] = raw;
        const v = norm(raw);
        const ok =
          alts.some((a) => norm(a) === v) ||
          (v.length > 3 && alts.some((a) => norm(a).startsWith(v) && v.length >= norm(a).length - 1));
        per.push(ok);
        acc.total++;
        if (ok) {
          acc.correct++;
          acc.xp += 2;
        } else {
          all = false;
          misses.push([raw, j]);
        }
      });
      if (!all) acc.missedQ.push({ kind: "gap", q });
      beep(all);
      setCombo(all ? state.combo + 1 : 0);
      res = { all, per, misses };
      show(answers, false);
    };
    const draw = () => {
      const { answers, html } = gapScreen(q, i, qs.length);
      roundFrame(html);
      wireQuit();
      setCombo(state.combo);
      answers.forEach((_, j) => {
        const el = $("#g" + j);
        if (!el) return;
        if (typed[j] != null) el.value = typed[j];
        el.oninput = () => {
          typed[j] = el.value;
        };
      });
      if (res) return show(answers, true);
      if ($("#g0")) $("#g0").focus();
      $("#chk").onclick = () => check(answers);
      document.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          check(answers);
        } else if (e.key === "Escape") exitRound();
      };
    };
    state.rerender = draw;
    draw();
  };
  step();
}

export function playGap(n) {
  state.combo = 0;
  const qs = shuffle(clozeQs(tk(n))).slice(0, 3);
  if (!qs.length) return exitRound();
  runGap(qs, (acc) => finish(n, "gap", acc.correct, acc.total, acc.xp, null, acc.missedQ));
}
