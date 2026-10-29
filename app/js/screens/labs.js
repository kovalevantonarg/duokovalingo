// Practice tab (#labs, #lab/<id>[/learn|do|talk]): practice for the tickets in code. A lab goes in three steps:
// 1) Разбор: a lesson that builds the reference solution step by step; 2) Повторение: a similar task you write
// yourself, with tests that run in the browser (js/labs/run.js); 3) Интервью: the production scenario out loud.
// Code and results sync with the rest of progress (lib/labs.js). Sources: labs/ → scripts/build-labs.mjs.
import { pageview } from "../analytics.js";
import { LABS_V } from "../../labs/version.js";
import { icon } from "../icons.js";
import { md, mdInline } from "../md.js";
import { canDictate, dictate } from "../speech.js";
import { state } from "../state.js";
import { labRec, resetLabProgress, saveLab, tk } from "../store.js";
import { frame } from "../ui.js";
import { $, esc } from "../util.js";
import { checkAnswer, gradeHtml } from "./exam.js";

const UI = {
  ru: {
    h1: "Практика",
    kick: "Лабы на TypeScript",
    lead: "Практика к билетам кодом. Каждая лаба в три шага: разбор, где решение собирается по шагам с объяснением; повторение, где похожую задачу пишешь сам и тесты проверяют её прямо здесь, в браузере; и прод-сценарий, на который отвечаешь как на интервью. Сеть и API-ключ не нужны: модель в тестах скриптованная.",
    lab: "Лаба",
    tests: (n) => `${n} ${plural(n, "тест", "теста", "тестов")}`,
    steps: (n) => `${n} ${plural(n, "шаг", "шага", "шагов")}`,
    notStarted: "не начата",
    readDone: "разбор прочитан",
    inProgress: (p, t) => `${p}/${t} тестов`,
    green: "пройдена",
    s1: "Разбор",
    s2: "Повторение",
    s3: "Интервью",
    s3d: "прод-сценарий",
    task: "Задача лабы",
    step: (n) => `Шаг ${n}`,
    whole: "Весь код целиком",
    wholeRun: "Прогнать тесты лабы на этом коде",
    experiment: "Живой эксперимент",
    experimentSub: "по желанию, с настоящим API у себя локально",
    readNext: "Разобрался, к повторению",
    noWalk: "Разбора к этой лабе пока нет: начни с задачи и тестов.",
    exRepeat: "Похожая задача",
    exOrig: "Исходная лаба",
    exOrigNote: "Та же задача, что в разборе. Попробуй написать её с нуля, не подглядывая.",
    checks: "Что проверяют тесты",
    hints: "Подсказки",
    hintBtn: (i, n) => `Показать подсказку ${i} из ${n}`,
    peek: "Подсмотреть в разборе",
    prod: "Прод-сценарий",
    prodSub:
      "Ответь как на интервью, 60–90 секунд: вслух или текстом. Ответ опирается на код, который ты разобрал и написал.",
    ansPh: "Твой ответ: где ищешь, в каком порядке, что меняешь…",
    speak: "Говорить",
    stop: "Стоп",
    aiCheck: "Разобрать с ИИ",
    checking: "Проверяю…",
    model: "Пример сильного ответа",
    run: "Запустить тесты",
    running: "Тесты идут…",
    yourCode: "твой код",
    testsFile: "тесты",
    fake: "фейковая модель",
    solution: "эталон",
    readOnly: "только чтение",
    reset: "Начать заново",
    showSol: "Эталон",
    solTitle: "Открыть эталон?",
    solBody:
      "Тесты ещё не зелёные. Сначала подсказки и разбор: эталон, когда застрял всерьёз или когда всё прошло. Иначе код в голове не останется.",
    solOpen: "Открыть",
    solBack: "Ещё попробую",
    resetTitle: "Начать заново?",
    resetBody: "Твой код заменится заготовкой, результаты тестов обнулятся.",
    resetYes: "Начать заново",
    cancel: "Отмена",
    spec: (n) => `Спецификация: ${n}. Запусти, чтобы увидеть, какие уже проходят.`,
    passed: (p, t) => `${p} из ${t}`,
    allGreen: "Все тесты зелёные",
    compile: "Код не собрался",
    timedOut: "Тесты остановлены: похоже на бесконечный цикл или промис, который никогда не завершается.",
    logs: (n) => `console.log · ${n}`,
    testCode: "Код теста",
    saved: "сохранено",
    paneTask: "Задание",
    paneCode: "Код",
    paneTests: "Тесты",
    keys: "⌘/Ctrl + Enter — запустить",
    loadErr: "Не удалось загрузить лабу. Проверь сеть и обнови страницу.",
    toCode: "Писать код",
    toTalk: "К интервью",
  },
  en: {
    h1: "Practice",
    kick: "TypeScript labs",
    lead: "Hands-on practice for the tickets. Each lab has three steps: a walkthrough that builds the solution step by step, a similar task you write yourself with tests running right here in the browser, and a production scenario you answer like in an interview. No network or API key needed: the model in the tests is scripted. Lab texts are in Russian.",
    lab: "Lab",
    tests: (n) => `${n} ${n === 1 ? "test" : "tests"}`,
    steps: (n) => `${n} ${n === 1 ? "step" : "steps"}`,
    notStarted: "not started",
    readDone: "walkthrough read",
    inProgress: (p, t) => `${p}/${t} tests`,
    green: "passed",
    s1: "Walkthrough",
    s2: "Repeat",
    s3: "Interview",
    s3d: "production scenario",
    task: "The lab's task",
    step: (n) => `Step ${n}`,
    whole: "The whole code",
    wholeRun: "Run the lab's tests on this code",
    experiment: "Live experiment",
    experimentSub: "optional, with the real API on your machine",
    readNext: "Got it, on to the repeat",
    noWalk: "No walkthrough for this lab yet: start with the task and the tests.",
    exRepeat: "Similar task",
    exOrig: "Original lab",
    exOrigNote: "The same task as in the walkthrough. Try to write it from scratch without peeking.",
    checks: "What the tests check",
    hints: "Hints",
    hintBtn: (i, n) => `Show hint ${i} of ${n}`,
    peek: "Peek at the walkthrough",
    prod: "Production scenario",
    prodSub:
      "Answer like in an interview, 60–90 seconds, out loud or typed. The answer leans on the code you went through and wrote.",
    ansPh: "Your answer: where you look, in what order, what you change…",
    speak: "Speak",
    stop: "Stop",
    aiCheck: "Review with AI",
    checking: "Checking…",
    model: "A strong answer",
    run: "Run tests",
    running: "Running…",
    yourCode: "your code",
    testsFile: "tests",
    fake: "fake model",
    solution: "reference",
    readOnly: "read only",
    reset: "Start over",
    showSol: "Reference",
    solTitle: "Open the reference?",
    solBody:
      "The tests aren't green yet. Hints and the walkthrough first: the reference when you're really stuck or done. Otherwise the code won't stick.",
    solOpen: "Open",
    solBack: "Keep trying",
    resetTitle: "Start over?",
    resetBody: "Your code is replaced with the starter file and the test results are cleared.",
    resetYes: "Start over",
    cancel: "Cancel",
    spec: (n) => `The spec: ${n}. Run them to see which already pass.`,
    passed: (p, t) => `${p} of ${t}`,
    allGreen: "All tests green",
    compile: "The code didn't compile",
    timedOut: "Tests stopped: looks like an endless loop or a promise that never settles.",
    logs: (n) => `console.log · ${n}`,
    testCode: "Test code",
    saved: "saved",
    paneTask: "Task",
    paneCode: "Code",
    paneTests: "Tests",
    keys: "⌘/Ctrl + Enter to run",
    loadErr: "Couldn't load the lab. Check the network and reload.",
    toCode: "Write the code",
    toTalk: "On to the interview",
  },
};
function plural(n, one, few, many) {
  const m = n % 10,
    h = n % 100;
  return m === 1 && h !== 11 ? one : m >= 2 && m <= 4 && (h < 12 || h > 14) ? few : many;
}
const L = () => UI[state.lang];

