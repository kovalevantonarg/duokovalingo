// Answer a ticket out loud: the three questions one by one (speech recognition shows what you said),
// then the reference, then a grade: your own (1 tap) or the AI grader's (when the server has a key).
import { icon } from "../icons.js";
import { momTiles } from "../screens/verdict.js";
import { beep } from "../sound.js";
import { canDictate, canSpeak, dictate, speak, stopSpeaking } from "../speech.js";
import { state } from "../state.js";
import { mergeAttempts, post, streak, tk, xpToday } from "../store.js";
import { exitRound, kbd, roundFrame, rtop, scoreCls, ui, wireQuit } from "../ui.js";
import { $, codify, esc } from "../util.js";
import { checkAnswer, gradeHtml } from "../screens/exam.js";

const stFromScore = (sc) => (sc >= 8 ? "green" : sc >= 5 ? "yellow" : "red");

/** @param {number} n @param {{ onDone?: (st: string) => void, step?: string }} [opts] */
export function playVoice(n, { onDone, step } = {}) {
  const t = tk(n);
  let qi = 0,
    rec = null,
    t0 = null,
    tick = null;
  const said = ["", "", ""];
  const fmt = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  const stopAll = () => {
    if (rec) said[qi] = rec.stop().trim();
    rec = null;
    if (tick) clearInterval(tick);
    tick = null;
  };
  const render = () => {
    const d = t[state.lang];
    roundFrame(`<div class="round">${rtop(Math.round((qi / 3) * 100))}<div class="body" style="gap:10px"><span class="qn">${step ? `${ui().ticket} ${step} · ` : ""}${ui().question} ${qi + 1} / 3</span><p class="q">${codify(d.qs[qi])}</p>
      <div class="vrow" style="margin-top:14px">${canSpeak ? `<button class="btn line" id="ask">${icon.speaker}${ui().ask}</button>` : ""}<button class="btn blue" id="rec">${icon.mic}${ui().rec}</button><button class="btn red" id="stp" style="display:none">${icon.stop}${ui().stop}</button><span class="sp"></span><span class="timer" id="tm">0:00</span></div>
      ${canDictate ? "" : `<div class="banner" style="margin-top:4px">${icon.warn}<span>${ui().norec}</span></div>`}
      <div class="tr" id="tr"><span class="lab">${ui().said}</span>${esc(said[qi]) || `<span class="interim">…</span>`}</div></div>
      <div class="act" style="flex-direction:row;align-items:center"><div class="hint" style="justify-content:flex-start"><span>${kbd("Space")} ${ui().hintSpeak}</span><span>${kbd("Enter")} ${ui().hintNextQ}</span></div><span class="sp"></span><button class="btn ghost" id="nxq">${qi < 2 ? ui().next : ui().reveal} ${icon.arrow}</button></div></div>`);
    wireQuit();
    const startRec = () => {
      if (tick) return;
      t0 = Date.now();
      $("#tm").className = "timer run";
      $("#rec").style.display = "none";
      $("#stp").style.display = "";
      tick = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        $("#tm").textContent = fmt(s);
        $("#tm").className = "timer " + (s > 90 ? "over" : "run");
      }, 500);
      $("#tr").innerHTML = `<span class="lab">${ui().said}</span><span class="rec"></span>${esc(said[qi])}`;
      rec = dictate(
        (final, interim) => {
          $("#tr").innerHTML =
            `<span class="lab">${ui().said}</span><span class="rec"></span>${esc(final)}<span class="interim">${esc(interim)}</span>`;
        },
        { initial: said[qi] },
      );
    };
    const stopRec = () => {
      if (!tick) return;
      stopAll();
      $("#rec").style.display = "";
      $("#stp").style.display = "none";
      $("#tm").className = "timer";
      $("#tr").innerHTML =
        `<span class="lab">${ui().said}</span>${esc(said[qi]) || `<span class="interim">—</span>`}`;
    };
    if (canSpeak) $("#ask").onclick = () => speak(t[state.lang].qs[qi]);
    $("#rec").onclick = startRec;
    $("#stp").onclick = stopRec;
    $("#nxq").onclick = () => {
      stopAll();
      if (qi < 2) {
        qi++;
        render();
      } else reveal();
    };
    state.rerender = () => {
      stopAll();
      render();
    };
    document.onkeydown = (e) => {
      if (e.key === " " && !e.target.closest("input,textarea")) {
        e.preventDefault();
        tick ? stopRec() : startRec();
      } else if (e.key === "Enter") $("#nxq").click();
      else if (e.key === "Escape") {
        stopAll();
        exitRound();
      }
    };
  };

  const reveal = () => {
    stopSpeaking();
    const d = t[state.lang];
    state.rerender = reveal;
    const answer = said
      .map((s, k) => (s ? `${k + 1}. ${s}` : ""))
      .filter(Boolean)
      .join("\n\n");
    const canAI = state.db.explain && state.live && answer.length >= 40;
    roundFrame(`<div class="round" style="min-height:0">${rtop(100, true)}<h2 class="h2" style="margin-top:28px">${ui().reveal}</h2>
      ${d.qs.map((q, k) => `<div class="rev" style="margin-top:28px"><span class="qn">${k + 1} / 3</span><p class="q">${codify(q)}</p>${said[k] ? `<div class="tr" style="min-height:0;padding:12px 14px"><span class="lab">${ui().said}</span>${esc(said[k])}</div>` : ""}<div class="ref" style="border-top:0;padding-top:4px"><span class="rq">${ui().reference}</span><p>${codify(d.a[k].t)}</p></div></div>${k < 2 ? `<div class="rule" style="margin-top:28px"></div>` : ""}`).join("")}
      <div class="kill" style="margin-top:20px"><b>${ui().killh}:</b> ${d.kill}</div>
      <div class="card" style="margin-top:28px;padding:20px;display:flex;flex-direction:column;gap:14px;border-color:#3d4f5a"><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:18px;font-weight:900">${ui().selfscore}</span><span class="sub">${ui().selfsub}</span></div>
      <div class="score"><button class="g" data-s="green"><span class="k">✓</span>${ui().g}</button><button class="y" data-s="yellow"><span class="k">~</span>${ui().y}</button><button class="r" data-s="red"><span class="k">✗</span>${ui().r}</button></div>
      ${canAI ? `<button class="btn line full" id="ai">${icon.spark}${ui().aiGrade}</button><div class="v-exam" id="aiBox"></div>` : ""}
      <div class="hint" style="justify-content:flex-start"><span>${kbd("1")} ${ui().cold}</span><span>${kbd("2")} ${ui().shaky}</span><span>${kbd("3")} ${ui().missed}</span></div></div><div style="height:40px"></div></div>`);
    wireQuit();
    const was = streak(),
      xpWas = xpToday();
    const after = (st, xp) => {
      state.lastChanged = n;
      if (onDone) return onDone(st);
      result(st, xp, was, xpWas);
    };
    const scoreIt = async (st) => {
      const xp = { green: 10, yellow: 6, red: 3 }[st];
      beep(st !== "red");
      await post("/api/done", { n, st, mode: "voice", xp, transcript: said.join(" | ").slice(0, 600) });
      after(st, xp);
    };
    app()
      .querySelectorAll(".score button")
      .forEach((b) => (b.onclick = () => scoreIt(b.dataset.s)));
    const ai = $("#ai");
    if (ai)
      ai.onclick = async () => {
        ai.disabled = true;
        ai.innerHTML = icon.spark + ui().thinking;
        const j = await checkAnswer(t, answer, { lang: state.lang });
        if (j.error) {
          $("#aiBox").innerHTML = `<div class="grade err">${esc(j.error)}</div>`;
          ai.disabled = false;
          ai.innerHTML = icon.spark + ui().aiGrade;
          return;
        }
        if (j.attempts) mergeAttempts(j.attempts);
        beep(j.score >= 5);
        $("#aiBox").innerHTML = gradeHtml(j, state.lang);
        ai.outerHTML = `<button class="btn green full big" id="cont">${ui().next} · <span class="scb ${scoreCls(j.score)}">${j.score}</span> ${ui().statuses[stFromScore(j.score)]}</button>`;
        app().querySelector(".score").remove();
        $("#cont").onclick = () => after(stFromScore(j.score), j.score);
      };
    document.onkeydown = (e) => {
      if (!$(".score")) return;
      if (e.key === "1") scoreIt("green");
      else if (e.key === "2") scoreIt("yellow");
      else if (e.key === "3") scoreIt("red");
      else if (e.key === "Escape") exitRound();
    };
  };
  render();
}

const app = () => document.getElementById("app");

function result(st, xp, was, xpWas) {
  roundFrame(`<div class="round">${rtop(100, true)}<div class="res"><span class="tag">${ui().statuses[st]}</span><div class="n" style="margin-top:24px;color:${{ green: "var(--good)", yellow: "var(--warn)", red: "var(--crit)" }[st]}">${{ green: "✓", yellow: "~", red: "✗" }[st]}</div><div class="v">${{ green: ui().g, yellow: ui().y, red: ui().r }[st]}</div><div class="xp">+${xp} XP</div><div class="mom">${momTiles(was, xpWas)}</div></div>
    <div class="act" style="flex-direction:row;gap:12px;margin-top:36px"><button class="btn green full big" id="hm">${ui().done} ${kbd("Enter", 1)}</button></div></div>`);
  state.rerender = null;
  wireQuit();
  $("#hm").onclick = exitRound;
  document.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === "Escape") exitRound();
  };
}
