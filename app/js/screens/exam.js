// Exam: one ticket, its three questions one at a time (typed or dictated), graded by the AI against the
// reference; then the reference itself with its source ledger. Attempts are kept per ticket.
import { icon } from "../icons.js";
import { canDictate, dictate } from "../speech.js";
import { persist, state } from "../state.js";
import { active, attemptsOf, loadAttempts, mergeAttempts, status, tk, trainable } from "../store.js";
import { frame, scoreCls } from "../ui.js";
import { $, esc, shuffle } from "../util.js";

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
    login: "Сессия закончилась: обнови страницу и войди через Google.",
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
    ph: "Пиши или диктуй ответ на этот вопрос. Своими словами, не подглядывая.",
    q: "Вопрос",
    limit: (n) =>
      `На сегодня проверки ИИ закончились (${n} в день). Завтра будут снова; эталон можно открыть и сейчас.`,
    next: "Дальше",
    prev: "Назад",
    dict: "Диктовать",
    dictStop: "Стоп",
    nodict: "Диктовка работает в Chrome и Safari.",
    other: "Другой билет",
    lessonLink: "Разбор с нуля: термины, механика, примеры →",
    ticket: "Билет",
    copy: "Скопировать",
    copied: "Скопировано",
    clear: "Очистить",
    chars: "символов",
    idle: "Ни одного билета не вытянуто.<br>Печатать можно где угодно — главное доставать из головы, а не узнавать в готовом тексте.",
    resetd: "Сброшено. Все билеты снова в колоде.",
    hint: "Если тема новая, сначала изучи разбор. Если уже знакома — попробуй ответить без подсказки и только потом открой эталон.",
    foot: "Эталон написан так, как ответ звучит вживую — связной речью, а не списком. Сравнивай не по галочкам, а по тому, смог бы ты это выговорить.<br><br>Отвечай по одному вопросу: печатай или диктуй (кнопка с микрофоном). Вслух полезнее: беглость под давлением приходит только от речи.<br><br>«Проверить ответ» сохраняет ответ и оценку и засчитывает сессию по теме в основном прогрессе.",
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
    login: "Your session ended: reload and sign in with Google.",
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
    ph: "Type or dictate your answer to this question. Your own words, no peeking.",
    q: "Question",
    limit: (n) =>
      `You've used today's AI checks (${n} a day). More tomorrow; the reference is open right now.`,
    next: "Next",
    prev: "Back",
    dict: "Dictate",
    dictStop: "Stop",
    nodict: "Dictation works in Chrome and Safari.",
    other: "Another ticket",
    lessonLink: "From-zero lesson: terms, mechanism, examples →",
    ticket: "Ticket",
    copy: "Copy",
    copied: "Copied",
    clear: "Clear",
    chars: "chars",
    idle: "No ticket drawn yet.<br>Typing works anywhere — what matters is producing from memory, not recognising a finished text.",
    resetd: "Reset. All tickets back in the deck.",
    hint: "For a new topic, read the lesson first. For a familiar topic, try answering from memory before opening the reference.",
    foot: "The reference is written the way the answer sounds out loud — connected speech, not a checklist. Judge yourself on whether you could say it, not on ticking items off.<br><br>Answer one question at a time: type or dictate (the mic button). Out loud is better: fluency under pressure only comes from speaking.<br><br>Check my answer saves the answer and the score and counts a drill session for the topic in the main progress.",
  },
};

const L = () => UI[state.lang];
const short = (u) => {
  try {
    const x = new URL(u);
    return (x.host.replace(/^www\./, "") + x.pathname + x.hash).replace(/\/$/, "");
  } catch {
    return u;
  }
};
const fmtD = (d) => {
  const x = new Date(d);
  return isNaN(x)
    ? d
    : x.toLocaleDateString(state.lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "short" });
};
const draftKey = (n) => "exam.draft." + n;
const readDraft = (n) => {
  try {
    const v = JSON.parse(localStorage.getItem(draftKey(n)) || "null");
    return Array.isArray(v) && v.length === 3 ? v : ["", "", ""];
  } catch {
    return ["", "", ""];
  }
};

/** Ledger entries for the given answer slots (0-2, "k" kill, "d" drills). */
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

/**
 * Send an answer to /api/check. Returns the grade, or { error } with a message for the user.
 * `qs`/`ref` default to the whole ticket; interview mode passes one question.
 */