// ---- data ----

let indexP = null;
const cache = {};
/** labs/index.json: { block, labs: [{ id, title, tickets, total, steps, repeat: { title, total } }] } */
export function labIndex() {
  return (indexP ||= fetch(`labs/index.json?v=${LABS_V}`)
    .then((r) => (r.ok ? r.json() : { labs: [] }))
    .catch(() => ((indexP = null), { labs: [] })));
}
async function loadLab(id) {
  if (cache[id]) return cache[id];
  const r = await fetch(`labs/${id}.json?v=${LABS_V}`);
  if (!r.ok) throw new Error(r.status);
  return (cache[id] = await r.json());
}
/** Labs that practise this ticket. */
export async function labsForTicket(n) {
  return (await labIndex()).labs.filter((l) => l.tickets.includes(Number(n)));
}

// progress keys: "<id>" holds the walkthrough read mark and the original lab's code; "<id>r" the repeat task
const isGreen = (r) => !!r?.total && r.passed === r.total;

/** Where a lab stands: not started / walkthrough read / 7/13 tests / passed (the repeat, or the original, is green). */
export function labStatus(l) {
  const ro = labRec(l.id),
    rr = labRec(l.id + "r");
  if (isGreen(rr) || isGreen(ro)) return { cls: "g", txt: L().green, pct: 100, done: true };
  const ex = rr?.total ? rr : ro?.total ? ro : null;
  if (ex)
    return {
      cls: ex.passed ? "y" : "r",
      txt: L().inProgress(ex.passed, ex.total),
      pct: 34 + (ex.passed / ex.total) * 66,
    };
  if (ro?.read) return { cls: "y", txt: L().readDone, pct: 34 };
  if (ro || rr) return { cls: "y", txt: L().inProgress(0, l.repeat?.total || l.total), pct: 10 };
  return { cls: "", txt: L().notStarted, pct: 0 };
}

