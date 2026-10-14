// The exam (#exam/<n>, also the recall part of the daily session): the ticket's three questions one at a time.
// Answer out loud (dictation writes it into the box) or type, or both: it's one box. Then the reference next to
// what you said, and a grade: the AI's (when it's available and there's enough text) or your own in one tap.
import { icon } from "../icons.js";
import { momTiles } from "../screens/verdict.js";
import { beep } from "../sound.js";
import { canDictate, canSpeak, dictate, speak, stopSpeaking } from "../speech.js";
import { persist, state } from "../state.js";
import { mergeAttempts, post, streak, tk, xpToday } from "../store.js";
import { exitRound, kbd, roundFrame, rtop, scoreCls, ui, wireQuit } from "../ui.js";
import { $, codify, esc } from "../util.js";
import { checkAnswer, gradeHtml } from "../screens/exam.js";
import { markWords } from "../vocab.js";

const stFromScore = (sc) => (sc >= 8 ? "green" : sc >= 5 ? "yellow" : "red");
const fmt = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");

// unfinished answers survive leaving the screen (same key the old exam page used)
const draftKey = (n) => "exam.draft." + n;
function readDraft(n) {
  try {
    const v = JSON.parse(localStorage.getItem(draftKey(n)) || "null");
    return Array.isArray(v) && v.length === 3 ? v : ["", "", ""];
  } catch {
    return ["", "", ""];
  }
}
const dropDraft = (n) => {
  try {
    localStorage.removeItem(draftKey(n));
  } catch {}
};

