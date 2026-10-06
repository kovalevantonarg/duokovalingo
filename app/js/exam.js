const UI = {
  ru: {
    sub: "Новая тема? Начни с «Разбора с нуля». Для самопроверки ответь на три вопроса, затем сравни с эталоном.",
    draw: "Вытянуть билет",
    reveal: "Показать эталон",
    reset: "Сбросить",
    all: "Все темы",
    meta: "три вопроса · 3–4 минуты",
    std: "Как это звучит целиком",
    kill: "На чём валятся: ",
    attempts: "Попытки",
    noatt: "Пока не проверялся",
    saved: "Сохранено: ответ, оценка и сессия в прогрессе.",
    notsaved: "Оценка не сохранилась: ",
    check: "Проверить ответ",
    checking: "Проверяю…",
    outof: "из 10",
    q3: "В",
    covered: "Попал",
    missing: "Не хватает",
    wrong: "Неверно",
    langh: "Как сказать по-английски",
    fu: "Следующий вопрос интервьюера",
    nxt: "Дальше: ",
    short: "Напиши хотя бы пару предложений, тогда будет что проверять.",
    nokey:
      "Проверка выключена: на сервере нет ANTHROPIC_API_KEY. Добавь ключ в переменные окружения проекта на Vercel и передеплой.",
    fail: "Не удалось проверить: ",
    login: "Нужно войти в приложение (главная страница), тогда проверка заработает и здесь.",
    src: "Источники",
    fixedN: "исправлено",
    was: "Было: ",
    said: "Источник: ",
    verif: (n) =>
      `Под ответом — журнал источников от ${n}: утверждения, пояснения и ссылки. Для изучения механизма открой «Разбор с нуля». Конкретные лимиты и параметры зависят от модели и версии API.`,
    st: {
      ok: "✓ подтверждено",
      fix: "исправлено по источнику",
      fix2: "исправлено при перепроверке",
      soft: "смягчено: первоисточника нет",
    },
    ph: "Пиши ответ здесь. Своими словами, не подглядывая.",
    copy: "Скопировать",
    copied: "Скопировано",
    clear: "Очистить",
    chars: "символов",
    idle: "Ни одного билета не вытянуто.<br>Печатать можно где угодно — главное доставать из головы, а не узнавать в готовом тексте.",
    resetd: "Сброшено. Все билеты снова в колоде.",
    hint: "Если тема новая, сначала изучи разбор. Если уже знакома — попробуй ответить без подсказки и только потом открой эталон.",
    foot: "Эталон написан так, как ответ звучит вживую — связной речью, а не списком. Сравнивай не по галочкам, а по тому, смог бы ты это выговорить.<br><br>Печатать — режим по умолчанию, работает везде. Вслух — раз-два в неделю, когда дома тихо: беглость под давлением приходит только от речи.<br><br>«Проверить ответ» сохраняет ответ и оценку и засчитывает сессию по теме в основном прогрессе.",
  },
  en: {
    sub: "New topic? Start with the detailed lesson in Russian. To practise recall, answer the three questions before opening the reference.",
    draw: "Draw a ticket",
    reveal: "Show reference",
    reset: "Reset",
    all: "All topics",
    meta: "three questions · 3–4 min",
    std: "How it sounds spoken",
    kill: "Where people fail: ",
    attempts: "Attempts",
    noatt: "Not checked yet",
    saved: "Saved: answer, score and a drill session.",
    notsaved: "Score not saved: ",
    check: "Check my answer",
    checking: "Checking…",
    outof: "out of 10",
    q3: "Q",
    covered: "Covered",
    missing: "Missing",
    wrong: "Wrong",
    langh: "How an engineer would say it",
    fu: "Interviewer's next question",
    nxt: "Next: ",
    short: "Write at least a couple of sentences first, then there is something to check.",
    nokey:
      "Checking is off: the server has no ANTHROPIC_API_KEY. Add it to the project's environment variables on Vercel and redeploy.",
    fail: "Could not check: ",
    login: "Log in on the home page first; then checking works here too.",
    src: "Sources",
    fixedN: "corrected",
    was: "Was: ",
    said: "Source says: ",
    verif: (n) =>
      `The source ledger dated ${n} lists claims, explanations and links. Use the detailed lesson to learn the mechanism. Exact limits and parameters depend on the model and API version.`,
    st: {
      ok: "✓ verified",
      fix: "corrected per source",
      fix2: "corrected on re-check",
      soft: "hedged: no primary source found",
    },
    ph: "Write your answer here. Your own words, no peeking.",
    copy: "Copy",
    copied: "Copied",
    clear: "Clear",
    chars: "chars",
    idle: "No ticket drawn yet.<br>Typing works anywhere — what matters is producing from memory, not recognising a finished text.",
    resetd: "Reset. All tickets back in the deck.",
    hint: "For a new topic, read the lesson first. For a familiar topic, try answering from memory before opening the reference.",
    foot: "The reference is written the way the answer sounds out loud — connected speech, not a checklist. Judge yourself on whether you could say it, not on ticking items off.<br><br>Typing is the default and works anywhere. Out loud once or twice a week, when the house is quiet — fluency under pressure only comes from speaking.<br><br>Check my answer saves the answer and the score and counts a drill session for the topic in the main progress.",
  },
};

