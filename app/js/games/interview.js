// Interview mode: three questions from different tracks, read out by the "interviewer", two minutes each,
// answered out loud (dictation) or typed. At the end: the reference for each, and an AI grade per answer.
import { icon } from "../icons.js";
import { checkAnswer } from "../screens/exam.js";
import { canDictate, canSpeak, dictate, speak, stopSpeaking } from "../speech.js";
import { persist, state } from "../state.js";
import { active, mergeAttempts, post, status, trainable } from "../store.js";
import { exitRound, kbd, roundFrame, rtop, scoreCls, ui, wireQuit } from "../ui.js";
import { $, codify, esc, shuffle } from "../util.js";

const LIMIT = 120; // seconds per answer

function pick() {
  const pool = shuffle(active().filter((t) => t.sec !== "bonus" && trainable(t.n)));
  const seen = status;
  const out = [];
  for (const pass of [(t) => seen(t.n) !== "new", () => true])
    for (const t of pool) {
      if (out.length >= 3) break;
      if (out.some((o) => o.t === t || o.t.sec === t.sec) || !pass(t)) continue;
      out.push({ t, qi: Math.floor(Math.random() * 3), answer: "" });
    }
  return out;
}

export function interview() {
  if (!pick().length) return noneRead();
  let voiceOn = localStorage.getItem("interview.voice") !== "off";
  roundFrame(`<div class="round">${rtop(0)}<div class="body" style="gap:14px"><span class="tag">${ui().interview}</span><h2 class="h2">${ui().ivTitle}</h2><p class="sub">${ui().ivIntro}</p>
    ${canSpeak ? `<label class="ivopt"><input type="checkbox" id="vo" ${voiceOn ? "checked" : ""}> ${ui().ivVoice}</label>` : ""}</div>
    <div class="act"><button class="btn blue full big" id="go">${ui().start} ${kbd("Enter", 1)}</button></div></div>`);
  wireQuit();
  const vo = $("#vo");
  if (vo) vo.onchange = () => persist("interview.voice", (voiceOn = vo.checked) ? "on" : "off");
  const go = () => run(pick(), voiceOn);
  $("#go").onclick = go;
  document.onkeydown = (e) => {
    if (e.key === "Enter") go();
    else if (e.key === "Escape") exitRound();
  };
}

function run(qs, voiceOn) {
  let i = 0,
    rec = null,
    tick = null;
  const stop = () => {
    if (rec) qs[i].answer = rec.stop().trim();
    rec = null;
    clearInterval(tick);
  };
  const ask = () => {
    const q = qs[i],
      d = q.t[state.lang];
    roundFrame(`<div class="round">${rtop(Math.round((i / qs.length) * 100))}<div class="body" style="gap:10px"><span class="qn">${ui().question} ${i + 1} / ${qs.length} · ${esc(q.t.tag)}</span><p class="q">${codify(d.qs[q.qi])}</p>
      <div class="vrow">${canSpeak ? `<button class="btn line" id="ask">${icon.speaker}${ui().ask}</button>` : ""}${canDictate ? `<button class="btn blue" id="rec">${icon.mic}${ui().rec}</button>` : ""}<span class="sp"></span><span class="timer run" id="tm">2:00</span></div>
      <textarea class="ivta" id="ta" placeholder="${ui().ivPh}">${esc(q.answer)}</textarea></div>
      <div class="act" style="flex-direction:row;align-items:center"><span class="sp"></span><button class="btn blue" id="nx">${i < qs.length - 1 ? ui().next : ui().ivFinish} ${icon.arrow}</button></div></div>`);
    wireQuit();
    state.rerender = () => {
      stop();
      ask();
    };
    const ta = $("#ta");
    ta.oninput = () => (q.answer = ta.value);
    const t0 = Date.now();
    tick = setInterval(() => {
      const left = LIMIT - Math.floor((Date.now() - t0) / 1000);
      const el = $("#tm");
      if (!el) return clearInterval(tick);
      const s = Math.abs(left);
      el.textContent = (left < 0 ? "+" : "") + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
      el.className = "timer " + (left < 0 ? "over" : "run");
    }, 500);
    if (voiceOn) setTimeout(() => speak(d.qs[q.qi]), 250);
    const a = $("#ask");
    if (a) a.onclick = () => speak(d.qs[q.qi]);
    const rb = $("#rec");
    if (rb)
      rb.onclick = () => {
        if (rec) {
          q.answer = rec.stop().trim();
          rec = null;
          rb.innerHTML = icon.mic + ui().rec;
          rb.classList.replace("red", "blue");
          return;
        }
        stopSpeaking();
        q.answer = ta.value;
        rec = dictate((final, interim) => (ta.value = final + interim), { initial: q.answer });
        rb.innerHTML = icon.stop + ui().stop;
        rb.classList.replace("blue", "red");
      };
    $("#nx").onclick = () => {
      stop();
      q.answer = ta.value.trim();
      i++;
      i < qs.length ? ask() : results(qs);
    };
    document.onkeydown = (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("#nx").click();
      else if (e.key === "Escape") {
        stop();
        exitRound();
      }
    };
  };
  ask();
}