/** @param {number} n @param {{ onDone?: (st: string) => void, step?: string }} [opts] */
export function playVoice(n, { onDone, step } = {}) {
  const t = tk(n);
  const said = readDraft(n);
  let qi = Math.max(
    0,
    said.findIndex((s) => !s.trim()),
  );
  let rec = null,
    tick = null,
    t0 = 0;
  const secs = [0, 0, 0]; // time spent speaking per question
  const save = () => persist(draftKey(n), said);

  const render = () => {
    const d = t[state.lang];
    roundFrame(`<div class="round">${rtop(Math.round((qi / 3) * 100))}<div class="body" style="gap:10px">
      <div class="qdots2">${d.qs.map((_, k) => `<button data-q="${k}" class="${k === qi ? "on" : ""}${said[k].trim() ? " done" : ""}">${k + 1}</button>`).join("")}<span class="qn">${step ? `${ui().ticket} ${step} · ` : `${ui().ticket} ${n} · `}${ui().question} ${qi + 1} / 3</span></div>
      <p class="q">${codify(d.qs[qi])}</p>
      <textarea class="ansbox" id="ans" placeholder="${canDictate ? ui().ansPh : ui().ansPhType}">${esc(said[qi])}</textarea>
      <div class="vrow">${canDictate ? `<button class="btn blue" id="rec">${icon.mic}${ui().rec}</button><button class="btn red" id="stp" style="display:none">${icon.stop}${ui().stop}</button>` : ""}${canSpeak ? `<button class="btn line" id="ask">${icon.speaker}${ui().ask}</button>` : ""}<span class="sp"></span><span class="timer" id="tm">${fmt(secs[qi])}</span></div>
      ${canDictate ? "" : `<div class="banner" style="margin-top:4px">${icon.warn}<span>${ui().norec}</span></div>`}</div>
      <div class="act" style="flex-direction:row;align-items:center;gap:10px">${qi > 0 ? `<button class="btn ghost" id="prq">${icon.back}</button>` : ""}<div class="hint" style="justify-content:flex-start">${canDictate ? `<span>${kbd("Space")} ${ui().hintSpeak}</span>` : ""}<span>${kbd("⌘Enter")} ${ui().hintNextQ}</span></div><span class="sp"></span><button class="btn ghost" id="nxq">${qi < 2 ? ui().next : ui().reveal} ${icon.arrow}</button></div></div>`);
    wireQuit();
    const ta = $("#ans");
    ta.oninput = () => {
      said[qi] = ta.value;
      save();
    };
    const startRec = () => {
      if (rec || !canDictate) return;
      t0 = Date.now() - secs[qi] * 1000;
      $("#tm").className = "timer run";
      $("#rec").style.display = "none";
      $("#stp").style.display = "";
      ta.classList.add("live");
      tick = setInterval(() => {
        secs[qi] = Math.floor((Date.now() - t0) / 1000);
        $("#tm").textContent = fmt(secs[qi]);
        $("#tm").className = "timer " + (secs[qi] > 90 ? "over" : "run");
      }, 500);
      rec = dictate(
        (final, interim) => {
          said[qi] = final;
          ta.value = final + interim;
          ta.scrollTop = ta.scrollHeight;
          save();
        },
        { initial: ta.value, onEnd: () => rec && stopRec() },
      );
    };
    const stopRec = () => {
      if (rec) said[qi] = rec.stop().trim() || said[qi];
      rec = null;
      clearInterval(tick);
      tick = null;
      save();
      const r = $("#rec");
      if (!r) return;
      r.style.display = "";
      $("#stp").style.display = "none";
      $("#tm").className = "timer";
      ta.value = said[qi];
      ta.classList.remove("live");
    };
    const goQ = (k) => {
      stopRec();
      said[qi] = ta.value;
      save();
      qi = k;
      render();
    };
    if (canDictate) {
      $("#rec").onclick = startRec;
      $("#stp").onclick = stopRec;
    }
    if (canSpeak) $("#ask").onclick = () => speak(t[state.lang].qs[qi]);
    document.querySelectorAll(".qdots2 [data-q]").forEach((b) => (b.onclick = () => goQ(+b.dataset.q)));
    const prq = $("#prq");
    if (prq) prq.onclick = () => goQ(qi - 1);
    $("#nxq").onclick = () => {
      if (qi < 2) return goQ(qi + 1);
      stopRec();
      said[qi] = ta.value;
      save();
      reveal();
    };
    state.rerender = () => {
      stopRec();
      render();
    };
    state.leave = () => stopRec();
    document.onkeydown = (e) => {
      const typing = e.target.closest("input,textarea");
      if (e.key === " " && !typing) {
        e.preventDefault();
        rec ? stopRec() : startRec();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !typing)) {
        e.preventDefault();
        $("#nxq").click();
      } else if (e.key === "Escape") {
        stopRec();
        exitRound();
      }
    };
    if (!canDictate && matchMedia("(pointer: fine)").matches) ta.focus();
  };

  const reveal = () => {
    stopSpeaking();
    const d = t[state.lang];
    state.rerender = reveal;
    const answer = said
      .map((s, k) => (s.trim() ? `${k + 1}. ${s.trim()}` : ""))
      .filter(Boolean)
      .join("\n\n");
    const aiOn = state.db.explain && state.live;
    const canAI = aiOn && answer.length >= 40;
    const selfBtns = `<div class="score"><button class="g" data-s="green"><span class="k">1</span>${ui().g}</button><button class="y" data-s="yellow"><span class="k">2</span>${ui().y}</button><button class="r" data-s="red"><span class="k">3</span>${ui().r}</button></div>`;
    roundFrame(`<div class="round" style="min-height:0">${rtop(100, true)}<h2 class="h2" style="margin-top:28px">${ui().reveal}</h2>
      ${d.qs.map((q, k) => `<div class="rev" style="margin-top:28px"><span class="qn">${k + 1} / 3</span><p class="q">${codify(q)}</p>${said[k].trim() ? `<div class="tr" style="min-height:0;padding:12px 14px"><span class="lab">${ui().said}</span>${esc(said[k])}</div>` : ""}<div class="ref" style="border-top:0;padding-top:4px"><span class="rq">${ui().reference}</span><p>${codify(d.a[k].t)}</p></div></div>${k < 2 ? `<div class="rule" style="margin-top:28px"></div>` : ""}`).join("")}
      <div class="kill" style="margin-top:20px"><b>${ui().killh}:</b> ${d.kill}</div>
      <p class="srclink"><a href="#ref/${n}">${ui().refSources}</a></p>
      <div class="card gradecard"><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:18px;font-weight:900">${ui().selfscore}</span><span class="sub">${canAI ? ui().gradeBoth : answer && aiOn ? ui().gradeShort : ui().gradeSelf}</span></div>
      ${canAI ? `<button class="btn blue full big" id="ai">${icon.spark}${ui().aiGrade}</button><div class="v-exam" id="aiBox"></div><span class="or">${ui().orSelf}</span>` : ""}
      ${selfBtns}
      <div class="hint" style="justify-content:flex-start"><span>${kbd("1")} ${ui().cold}</span><span>${kbd("2")} ${ui().shaky}</span><span>${kbd("3")} ${ui().missed}</span></div></div><div style="height:40px"></div></div>`);
    wireQuit();
    markWords(document.querySelector(".round"));
    const was = streak(),
      xpWas = xpToday();
    const after = (st, xp) => {
      state.lastChanged = n;
      dropDraft(n);
      if (onDone) return onDone(st);
      result(st, xp, was, xpWas);
    };
    const scoreIt = async (st) => {
      const xp = { green: 10, yellow: 6, red: 3 }[st];
      beep(st !== "red");
      await post("/api/done", { n, st, mode: "voice", xp, transcript: answer.slice(0, 600) });
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
        app().querySelector(".score")?.remove();
        app().querySelector(".gradecard .or")?.remove();
        app().querySelector(".gradecard .hint")?.remove();
        $("#cont").onclick = () => after(stFromScore(j.score), j.score);
        $("#aiBox").scrollIntoView({ behavior: "smooth", block: "start" });
      };
    document.onkeydown = (e) => {
      if (e.key === "Escape") return exitRound();
      if (!$(".score")) return;
      if (e.key === "1") scoreIt("green");
      else if (e.key === "2") scoreIt("yellow");
      else if (e.key === "3") scoreIt("red");
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
