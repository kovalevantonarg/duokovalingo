// ---------- plan data: dates are facts or the plan's own targets (pivot reframe 2026-05-30) ----------
const START = "2026-04-14",
  RANGE = ["2026-04-01", "2027-03-01"],
  CHECKPOINT = "2026-10-01",
  FINISH = 0.8;
const BANDS = [
  // lane 0 = learning (planned windows), lane 1 = job search
  {
    lane: 0,
    from: "2026-05-30",
    to: "2026-07-10",
    ru: "Фундамент",
    en: "Foundations",
    full: {
      ru: "Фаза 1: LLM API, промпты, structured output, tool use, простой RAG",
      en: "Phase 1: LLM API, prompting, structured output, tool use, simple RAG",
    },
  },
  {
    lane: 0,
    from: "2026-07-10",
    to: "2026-09-05",
    ru: "Глубина",
    en: "Depth",
    full: {
      ru: "Фаза 2: RAG, агенты, эвалы, research-агент как капстоун",
      en: "Phase 2: RAG, agents, evals, research agent as the capstone",
    },
  },
  {
    lane: 0,
    from: "2026-09-05",
    to: "2026-10-10",
    ru: "Прод + SD",
    en: "Prod + SD",
    full: {
      ru: "Фаза 3: прод, наблюдаемость, стоимость, system design",
      en: "Phase 3: production, observability, cost, system design",
    },
  },
  { lane: 1, from: "2026-08-11", to: "2026-10-31", ru: "Заявки", en: "Applying", cls: "job" },
  { lane: 1, from: "2026-11-01", to: "2027-02-28", ru: "Цель: оффер", en: "Goal: offer", cls: "offer" },
];
// fixed:true = already happened. Others are tapped done by you (saved to your progress).
const MS = [
  { k: "pivot-start", d: "2026-04-14", fixed: true, ru: "Публичный старт пивота", en: "Public pivot starts" },
  {
    k: "p1-ship",
    d: "2026-05-18",
    fixed: true,
    ru: "Bro Code Chat в проде, эвалы 9/9",
    en: "Bro Code Chat live, evals 9/9",
  },
  {
    k: "reframe",
    d: "2026-05-30",
    fixed: true,
    ru: "Глубина вместо дедлайна 90 дней",
    en: "Depth over the 90-day deadline",
  },
  {
    k: "reanchor",
    d: "2026-08-11",
    fixed: true,
    ru: "Правило: сначала заявки, потом дриллы",
    en: "Rule: applications first, drilling around them",
  },
  {
    k: "app-live",
    d: "2026-09-22",
    fixed: true,
    ru: "duokovalingo в проде, 50 билетов",
    en: "duokovalingo live, 50 tickets",
  },
  {
    k: "p2-demo",
    d: "2026-09-25",
    ru: "Research-агент: демо end-to-end",
    en: "Research agent: end-to-end demo",
  },
  {
    k: "first-app",
    d: "2026-09-26",
    ru: "Первая заявка: Resend, Product Engineer",
    en: "First application: Resend, Product Engineer",
  },
  { k: "triage", d: "2026-09-30", ru: "Core-40 оттриажен (1–3)", en: "Core-40 triaged (1–3)" },
  {
    k: "checkpoint",
    d: CHECKPOINT,
    auto: true,
    ru: "Чекпойнт: 5 заявок, 2 интервью, 12 уверенно",
    en: "Checkpoint: 5 applications, 2 interviews, 12 cold",
  },
  {
    k: "tier2",
    d: "2026-10-31",
    ru: "Tier-2 заявки с демо агента",
    en: "Tier-2 applications with the agent demo",
  },
  { k: "offer", d: "2027-01-15", ru: "Оффер", en: "Offer" },
];
const STAGES = [
  {
    ru: "Фундамент фронта · твоя база, но recall",
    en: "Frontend core · your base, but recall",
    secs: ["js", "ts", "react", "web"],
  },
  { ru: "Фаза 1 · LLM", en: "Phase 1 · LLM", secs: ["llm"] },
  { ru: "Фаза 2 · RAG и агенты", en: "Phase 2 · RAG and agents", secs: ["rag", "agents"] },
  { ru: "Фаза 3 · System design", en: "Phase 3 · System design", secs: ["sysd"] },
  { ru: "Всегда · Behavioral", en: "Always · Behavioral", secs: ["behav"] },
];
const SEC = {
  llm: "LLM",
  rag: "RAG",
  agents: "Agents",
  sysd: "System design",
  behav: "Behavioral",
  js: "JavaScript",
  ts: "TypeScript",
  react: "React",
  web: "Browser",
  bonus: "Depth",
  meta: "Meta",
};