function results(qs) {
  stopSpeaking();
  qs.filter((q) => q.answer).forEach((q) => post("/api/log", { n: q.t.n, mode: "interview", xp: 2 }));
  const canAI = state.db.explain && state.live && qs.some((q) => q.answer.length >= 40);
  const draw = () => {
    roundFrame(`<div class="round" style="min-height:0">${rtop(100, true)}<h2 class="h2" style="margin-top:28px">${ui().ivDone}</h2>
      ${qs
        .map((q, k) => {
          const d = q.t[state.lang];
          return `<div class="rev" style="margin-top:26px"><span class="qn">${k + 1} / ${qs.length} · <a href="#t/${q.t.n}">${ui().ticket} ${q.t.n}</a>${q.g ? ` · <span class="scb ${scoreCls(q.g.score)}">${q.g.score}</span>` : ""}</span><p class="q">${codify(d.qs[q.qi])}</p>
          <div class="tr" style="min-height:0;padding:12px 14px"><span class="lab">${ui().said}</span>${esc(q.answer) || `<span class="interim">—</span>`}</div>
          ${q.g ? `<div class="ivg"><p>${esc(q.g.verdict)}</p>${q.g.missing?.length ? `<ul>${q.g.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}</div>` : q.err ? `<div class="banner">${esc(q.err)}</div>` : ""}
          <div class="ref" style="border-top:0;padding-top:4px"><span class="rq">${ui().reference}</span><p>${codify(d.a[q.qi].t)}</p></div></div>`;
        })
        .join("")}
      <div class="act" style="flex-direction:column;gap:12px;margin-top:28px">${canAI && !qs.some((q) => q.g) ? `<button class="btn blue full big" id="ai">${icon.spark}${ui().aiGrade}</button>` : ""}
      <div style="display:flex;gap:12px"><button class="btn line" id="ag" style="flex:1">${ui().again}</button><button class="btn green" id="hm" style="flex:1.4">${ui().done}</button></div></div><div style="height:40px"></div></div>`);
    wireQuit();
    $("#ag").onclick = interview;
    $("#hm").onclick = exitRound;
    const ai = $("#ai");
    if (ai)
      ai.onclick = async () => {
        ai.disabled = true;
        ai.innerHTML = icon.spark + ui().thinking;
        await Promise.all(
          qs.map(async (q) => {
            if (q.answer.length < 40) return;
            const d = q.t[state.lang];
            const j = await checkAnswer(q.t, q.answer, {
              kind: "interview",
              qs: [d.qs[q.qi]],
              ref: [d.a[q.qi]],
            });
            if (j.error) q.err = j.error;
            else {
              q.g = j;
              if (j.attempts) mergeAttempts(j.attempts);
            }
          }),
        );
        draw();
      };
    document.onkeydown = (e) => {
      if (e.key === "Escape") exitRound();
    };
  };
  state.rerender = draw;
  draw();
}

// with "only read tickets" on and nothing read yet there's nothing to ask
function noneRead() {
  roundFrame(`<div class="round">${rtop(0)}<div class="body" style="gap:14px"><span class="tag">${ui().interview}</span><h2 class="h2">${ui().ivNoneTitle}</h2><p class="sub">${ui().ivNone}</p></div>
    <div class="act"><a class="btn blue full big" href="#learn">${ui().tabs.learn}</a></div></div>`);
  wireQuit();
  document.onkeydown = (e) => e.key === "Escape" && exitRound();
}
