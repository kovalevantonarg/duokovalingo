// The personal dictionary (#words) and its trainer (#wplay). Words get here from vocab.js (select → "Add").
import { FILLER, checkTyped, exerciseKind, formIn, gradeFor, options } from "../../lib/words.js";
import { icon } from "../icons.js";
import { beep } from "../sound.js";
import { state } from "../state.js";
import {
  dropWord,
  editWord,
  gradeWordAs,
  lookupWord,
  saveWord,
  words,
  wordsDue,
  wordsStats,
} from "../store.js";
import { exitRound, frame, kbd, roundFrame, rtop, setProg, ui, wireQuit } from "../ui.js";
import { $, esc } from "../util.js";

const ROUND = 12;
const DOT = { green: "g", yellow: "y", red: "r" };

/** The context sentence with the word in bold. */
export function ctxHtml(ctx, w) {
  if (!ctx) return "";
  const base = esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return esc(ctx).replace(new RegExp(`(${base}[a-z]{0,3})`, "i"), "<b>$1</b>");
}

function row(x, open) {
  const st = x.st ? DOT[x.st] : "n";
  return `<details class="wrow" data-k="${esc(x.key)}"${open ? " open" : ""}><summary><span class="sw ${st}"></span><span class="ww"><b>${esc(x.w)}</b>${x.ipa ? `<i>${esc(x.ipa)}</i>` : ""}</span><span class="wt">${x.tr ? esc(x.tr) : `<span class="wdim">${ui().noTrShort}</span>`}</span>${icon.chev}</summary>
    <div class="wed">
      ${x.ctx ? `<p class="wctx">${ctxHtml(x.ctx, x.w)}${x.n ? ` <a href="#learn/${x.n}">${ui().ticket} ${x.n}</a>` : ""}</p>` : ""}
      <label>${ui().fTr}<input name="tr" value="${esc(x.tr || "")}" maxlength="120"></label>
      <label>${ui().fDef}<input name="def" value="${esc(x.def || "")}" maxlength="200"></label>
      <label>${ui().fNote}<input name="note" value="${esc(x.note || "")}" maxlength="200"></label>
      <div class="wbtn"><button class="btn green" data-a="save">${ui().saveW}</button>${state.live && (!x.tr || !x.def) ? `<button class="btn line" data-a="ai">${icon.spark}${ui().aiFill}</button>` : ""}<span class="sp"></span><button class="btn line del" data-a="del">${ui().remove}</button></div>
      <small class="wdim">${ui().addedOn} ${esc(x.added)}${x.last ? ` · ${ui().statuses[x.st]}` : ` · ${ui().notReviewed}`}</small>
    </div></details>`;
}