const UI = {
  ru: {
    eyebrow: "Роадмап",
    title: (a, b) => `${a} <span class="to">→</span> ${b}`,
    from: "Апрель 2026",
    to: "оффер",
    lede: "Откуда идём, где мы сейчас и что дальше. Прогресс берётся из твоих ответов в тренажёре, отметки ставишь сам.",
    day: "день с начала пивота",
    ready: "билетов уверенно",
    apps: "заявок отправлено",
    next: "Следующий шаг",
    nextR: "одно внешнее событие, одно повторение",
    ext: "Наружу",
    drill: "Повтор",
    appT: (n) => (n === 0 ? "Отправить первую заявку" : `Отправить заявку №${n + 1}`),
    appS: (n) =>
      n === 0
        ? "Resend, Product Engineer, Americas/Remote. Не идеальная, а отправленная."
        : "Firecrawl, Supabase или HN «Who is hiring» с фильтром REMOTE + TypeScript + LLM.",
    sent: "Отправил +1",
    dueT: (n) =>
      n
        ? `${n} ${pl(n, "карточка ждёт", "карточки ждут", "карточек ждут")} повторения`
        : "Повторений на сегодня нет",
    dueS: (n) =>
      n ? "Интервальное повторение: сегодня самые просроченные." : "Возьми новый билет из стены.",
    open: "Открыть",
    tl: "Таймлайн",
    tlR: "пунктир — план, сплошное — сделано",
    lane0: "учёба · план",
    lane1: "поиск работы",
    today: "сегодня",
    msDone: "Сделано",
    msMark: "Отметить",
    msAuto: "считается само",
    late: (n) => `просрочено на ${n} ${pl(n, "день", "дня", "дней")}`,
    left: (n) => `через ${n} ${pl(n, "день", "дня", "дней")}`,
    cp: "Чекпойнт",
    cpR: (d) => `до ${d}`,
    gApps: "заявок",
    gInt: "интервью-репов",
    gCold: "билетов уверенно",
    gSess: "сессий за 14 дней",
    liveTag: "из тренажёра",
    map: "Карта знаний",
    mapR: "нажми на трек, чтобы увидеть билеты",
    readyH: "Готовность",
    readyD:
      "доля активных билетов на «уверенно». Финиш из плана: 80%, остальное вытянешь рассуждением вслух.",
    fin: "финиш 80%",
    g: "уверенно",
    y: "шатко",
    r: "мимо",
    n: "не открывал",
    parked: (n) =>
      `${n} ${pl(n, "билет запаркован", "билета запаркованы", "билетов запарковано")} и в расчёт не входят.`,
    offline: "Прогресс не загрузился: войди в тренажёре, и роадмап подтянет его.",
    login: "Войти",
    cantSave: "Нет связи с сервером: отметки сейчас не сохранятся.",
  },
  en: {
    eyebrow: "Roadmap",
    title: (a, b) => `${a} <span class="to">→</span> ${b}`,
    from: "April 2026",
    to: "an offer",
    lede: "Where we came from, where we are, what's next. Progress comes from your answers in the trainer; milestones you tick yourself.",
    day: "days since the pivot started",
    ready: "tickets cold",
    apps: "applications sent",
    next: "Next step",
    nextR: "one external event, one review",
    ext: "Outside",
    drill: "Review",
    appT: (n) => (n === 0 ? "Send the first application" : `Send application #${n + 1}`),
    appS: (n) =>
      n === 0
        ? "Resend, Product Engineer, Americas/Remote. A sent one beats a perfect one."
        : "Firecrawl, Supabase, or HN Who is hiring filtered REMOTE + TypeScript + LLM.",
    sent: "Sent +1",
    dueT: (n) => (n ? `${n} card${n > 1 ? "s" : ""} due for review` : "Nothing due today"),
    dueS: (n) => (n ? "Spaced repetition: the most overdue first." : "Pick a new ticket from the wall."),
    open: "Open",
    tl: "Timeline",
    tlR: "dashed is the plan, solid is done",
    lane0: "learning · plan",
    lane1: "job search",
    today: "today",
    msDone: "Done",
    msMark: "Mark",
    msAuto: "computed",
    late: (n) => `${n} day${n > 1 ? "s" : ""} late`,
    left: (n) => `in ${n} day${n > 1 ? "s" : ""}`,
    cp: "Checkpoint",
    cpR: (d) => `by ${d}`,
    gApps: "applications",
    gInt: "interview reps",
    gCold: "tickets cold",
    gSess: "sessions in 14 days",
    liveTag: "from the trainer",
    map: "Knowledge map",
    mapR: "tap a track to see its tickets",
    readyH: "Readiness",
    readyD:
      "share of active tickets at cold. The plan's finish line is 80%; the rest you reason through out loud.",
    fin: "finish 80%",
    g: "cold",
    y: "shaky",
    r: "missed",
    n: "never opened",
    parked: (n) => `${n} parked ticket${n > 1 ? "s are" : " is"} not counted.`,
    offline: "Progress didn't load: sign in to the trainer and the roadmap will pick it up.",
    login: "Sign in",
    cantSave: "No connection to the server: marks won't be saved right now.",
  },
};

