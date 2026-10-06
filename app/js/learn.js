const UI = {
  ru: {
    home: "Главная",
    all: "Все разборы",
    h1: "Разбор с нуля",
    lead: "Каждая тема от базы: термины, механика, пример, ловушки, самопроверка. Сначала читаешь разбор, потом отвечаешь по билету.",
    read: "прочитано",
    new: "не прочитано",
    soon: "скоро",
    why: "Зачем это спрашивают",
    toc: "Содержание",
    terms: "Термины",
    decode: "Расшифровка эталона",
    decodeh: "Фразы из эталонного ответа, которые без контекста непонятны, и что они значат.",
    check: "Самопроверка",
    checkh: "Сначала ответь сам, потом открывай.",
    src: "Источники",
    srch: "Каждый факт сверён с первоисточником.",
    ex: "Пример",
    fe: "Как во фронтенде",
    warn: "Ловушка",
    drill: "Отвечать по билету",
    mark: "Отметить прочитанным",
    marked: "Прочитано ✓",
    prev: "←",
    next: "→",
    ticket: "Билет",
    words: "мин чтения",
    err: "Не удалось загрузить разбор. Проверь сеть и обнови страницу.",
    sec: {
      llm: "LLM engineering",
      rag: "RAG",
      agents: "Агенты",
      sysd: "Системный дизайн",
      behav: "Behavioral",
      js: "JavaScript",
      ts: "TypeScript",
      react: "React",
      web: "Браузер и веб-платформа",
      bonus: "Глубина",
      parked: "Быстрая проверка JS/React",
    },
  },
  en: {
    home: "Home",
    all: "All lessons",
    h1: "From zero",
    lead: "Every topic from the ground up: terms, mechanism, example, traps, self-check. Read the lesson first, then answer the ticket.",
    read: "read",
    new: "unread",
    soon: "soon",
    why: "Why they ask",
    toc: "Contents",
    terms: "Terms",
    decode: "Decoding the reference answer",
    decodeh: "Phrases from the reference answer that don't make sense without context, and what they mean.",
    check: "Self-check",
    checkh: "Answer it yourself first, then open.",
    src: "Sources",
    srch: "Every fact checked against a primary source.",
    ex: "Example",
    fe: "Frontend parallel",
    warn: "Trap",
    drill: "Answer the ticket",
    mark: "Mark as read",
    marked: "Read ✓",
    prev: "←",
    next: "→",
    ticket: "Ticket",
    words: "min read",
    err: "Couldn't load the lesson. Check your connection and reload.",
    sec: {
      llm: "LLM engineering",
      rag: "RAG",
      agents: "Agents",
      sysd: "System design",
      behav: "Behavioral",
      js: "JavaScript",
      ts: "TypeScript",
      react: "React",
      web: "Browser and web platform",
      bonus: "Depth",
      parked: "Quick JS/React check",
    },
  },
};
const ORDER = ["llm", "rag", "agents", "sysd", "behav", "js", "ts", "react", "web", "bonus", "parked"];
const T = window.TICKETS,
  $ = (id) => document.getElementById(id),
  main = $("main");
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};
let lang = (() => {
  try {
    return localStorage.getItem("drill.lang") || "ru";
  } catch {
    return "ru";
  }
})();
const L = () => UI[lang];
let IDX = null;
const cache = {};
const readSet = () => new Set(store.get("learn.read", []));
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// Lesson text is our own reviewed content; allow only <b>, <i>, <code> inline tags, escape everything else.
const rich = (s) => esc(s).replace(/&lt;(\/?)(b|i|code)&gt;/g, "<$1$2>");
const short = (u) => {
  try {
    const x = new URL(u);
    return (x.host.replace(/^www\./, "") + x.pathname + x.hash).replace(/\/$/, "");
  } catch {
    return u;
  }
};

async function index() {
  if (IDX) return IDX;
  try {
    IDX = await (await fetch("lessons/index.json", { cache: "no-cache" })).json();
  } catch {
    IDX = {};
  }
  return IDX;
}
async function lesson(n) {
  if (cache[n]) return cache[n];
  const r = await fetch(`lessons/L${n}.json`, { cache: "no-cache" });
  if (!r.ok) throw new Error(r.status);
  return (cache[n] = await r.json());
}