export async function checkAnswer(t, text, { lang = state.lang, kind, qs, ref } = {}) {
  const d = t[lang];
  if (text.trim().length < 40) return { error: UI[lang].short };
  try {
    const r = await fetch("/api/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        n: t.n,
        lang,
        topic: d.topic,
        qs: qs || d.qs,
        answer: text,
        ref: ref || d.a,
        kill: d.kill.replace(/<[^>]+>/g, ""),
        ...(kind ? { kind } : {}),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j;
    const msg =
      r.status === 401
        ? UI[lang].login
        : j.error === "no_key"
          ? UI[lang].nokey
          : j.error === "too_short"
            ? UI[lang].short
            : j.error === "limit"
              ? UI[lang].limit(j.limit)
              : UI[lang].fail + (j.error || r.status);
    return { error: msg };
  } catch (e) {
    return { error: UI[lang].fail + e.message };
  }
}

/** The grade card (classes from exam.css; render inside .v-exam). */
export function gradeHtml(j, lang = state.lang) {
  const T = UI[lang];
  const li = (xs, f) => xs.map((x) => `<li>${f ? f(x) : esc(x)}</li>`).join("");
  return `<div class="grade">
    <div class="gh"><div class="score ${scoreCls(j.score)}">${j.score}<small>${T.outof}</small></div>
      ${j.questions?.length > 1 ? `<div class="qs3">${j.questions.map((q, i) => `<span>${T.q3}${i + 1} · ${q}</span>`).join("")}</div>` : ""}</div>
    <p class="verdict">${esc(j.verdict)}</p>
    ${j.covered?.length ? `<h4>${T.covered}</h4><ul class="ok">${li(j.covered)}</ul>` : ""}
    ${j.missing?.length ? `<h4>${T.missing}</h4><ul class="miss">${li(j.missing)}</ul>` : ""}
    ${j.wrong?.length ? `<h4>${T.wrong}</h4><ul class="bad">${li(j.wrong, (w) => `<b>${esc(w.said)}</b> <i>→ ${esc(w.actually)}</i>`)}</ul>` : ""}
    ${j.language?.length ? `<h4>${T.langh}</h4><ul class="lng">${li(j.language, (w) => `<s>${esc(w.from)}</s> → <b>${esc(w.to)}</b>`)}</ul>` : ""}
    ${j.followup ? `<div class="fu"><span>${T.fu}</span>${esc(j.followup)}</div>` : ""}
    ${j.next ? `<div class="nx">${T.nxt}${esc(j.next)}</div>` : ""}
    <div class="nx">${j.saveError ? esc(T.notsaved + j.saveError) : T.saved}</div>
  </div>`;
}

/** A random ticket to draw: weak and unseen ones first. */
export function drawTicket(except) {
  const weight = { red: 4, new: 3, yellow: 3, green: 1 };
  const all = active().filter((t) => t.n !== except);
  const pool = all.some((t) => trainable(t.n)) ? all.filter((t) => trainable(t.n)) : all;
  const bag = pool.flatMap((t) => Array(weight[status(t.n)] || 1).fill(t.n));
  return shuffle(bag)[0];
}

let timer = null;

export function examScreen(n) {
  if (!n) return void location.replace("#exam/" + drawTicket());
  const t = tk(n),
    d = t[state.lang];
  const ans = readDraft(n);
  let qi = Math.max(
    0,
    ans.findIndex((a) => !a.trim()),
  );
  if (qi < 0) qi = 0;
  let rec = null;
  const total = () => ans.join("").trim().length;
  const view = frame(
    `<div class="card">
      <div class="tnum">${L().ticket} ${t.n} · ${esc(t.tag)}</div>
      <div class="ttopic">${esc(d.topic)}</div>
      <div class="tmeta">${L().meta} <span class="timer" id="timer">0:00</span></div>
      <div class="att" id="att"></div>
      <p class="lesson"><a href="#learn/${t.n}">${L().lessonLink}</a></p>
      <div class="qdots" id="qdots"></div>
      <p class="qcur" id="qcur"></p>
      <textarea id="mine" placeholder="${L().ph}"></textarea>
      <div class="tools">
        ${canDictate ? `<button id="dict">${icon.mic14}<span>${L().dict}</span></button>` : ""}
        <button class="ghost" id="prev">${L().prev}</button>
        <button class="primary" id="next"></button>
        <span class="count" id="cnt"></span>
      </div>
      <div class="tools"><button class="chk" id="chk">${L().check}</button><button id="reveal">${L().reveal}</button><button class="ghost" id="other">${L().other}</button></div>
      <div id="gradeBox"></div>
      <div class="hint">${L().hint}</div>
    </div>
    <div id="ansBox"></div>
    <footer class="foot">${L().foot}</footer>`,
    { back: { href: `t/${n}`, label: `${L().ticket} ${n}` }, scope: "v-exam", cls: "wrap" },
  );
  document.title = `${L().ticket} ${n} · ${d.topic}`;
  const ta = $("#mine");

  // timer: starts with the screen, turns red after 4 minutes
  clearInterval(timer);
  const t0 = Date.now();
  timer = setInterval(() => {
    const el = $("#timer");
    if (!el) return clearInterval(timer);
    const s = Math.floor((Date.now() - t0) / 1000);
    el.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    el.className = "timer " + (s > 240 ? "over" : "run");
  }, 500);

  const save = () => persist(draftKey(n), ans);
  const stopDict = () => {
    if (!rec) return;
    rec.stop();
    rec = null;
    const b = $("#dict");
    if (b) {
      b.classList.remove("rec");
      b.querySelector("span").textContent = L().dict;
    }
  };
  const show = () => {
    $("#qdots").innerHTML = d.qs
      .map(
        (_, i) =>
          `<button class="${i === qi ? "on" : ""}${ans[i].trim() ? " done" : ""}" data-q="${i}">${L().q3}${i + 1}</button>`,
      )
      .join("");
    $("#qdots")
      .querySelectorAll("[data-q]")
      .forEach((b) => (b.onclick = () => goQ(+b.dataset.q)));
    $("#qcur").innerHTML = `<span>${L().q} ${qi + 1} / 3</span>${esc(d.qs[qi])}`;
    ta.value = ans[qi];
    $("#prev").disabled = qi === 0;
    $("#next").textContent = qi < 2 ? L().next + " →" : L().check;
    $("#cnt").textContent = total() + " " + L().chars;
  };
  const goQ = (i) => {
    stopDict();
    ans[qi] = ta.value;
    save();
    qi = i;
    show();
    ta.focus({ preventScroll: true });
  };
  ta.oninput = () => {
    ans[qi] = ta.value;
    save();
    $("#cnt").textContent = total() + " " + L().chars;
  };
  $("#prev").onclick = () => qi > 0 && goQ(qi - 1);
  $("#next").onclick = () => (qi < 2 ? goQ(qi + 1) : grade());
  const db = $("#dict");
  if (db)
    db.onclick = () => {
      if (rec) return stopDict();
      const base = ta.value;
      rec = dictate(
        (final, interim) => {
          ta.value = final + interim;
          ans[qi] = final;
          save();
          $("#cnt").textContent = total() + " " + L().chars;
        },
        { initial: base },
      );
      db.classList.add("rec");
      db.querySelector("span").textContent = L().dictStop;
    };
  ta.onkeydown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      $("#next").click();
    }
  };

  async function grade() {
    stopDict();
    ans[qi] = ta.value;
    save();
    const box = $("#gradeBox"),
      btn = $("#chk");
    const text = ans
      .map((a, i) => (a.trim() ? `${i + 1}. ${a.trim()}` : ""))
      .filter(Boolean)
      .join("\n\n");
    btn.disabled = true;
    btn.classList.add("busy");
    btn.textContent = L().checking;
    const j = await checkAnswer(t, text);
    btn.disabled = false;
    btn.classList.remove("busy");
    btn.textContent = L().check;
    if (j.error) {
      box.innerHTML = `<div class="grade err">${esc(j.error)}</div>`;
      return;
    }
    box.innerHTML = gradeHtml(j);
    mergeAttempts(
      j.attempts?.length
        ? j.attempts
        : [
            {
              n,
              lang: state.lang,
              d: new Date().toISOString().slice(0, 10),
              t: Date.now(),
              score: j.score,
              q: j.questions,
              answer: text.slice(0, 1500),
              verdict: (j.verdict || "").slice(0, 300),
            },
          ],
    );
    try {
      localStorage.removeItem(draftKey(n));
    } catch {}
    renderAttempts();
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  $("#chk").onclick = grade;
  $("#other").onclick = () => (location.hash = "exam/" + drawTicket(n));
  $("#reveal").onclick = () => {
    const D = t[state.lang];
    $("#ansBox").innerHTML = `<div class="ans">
      <h3>${L().std}</h3>
      ${window.SOURCES ? `<div class="verif">${L().verif(new Date(window.SOURCES_CHECKED).toLocaleDateString(state.lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long", year: "numeric" }))}</div>` : ""}
      ${D.a.map((b, i) => `<div class="ablock"><div class="aq">${i + 1}. ${b.q}</div><p class="atext">${b.t}</p>${srcList(n, [i])}</div>`).join("")}
      <div class="kill">${L().kill}${D.kill}</div>${srcList(n, ["k", "d"])}
    </div>`;
    $("#reveal").disabled = true;
    $("#ansBox").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function renderAttempts() {
    const box = $("#att");
    if (!box) return;
    const xs = attemptsOf(n);
    if (!xs.length) return void (box.innerHTML = `<span>${L().attempts}: ${L().noatt}</span>`);
    const from = Math.max(0, xs.length - 8);
    box.innerHTML = `<span>${L().attempts}:</span>${xs
      .slice(from)
      .map(
        (e, i) =>
          `<span class="a ${scoreCls(e.score)}" data-i="${from + i}" title="${esc(e.verdict || "")}">${fmtD(e.d)} · ${e.score}</span>`,
      )
      .join("")}<div id="prevBox" style="flex-basis:100%"></div>`;
    box.querySelectorAll("span.a").forEach(
      (el) =>
        (el.onclick = () => {
          const e = xs[+el.dataset.i];
          const open = el.classList.contains("sel");
          box.querySelectorAll("span.a").forEach((x) => x.classList.remove("sel"));
          $("#prevBox").innerHTML = open
            ? ""
            : `<div class="prev">${esc(e.answer || "")}${e.verdict ? `\n\n— ${esc(e.verdict)}` : ""}</div>`;
          if (!open) el.classList.add("sel");
        }),
    );
  }
  show();
  renderAttempts();
  loadAttempts(n).then(renderAttempts);
  void view;
}