let lang = (() => {
  try {
    return localStorage.getItem("drill.lang") || "ru";
  } catch {
    return "ru";
  }
})();
let DB = { items: [], history: [] },
  live = false,
  needLogin = false,
  open = new Set();
const L = () => UI[lang],
  $ = (s) => document.querySelector(s),
  app = $("#app");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function pl(n, a, b, c) {
  const m = n % 10,
    h = n % 100;
  return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c;
}
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = iso(new Date());
const D = (s) => new Date(s + "T12:00:00");
const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 864e5);
const pct = (s) => Math.max(0, Math.min(100, ((D(s) - D(RANGE[0])) / (D(RANGE[1]) - D(RANGE[0]))) * 100));
const fmtD = (s) =>
  D(s).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "short" });
const RM = () => DB.roadmap || { marks: {}, counts: {} };
const count = (k) => (RM().counts || {})[k] || 0;

async function load() {
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.ok) {
      DB = await r.json();
      live = true;
    } else if (r.status === 401) needLogin = true;
  } catch {}
  // make sure every ticket's item exists (same rule as the trainer)
  const miss = [];
  for (const t of window.TICKETS || []) {
    if (t.sec === "parked") continue;
    for (const id of t.core || [])
      if (!DB.items.some((i) => i.id === id) && !miss.some((m) => m.id === id))
        miss.push({ id, s: t.sec, t: t.en.topic });
  }
  if (miss.length && live) {
    try {
      const r = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: miss }),
      });
      if (r.ok) DB = await r.json();
    } catch {}
  } else for (const m of miss) DB.items.push({ ...m, st: "new" });
}
async function save(body) {
  if (!live) {
    alert(L().cantSave);
    return;
  }
  try {
    const r = await fetch("/api/roadmap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      DB = await r.json();
      render();
    }
  } catch {
    alert(L().cantSave);
  }
}

// ---------- derived numbers ----------
function numbers() {
  const active = DB.items.filter((i) => i.st !== "parked" && i.s !== "meta" && i.s !== "bonus");
  const by = (s) => active.filter((i) => i.st === s).length;
  const intervals = { red: 1, yellow: 3, green: 7 };
  const ivOf = (i) => i.iv || intervals[i.st];
  const due = DB.items.filter((i) => i.last && ivOf(i) && daysBetween(i.last, TODAY) >= ivOf(i)).length;
  const sess = (DB.history || []).filter(
    (h) => daysBetween(h.d, TODAY) <= 13 && h.ids && h.ids.length,
  ).length;
  return {
    active,
    g: by("green"),
    y: by("yellow"),
    r: by("red"),
    n: by("new"),
    total: active.length,
    parked: DB.items.filter((i) => i.st === "parked").length,
    due,
    sess,
    apps: count("applications"),
    ints: count("interviews"),
  };
}
function msState(m, N) {
  if (m.fixed) return { ok: true, date: m.d };
  if (m.auto) {
    const ok = N.apps >= 5 && N.ints >= 2 && N.g >= 12;
    return { ok, date: ok ? TODAY : null };
  }
  const d = (RM().marks || {})[m.k];
  return { ok: !!d, date: d || null };
}