/** A lab as a tappable row (practice tab, ticket page). */
export function labRow(l) {
  const s = labStatus(l);
  return `<a class="labrow" href="#lab/${l.id}"><span class="lnum">${l.id}</span><span class="ltt"><b>${esc(l.title)}</b><small>${l.tickets.map((n) => `${n}. ${esc(tk(n)?.[state.lang].topic || "")}`).join(" · ")}</small><span class="lbar"><i class="${s.cls}" style="width:${s.pct}%"></i></span></span><span class="lst ${s.cls}">${s.done ? icon.check : ""}${esc(s.txt)}</span>${icon.chev}</a>`;
}

// ---- #labs ----

export async function labsIndex() {
  const view = frame(`<div class="wrap" id="main"></div>`, { scope: "v-learn", cls: "" });
  document.title = `${L().h1} · duokovalingo`;
  const idx = await labIndex();
  if (!view.isConnected) return;
  const done = idx.labs.filter((l) => labStatus(l).done).length;
  $("#main").innerHTML =
    `<div class="kick">${L().kick}</div><h1 class="big">${L().h1}</h1><p class="lead">${L().lead}</p>
    <div class="sumbar"><div class="track"><div class="fill" style="width:${idx.labs.length ? Math.round((done / idx.labs.length) * 100) : 0}%"></div></div><span>${done}/${idx.labs.length} ${L().green}</span></div>
    ${idx.block ? `<div class="sech"><span>${esc(idx.block)}</span><span></span></div>` : ""}
    <div class="labs">${idx.labs.map(labRow).join("")}</div>`;
}

// ---- #lab/<id> ----

const local = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k) || "null");
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