const T = window.TICKETS;
let lang = (() => {
    try {
      return localStorage.getItem("drill.lang") || "ru";
    } catch {
      return "ru";
    }
  })(),
  cur = null,
  t0 = null,
  tick = null,
  seen = new Set();
// graded attempts: cloud copy from /api/state when logged in, local mirror otherwise
let EX = (() => {
  try {
    return JSON.parse(localStorage.getItem("exam.attempts") || "[]");
  } catch {
    return [];
  }
})();
const attemptsOf = (n) => EX.filter((e) => e.n === n).sort((a, b) => (a.t || 0) - (b.t || 0));
const lastOf = (n) => attemptsOf(n).slice(-1)[0];
function mergeAttempts(list) {
  if (!Array.isArray(list)) return;
  const key = (e) => e.n + "|" + (e.t || e.d);
  const have = new Set(EX.map(key));
  for (const e of list) if (!have.has(key(e))) EX.push(e);
  EX = EX.slice(-400);
  try {
    localStorage.setItem("exam.attempts", JSON.stringify(EX));
  } catch {}
}
async function loadAttempts() {
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.ok) {
      const db = await r.json();
      if (Array.isArray(db.exams)) {
        EX = db.exams.slice();
        try {
          localStorage.setItem("exam.attempts", JSON.stringify(EX));
        } catch {}
      }
    }
  } catch {}
  renderChips();
  if (cur) renderAttempts(cur);
}
const fmtD = (d) => {
  const x = new Date(d);
  return isNaN(x)
    ? d
    : x.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "short" });
};
function renderAttempts(t) {
  const box = $("att");
  if (!box) return;
  const xs = attemptsOf(t.n);
  if (!xs.length) {
    box.innerHTML = `<span>${L().attempts}: ${L().noatt}</span>`;
    return;
  }
  box.innerHTML = `<span>${L().attempts}:</span>${xs
    .slice(-8)
    .map(
      (e, i) =>
        `<span class="a ${scoreCls(e.score)}" data-i="${xs.length - Math.min(8, xs.length) + i}" title="${esc(e.verdict || "")}">${fmtD(e.d)} · ${e.score}</span>`,
    )
    .join("")}<div id="prevBox" style="flex-basis:100%"></div>`;
  box.querySelectorAll("span.a").forEach(
    (el) =>
      (el.onclick = () => {
        const e = xs[+el.dataset.i];
        const pb = $("prevBox");
        const open = el.classList.contains("sel");
        box.querySelectorAll("span.a").forEach((x) => x.classList.remove("sel"));
        if (open) {
          pb.innerHTML = "";
          return;
        }
        el.classList.add("sel");
        pb.innerHTML = `<div class="prev">${esc(e.answer || "")}${
          e.verdict
            ? `

— ${esc(e.verdict)}`
            : ""
        }</div>`;
      }),
  );
}
const $ = (id) => document.getElementById(id);
const stage = $("stage"),
  timer = $("timer"),
  chips = $("chips");
