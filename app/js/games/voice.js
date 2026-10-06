// Voice answer: speech recognition, timer, reference reveal, self-score.
import { icon } from "../icons.js";
import { momTiles } from "../screens/verdict.js";
import { beep } from "../sound.js";
import { state } from "../state.js";
import { byId, post, streak, ticketFor, xpToday } from "../store.js";
import { app, kbd, rtop, ui, wireQuit } from "../ui.js";
import { $, codify, esc } from "../util.js";

export function playVoice(id) {
  const t = ticketFor(id);
  let qi = 0,
    transcripts = ["", "", ""],
    rec = null,
    t0 = null,
    tick = null,
    final = "",
    interim = "",
    recording = false;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const fmt = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  const speak = (txt) => {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(txt);
      u.lang = state.lang === "ru" ? "ru-RU" : "en-US";
      u.rate = 0.95;
      speechSynthesis.speak(u);
    } catch {}
  };
  const stopAll = () => {
    recording = false;
    if (rec) {
      try {
        rec.stop();
      } catch {}
      rec = null;
    }
    if (tick) {
      clearInterval(tick);
      tick = null;
    }
  };
  const render = () => {
    const d = t[state.lang];
    app.innerHTML = `<div class="round">${rtop(Math.round((qi / 3) * 100))}<div class="body" style="gap:10px"><span class="qn">${state.lang === "ru" ? "Вопрос" : "Question"} ${qi + 1} / 3</span><p class="q">${codify(d.qs[qi])}</p>
      <div class="vrow" style="margin-top:14px"><button class="btn line" id="ask">${icon.speaker}${ui().ask}</button><button class="btn blue" id="rec">${icon.mic}${ui().rec}</button><button class="btn red" id="stp" style="display:none">${icon.stop}${ui().stop}</button><span class="sp"></span><span class="timer" id="tm">0:00</span></div>
      ${SR ? "" : `<div class="banner" style="margin-top:4px">${icon.warn}<span>${ui().norec}</span></div>`}
      <div class="tr" id="tr"><span class="lab">${ui().said}</span><span class="interim">…</span></div></div>
      <div class="act" style="flex-direction:row;align-items:center"><div class="hint" style="justify-content:flex-start"><span>${kbd("Space")} ${ui().hintSpeak}</span><span>${kbd("Enter")} ${ui().hintNextQ}</span></div><span class="sp"></span><button class="btn ghost" id="nxq">${qi < 2 ? ui().next : ui().reveal} ${icon.arrow}</button></div></div>`;
    wireQuit();
    const startRec = () => {
      if (recording) return;
      recording = true;
      final = transcripts[qi];
      interim = "";
      t0 = Date.now();
      $("#tm").className = "timer run";
      $("#rec").style.display = "none";
      $("#stp").style.display = "";
      tick = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        $("#tm").textContent = fmt(s);
        $("#tm").className = "timer " + (s > 90 ? "over" : "run");
      }, 500);
      $("#tr").innerHTML = `<span class="lab">${ui().said}</span><span class="rec"></span>${esc(final)}`;
      if (SR) {
        rec = new SR();
        rec.lang = state.lang === "ru" ? "ru-RU" : "en-US";
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (e) => {
          interim = "";
          for (let k = e.resultIndex; k < e.results.length; k++) {
            const r = e.results[k];
            if (r.isFinal) final += r[0].transcript + " ";
            else interim += r[0].transcript;
          }
          transcripts[qi] = final;
          $("#tr").innerHTML =
            `<span class="lab">${ui().said}</span><span class="rec"></span>${esc(final)}<span class="interim">${esc(interim)}</span>`;
        };
        rec.onend = () => {
          if (recording && rec) {
            try {
              rec.start();
            } catch {}
          }
        };
        try {
          rec.start();
        } catch {}
      }
    };
    const stopRec = () => {
      if (!recording) return;
      stopAll();
      transcripts[qi] = final;
      $("#rec").style.display = "";
      $("#stp").style.display = "none";
      $("#tr").innerHTML =
        `<span class="lab">${ui().said}</span>${esc(final) || `<span class="interim">—</span>`}`;
    };
    $("#ask").onclick = () => speak(t[state.lang].qs[qi]);
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
      if (recording) {
        stopAll();
        transcripts[qi] = final;
      }
      render();
    };
    document.onkeydown = (e) => {
      if (e.key === " " && !e.target.closest("input")) {
        e.preventDefault();
        recording ? stopRec() : startRec();
      } else if (e.key === "Enter") {
        $("#nxq").click();
      } else if (e.key === "Escape") {
        stopAll();
        location.hash = "home";
      }
    };
  };
  const reveal = () => {
    try {
      speechSynthesis.cancel();
    } catch {}
    const d = t[state.lang];
    state.rerender = reveal;
    const ids = t.core.filter((c) => byId(c) && byId(c).st !== "parked");
    if (!ids.length) ids.push(id);
    app.innerHTML = `<div class="round" style="min-height:0">${rtop(100, true)}<h2 class="h2" style="margin-top:28px">${ui().reveal}</h2>
      ${d.qs.map((q, k) => `<div class="rev" style="margin-top:28px"><span class="qn">${k + 1} / 3</span><p class="q">${codify(q)}</p>${transcripts[k] ? `<div class="tr" style="min-height:0;padding:12px 14px"><span class="lab">${ui().said}</span>${esc(transcripts[k])}</div>` : ""}<div class="ref" style="border-top:0;padding-top:4px"><span class="rq">${ui().reference}</span><p>${codify(d.a[k].t)}</p></div><div class="kill"><b>${ui().killh}:</b> ${d.kill}</div></div>${k < 2 ? `<div class="rule" style="margin-top:28px"></div>` : ""}`).join("")}
      <div class="card" style="margin-top:28px;padding:20px;display:flex;flex-direction:column;gap:14px;border-color:#3d4f5a"><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:18px;font-weight:900">${ui().selfscore}</span><span class="sub">${ui().selfsub.replace("#ID", ids.map((x) => "#" + x).join(", "))}</span></div>
      <div class="score"><button class="g" data-s="green"><span class="k">✓</span>${ui().g}</button><button class="y" data-s="yellow"><span class="k">~</span>${ui().y}</button><button class="r" data-s="red"><span class="k">✗</span>${ui().r}</button></div>
      <div class="hint" style="justify-content:flex-start"><span>${kbd("1")} ${ui().cold}</span><span>${kbd("2")} ${ui().shaky}</span><span>${kbd("3")} ${ui().missed}</span></div></div><div style="height:40px"></div></div>`;
    wireQuit();
    const scoreIt = async (st) => {
      const xp = { green: 10, yellow: 6, red: 3 }[st];
      beep(st !== "red");
      const was = streak(),
        xpWas = xpToday();
      for (const cid of ids)
        await post("/api/done", {
          id: cid,
          st,
          mode: "voice",
          xp: cid === ids[0] ? xp : 0,
          transcript: transcripts.join(" | ").slice(0, 600),
        });
      state.lastChanged = ids[0];
      app.innerHTML = `<div class="round">${rtop(100, true)}<div class="res"><span class="tag">${ids.map((x) => "#" + x).join(", ")} → ${ui().statuses[st]}</span><div class="n" style="margin-top:24px;color:${{ green: "var(--good)", yellow: "var(--warn)", red: "var(--crit)" }[st]}">${{ green: "✓", yellow: "~", red: "✗" }[st]}</div><div class="v">${{ green: ui().g, yellow: ui().y, red: ui().r }[st]}</div><div class="xp">+${xp} XP</div><div class="mom">${momTiles(was, xpWas)}</div></div>
        <div class="act" style="flex-direction:row;gap:12px;margin-top:36px"><button class="btn green full big" id="hm">${ui().home} ${kbd("Enter", 1)}</button></div></div>`;
      state.rerender = null;
      wireQuit();
      $("#hm").onclick = () => (location.hash = "home");
      document.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === "Escape") location.hash = "home";
      };
    };
    app.querySelectorAll(".score button").forEach((b) => (b.onclick = () => scoreIt(b.dataset.s)));
    document.onkeydown = (e) => {
      if (e.key === "1") scoreIt("green");
      else if (e.key === "2") scoreIt("yellow");
      else if (e.key === "3") scoreIt("red");
      else if (e.key === "Escape") location.hash = "home";
    };
  };
  render();
}