function chrome(title) {
  $("lru").className = lang === "ru" ? "on" : "";
  $("len").className = lang === "en" ? "on" : "";
  document.documentElement.lang = lang;
  $("ttl").textContent = title || "";
}
function setBack(toIndex) {
  const b = $("back");
  if (toIndex) {
    b.href = "#";
    $("backt").textContent = L().all;
    b.onclick = (e) => {
      e.preventDefault();
      location.hash = "";
    };
  } else {
    b.href = "./";
    $("backt").textContent = L().home;
    b.onclick = null;
  }
}

async function renderIndex() {
  chrome("");
  setBack(false);
  document.title = L().h1;
  const idx = await index(),
    rd = readSet();
  const have = T.filter((t) => idx[t.n]),
    done = have.filter((t) => rd.has(t.n)).length;
  let h = `<div class="kick">${have.length} / ${T.length}</div><h1 class="big">${L().h1}</h1><p class="lead">${L().lead}</p>
    <div class="sumbar"><div class="track"><div class="fill" style="width:${have.length ? Math.round((done / have.length) * 100) : 0}%"></div></div><span>${done}/${have.length} ${L().read}</span></div>`;
  for (const sec of ORDER) {
    const ts = T.filter((t) => t.sec === sec);
    if (!ts.length) continue;
    h += `<div class="sech"><span>${L().sec[sec] || sec}</span><span>${ts.filter((t) => rd.has(t.n)).length}/${ts.length}</span></div><div class="tl">`;
    for (const t of ts) {
      const m = idx[t.n],
        r = rd.has(t.n);
      h += `<a class="ti${m ? "" : " none"}${r ? " read" : ""}" href="#t${t.n}"><span class="nn">${t.n}</span><span class="tt"><b>${esc(m ? m[lang]?.title || t[lang].topic : t[lang].topic)}</b>${m ? `<small>${Math.max(1, Math.round((m[lang]?.words || 0) / 170))} ${L().words}</small>` : ""}</span><span class="st">${m ? (r ? "✓ " + L().read : L().new) : L().soon}</span></a>`;
    }
    h += `</div>`;
  }
  main.innerHTML = h;
  window.scrollTo(0, 0);
  prog();
}