export function wordsScreen(query) {
  const openKey = query?.get("w") || "";
  let filter = "";
  const draw = () => {
    const all = words(),
      due = wordsDue().length;
    const f = filter.toLowerCase();
    const list = f ? all.filter((x) => x.key.includes(f) || (x.tr || "").toLowerCase().includes(f)) : all;
    const view = frame(
      `<section class="hero card"><span class="kick">${ui().dictKick}</span><h1 class="h1">${all.length ? ui().wordsN(all.length) : ui().dictEmpty}</h1><p class="sub">${all.length ? ui().dictSub(due) : ui().dictHow}</p>
      ${all.length ? (due ? `<a class="btn blue big full" href="#wplay">${ui().reviewWords(Math.min(due, ROUND))} ${icon.arrow}</a>` : `<a class="btn line big full" href="#wplay/more">${ui().practiceMore}</a>`) : ""}</section>
      ${all.length ? stats() : ""}
      ${all.length ? `<div class="sec"><span>${ui().allWords}</span><span class="r">${all.length}</span></div>` : ""}
      <form class="wnew" id="wnew"><input id="wnewIn" placeholder="${ui().addPh}" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn line" type="submit">${icon.plus}</button></form>
      ${all.length > 6 ? `<label class="wsearch">${icon.search}<input id="wq" placeholder="${ui().searchW}" value="${esc(filter)}"></label>` : ""}
      <div class="wlist">${list.map((x) => row(x, x.key === openKey)).join("") || (all.length ? `<p class="wdim" style="padding:12px 4px">${ui().noMatch}</p>` : "")}</div>
      ${all.length ? `<p class="wfoot"><button class="lnk" id="csv">${ui().exportCsv}</button></p>` : ""}`,
    );
    document.title = `${ui().dictKick} · duokovalingo`;
    wire(view);
    if (openKey) view.querySelector(`details[open]`)?.scrollIntoView({ block: "center" });
  };
  const wire = (view) => {
    const q = $("#wq");
    if (q)
      q.oninput = () => {
        filter = q.value.trim();
        const pos = q.selectionStart;
        draw();
        const n = $("#wq");
        n.focus();
        n.setSelectionRange(pos, pos);
      };
    $("#wnew").onsubmit = async (e) => {
      e.preventDefault();
      const v = $("#wnewIn").value.trim();
      if (!v) return;
      $("#wnew").classList.add("wait");
      await saveWord(v, "", undefined);
      filter = "";
      draw();
    };
    const csv = $("#csv");
    if (csv) csv.onclick = exportCsv;
    view.querySelectorAll("details.wrow").forEach((d) => {
      const key = d.dataset.k;
      const val = (n) => d.querySelector(`input[name=${n}]`).value;
      d.querySelectorAll("[data-a]").forEach(
        (b) =>
          (b.onclick = async () => {
            b.disabled = true;
            if (b.dataset.a === "save")
              await editWord(key, { tr: val("tr"), def: val("def"), note: val("note") });
            if (b.dataset.a === "ai") {
              b.innerHTML = icon.spark + ui().thinking;
              await lookupWord(key);
            }
            if (b.dataset.a === "del") await dropWord(key);
            draw();
            if (b.dataset.a !== "del")
              $(`details.wrow[data-k="${CSS.escape(key)}"]`)?.setAttribute("open", "");
          }),
      );
      d.querySelectorAll("input").forEach(
        (i) =>
          (i.onkeydown = (e) => {
            if (e.key === "Enter") d.querySelector('[data-a="save"]').click();
          }),
      );
    });
  };
  draw();
}

const ST = ["green", "yellow", "red", "new"];
const stLabel = (st) => ({ green: ui().wG, yellow: ui().wY, red: ui().wR, new: ui().wNew })[st];

/** How the learning goes: words by status, the last week, 14 days of reviews, the words forgotten most. */
function stats() {
  const s = wordsStats();
  const loc = state.lang === "ru" ? "ru-RU" : "en-GB";
  const max = Math.max(1, ...s.days.map((d) => d.n));
  const day = (d) =>
    new Date(d + "T12:00:00").toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" });
  return `<div class="sec"><span>${ui().wStats}</span></div><section class="card pg-sum wstat">
    <div class="pg-gauge" role="img" aria-label="${ST.map((st) => `${stLabel(st)} ${s.by[st]}`).join(", ")}">${ST.map((st) => (s.by[st] ? `<i class="${st}" style="flex:${s.by[st]}" data-tip="${s.by[st]} · ${stLabel(st)}"></i>` : "")).join("")}</div>
    <div class="pg-legend">${ST.map((st) => `<span><i class="${st}"></i>${stLabel(st)} <b>${s.by[st]}</b></span>`).join("")}</div>
    <div class="pg-stats">
      <div><b>${s.reviewed7}</b><span>${ui().wRev7}</span></div>
      <div><b>${s.acc30 == null ? "—" : Math.round(s.acc30 * 100) + "%"}</b><span>${ui().wAcc}</span></div>
      <div><b>${s.added7}</b><span>${ui().wAdd7}</span></div>
    </div>
    <div class="wdays" role="img" aria-label="${ui().wDays}">${s.days.map((d) => `<i style="height:${d.n ? Math.max(8, Math.round((d.n / max) * 100)) : 0}%" data-tip="<b>${d.n ? ui().wRevN(d.n) : ui().noAct}</b><br>${esc(day(d.d))}"></i>`).join("")}</div>
    <div class="wdays-l"><span>${ui().wDays}</span><span>${ui().todayW}</span></div>
    ${s.hard.length ? `<div class="whard"><span>${ui().wHard}</span>${s.hard.map((w) => `<a href="#words?w=${encodeURIComponent(w.key)}">${esc(w.w)}<small>×${w.miss}</small></a>`).join("")}</div>` : ""}
  </section>`;
}