/** describe title without the lab number and the ticket list: "01 tool loop: стоп-условия (билеты 2, 8)". */
const groupTitle = (g, title) =>
  g
    .split(" › ")
    .at(-1)
    .replace(/^\d\d\s+(повторение:\s*)?/i, "")
    .replace(/\s*\((билеты?|tickets?)[^)]*\)\s*$/i, "")
    .replace(new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*`, "i"), "")
    .trim();

/** Test results (or the spec before the first run) grouped by describe, the first failure open. */
function resultsHtml(T, ex, results) {
  let head = "";
  const groups = new Map();
  const rows = results ? results.results : ex.tests.map((t) => ({ ...t, ok: null }));
  for (const r of rows) groups.set(r.group, [...(groups.get(r.group) || []), r]);
  if (!results) head = `<p class="rspec">${T.spec(T.tests(ex.total))}</p>`;
  else
    head = `<div class="rsum ${results.ok ? "g" : results.passed ? "y" : "r"}"><b>${results.ok ? icon.check + T.allGreen : T.passed(results.passed, results.total)}</b><span>${results.ms ? Math.round(results.ms) + " ms" : ""}</span></div>
      ${results.compileError ? `<div class="rerr"><b>${T.compile}</b><pre>${esc(results.compileError)}</pre></div>` : ""}
      ${results.timedOut ? `<div class="rerr">${T.timedOut}</div>` : ""}
      ${results.logs?.length ? `<details class="rlogs"><summary>${T.logs(results.logs.length)}</summary><pre>${esc(results.logs.join("\n"))}</pre></details>` : ""}`;
  let firstFail = true;
  const codeOf = (g, name) => ex.tests.find((t) => t.name === name && t.group === g)?.code;
  return (
    head +
    [...groups]
      .map(
        ([g, rs]) =>
          `<div class="rgroup"><h3>${esc(groupTitle(g, ex.title || ""))}</h3>${rs
            .map((r) => {
              const open = r.ok === false && firstFail;
              if (r.ok === false) firstFail = false;
              const src = codeOf(g, r.name);
              return `<details class="rt ${r.ok === null ? "n" : r.ok ? "ok" : "bad"}"${open ? " open" : ""}><summary><span class="dot"></span><span class="rn">${esc(r.name)}</span></summary>${r.error ? `<pre class="rerrtxt">${esc(r.error)}</pre>` : ""}${src ? `<details class="rsrc"><summary>${T.testCode}</summary><pre>${esc(src)}</pre></details>` : ""}</details>`;
            })
            .join("")}</div>`,
      )
      .join("")
  );
}

/** The walkthrough's Markdown with the "tests that turn green" and "trap" lines styled. */
const walkMd = (s) =>
  md(s)
    .replace(/<p><b>(Зеленеют тесты|Зеленеет тест|Green tests?):<\/b>/g, '<p class="wgreen"><b>$1:</b>')
    .replace(/<p><b>(Ловушка|Trap):<\/b>/g, '<p class="wtrap"><b>$1:</b>');

const STEPS = ["learn", "do", "talk"];

export async function labScreen(id, stepArg) {
  const view = frame(`<div class="lab" id="lab"><div class="lload">…</div></div>`, {
    back: { href: "labs", label: L().h1 },
    scope: "v-lab",
    cls: "",
  });
  let lab;
  try {
    lab = await loadLab(id);
  } catch {
    if (view.isConnected) $("#lab").innerHTML = `<p class="lerr">${L().loadErr}</p>`;
    return;
  }
  if (!view.isConnected) return;
  document.title = `${L().lab} ${lab.id} · ${lab.title}`;
  const T = L();

  // the two exercises: the similar task (default) and the original lab
  const EX = {
    repeat: lab.repeat && { key: id + "r", ...lab.repeat },
    orig: {
      key: id,
      title: lab.title,
      module: lab.module,
      file: lab.file,
      testFile: lab.testFile,
      total: lab.total,
      tests: lab.tests,
      stub: lab.stub,
      solution: lab.solution,
      test: lab.test,
    },
  };
  let exKey = local.get("lab.ex." + id) === "orig" || !EX.repeat ? "orig" : "repeat";
  const ex = () => EX[exKey];

  const ro = labRec(id),
    rr = labRec(id + "r");
  let step = STEPS.includes(stepArg)
    ? stepArg
    : !lab.walk || ro?.read
      ? isGreen(rr) || isGreen(ro)
        ? "talk"
        : "do"
      : "learn";

  const ticketsHtml = lab.tickets
    .map((n) => `<a class="tchip" href="#t/${n}"><b>${n}</b>${esc(tk(n)?.[state.lang].topic || "")}</a>`)
    .join("");
  $("#lab").innerHTML = `
    <header class="lhead">
      <span class="kick">${T.lab} ${lab.id}</span>
      <h1>${esc(lab.title)}</h1>
      <div class="tchips">${ticketsHtml}</div>
    </header>
    <nav class="lsteps" id="lsteps"></nav>
    <div id="lbody"></div>
    <div id="lsheet"></div>`;

  // ---- step nav: number or check, title, a short state line ----
  const drawSteps = () => {
    const o = labRec(id),
      r = labRec(EX[exKey].key);
    const st = {
      learn: { done: !!o?.read, sub: lab.walk ? T.steps(lab.walk.steps.length) : "" },
      do: {
        done: isGreen(labRec(id + "r")) || isGreen(o),
        sub: r?.total ? T.passed(r.passed, r.total) : T.tests(ex().total),
      },
      talk: { done: !!o?.talk, sub: T.s3d },
    };
    $("#lsteps").innerHTML = STEPS.map(
      (s, i) =>
        `<button data-s="${s}" class="${s === step ? "on" : ""}${st[s].done ? " done" : ""}"><span class="k">${st[s].done ? icon.check : i + 1}</span><span class="t"><b>${T["s" + (i + 1)]}</b><small>${esc(st[s].sub)}</small></span></button>`,
    ).join("");
    document.querySelectorAll("#lsteps [data-s]").forEach((b) => (b.onclick = () => go(b.dataset.s)));
  };
  let leaveStep = null;
  const go = (s) => {
    leaveStep?.();
    leaveStep = null;
    step = s;
    history.replaceState(null, "", `#lab/${id}/${s}`);
    pageview(`lab/${id}/${s}`);
    drawSteps();
    ({ learn: drawLearn, do: drawDo, talk: drawTalk })[s]();
    window.scrollTo(0, 0);
  };
  state.leave = () => leaveStep?.();

  const sheet = (title, body, yes, no, onYes) => {
    $("#lsheet").innerHTML =
      `<div class="lback" id="lback"><div class="lsh" role="dialog" aria-modal="true"><h3>${title}</h3><p>${body}</p><div class="lshb"><button class="lbtn ghost" id="lno">${no}</button><button class="lbtn" id="lyes">${yes}</button></div></div></div>`;
    const close = () => ($("#lsheet").innerHTML = "");
    $("#lno").onclick = close;
    $("#lback").onclick = (e) => e.target.id === "lback" && close();
    $("#lyes").onclick = () => {
      close();
      onYes();
    };
  };

  // ---- 1. walkthrough ----
  function drawLearn() {
    const w = lab.walk;
    $("#lbody").innerHTML = `<article class="lread">
      <section class="ltask"><h2>${T.task}</h2><div class="md">${md(lab.task)}</div></section>
      ${
        w
          ? `<div class="md wintro">${walkMd(w.intro)}</div>
        <ol class="wsteps">${w.steps.map((s, i) => `<li class="wstep" id="ws${i + 1}"><span class="wnum">${T.step(i + 1)}</span><h2>${mdInline(s.title)}</h2><div class="md">${walkMd(s.body)}</div></li>`).join("")}</ol>
        ${w.whole ? `<details class="wwhole"><summary>${T.whole}</summary><div class="md">${walkMd(w.whole)}</div><button class="lbtn ghost" id="wrun">${icon.bolt13}<span>${T.wholeRun}</span></button><div class="lres wres" id="wres" hidden></div></details>` : ""}`
          : `<p class="sub">${T.noWalk}</p>`
      }
      ${lab.experiment ? `<details class="lsec lexp"><summary><h2>${T.experiment}</h2><span class="sub">${T.experimentSub}</span></summary><div class="md">${md(lab.experiment)}</div></details>` : ""}
      <button class="lbtn big" id="readNext">${T.readNext} ${icon.arrow}</button>
    </article>`;
    $("#readNext").onclick = () => {
      saveLab(id, { read: true });
      go("do");
    };
    const wrun = $("#wrun");
    if (wrun)
      wrun.onclick = async () => {
        wrun.disabled = true;
        const { runLab } = await import("../labs/run.js");
        const r = await runLab({
          code: lab.solution,
          test: lab.test,
          shared: lab.shared,
          labModule: lab.module,
        });
        wrun.disabled = false;
        const box = $("#wres");
        if (!box) return;
        box.hidden = false;
        box.innerHTML = resultsHtml(T, EX.orig, r);
      };
  }

  // ---- 2. repeat: task and hints on the left, editor and tests on the right ----
  function drawDo() {
    const wide = matchMedia("(min-width: 1100px)");
    let pane = wide.matches ? "all" : "task";
    let editor = null;
    let file = "code";
    let results = null;
    let busy = false;
    const e = ex();
    const rec = labRec(e.key);
    const draftKey = "lab.draft." + e.key;
    const draft = local.get(draftKey);
    let code = draft && (!rec?.code || draft.at > (rec.at || 0)) ? draft.code : rec?.code || e.stub;
    let synced = rec?.code || e.stub; // just opening doesn't start it
    let solSeen = !!rec?.sol;
    const hintsKey = "lab.hints." + e.key;
    let hintsShown = local.get(hintsKey) || 0;

    const taskHtml =
      exKey === "repeat"
        ? `<h2 class="extitle">${mdInline(e.title)}</h2><div class="md">${md(e.task)}${e.intro.map(md).join("")}</div>
          ${e.checks.length ? `<section class="lsec"><h2>${T.checks}</h2><ul class="checks">${e.checks.map((c) => `<li>${c.title ? `<b>${mdInline(c.title)}</b> ` : ""}${mdInline(c.body)}</li>`).join("")}</ul></section>` : ""}
          ${e.hints.length ? `<section class="lsec"><h2>${T.hints}</h2><ol class="hints" id="hints"></ol><button class="lbtn ghost" id="hintBtn"></button></section>` : ""}`
        : `<h2 class="extitle">${esc(lab.title)}</h2><p class="sub">${T.exOrigNote}</p><div class="md">${md(lab.task)}</div>
          <section class="lsec"><h2>${T.checks}</h2><ul class="checks">${lab.edges.map((x) => `<li><b>${mdInline(x.title.replace(/[.:]$/, ""))}</b> ${mdInline(x.body)}</li>`).join("")}</ul></section>`;
    $("#lbody").innerHTML = `<div class="ldo" id="ldo">
      <nav class="lpanes" id="lpanes">${["task", "code", "tests"].map((p) => `<button data-p="${p}">${T["pane" + p[0].toUpperCase() + p.slice(1)]}<span class="pbadge" id="pb-${p}"></span></button>`).join("")}</nav>
      <div class="lgrid">
        <article class="lmat" data-pane="task">
          ${EX.repeat ? `<div class="exsw" role="tablist"><button data-ex="repeat" class="${exKey === "repeat" ? "on" : ""}">${T.exRepeat}</button><button data-ex="orig" class="${exKey === "orig" ? "on" : ""}">${T.exOrig}</button></div>` : ""}
          ${taskHtml}
          ${lab.walk ? `<p class="peek"><a href="#lab/${id}/learn" id="peek">${T.peek} →</a></p>` : ""}
          <button class="lbtn gocode" id="gocode">${T.toCode} ${icon.arrow}</button>
        </article>
        <section class="lwork">
          <div class="ledit" data-pane="code">
            <div class="lbar2">
              <div class="ftabs" id="ftabs"></div>
              <span class="sp"></span>
              <span class="lsaved" id="lsaved"></span>
              <button class="lbtn ghost" id="lmore" aria-haspopup="true" title="${T.reset} · ${T.showSol}">⋯</button>
              <button class="lbtn run" id="lrun">${icon.bolt13}<span>${T.run}</span></button>
            </div>
            <div class="lmenu" id="lmenuBox" hidden><button id="lsol">${T.showSol}</button><button id="lreset">${T.reset}</button></div>
            <div class="cm" id="cm"></div>
            <div class="lkeys">${T.keys}</div>
          </div>
          <div class="lres" data-pane="tests" id="lres"></div>
        </section>
      </div>
    </div>`;

    // exercise switch: re-renders this step with the other exercise
    document.querySelectorAll(".exsw [data-ex]").forEach(
      (b) =>
        (b.onclick = () => {
          if (b.dataset.ex === exKey) return;
          leaveStep?.();
          leaveStep = null;
          exKey = b.dataset.ex;
          local.set("lab.ex." + id, exKey);
          drawSteps();
          drawDo();
        }),
    );
    const peek = $("#peek");
    if (peek)
      peek.onclick = (ev) => {
        ev.preventDefault();
        go("learn");
      };

    // hints one at a time
    const drawHints = () => {
      const box = $("#hints"),
        btn = $("#hintBtn");
      if (!box) return;
      box.innerHTML = e.hints
        .slice(0, hintsShown)
        .map((h) => `<li>${mdInline(h)}</li>`)
        .join("");
      btn.hidden = hintsShown >= e.hints.length;
      btn.textContent = T.hintBtn(hintsShown + 1, e.hints.length);
    };
    const hb = $("#hintBtn");
    if (hb)
      hb.onclick = () => {
        hintsShown++;
        local.set(hintsKey, hintsShown);
        drawHints();
      };
    drawHints();

    // panes on narrow screens
    const setPane = (p) => {
      pane = p;
      $("#ldo").dataset.pane = p;
      document.querySelectorAll("#lpanes button").forEach((b) => b.classList.toggle("on", b.dataset.p === p));
      if (p === "code") editor?.focus();
    };
    document.querySelectorAll("#lpanes button").forEach((b) => (b.onclick = () => setPane(b.dataset.p)));
    setPane(pane);
    $("#gocode").onclick = () => {
      setPane("code");
      window.scrollTo(0, $("#lpanes").offsetTop);
    };
    const onWide = () => $("#ldo") && setPane(wide.matches ? "all" : "task");
    wide.addEventListener("change", onWide);

    // files
    const files = () => [
      ["code", e.file, T.yourCode],
      ["test", e.testFile, T.testsFile],
      ["shared", "fake-client.ts", T.fake],
      ...(solSeen ? [["solution", `solutions/${e.module}.ts`, T.solution]] : []),
    ];
    const drawTabs = () => {
      $("#ftabs").innerHTML = files()
        .map(
          ([k, name, hint]) =>
            `<button data-f="${k}" class="${k === file ? "on" : ""}${k === "solution" ? " sol" : ""}${k !== "code" ? " ro" : ""}" title="${esc(name)} · ${esc(hint)}${k !== "code" ? ` · ${T.readOnly}` : ""}">${k === "solution" ? T.solution : esc(name.split("/").pop())}</button>`,
        )
        .join("");
      document.querySelectorAll("#ftabs [data-f]").forEach((b) => (b.onclick = () => openFile(b.dataset.f)));
    };
    const source = (k) => ({ code, test: e.test, shared: lab.shared, solution: e.solution })[k];
    const openFile = (k) => {
      file = k;
      editor?.setValue(source(k));
      editor?.setReadOnly(k !== "code");
      drawTabs();
    };
    let saveT = null;
    const saveSoon = () => {
      clearTimeout(saveT);
      $("#lsaved").textContent = "";
      saveT = setTimeout(() => {
        local.set(draftKey, { code, at: Date.now() });
        const s = $("#lsaved");
        if (s) s.textContent = T.saved;
      }, 400);
    };
    const sync = (extra = {}) => {
      if (code === synced && !("passed" in extra) && !extra.solution) return;
      synced = code;
      return saveLab(e.key, { code, at: Date.now(), ...extra });
    };
    leaveStep = () => {
      wide.removeEventListener("change", onWide);
      clearTimeout(saveT);
      local.set(draftKey, { code, at: Date.now() });
      sync();
    };

    const drawResults = () => {
      $("#lres").innerHTML = resultsHtml(T, e, results);
      $("#pb-tests").textContent = results ? `${results.passed}/${results.total}` : "";
    };
    async function runTests() {
      if (busy) return;
      busy = true;
      const btn = $("#lrun");
      btn.disabled = true;
      btn.querySelector("span").textContent = T.running;
      if (file !== "code") openFile("code");
      const { runLab } = await import("../labs/run.js");
      const r = await runLab({ code, test: e.test, shared: lab.shared, labModule: e.module });
      busy = false;
      if (!$("#lrun")) return;
      results = r;
      btn.disabled = false;
      btn.querySelector("span").textContent = T.run;
      local.set(draftKey, { code, at: Date.now() });
      drawResults();
      if (pane === "code") setPane("tests");
      Promise.resolve(sync({ passed: r.passed, total: r.total })).then(() => $("#lsteps") && drawSteps());
    }
    $("#lrun").onclick = runTests;

    // menu: reference and start over
    const menu = $("#lmenuBox");
    $("#lmore").onclick = (ev) => {
      ev.stopPropagation();
      menu.hidden = !menu.hidden;
    };
    $("#ldo").addEventListener("click", (ev) => {
      if (!ev.target.closest("#lmenuBox, #lmore")) menu.hidden = true;
    });
    const openSolution = () => {
      solSeen = true;
      saveLab(e.key, { solution: true });
      if (pane !== "all") setPane("code");
      openFile("solution");
    };
    $("#lsol").onclick = () => {
      menu.hidden = true;
      const green = results ? results.ok : isGreen(labRec(e.key));
      if (green || solSeen) openSolution();
      else sheet(T.solTitle, T.solBody, T.solOpen, T.solBack, openSolution);
    };
    $("#lreset").onclick = () => {
      menu.hidden = true;
      sheet(T.resetTitle, T.resetBody, T.resetYes, T.cancel, async () => {
        code = e.stub;
        synced = e.stub;
        results = null;
        solSeen = false;
        local.set(draftKey, { code, at: Date.now() });
        await resetLabProgress(e.key);
        openFile("code");
        drawResults();
        drawSteps();
      });
    };

    drawResults();
    import("../../vendor/codemirror.js").then(({ createEditor }) => {
      if (!$("#cm") || step !== "do") return;
      editor = createEditor($("#cm"), {
        doc: code,
        onChange: (v) => {
          if (file !== "code") return;
          code = v;
          saveSoon();
        },
        onRun: () => runTests(),
      });
      drawTabs();
    });
  }

  // ---- 3. interview: the production scenario out loud, an AI review and a model answer ----
  function drawTalk() {
    const strong = lab.walk?.talk || "";
    $("#lbody").innerHTML = `<section class="lread lprod">
      <h2>${T.prod}</h2>
      <blockquote>${mdInline(lab.scenario)}</blockquote>
      <p class="sub">${T.prodSub}</p>
      <textarea id="pans" placeholder="${T.ansPh}"></textarea>
      <div class="prow">${canDictate ? `<button class="lbtn ghost" id="pdict">${icon.mic14}<span>${T.speak}</span></button>` : ""}${state.db.explain && state.live ? `<button class="lbtn" id="pai">${icon.spark}<span>${T.aiCheck}</span></button>` : ""}</div>
      <div class="v-exam" id="pgrade"></div>
      ${strong ? `<details class="wwhole" id="strong"><summary>${T.model}</summary><div class="md">${walkMd(strong)}</div></details>` : ""}
    </section>`;
    const ta = $("#pans");
    ta.value = local.get("lab.answer." + id) || "";
    ta.oninput = () => local.set("lab.answer." + id, ta.value);
    let rec2 = null;
    const pd = $("#pdict");
    if (pd)
      pd.onclick = () => {
        if (rec2) {
          rec2.stop();
          rec2 = null;
          pd.classList.remove("rec");
          pd.querySelector("span").textContent = T.speak;
          ta.oninput();
          return;
        }
        rec2 = dictate((final, interim) => (ta.value = final + interim), {
          initial: ta.value,
          onEnd: () => rec2 && pd.click(),
        });
        pd.classList.add("rec");
        pd.querySelector("span").textContent = T.stop;
      };
    leaveStep = () => rec2?.stop();
    $("#strong")?.addEventListener("toggle", () => {
      if (!labRec(id)?.talk) saveLab(id, { talk: true }).then?.(() => $("#lsteps") && drawSteps());
    });
    const pai = $("#pai");
    if (pai)
      pai.onclick = async () => {
        const text = ta.value.trim();
        pai.disabled = true;
        pai.querySelector("span").textContent = T.checking;
        // graded against the walkthrough's model answer (or the lab's edge cases); stored as an interview answer
        const ref = [
          { q: lab.scenario, t: strong || lab.edges.map((x) => `${x.title} ${x.body}`).join(" ") },
        ];
        const topic = `${T.lab} ${lab.id} · ${lab.title}`;
        const t = { n: lab.tickets[0], ru: { topic, kill: "" }, en: { topic, kill: "" } };
        const j = await checkAnswer(t, text, { kind: "interview", qs: [lab.scenario], ref });
        pai.disabled = false;
        pai.querySelector("span").textContent = T.aiCheck;
        $("#pgrade").innerHTML = j.error ? `<div class="grade err">${esc(j.error)}</div>` : gradeHtml(j);
        if (!j.error) saveLab(id, { talk: true }).then?.(() => $("#lsteps") && drawSteps());
      };
  }

  history.replaceState(null, "", `#lab/${id}/${step}`);
  pageview(`lab/${id}/${step}`);
  drawSteps();
  ({ learn: drawLearn, do: drawDo, talk: drawTalk })[step]();
}