function block(b) {
  if (typeof b === "string") return `<p>${rich(b)}</p>`;
  if (b.code != null)
    return `<pre>${b.lang ? `<span class="lang">${esc(b.lang)}</span>` : ""}<code>${esc(b.code)}</code></pre>`;
  if (b.list) return `<ul class="b">${b.list.map((x) => `<li>${rich(x)}</li>`).join("")}</ul>`;
  if (b.ol) return `<ol class="b">${b.ol.map((x) => `<li>${rich(x)}</li>`).join("")}</ol>`;
  for (const k of ["ex", "fe", "warn"])
    if (b[k] != null) return `<div class="box ${k}"><span class="lbl">${L()[k]}</span>${rich(b[k])}</div>`;
  if (b.table)
    return `<div class="tw"><table><thead><tr>${b.table.head.map((x) => `<th>${rich(x)}</th>`).join("")}</tr></thead><tbody>${b.table.rows.map((r) => `<tr>${r.map((x) => `<td>${rich(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  return "";
}

async function renderLesson(n) {
  const t = T.find((x) => x.n === n);
  if (!t) {
    location.hash = "";
    return;
  }
  setBack(true);
  chrome(`${L().ticket} ${n} · ${t[lang].topic}`);
  let Ld;
  try {
    Ld = await lesson(n);
  } catch {
    main.innerHTML = `<div class="empty">${L().err}</div>`;
    return;
  }
  const x = Ld[lang] || Ld.ru;
  document.title = x.title;
  const extra = [
    ["terms", L().terms],
    ...(x.decode?.length ? [["decode", L().decode]] : []),
    ["check", L().check],
    ["src", L().src],
  ];
  const rd = readSet(),
    idx = await index();
  const have = T.filter((k) => idx[k.n]);
  const pos = have.findIndex((k) => k.n === n);
  const prev = have[pos - 1],
    next = have[pos + 1];
  main.innerHTML = `
    <div class="kick">${L().ticket} ${n} · ${esc(t[lang].topic)}</div>
    <h1 class="big">${esc(x.title)}</h1>
    <div class="why"><span class="lbl">${L().why}</span>${rich(x.why)}</div>
    <details class="toc"><summary>${L().toc} ▾</summary><ol>${x.sections.map((s, i) => `<li><a href="#s${i}" data-j="s${i}">${esc(s.h)}</a></li>`).join("")}${extra.map(([id, h]) => `<li><a href="#${id}" data-j="${id}">${h}</a></li>`).join("")}</ol></details>
    ${x.sections.map((s, i) => `<section class="ls" id="s${i}"><h2><span class="sn">${i + 1}</span>${esc(s.h)}</h2>${s.body.map(block).join("")}</section>`).join("")}
    <section class="ls" id="terms"><h2>${L().terms}</h2><dl class="terms">${x.terms.map((d) => `<dt>${rich(d.t)}</dt><dd>${rich(d.d)}</dd>`).join("")}</dl></section>
    ${x.decode?.length ? `<section class="ls" id="decode"><h2>${L().decode}</h2><p class="hintline">${L().decodeh}</p>${x.decode.map((d) => `<div class="dec"><q>${esc(d.s)}</q><div>${rich(d.m)}</div></div>`).join("")}</section>` : ""}
    <section class="ls" id="check"><h2>${L().check}</h2><p class="hintline">${L().checkh}</p>${x.check.map((c, i) => `<details class="chk"><summary><span class="qn">${i + 1}</span><span>${rich(c.q)}</span></summary><div class="a">${rich(c.a)}</div></details>`).join("")}</section>
    <section class="ls" id="src"><h2>${L().src}</h2><p class="hintline">${L().srch}</p><ol class="srcs">${(Ld.sources || []).map((s) => `<li>${esc(s.claim)}${s.quote ? ` — <i>${esc(s.quote)}</i>` : ""}<br><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(short(s.url))}</a></li>`).join("")}</ol></section>
    <div class="end"><button id="mk" class="${rd.has(n) ? "done" : ""}">${rd.has(n) ? L().marked : L().mark}</button><a class="pri" href="exam-tickets.html#t${n}">${L().drill} →</a></div>
    <div class="nav2">${prev ? `<a href="#t${prev.n}">${L().prev} ${prev.n}. ${esc(idx[prev.n][lang]?.title || prev[lang].topic)}</a>` : "<span></span>"}${next ? `<a href="#t${next.n}" style="text-align:right">${next.n}. ${esc(idx[next.n][lang]?.title || next[lang].topic)} ${L().next}</a>` : ""}</div>`;
  // in-page anchors: scroll without touching the router hash
  main.querySelectorAll("a[data-j]").forEach(
    (a) =>
      (a.onclick = (e) => {
        e.preventDefault();
        document.getElementById(a.dataset.j)?.scrollIntoView({ behavior: "smooth" });
      }),
  );
  $("mk").onclick = () => {
    const s = readSet();
    s.has(n) ? s.delete(n) : s.add(n);
    store.set("learn.read", [...s]);
    const on = s.has(n);
    $("mk").className = on ? "done" : "";
    $("mk").textContent = on ? L().marked : L().mark;
  };
  if (!keepScroll) window.scrollTo(0, 0);
  keepScroll = false;
  prog();
}

let keepScroll = false;
function route() {
  const m = location.hash.match(/^#t(\d+)$/);
  m ? renderLesson(+m[1]) : renderIndex();
}
function prog() {
  const h = document.documentElement;
  const max = h.scrollHeight - h.clientHeight;
  $("prog").style.width =
    (max > 0 && /^#t\d+$/.test(location.hash) ? Math.min(100, (h.scrollTop / max) * 100) : 0) + "%";
}
addEventListener("scroll", prog, { passive: true });
addEventListener("hashchange", route);
for (const [id, l] of [
  ["lru", "ru"],
  ["len", "en"],
])
  $(id).onclick = () => {
    if (lang === l) return;
    const y = scrollY / Math.max(1, document.documentElement.scrollHeight);
    lang = l;
    try {
      localStorage.setItem("drill.lang", l);
    } catch {}
    keepScroll = /^#t\d+$/.test(location.hash);
    route();
    if (keepScroll) setTimeout(() => scrollTo(0, y * document.documentElement.scrollHeight), 0);
  };
route();
