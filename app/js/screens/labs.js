// Labs (#labs, #lab/<id>): practice for the tickets in code. Each lab is a small TypeScript task with failing
// tests for the edge cases that break LLM products in production; the tests run in the browser (js/labs/run.js),
// the code and the results sync with the rest of progress (lib/labs.js). Sources: labs/ → scripts/build-labs.mjs.
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
    tabLessons: "Разборы",
    tabLabs: "Лабы",
    h1: "Лабы",
    lead: "Практика к билетам кодом. В каждой лабе маленькая задача на TypeScript и готовые тесты на пограничные случаи, которые ломают LLM-продукты в проде. Твоя задача: сделать тесты зелёными. Код пишешь и запускаешь прямо здесь, сеть и API-ключ не нужны: модель в тестах скриптованная.",
    lab: "Лаба",
    tests: (n) => `${n} ${plural(n, "тест", "теста", "тестов")}`,
    notStarted: "не начата",
    inProgress: (p, t) => `${p}/${t} тестов`,
    green: "пройдена",
    tickets: "Билеты",
    task: "Задача",
    edges: "Что ломается в проде",
    edgesSub: "Каждый пункт проверяет хотя бы один тест. Это и есть вопросы, на которых валятся.",
    note: "Для интервью",
    experiment: "Живой эксперимент",
    experimentSub: "по желанию, с настоящим API у себя локально",
    prod: "Прод-сценарий",
    prodSub:
      "Ответь как на интервью, 60–90 секунд: вслух или текстом. Лучше после того, как тесты позеленеют: ответ опирается на код, который ты написал.",
    ansPh: "Твой ответ: где ищешь, в каком порядке, что меняешь…",
    speak: "Говорить",
    stop: "Стоп",
    aiCheck: "Разобрать с ИИ",
    checking: "Проверяю…",
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
      "Тесты ещё не зелёные. Правило лабы: сначала минут 40 честных попыток, эталон, когда застрял или когда всё прошло. Иначе код в голове не останется.",
    solOpen: "Открыть",
    solBack: "Ещё попробую",
    resetTitle: "Начать лабу заново?",
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
    hideCode: "Скрыть код",
    solSeen: "эталон открыт",
    saved: "сохранено",
    paneTask: "Задача",
    paneCode: "Код",
    paneTests: "Тесты",
    paneTalk: "Интервью",
    keys: "⌘/Ctrl + Enter — запустить",
    loadErr: "Не удалось загрузить лабу. Проверь сеть и обнови страницу.",
    practice: "Практика кодом",
    labOf: (id, title) => `Лаба ${id} · ${title}`,
    continueLab: "Продолжить лабу",
    toCode: "Писать код",
  },
  en: {
    tabLessons: "Lessons",
    tabLabs: "Labs",
    h1: "Labs",
    lead: "Hands-on practice for the tickets. Each lab is a small TypeScript task with ready tests for the edge cases that break LLM products in production. Your job: make the tests green. You write and run the code right here; no network or API key needed, the model in the tests is scripted. Lab texts are in Russian.",
    lab: "Lab",
    tests: (n) => `${n} ${n === 1 ? "test" : "tests"}`,
    notStarted: "not started",
    inProgress: (p, t) => `${p}/${t} tests`,
    green: "passed",
    tickets: "Tickets",
    task: "Task",
    edges: "What breaks in production",
    edgesSub: "Every point is checked by at least one test. These are the questions people fail on.",
    note: "For the interview",
    experiment: "Live experiment",
    experimentSub: "optional, with the real API on your machine",
    prod: "Production scenario",
    prodSub:
      "Answer like in an interview, 60–90 seconds, out loud or typed. Best after the tests are green: the answer leans on code you wrote.",
    ansPh: "Your answer: where you look, in what order, what you change…",
    speak: "Speak",
    stop: "Stop",
    aiCheck: "Review with AI",
    checking: "Checking…",
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
      "The tests aren't green yet. The lab's rule: about 40 minutes of honest attempts first, the reference when you're stuck or done. Otherwise the code won't stick.",
    solOpen: "Open",
    solBack: "Keep trying",
    resetTitle: "Start the lab over?",
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
    hideCode: "Hide code",
    solSeen: "reference opened",
    saved: "saved",
    paneTask: "Task",
    paneCode: "Code",
    paneTests: "Tests",
    paneTalk: "Interview",
    keys: "⌘/Ctrl + Enter to run",
    loadErr: "Couldn't load the lab. Check the network and reload.",
    practice: "Practice in code",
    labOf: (id, title) => `Lab ${id} · ${title}`,
    continueLab: "Continue the lab",
    toCode: "Write the code",
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
/** labs/index.json: { block, labs: [{ id, title, tickets, total, edges }] } */
export function labIndex() {
  return (indexP ||= fetch("labs/index.json")
    .then((r) => (r.ok ? r.json() : { labs: [] }))
    .catch(() => ((indexP = null), { labs: [] })));
}
async function loadLab(id) {
  if (cache[id]) return cache[id];
  const r = await fetch(`labs/${id}.json`);
  if (!r.ok) throw new Error(r.status);
  return (cache[id] = await r.json());
}
/** Labs that practise this ticket. */
export async function labsForTicket(n) {
  return (await labIndex()).labs.filter((l) => l.tickets.includes(Number(n)));
}

/** "not started" / "7/16 tests" / "passed" for a lab, and the class for its badge. */
export function labStatus(l) {
  const r = labRec(l.id);
  if (!r) return { cls: "", txt: L().notStarted, pct: 0 };
  const t = r.total || l.total,
    p = r.passed || 0;
  if (p === t) return { cls: "g", txt: L().green, pct: 100 };
  return { cls: p ? "y" : "r", txt: L().inProgress(p, t), pct: (p / t) * 100 };
}

/** A lab as a tappable row (lessons index, ticket page). */
export function labRow(l) {
  const s = labStatus(l);
  return `<a class="labrow" href="#lab/${l.id}"><span class="lnum">${l.id}</span><span class="ltt"><b>${esc(l.title)}</b><small>${l.tickets.map((n) => `${n}. ${esc(tk(n)?.[state.lang].topic || "")}`).join(" · ")}</small><span class="lbar"><i class="${s.cls}" style="width:${s.pct}%"></i></span></span><span class="lst ${s.cls}">${s.cls === "g" && s.pct === 100 ? icon.check : ""}${esc(s.txt)}</span>${icon.chev}</a>`;
}

/** The Lessons | Labs switch at the top of both lists. */
export const learnSwitch = (on) =>
  `<nav class="lswitch" aria-label="${L().h1}"><a href="#learn" class="${on === "learn" ? "on" : ""}">${icon.book}${L().tabLessons}</a><a href="#labs" class="${on === "labs" ? "on" : ""}">${icon.pen}${L().tabLabs}</a></nav>`;

// ---- #labs ----

export async function labsIndex() {
  const view = frame(`<div class="wrap" id="main"></div>`, { scope: "v-learn", cls: "" });
  document.title = L().h1;
  const idx = await labIndex();
  if (!view.isConnected) return;
  const done = idx.labs.filter((l) => labRec(l.id)?.green).length;
  $("#main").innerHTML = `${learnSwitch("labs")}<h1 class="big">${L().h1}</h1><p class="lead">${L().lead}</p>
    <div class="sumbar"><div class="track"><div class="fill" style="width:${idx.labs.length ? Math.round((done / idx.labs.length) * 100) : 0}%"></div></div><span>${done}/${idx.labs.length} ${L().green}</span></div>
    ${idx.block ? `<div class="sech"><span>${esc(idx.block)}</span><span>${L().tests(idx.labs.reduce((a, l) => a + l.total, 0))}</span></div>` : ""}
    <div class="labs">${idx.labs.map(labRow).join("")}</div>`;
}

// ---- #lab/<id> ----

const draftKey = (id) => "lab.draft." + id;
function readDraft(id) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) || "null");
  } catch {
    return null;
  }
}
const writeDraft = (id, code) => {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify({ code, at: Date.now() }));
  } catch {}
};

