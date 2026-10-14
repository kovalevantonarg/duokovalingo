// The personal dictionary (#words) and its flashcards (#wplay). Words get here from vocab.js (select → "Add").
import { icon } from "../icons.js";
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

const ROUND = 15;
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
      ${all.length ? (due ? `<a class="btn blue big full" href="#wplay">${ui().reviewWords(Math.min(due, ROUND))} ${icon.arrow}</a>` : `<button class="btn line big full" disabled>${ui().nothingDue}</button>`) : ""}</section>
      ${all.length ? stats() : ""}
      ${all.length ? `<div class="sec"><span>${ui().allWords}</span><span class="r">${all.length}</span></div>` : ""}
      <form class="wnew" id="wnew"><input id="wnewIn" placeholder="${ui().addPh}" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn line" type="submit">${icon.plus}</button></form>
      ${all.length > 6 ? `<label class="wsearch">${icon.search}<input id="wq" placeholder="${ui().searchW}" value="${esc(filter)}"></label>` : ""}
      <div class="wlist">${list.map((x) => row(x, x.key === openKey)).join("") || (all.length ? `<p class="wdim" style="padding:12px 4px">${ui().noMatch}</p>` : "")}</div>
      ${all.length ? `<p class="wfoot"><button class="lnk" id="csv">${ui().exportCsv}</button></p>` : ""}`,
    );
    document.title = ui().dictKick;
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

// ---- flashcards ----

/**
 * Up to 15 words that are due (or never reviewed). Front: the word in its sentence, or (once it's been green)
 * the translation, to recall the English. Space shows the back; 1/2/3 grade it like a ticket.
 */
export function wordPlay() {
  const deck = wordsDue().slice(0, ROUND);
  if (!deck.length) return void (location.hash = "words");
  const tally = { green: 0, yellow: 0, red: 0 };
  let i = 0;
  const step = () => {
    if (i >= deck.length) return done();
    const x = deck[i];
    const rev = x.st === "green" && !!x.tr; // known well: the other way round
    let open = false;
    const draw = () => {
      const front = rev
        ? `<span class="tag">${ui().recallEn}</span><p class="wfront">${esc(x.tr)}</p>`
        : `<span class="tag">${ui().whatMeans}</span><p class="wfront">${esc(x.w)}</p>${x.ctx ? `<p class="wctx">${ctxHtml(x.ctx, x.w)}</p>` : ""}`;
      const back = `<div class="wback">${rev ? `<p class="wfront sm">${esc(x.w)}</p>${x.ctx ? `<p class="wctx">${ctxHtml(x.ctx, x.w)}</p>` : ""}` : `<p class="wtr">${x.tr ? esc(x.tr) : `<span class="wdim">${ui().noTr}</span>`}</p>`}${x.ipa ? `<p class="ipa">${esc(x.ipa)}</p>` : ""}${x.def ? `<p class="wdef">${esc(x.def)}</p>` : ""}${x.note ? `<p class="wnote">${esc(x.note)}</p>` : ""}</div>`;
      roundFrame(`<div class="round">${rtop(Math.round((i / deck.length) * 100))}<div class="body wcard">${front}${open ? back : ""}</div>
        <div class="act">${
          open
            ? `<div class="score"><button class="r" data-s="red"><span class="k">1</span>${ui().wR}</button><button class="y" data-s="yellow"><span class="k">2</span>${ui().wY}</button><button class="g" data-s="green"><span class="k">3</span>${ui().wG}</button></div>`
            : `<button class="btn blue big full" id="flip">${ui().showW} ${kbd("Space", 1)}</button>`
        }<div class="hint"><span>${kbd("1")} ${kbd("2")} ${kbd("3")} ${ui().hintGrade}</span><span>${kbd("Esc")} ${ui().hintQuit}</span></div></div></div>`);
      wireQuit();
      const flip = $("#flip");
      if (flip) flip.onclick = () => ((open = true), draw());
      document.querySelectorAll(".score [data-s]").forEach((b) => (b.onclick = () => grade(b.dataset.s)));
      document.onkeydown = (e) => {
        if (e.key === "Escape") return exitRound();
        if (!open && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          open = true;
          return draw();
        }
        if (open) {
          const s = { 1: "red", 2: "yellow", 3: "green" }[e.key];
          if (s) grade(s);
        }
      };
    };
    const grade = (s) => {
      document.onkeydown = null;
      tally[s]++;
      gradeWordAs(x.key, s);
      setProg(i + 1, deck.length);
      i++;
      step();
    };
    state.rerender = draw;
    draw();
  };
  const done = () => {
    state.rerender = null;
    const more = wordsDue().filter((w) => !deck.some((d) => d.key === w.key)).length;
    roundFrame(`<div class="round">${rtop(100, true)}<div class="res"><span class="tag">${ui().wordsDone}</span><div class="n" style="margin-top:24px">${tally.green}<small>/${deck.length}</small></div><div class="v">${ui().wKnown}</div>
      <div class="mom"><div><b style="color:var(--good)">${tally.green}</b><span>${ui().wG}</span></div><div><b style="color:var(--warn)">${tally.yellow}</b><span>${ui().wY}</span></div><div><b style="color:var(--crit)">${tally.red}</b><span>${ui().wR}</span></div></div></div>
      <div class="act" style="flex-direction:row;gap:12px;margin-top:36px">${more ? `<button class="btn line" id="ag" style="flex:1">${ui().moreWords(more)}</button>` : ""}<button class="btn green" id="hm" style="flex:1.4">${ui().done} ${kbd("Enter", 1)}</button></div></div>`);
    wireQuit();
    $("#hm").onclick = exitRound;
    const ag = $("#ag");
    if (ag) ag.onclick = wordPlay;
    document.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === "Escape") exitRound();
    };
  };
  step();
}