// ---------- render ----------
function render() {
  document.documentElement.lang = lang;
  $("#ru").className = lang === "ru" ? "on" : "";
  $("#en").className = lang === "en" ? "on" : "";
  const N = numbers();
  const readiness = N.total ? N.g / N.total : 0;
  let h = `<div class="eyebrow">${L().eyebrow}</div><h1>${L().title(L().from, L().to)}</h1><p class="lede">${L().lede}</p>`;
  if (needLogin || (!live && !DB.items.length))
    h += `<div class="banner">${L().offline} <a href="./">${L().login} →</a></div>`;
  h += `<div class="stats">
    <div class="stat"><div class="v">${daysBetween(START, TODAY)}</div><div class="l">${L().day}</div></div>
    <div class="stat"><div class="v">${N.g}<small>/${N.total}</small></div><div class="l">${L().ready}</div></div>
    <div class="stat"><div class="v">${N.apps}</div><div class="l">${L().apps}</div></div></div>`;

  // next step: the external event first, then the review
  h += `<div class="sec"><span>${L().next}</span><span class="r">${L().nextR}</span></div><div class="next">
    <div class="nrow hot"><div class="k">${L().ext}</div><div class="b"><div>${L().appT(N.apps)}</div><small>${L().appS(N.apps)}</small></div><button class="btn" id="sent" ${live ? "" : "disabled"}>${L().sent}</button></div>
    <div class="nrow"><div class="k">${L().drill}</div><div class="b"><div>${L().dueT(N.due)}</div><small>${L().dueS(N.due)}</small></div><a class="btn ghost" href="./">${L().open}</a></div></div>`;

  // timeline
  const lastDone = Math.max(
    ...MS.map((m) => {
      const s = msState(m, N);
      return s.ok ? pct(s.date || m.d) : 0;
    }),
  );
  h += `<div class="sec"><span>${L().tl}</span><span class="r">${L().tlR}</span></div><div class="card"><div class="tlwrap"><div class="tl">`;
  let months = "";
  for (let d = D(RANGE[0]); d < D(RANGE[1]); d.setMonth(d.getMonth() + 1)) {
    const k = iso(d);
    const lbl = d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", { month: "short" }).replace(".", "");
    months += `<span style="left:${pct(k)}%">${d.getMonth() === 0 ? lbl + " ’" + String(d.getFullYear()).slice(2) : lbl}</span>`;
  }
  h += `<div class="months">${months}</div>`;
  for (const lane of [0, 1]) {
    h +=
      `<div class="lane"><span class="lab">${lane ? L().lane1 : L().lane0}</span>` +
      BANDS.filter((b) => b.lane === lane)
        .map(
          (b) =>
            `<div class="band ${b.cls || ""}" style="left:${pct(b.from)}%;width:${pct(b.to) - pct(b.from)}%" data-tip="${esc(b.full ? b.full[lang] : b[lang])}" data-sub="${fmtD(b.from)} – ${fmtD(b.to)}"><span>${esc(b[lang])}</span></div>`,
        )
        .join("") +
      `</div>`;
  }
  const trackAt = h.length;
  h += `<div class="track"><div class="done" style="width:${lastDone}%"></div>`;
  const rows = [];
  MS.forEach((m, i) => {
    const s = msState(m, N);
    const late = !s.ok && m.d < TODAY;
    const x = pct(s.ok && s.date ? s.date : m.d);
    let row = 0;
    while (rows[row] !== undefined && x - rows[row] < 2.8) row++;
    rows[row] = x;
    h += `<button class="dot${s.ok ? " ok" : late ? " late" : ""}" style="left:${x}%;top:${12 + row * 24}px" data-tip="${esc(m[lang])}" data-sub="${fmtD(s.ok && s.date ? s.date : m.d)}${s.ok ? " · ✓" : late ? " · " + L().late(daysBetween(m.d, TODAY)) : ""}" aria-label="${i + 1}. ${esc(m[lang])}">${i + 1}</button>`;
  });
  h =
    h.slice(0, trackAt) +
    h
      .slice(trackAt)
      .replace('<div class="track">', `<div class="track" style="height:${40 + (rows.length - 1) * 24}px">`);
  h += `</div><div class="today" style="left:${pct(TODAY)}%"><b>${L().today}</b></div></div></div>`;
  h +=
    `<ul class="ms">` +
    MS.map((m, i) => {
      const s = msState(m, N);
      const late = !s.ok && m.d < TODAY;
      const when = s.ok
        ? s.date && s.date !== m.d && !m.fixed
          ? `${L().msDone.toLowerCase()} ${fmtD(s.date)}`
          : ""
        : late
          ? L().late(daysBetween(m.d, TODAY))
          : L().left(daysBetween(TODAY, m.d));
      const ctl = m.fixed
        ? ""
        : m.auto
          ? `<span class="live">${L().msAuto}</span>`
          : `<button class="tog${s.ok ? " on" : ""}" data-ms="${m.k}" ${live ? "" : "disabled"}>${s.ok ? "✓ " + L().msDone : L().msMark}</button>`;
      return `<li class="${s.ok ? "ok" : late ? "late" : ""}"><span class="n">${s.ok ? "✓" : i + 1}</span><div class="t"><div>${esc(m[lang])}</div><small>${fmtD(m.d)}${when ? " · " + when : ""}</small></div>${ctl}</li>`;
    }).join("") +
    `</ul></div>`;

  // checkpoint
  const goal = (v, t, l, key, liveVal) => {
    const f = Math.min(1, v / t);
    return `<div class="goal"><div class="top"><div class="v">${v}<small>/ ${t}</small></div>${liveVal ? `<span class="live">${L().liveTag}</span>` : ""}</div><div class="l">${l}</div><div class="meter${f >= 1 ? " full" : ""}" role="img" aria-label="${v} / ${t}"><i style="width:${f * 100}%"></i></div>${key ? `<div class="step"><button data-cnt="${key}" data-d="-1" ${live && v > 0 ? "" : "disabled"} aria-label="−1">−</button><button data-cnt="${key}" data-d="1" ${live ? "" : "disabled"} aria-label="+1">+</button></div>` : ""}</div>`;
  };
  h += `<div class="sec"><span>${L().cp} · ${fmtD(CHECKPOINT)}</span><span class="r">${CHECKPOINT >= TODAY ? L().left(daysBetween(TODAY, CHECKPOINT)) : L().late(daysBetween(CHECKPOINT, TODAY))}</span></div><div class="cp">
    ${goal(N.apps, 5, L().gApps, "applications")}${goal(N.ints, 2, L().gInt, "interviews")}${goal(N.g, 12, L().gCold, null, true)}${goal(N.sess, 4, L().gSess, null, true)}</div>`;

  // readiness + knowledge map
  const seg = (c) =>
    c
      .map(([k, v, cls]) => (v ? `<i class="${cls}" style="flex:${v}" data-tip="${v} · ${L()[k]}"></i>` : ""))
      .join("");
  h += `<div class="sec"><span>${L().map}</span><span class="r">${L().mapR}</span></div><div class="card ready">
    <div class="row"><div><div class="eyebrow">${L().readyH}</div><div class="big">${Math.round(readiness * 100)}<small>%</small></div></div><div class="legend"><span><i class="sw st-g"></i>${L().g} ${N.g}</span><span><i class="sw st-y"></i>${L().y} ${N.y}</span><span><i class="sw st-r"></i>${L().r} ${N.r}</span><span><i class="sw st-nf"></i>${L().n} ${N.n}</span></div></div>
    <div class="gauge" role="img" aria-label="${L().g} ${N.g}, ${L().y} ${N.y}, ${L().r} ${N.r}, ${L().n} ${N.n}">${seg(
      [
        ["g", N.g, "st-g"],
        ["y", N.y, "st-y"],
        ["r", N.r, "st-r"],
        ["n", N.n, "st-nf"],
      ],
    )}<span class="fin" style="left:${FINISH * 100}%"><b>${L().fin}</b></span></div>
    <p class="note" style="margin-top:0">${L().readyD}</p>`;
  for (const st of STAGES) {
    h += `<div class="stage"><h3><span>${st[lang]}</span></h3>`;
    for (const s of st.secs) {
      const its = N.active.filter((i) => i.s === s);
      if (!its.length) continue;
      const c = (x) => its.filter((i) => i.st === x).length;
      const g = c("green");
      h += `<button class="trk" data-trk="${s}" aria-expanded="${open.has(s)}"><span class="nm">${SEC[s]}</span><span class="bar" role="img" aria-label="${SEC[s]}: ${g}/${its.length} ${L().g}">${seg(
        [
          ["g", g, "st-g"],
          ["y", c("yellow"), "st-y"],
          ["r", c("red"), "st-r"],
          ["n", c("new"), "st-nf"],
        ],
      )}</span><span class="num"><b>${g}</b>/${its.length}</span></button>`;
      h +=
        `<div class="cells" ${open.has(s) ? "" : "hidden"}>` +
        its
          .map((i) => {
            const t = (window.TICKETS || []).find((t) => (t.core || []).includes(i.id));
            const title = t ? t[lang].topic : i.t;
            const cls = { green: "st-g", yellow: "st-y", red: "st-r" }[i.st] || "st-nw";
            return `<a class="cell" href="./#item/${i.id}"><i class="sw ${cls}"></i><span class="id">${i.id}</span><span class="tt">${esc(title)}</span></a>`;
          })
          .join("") +
        `</div>`;
    }
    h += `</div>`;
  }
  if (N.parked) h += `<p class="note">${L().parked(N.parked)}</p>`;
  h += `</div>`;
  app.innerHTML = h;
  wire();
  const tw = $(".tlwrap");
  if (tw && tw.scrollWidth > tw.clientWidth) {
    const x = (pct(TODAY) / 100) * tw.scrollWidth;
    tw.scrollLeft = Math.max(0, x - tw.clientWidth * 0.6);
  }
}