/** describe title without the lab number and the ticket list: "01 tool loop: стоп-условия (билеты 2, 8)" → "стоп-условия". */
const groupTitle = (g) =>
  g
    .split(" › ")
    .at(-1)
    .replace(/^\d\d\s+/, "")
    .replace(/\s*\((билеты?|tickets?)[^)]*\)\s*$/i, "")
    .trim();

export async function labScreen(id) {
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

  // the code: the newer of this browser's draft and the synced copy, else the starter file
  const rec = labRec(id);
  const draft = readDraft(id);
  let code = draft && (!rec?.code || draft.at > (rec.at || 0)) ? draft.code : rec?.code || lab.stub;
  let synced = rec?.code || "";
  let solSeen = !!rec?.sol;
  let results = null; // last run
  const wide = matchMedia("(min-width: 1100px)");
  let pane = wide.matches ? "all" : "task";
  let file = "code"; // code | test | shared | solution
  let editor = null;

  const T = L();
  const ticketsHtml = lab.tickets
    .map((n) => `<a class="tchip" href="#t/${n}"><b>${n}</b>${esc(tk(n)?.[state.lang].topic || "")}</a>`)
    .join("");
  $("#lab").innerHTML = `
    <header class="lhead">
      <span class="kick">${T.lab} ${lab.id}</span>
      <h1>${esc(lab.title)}</h1>
      <div class="tchips">${ticketsHtml}</div>
      <div class="lprog" id="lprog"></div>
    </header>
    <nav class="lpanes" id="lpanes">${["task", "code", "tests", "talk"].map((p) => `<button data-p="${p}">${T["pane" + p[0].toUpperCase() + p.slice(1)]}<span class="pbadge" id="pb-${p}"></span></button>`).join("")}</nav>
    <div class="lgrid">
      <article class="lmat" data-pane="task">
        <section class="lsec"><h2>${T.task}</h2><div class="md">${md(lab.task)}${lab.intro.map(md).join("")}</div></section>
        <section class="lsec"><h2>${T.edges}</h2><p class="sub">${T.edgesSub}</p>
          <ol class="edges">${lab.edges.map((e, i) => `<li><span class="en">${i + 1}</span><div><b>${mdInline(e.title.replace(/[.:]$/, ""))}</b>${e.body ? `<p>${mdInline(e.body)}</p>` : ""}</div></li>`).join("")}</ol>
          ${lab.note.length ? `<div class="lnote"><span class="lbl">${T.note}</span>${lab.note.map((n) => md(n.replace(/^Для (ответа на )?интервью:\s*/i, ""))).join("")}</div>` : ""}
        </section>
        <button class="lbtn gocode" id="gocode">${T.toCode} ${icon.arrow}</button>
        ${lab.experiment ? `<details class="lsec lexp"><summary><h2>${T.experiment}</h2><span class="sub">${T.experimentSub}</span></summary><div class="md">${md(lab.experiment)}</div></details>` : ""}
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
      <section class="lprod" data-pane="talk">
        <h2>${T.prod}</h2>
        <blockquote>${mdInline(lab.scenario)}</blockquote>
        <p class="sub">${T.prodSub}</p>
        <textarea id="pans" placeholder="${T.ansPh}"></textarea>
        <div class="prow">${canDictate ? `<button class="lbtn ghost" id="pdict">${icon.mic14}<span>${T.speak}</span></button>` : ""}${state.db.explain && state.live ? `<button class="lbtn" id="pai">${icon.spark}<span>${T.aiCheck}</span></button>` : ""}</div>
        <div class="v-exam" id="pgrade"></div>
      </section>
    </div>
    <div id="lsheet"></div>`;

  // ---- progress line and pane badges ----
  const prog = () => {
    const r = labRec(id);
    const p = results ? results.passed : (r?.passed ?? 0);
    const t = results ? results.total : r?.total || lab.total;
    const green = p === t && (results ? results.ok : !!r?.green && r.passed === r.total);
    $("#lprog").innerHTML =
      `<div class="ptrack"><i class="${green ? "g" : p ? "y" : ""}" style="width:${Math.round((p / t) * 100)}%"></i></div><span>${green ? icon.check + T.allGreen : results || r?.total ? T.passed(p, t) : T.tests(lab.total)}</span>${solSeen ? `<span class="solseen">${T.solSeen}</span>` : ""}`;
    $("#pb-tests").textContent = results ? `${results.passed}/${results.total}` : "";
  };

  // ---- panes on narrow screens ----
  const setPane = (p) => {
    pane = p;
    $("#lab").dataset.pane = p;
    document.querySelectorAll("#lpanes button").forEach((b) => b.classList.toggle("on", b.dataset.p === p));
    if (p === "code") editor?.focus();
  };
  document.querySelectorAll("#lpanes button").forEach((b) => (b.onclick = () => setPane(b.dataset.p)));
  setPane(pane);
  $("#gocode").onclick = () => {
    setPane("code");
    window.scrollTo(0, $("#lpanes").offsetTop);
  };
  const onWide = () => view.isConnected && setPane(wide.matches ? "all" : "task");
  wide.addEventListener("change", onWide);

  // ---- editor and file tabs ----
  const files = () => [
    ["code", lab.file, T.yourCode],
    ["test", lab.testFile, T.testsFile],
    ["shared", "fake-client.ts", T.fake],
    ...(solSeen ? [["solution", `solutions/${lab.module}.ts`, T.solution]] : []),
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
  const source = (k) => ({ code, test: lab.test, shared: lab.shared, solution: lab.solution })[k];
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
      writeDraft(id, code);
      $("#lsaved").textContent = T.saved;
    }, 400);
  };
  const { createEditor } = await import("../../vendor/codemirror.js");
  if (!view.isConnected) return;
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

  // the synced copy is updated on every run and when leaving the lab
  const sync = (extra = {}) => {
    if (code === synced && !("passed" in extra) && !extra.solution) return;
    synced = code;
    return saveLab(id, { code, at: Date.now(), ...extra });
  };
  state.leave = () => {
    wide.removeEventListener("change", onWide);
    clearTimeout(saveT);
    writeDraft(id, code);
    sync();
  };

  // ---- results ----
  const specRows = () => {
    const groups = new Map();
    for (const t of lab.tests) {
      const g = groups.get(t.group) || [];
      g.push({ ...t, ok: null });
      groups.set(t.group, g);
    }
    return groups;
  };
  const codeOf = (group, name) => lab.tests.find((t) => t.name === name && t.group === group)?.code;
  const drawResults = () => {
    const box = $("#lres");
    let head = "";
    let groups;
    if (!results) {
      head = `<p class="rspec">${T.spec(T.tests(lab.total))}</p>`;
      groups = specRows();
    } else {
      groups = new Map();
      for (const r of results.results) {
        const g = groups.get(r.group) || [];
        g.push(r);
        groups.set(r.group, g);
      }
      head = `<div class="rsum ${results.ok ? "g" : results.passed ? "y" : "r"}"><b>${results.ok ? icon.check + T.allGreen : T.passed(results.passed, results.total)}</b><span>${results.ms ? Math.round(results.ms) + " ms" : ""}</span></div>
        ${results.compileError ? `<div class="rerr"><b>${T.compile}</b><pre>${esc(results.compileError)}</pre></div>` : ""}
        ${results.timedOut ? `<div class="rerr">${T.timedOut}</div>` : ""}
        ${results.logs?.length ? `<details class="rlogs"><summary>${T.logs(results.logs.length)}</summary><pre>${esc(results.logs.join("\n"))}</pre></details>` : ""}`;
    }
    let firstFail = true;
    box.innerHTML =
      head +
      [...groups]
        .map(
          ([g, rows]) =>
            `<div class="rgroup"><h3>${esc(groupTitle(g).replace(new RegExp(`^${lab.title}:\\s*`, "i"), ""))}</h3>${rows
              .map((r) => {
                const open = r.ok === false && firstFail;
                if (r.ok === false) firstFail = false;
                const src = codeOf(g, r.name);
                return `<details class="rt ${r.ok === null ? "n" : r.ok ? "ok" : "bad"}"${open ? " open" : ""}><summary><span class="dot"></span><span class="rn">${esc(r.name)}</span></summary>${r.error ? `<pre class="rerrtxt">${esc(r.error)}</pre>` : ""}${src ? `<details class="rsrc"><summary>${T.testCode}</summary><pre>${esc(src)}</pre></details>` : ""}</details>`;
              })
              .join("")}</div>`,
        )
        .join("");
  };

  // ---- run ----
  let busy = false;
  async function runTests() {
    if (busy) return;
    busy = true;
    const btn = $("#lrun");
    btn.disabled = true;
    btn.querySelector("span").textContent = T.running;
    if (file !== "code") openFile("code");
    const { runLab } = await import("../labs/run.js");
    const r = await runLab({ code, test: lab.test, shared: lab.shared, labModule: lab.module });
    if (!view.isConnected) return;
    results = r;
    busy = false;
    btn.disabled = false;
    btn.querySelector("span").textContent = T.run;
    writeDraft(id, code);
    drawResults();
    prog();
    if (pane === "code") setPane("tests");
    Promise.resolve(sync({ passed: r.passed, total: r.total })).then(() => view.isConnected && prog());
  }
  $("#lrun").onclick = runTests;

  // ---- menu: reference and start over ----
  const menu = $("#lmenuBox");
  $("#lmore").onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };
  view.addEventListener("click", (e) => {
    if (!e.target.closest("#lmenuBox, #lmore")) menu.hidden = true;
  });
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
  const openSolution = () => {
    solSeen = true;
    saveLab(id, { solution: true });
    if (pane !== "all") setPane("code");
    openFile("solution");
    prog();
  };
  $("#lsol").onclick = () => {
    menu.hidden = true;
    const green = results ? results.ok : !!labRec(id)?.green;
    if (green || solSeen) openSolution();
    else sheet(T.solTitle, T.solBody, T.solOpen, T.solBack, openSolution);
  };
  $("#lreset").onclick = () => {
    menu.hidden = true;
    sheet(T.resetTitle, T.resetBody, T.resetYes, T.cancel, async () => {
      code = lab.stub;
      synced = "";
      results = null;
      solSeen = false;
      writeDraft(id, code);
      await resetLabProgress(id);
      openFile("code");
      drawResults();
      prog();
    });
  };

  // ---- production scenario: answer out loud or typed, review with AI ----
  const ta = $("#pans");
  try {
    ta.value = localStorage.getItem("lab.answer." + id) || "";
  } catch {}
  ta.oninput = () => {
    try {
      localStorage.setItem("lab.answer." + id, ta.value);
    } catch {}
  };
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
  const pai = $("#pai");
  if (pai)
    pai.onclick = async () => {
      const text = ta.value.trim();
      pai.disabled = true;
      pai.querySelector("span").textContent = T.checking;
      // graded against the lab's own edge cases; stored as an interview answer (activity only, no ticket status)
      const ref = [
        {
          q: lab.scenario,
          t: lab.edges.map((e) => `${e.title} ${e.body}`).join(" ") + " " + lab.note.join(" "),
        },
      ];
      const topic = `${T.lab} ${lab.id} · ${lab.title}`;
      const t = { n: lab.tickets[0], ru: { topic, kill: "" }, en: { topic, kill: "" } };
      const j = await checkAnswer(t, text, { kind: "interview", qs: [lab.scenario], ref });
      pai.disabled = false;
      pai.querySelector("span").textContent = T.aiCheck;
      $("#pgrade").innerHTML = j.error ? `<div class="grade err">${esc(j.error)}</div>` : gradeHtml(j);
    };

  drawResults();
  prog();
}