/** CSV for Anki or a spreadsheet: word, translation, definition, note, context. */
function exportCsv() {
  const cell = (s) => `"${String(s || "").replace(/"/g, '""')}"`;
  const lines = [["word", "translation", "definition", "ipa", "note", "context"].join(",")];
  for (const x of words()) lines.push([x.w, x.tr, x.def, x.ipa, x.note, x.ctx].map(cell).join(","));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
  a.download = "duokovalingo-words.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- the trainer (#wplay; #wplay/more practises the weakest words without touching their schedule) ----

const blank = (ctx, at, form) =>
  `${esc(ctx.slice(0, at))}<span class="wgap">${"&nbsp;".repeat(Math.max(6, form.length))}</span>${esc(ctx.slice(at + form.length))}`;
const hintOf = (s) => s[0] + " " + "_ ".repeat(Math.max(0, s.length - 1)).trim();

/** One exercise for a word: what to show, the options or the accepted spellings. */
function exercise(x, kind, all) {
  const others = all.filter((o) => o.key !== x.key);
  const f = formIn(x.ctx, x.w);
  if (kind === "pickTr")
    return {
      kind,
      tag: ui().tPickTr,
      big: esc(x.w),
      sub: x.ipa ? `<p class="ipa">${esc(x.ipa)}</p>` : "",
      opts: options(
        x.tr,
        others.map((o) => o.tr),
        FILLER.map((p) => p[1]),
      ),
      right: x.tr,
    };
  if (kind === "pickW")
    return {
      kind,
      tag: ui().tPickW,
      big: esc(x.tr),
      sub: x.def ? `<p class="wdef">${esc(x.def)}</p>` : "",
      opts: options(
        x.w,
        others.map((o) => o.w),
        FILLER.map((p) => p[0]),
      ),
      right: x.w,
    };
  if (kind === "gap")
    return {
      kind,
      tag: ui().tGap,
      ctx: blank(x.ctx, f.at, f.form),
      sub: x.tr ? `<p class="wdef">${esc(x.tr)}</p>` : "",
      // all options in lower case: a capital letter would give the sentence-start answer away
      opts: options(
        f.form.toLowerCase(),
        others.map((o) => o.w.toLowerCase()),
        FILLER.map((p) => p[0]),
      ),
      right: f.form.toLowerCase(),
    };
  if (kind === "type")
    return f
      ? {
          kind,
          tag: ui().tType,
          ctx: blank(x.ctx, f.at, f.form),
          sub: x.tr ? `<p class="wdef">${esc(x.tr)}</p>` : "",
          answers: [f.form, x.w],
          hint: hintOf(f.form),
        }
      : {
          kind,
          tag: ui().tType,
          big: esc(x.tr),
          sub: x.def ? `<p class="wdef">${esc(x.def)}</p>` : "",
          answers: [x.w],
          hint: hintOf(x.w),
        };
  return { kind: "flip", tag: ui().whatMeans, big: esc(x.w), ctx: x.ctx ? ctxHtml(x.ctx, x.w) : "" };
}

/** What the word is, shown after every answer: that's where the learning happens. */
const reveal = (x) =>
  `<p class="wfront sm">${esc(x.w)}${x.ipa ? ` <span class="ipa">${esc(x.ipa)}</span>` : ""}</p>${x.tr ? `<p class="wtr">${esc(x.tr)}</p>` : ""}${x.def ? `<p class="wdef">${esc(x.def)}</p>` : ""}${x.ctx ? `<p class="wctx">${ctxHtml(x.ctx, x.w)}</p>` : ""}${x.note ? `<p class="wnote">${esc(x.note)}</p>` : ""}`;

export function wordPlay(mode) {
  const practice = mode === "more";
  const all = words();
  const deck = practice
    ? all
        .slice()
        .sort(
          (a, b) =>
            ({ red: 0, yellow: 1, undefined: 2, green: 3 })[a.st] -
              { red: 0, yellow: 1, undefined: 2, green: 3 }[b.st] || (a.iv || 0) - (b.iv || 0),
        )
        .slice(0, ROUND)
    : wordsDue().slice(0, ROUND);
  if (!deck.length) return void (location.hash = "words");
  // each word once; a miss comes back at the end in an easier form (it doesn't change the grade again)
  const queue = deck.map((x) => ({ x, kind: exerciseKind(x) }));
  const out = new Map(); // key → { x, st }
  let i = 0;
  const step = () => {
    if (i >= queue.length) return done();
    const { x, kind, again } = queue[i];
    const ex = exercise(x, kind, all);
    let res = null,
      picked = null,
      typed = "",
      open = false; // flip cards
    const finish = (result, st) => {
      res = result;
      if (!again) {
        const grade = st || gradeFor(ex.kind, result, x.st);
        out.set(x.key, { x, st: grade });
        if (!practice) gradeWordAs(x.key, grade);
        if (result === "no")
          queue.push({ x, kind: x.tr ? "pickTr" : ex.kind === "flip" ? "flip" : "gap", again: true });
      }
      beep(result !== "no");
      setProg(i + 1, queue.length);
      draw();
    };
    const draw = () => {
      const prompt = `<span class="tag">${ex.tag}${again ? ` · ${ui().tAgain}` : ""}</span>${ex.big ? `<p class="wfront">${ex.big}</p>` : ""}${ex.ctx ? `<p class="wctx big">${ex.ctx}</p>` : ""}${ex.sub || ""}`;
      let body = "",
        act = "";
      if (ex.opts) {
        body = `<div class="wopts">${ex.opts.map((o, k) => `<button class="ans wopt${res ? (o === ex.right ? " pick" : o === picked ? " pick bad" : " dim") : ""}" data-o="${k}"${res ? " disabled" : ""}>${kbd(k + 1, 1)}<span>${esc(o)}</span></button>`).join("")}</div>`;
      } else if (ex.answers) {
        body = `<form class="wtype" id="wtf"><input id="wti" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${esc(ex.hint)}" value="${esc(typed)}"${res ? " disabled" : ""}>${res ? "" : `<button class="btn blue" type="submit">${ui().check}</button>`}</form>${res ? "" : `<button class="lnk" id="idk">${ui().tDontKnow}</button>`}`;
      } else if (open) body = `<div class="wback">${reveal(x)}</div>`;
      if (res) {
        const ok = res !== "no";
        act = `<div class="sheet ${ok ? "ok" : "bad"}" id="sheet"><div class="h"><span class="mark">${ok ? icon.check : icon.xs}</span><span>${res === "ok" ? ui().resok : res === "almost" ? ui().tAlmost : ui().resbad}</span></div><div class="wsheet">${reveal(x)}</div><button class="btn ${ok ? "green" : "red"} full big" id="nx">${ui().next} ${kbd("Enter", 1)}</button></div>`;
      } else if (ex.kind === "flip")
        act = open
          ? `<div class="score"><button class="r" data-s="red"><span class="k">1</span>${ui().wR}</button><button class="y" data-s="yellow"><span class="k">2</span>${ui().wY}</button><button class="g" data-s="green"><span class="k">3</span>${ui().wG}</button></div>`
          : `<button class="btn blue big full" id="flip">${ui().showW} ${kbd("Space", 1)}</button>`;
      roundFrame(
        `<div class="round">${rtop(Math.round(((i + (res ? 1 : 0)) / queue.length) * 100))}<div class="body wcard">${prompt}${body}</div><div class="act">${act}${res ? "" : `<div class="hint">${ex.opts ? `<span>${kbd("1")}–${kbd("4")} ${ui().tChoose}</span>` : ""}<span>${kbd("Esc")} ${ui().hintQuit}</span></div>`}</div></div>`,
      );
      wireQuit();
      const next = () => {
        i++;
        step();
      };
      if (res) $("#nx").onclick = next;
      document.querySelectorAll(".wopt").forEach(
        (b) =>
          (b.onclick = () => {
            if (res) return;
            picked = ex.opts[+b.dataset.o];
            finish(picked === ex.right ? "ok" : "no");
          }),
      );
      const tf = $("#wtf");
      if (tf && !res) {
        const inp = $("#wti");
        inp.oninput = () => (typed = inp.value);
        if (matchMedia("(pointer: fine)").matches || i > 0) inp.focus();
        tf.onsubmit = (e) => {
          e.preventDefault();
          typed = inp.value;
          if (!typed.trim()) return;
          finish(checkTyped(typed, ex.answers));
        };
        $("#idk").onclick = () => finish("no");
      }
      const flip = $("#flip");
      if (flip) flip.onclick = () => ((open = true), draw());
      document
        .querySelectorAll(".score [data-s]")
        .forEach((b) => (b.onclick = () => finish(b.dataset.s === "red" ? "no" : "ok", b.dataset.s)));
      document.onkeydown = (e) => {
        if (e.key === "Escape") return exitRound();
        if (res) {
          if (e.key === "Enter") {
            e.preventDefault();
            next();
          }
          return;
        }
        if (e.target.closest("input")) return;
        if (ex.opts && /^[1-4]$/.test(e.key))
          document.querySelector(`.wopt[data-o="${+e.key - 1}"]`)?.click();
        if (ex.kind === "flip") {
          if (!open && (e.key === " " || e.key === "Enter")) {
            e.preventDefault();
            open = true;
            draw();
          } else if (open) {
            const s = { 1: "red", 2: "yellow", 3: "green" }[e.key];
            if (s) finish(s === "red" ? "no" : "ok", s);
          }
        }
      };
    };
    state.rerender = draw;
    draw();
  };
  const done = () => {
    state.rerender = null;
    const rs = [...out.values()];
    const right = rs.filter((r) => r.st !== "red").length;
    const more = practice ? 0 : wordsDue().filter((w) => !out.has(w.key)).length;
    roundFrame(`<div class="round">${rtop(100, true)}<div class="res"><span class="tag">${practice ? ui().tPractice : ui().wordsDone}</span><div class="n" style="margin-top:24px">${right}<small>/${rs.length}</small></div><div class="v">${ui().tRight}</div></div>
      <div class="card wsum">${rs.map((r) => `<a href="#words?w=${encodeURIComponent(r.x.key)}"><span class="sw ${DOT[r.st]}"></span><b>${esc(r.x.w)}</b><span>${esc(r.x.tr || "")}</span></a>`).join("")}</div>
      ${practice ? `<p class="wdim" style="text-align:center;margin-top:12px;font-size:13px">${ui().tPracticeNote}</p>` : ""}
      <div class="act" style="flex-direction:row;gap:12px;margin-top:24px">${more ? `<button class="btn line" id="ag" style="flex:1">${ui().moreWords(more)}</button>` : ""}<button class="btn green" id="hm" style="flex:1.4">${ui().done} ${kbd("Enter", 1)}</button></div></div>`);
    wireQuit();
    $("#hm").onclick = exitRound;
    const ag = $("#ag");
    if (ag) ag.onclick = () => wordPlay();
    document.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === "Escape") exitRound();
    };
  };
  step();
}