function wire() {
  const s = $("#sent");
  if (s) s.onclick = () => save({ type: "count", key: "applications", val: count("applications") + 1 });
  document
    .querySelectorAll("[data-cnt]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          save({ type: "count", key: b.dataset.cnt, val: count(b.dataset.cnt) + Number(b.dataset.d) })),
    );
  document.querySelectorAll("[data-ms]").forEach(
    (b) =>
      (b.onclick = () => {
        const on = !!(RM().marks || {})[b.dataset.ms];
        save({ type: "mark", key: b.dataset.ms, val: on ? null : TODAY });
      }),
  );
  document.querySelectorAll("[data-trk]").forEach(
    (b) =>
      (b.onclick = () => {
        const k = b.dataset.trk;
        open.has(k) ? open.delete(k) : open.add(k);
        b.setAttribute("aria-expanded", open.has(k));
        b.nextElementSibling.hidden = !open.has(k);
      }),
  );
}
// tooltip: hover on desktop, tap on touch
const tip = $("#tip");
function showTip(el, x, y) {
  tip.innerHTML = (el.dataset.sub ? `<small>${el.dataset.sub}</small>` : "") + el.dataset.tip;
  const w = tip.offsetWidth,
    hh = tip.offsetHeight;
  tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + "px";
  tip.style.top = Math.max(8, y - hh - 14) + "px";
  tip.style.opacity = 1;
}
document.addEventListener("pointerover", (e) => {
  const el = e.target.closest("[data-tip]");
  if (el && e.pointerType === "mouse") showTip(el, e.clientX, e.clientY);
});
document.addEventListener("pointermove", (e) => {
  const el = e.target.closest("[data-tip]");
  if (el && e.pointerType === "mouse") showTip(el, e.clientX, e.clientY);
  else if (e.pointerType === "mouse") tip.style.opacity = 0;
});
document.addEventListener("pointerdown", (e) => {
  const el = e.target.closest("[data-tip]");
  if (el && e.pointerType !== "mouse") {
    const r = el.getBoundingClientRect();
    showTip(el, r.left + r.width / 2, r.top);
  } else if (e.pointerType !== "mouse") tip.style.opacity = 0;
});
addEventListener(
  "scroll",
  () => {
    tip.style.opacity = 0;
  },
  { passive: true },
);

$("#ru").onclick = () => {
  lang = "ru";
  try {
    localStorage.setItem("drill.lang", lang);
  } catch {}
  render();
};
$("#en").onclick = () => {
  lang = "en";
  try {
    localStorage.setItem("drill.lang", lang);
  } catch {}
  render();
};
(() => {
  try {
    const ref = document.referrer;
    if (ref) {
      const u = new URL(ref);
      if (u.origin === location.origin && !u.pathname.endsWith("roadmap.html")) {
        $("#back").href = ref;
        $("#back").onclick = (e) => {
          e.preventDefault();
          history.back();
        };
      }
    }
  } catch {}
})();
render();
load().then(render);