const L = () => UI[lang];
const D = (t) => t[lang];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const short = (u) => {
  try {
    const x = new URL(u);
    return (x.host.replace(/^www\./, "") + x.pathname + x.hash).replace(/\/$/, "");
  } catch {
    return u;
  }
};
function srcList(n, slots) {
  const xs = ((window.SOURCES || {})[n] || []).filter((x) => x.w.some((w) => slots.includes(w)));
  if (!xs.length) return "";
  const nf = xs.filter((x) => x.s !== "ok").length,
    fx = (x) => x.s === "fix" || x.s === "fix2";
  return `<details class="src"><summary>${L().src} · ${xs.length}${nf ? ` · <span class="sfix">${nf} ${L().fixedN}</span>` : ""}</summary><ul>${xs
    .map(
      (x) =>
        `<li class="s-${x.s}"><div class="badge">${L().st[x.s]}</div>${x.c ? `<div class="sc">${x.s === "fix" ? L().was : ""}${esc(x.c)}</div>` : ""}<div class="se">${fx(x) && x.c ? L().said : ""}${esc(x.e)}</div>${x.u
          .map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(short(u))}</a>`)
          .join("")}</li>`,
    )
    .join("")}</ul></details>`;
}
function fmt(s) {
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
function stopTimer() {
  if (tick) {
    clearInterval(tick);
    tick = null;
  }
}
function startTimer() {
  stopTimer();
  t0 = Date.now();
  timer.className = "timer run";
  timer.textContent = "0:00";
  tick = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    timer.textContent = fmt(s);
    timer.className = "timer " + (s > 240 ? "over" : "run");
  }, 500);
}
function chrome() {
  $("sub").innerHTML = L().sub;
  $("draw").textContent = L().draw;
  $("reveal").textContent = L().reveal;
  $("reset").textContent = L().reset;
  $("allh").textContent = L().all;
  $("foot").innerHTML = L().foot;
  $("h1").textContent = lang === "ru" ? "Билеты" : "Tickets";
  $("rml").textContent = lang === "ru" ? "Роадмап" : "Roadmap";
  $("ru").className = lang === "ru" ? "on" : "";
  $("en").className = lang === "en" ? "on" : "";
  renderChips();
}
const SEC = {
  llm: ["LLM engineering", "LLM engineering"],
  rag: ["RAG", "RAG"],
  agents: ["Агенты", "Agents"],
  sysd: ["Системный дизайн", "System design"],
  behav: ["Behavioral", "Behavioral"],
  js: ["JavaScript", "JavaScript"],
  ts: ["TypeScript", "TypeScript"],
  react: ["React", "React"],
  web: ["Браузер и веб-платформа", "Browser and web platform"],
  bonus: ["Глубина", "Depth"],
  parked: ["Быстрая проверка JS/React", "Quick JS/React check"],
};
const ORDER = ["llm", "rag", "agents", "sysd", "behav", "js", "ts", "react", "web", "bonus", "parked"];
function renderChips() {
  chips.innerHTML = "";
  ORDER.forEach((sec) => {
    const ts = T.filter((t) => t.sec === sec);
    if (!ts.length) return;
    const h = document.createElement("div");
    h.className = "sech";
    const done = ts.filter((t) => seen.has(t.n)).length;
    h.innerHTML = `<span>${SEC[sec][lang === "ru" ? 0 : 1]}</span><span class="secn">${done}/${ts.length}</span>`;
    chips.appendChild(h);
    const row = document.createElement("div");
    row.className = "chips";
    ts.forEach((t) => {
      const b = document.createElement("button");
      b.className = "chip" + (seen.has(t.n) ? " done" : "");
      b.textContent = t.n + ". " + D(t).topic;
      const le = lastOf(t.n);
      if (le) {
        const sc = document.createElement("span");
        sc.className = "sc " + scoreCls(le.score);
        sc.textContent = le.score;
        b.appendChild(sc);
      }
      b.title = t.tag;
      b.onclick = () => {
        location.hash = "t" + t.n;
        show(t);
      };
      row.appendChild(b);
    });
    chips.appendChild(row);
  });
}
function openFromHash() {
  const h = location.hash.slice(1);
  if (!h) return false;
  let t = null;
  if (h.startsWith("core-")) {
    const id = Number(h.slice(5));
    t = T.find((x) => (x.core || []).includes(id));
  } else if (h.startsWith("t")) {
    const n = Number(h.slice(1));
    t = T.find((x) => x.n === n);
  }
  if (t) {
    show(t);
    return true;
  }
  return false;
}
function show(t) {
  cur = t;
  seen.add(t.n);
  renderChips();
  startTimer();
  $("reveal").disabled = false;
  const d = D(t);
  stage.innerHTML = `
    <div class="card">
      <div class="tnum">${lang === "ru" ? "Билет" : "Ticket"} ${t.n} · ${t.tag}</div>
      <div class="ttopic">${d.topic}</div>
      <div class="tmeta">${L().meta}</div>
      <div class="att" id="att"></div>
      <p class="lesson"><a href="learn.html#t${t.n}">${lang === "ru" ? "Разбор с нуля: термины, механика, примеры →" : "From-zero lesson: terms, mechanism, examples →"}</a></p>
      <ol class="qs">${d.qs.map((q) => `<li>${q}</li>`).join("")}</ol>
      <textarea id="mine" placeholder="${L().ph}"></textarea>
      <div class="tools">
        <button id="copy">${L().copy}</button>
        <button class="ghost" id="clr">${L().clear}</button>
        <button class="chk" id="chk">${L().check}</button>
        <span class="count" id="cnt">0 ${L().chars}</span>
      </div>
      <div id="gradeBox"></div>
      <div class="hint">${L().hint}</div>
    </div>`;
  const ta = $("mine"),
    cnt = $("cnt");
  ta.oninput = () => {
    cnt.textContent = ta.value.length + " " + L().chars;
  };
  $("copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(ta.value);
    } catch (e) {
      ta.select();
      document.execCommand("copy");
    }
    $("copy").textContent = L().copied;
    setTimeout(() => {
      $("copy").textContent = L().copy;
    }, 1200);
  };
  $("clr").onclick = () => {
    ta.value = "";
    cnt.textContent = "0 " + L().chars;
    $("gradeBox").innerHTML = "";
    ta.focus();
  };
  $("chk").onclick = () => checkAnswer(t, ta.value);
  renderAttempts(t);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function scoreCls(n) {
  return n >= 8 ? "g" : n >= 5 ? "y" : "r";
}
async function checkAnswer(t, text) {
  const box = $("gradeBox"),
    btn = $("chk"),
    d = D(t);
  if (text.trim().length < 40) {
    box.innerHTML = `<div class="grade err">${L().short}</div>`;
    return;
  }
  btn.disabled = true;
  btn.classList.add("busy");
  btn.textContent = L().checking;
  try {
    const r = await fetch("/api/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        n: t.n,
        lang,
        topic: d.topic,
        qs: d.qs,
        answer: text,
        ref: d.a,
        kill: d.kill.replace(/<[^>]+>/g, ""),
        core: t.core || [],
      }),
    });
    let j = {};
    try {
      j = await r.json();
    } catch {}
    if (!r.ok) {
      const msg =
        r.status === 401
          ? L().login
          : j.error === "no_key"
            ? L().nokey
            : j.error === "too_short"
              ? L().short
              : L().fail + (j.error || r.status);
      box.innerHTML = `<div class="grade err">${esc(msg)}</div>`;
      return;
    }
    const li = (xs, f) => xs.map((x) => `<li>${f ? f(x) : esc(x)}</li>`).join("");
    box.innerHTML = `<div class="grade">
      <div class="gh"><div class="score ${scoreCls(j.score)}">${j.score}<small>${L().outof}</small></div>
        ${j.questions?.length === 3 ? `<div class="qs3">${j.questions.map((q, i) => `<span>${L().q3}${i + 1} · ${q}</span>`).join("")}</div>` : ""}</div>
      <p class="verdict">${esc(j.verdict)}</p>
      ${j.covered?.length ? `<h4>${L().covered}</h4><ul class="ok">${li(j.covered)}</ul>` : ""}
      ${j.missing?.length ? `<h4>${L().missing}</h4><ul class="miss">${li(j.missing)}</ul>` : ""}
      ${j.wrong?.length ? `<h4>${L().wrong}</h4><ul class="bad">${li(j.wrong, (w) => `<b>${esc(w.said)}</b> <i>→ ${esc(w.actually)}</i>`)}</ul>` : ""}
      ${j.language?.length ? `<h4>${L().langh}</h4><ul class="lng">${li(j.language, (w) => `<s>${esc(w.from)}</s> → <b>${esc(w.to)}</b>`)}</ul>` : ""}
      ${j.followup ? `<div class="fu"><span>${L().fu}</span>${esc(j.followup)}</div>` : ""}
      ${j.next ? `<div class="nx">${L().nxt}${esc(j.next)}</div>` : ""}
      <div class="nx">${j.saveError ? esc(L().notsaved + j.saveError) : L().saved}</div>
    </div>`;
    if (Array.isArray(j.attempts) && j.attempts.length) mergeAttempts(j.attempts);
    else
      mergeAttempts([
        {
          n: t.n,
          lang,
          d: new Date().toISOString().slice(0, 10),
          t: Date.now(),
          score: j.score,
          q: j.questions,
          chars: text.length,
          answer: text.slice(0, 1500),
          verdict: (j.verdict || "").slice(0, 300),
        },
      ]);
    renderChips();
    renderAttempts(t);
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (e) {
    box.innerHTML = `<div class="grade err">${esc(L().fail + e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.classList.remove("busy");
    btn.textContent = L().check;
  }
}
function draw() {
  const pool = T.filter((t) => !seen.has(t.n));
  const from = pool.length ? pool : T;
  show(from[Math.floor(Math.random() * from.length)]);
}
function reveal() {
  if (!cur) return;
  stopTimer();
  timer.className = "timer";
  const d = D(cur);
  stage.querySelector(".card").insertAdjacentHTML(
    "beforeend",
    `
    <div class="ans">
      <h3>${L().std}</h3>
      ${window.SOURCES ? `<div class="verif">${L().verif(new Date(window.SOURCES_CHECKED).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long", year: "numeric" }))}</div>` : ""}
      ${d.a.map((b, i) => `<div class="ablock"><div class="aq">${i + 1}. ${b.q}</div><p class="atext">${b.t}</p>${srcList(cur.n, [i])}</div>`).join("")}
      <div class="kill">${L().kill}${d.kill}</div>${srcList(cur.n, ["k", "d"])}
    </div>`,
  );
  $("reveal").disabled = true;
}
function setLang(l) {
  lang = l;
  try {
    localStorage.setItem("drill.lang", l);
  } catch {}
  chrome();
  if (cur) {
    const t = cur;
    seen.delete(t.n);
    show(t);
  } else stage.innerHTML = `<div class="idle">${L().idle}</div>`;
}
$("draw").onclick = draw;
$("reveal").onclick = reveal;
$("ru").onclick = () => setLang("ru");
$("en").onclick = () => setLang("en");
$("reset").onclick = () => {
  seen.clear();
  cur = null;
  stopTimer();
  timer.className = "timer";
  timer.textContent = "0:00";
  $("reveal").disabled = true;
  stage.innerHTML = `<div class="idle">${L().resetd}</div>`;
  renderChips();
};
(() => {
  let hops = 0;
  addEventListener("hashchange", () => hops++);
  try {
    const ref = document.referrer;
    if (ref) {
      const u = new URL(ref);
      if (u.origin === location.origin && !u.pathname.endsWith("exam-tickets.html")) {
        $("back").href = ref;
        $("back").onclick = (e) => {
          e.preventDefault();
          history.go(-(hops + 1));
        };
      }
    }
  } catch {}
})();
chrome();
loadAttempts();
if (!openFromHash()) stage.innerHTML = `<div class="idle">${L().idle}</div>`;
window.addEventListener("hashchange", openFromHash);
