// Knowledge map: how many tickets are cold / shaky / missed, overall and per track, with each track's items.
import { $, esc } from "./util.js";

/** Tracks grouped into the stages of the plan. Section keys match ticket.sec and item.s. */
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
const SECTION_LABEL = {
  llm: "LLM",
  rag: "RAG",
  agents: "Agents",
  sysd: "System design",
  behav: "Behavioral",
  js: "JavaScript",
  ts: "TypeScript",
  react: "React",
  web: "Browser",
};
/** Share of active tickets that should be "cold" before interviews. */
const FINISH = 0.8;

const plural = (n, one, few, many) => {
  const m = n % 10,
    h = n % 100;
  return m === 1 && h !== 11 ? one : m >= 2 && m <= 4 && (h < 12 || h > 14) ? few : many;
};
const STRINGS = {
  ru: {
    title: "Карта знаний",
    hint: "нажми на трек, чтобы увидеть билеты",
    readiness: "Готовность",
    readinessNote: "доля активных билетов на «уверенно». Финиш: 80%, остальное вытянешь рассуждением вслух.",
    finish: "финиш 80%",
    green: "уверенно",
    yellow: "шатко",
    red: "мимо",
    new: "не открывал",
    parked: (n) =>
      `${n} ${plural(n, "билет запаркован", "билета запаркованы", "билетов запарковано")} и в расчёт не входят.`,
    offline: "Прогресс не загрузился: войди в тренажёре, и карта подтянет его.",
    login: "Войти",
  },
  en: {
    title: "Knowledge map",
    hint: "tap a track to see its tickets",
    readiness: "Readiness",
    readinessNote:
      "share of active tickets that are cold. Finish line: 80%, the rest you reason through out loud.",
    finish: "finish 80%",
    green: "cold",
    yellow: "shaky",
    red: "missed",
    new: "never opened",
    parked: (n) => `${n} parked ticket${n > 1 ? "s are" : " is"} not counted.`,
    offline: "Progress didn't load: sign in to the trainer and the map will pick it up.",
    login: "Sign in",
  },
};
const STATUS_CLASS = { green: "st-g", yellow: "st-y", red: "st-r", new: "st-nf" };

const page = {
  lang: (() => {
    try {
      return localStorage.getItem("drill.lang") || "ru";
    } catch {
      return "ru";
    }
  })(),
  db: { items: [], history: [] },
  live: false,
  needLogin: false,
  openTracks: new Set(),
};
const t = () => STRINGS[page.lang];

async function load() {
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.ok) {
      page.db = await r.json();
      page.live = true;
    } else if (r.status === 401) page.needLogin = true;
  } catch {}
  // every ticket's items exist even before the first attempt (same rule as the trainer)
  for (const ticket of window.TICKETS || []) {
    if (ticket.sec === "parked") continue;
    for (const id of ticket.core || [])
      if (!page.db.items.some((i) => i.id === id))
        page.db.items.push({ id, s: ticket.sec, t: ticket.en.topic, st: "new" });
  }
}

/** Stacked bar of status counts; each segment has a tooltip. */
const stackedBar = (counts) =>
  Object.entries(counts)
    .map(([st, n]) =>
      n ? `<i class="${STATUS_CLASS[st]}" style="flex:${n}" data-tip="${n} · ${t()[st]}"></i>` : "",
    )
    .join("");
const countByStatus = (items) => {
  const c = { green: 0, yellow: 0, red: 0, new: 0 };
  for (const i of items) if (i.st in c) c[i.st]++;
  return c;
};
const ticketTitle = (item) => {
  const ticket = (window.TICKETS || []).find((x) => (x.core || []).includes(item.id));
  return ticket ? ticket[page.lang].topic : item.t;
};

function render() {
  document.documentElement.lang = page.lang;
  document.title = `duokovalingo · ${t().title.toLowerCase()}`;
  $("#ru").className = page.lang === "ru" ? "on" : "";
  $("#en").className = page.lang === "en" ? "on" : "";

  const active = page.db.items.filter((i) => i.st !== "parked" && i.s !== "meta" && i.s !== "bonus");
  const parked = page.db.items.filter((i) => i.st === "parked").length;
  const total = countByStatus(active);
  const readiness = active.length ? total.green / active.length : 0;

  let html = `<h1>${t().title}</h1>`;
  if (page.needLogin || (!page.live && !page.db.items.length))
    html += `<div class="banner">${t().offline} <a href="./">${t().login} →</a></div>`;

  html += `<div class="sec"><span>${t().readiness}</span><span class="r">${t().hint}</span></div>
  <div class="card ready">
    <div class="row">
      <div class="big">${Math.round(readiness * 100)}<small>%</small></div>
      <div class="legend">${["green", "yellow", "red", "new"].map((st) => `<span><i class="sw ${STATUS_CLASS[st]}"></i>${t()[st]} ${total[st]}</span>`).join("")}</div>
    </div>
    <div class="gauge" role="img" aria-label="${["green", "yellow", "red", "new"].map((st) => `${t()[st]} ${total[st]}`).join(", ")}">
      ${stackedBar(total)}<span class="fin" style="left:${FINISH * 100}%"><b>${t().finish}</b></span>
    </div>
    <p class="note">${t().readinessNote}</p>`;

  for (const stage of STAGES) {
    html += `<div class="stage"><h3><span>${stage[page.lang]}</span></h3>`;
    for (const sec of stage.secs) {
      const items = active.filter((i) => i.s === sec);
      if (!items.length) continue;
      const c = countByStatus(items);
      const isOpen = page.openTracks.has(sec);
      html += `<button class="trk" data-trk="${sec}" aria-expanded="${isOpen}">
        <span class="nm">${SECTION_LABEL[sec]}</span>
        <span class="bar" role="img" aria-label="${SECTION_LABEL[sec]}: ${c.green}/${items.length} ${t().green}">${stackedBar(c)}</span>
        <span class="num"><b>${c.green}</b>/${items.length}</span>
      </button>
      <div class="cells" ${isOpen ? "" : "hidden"}>${items
        .map(
          (i) =>
            `<a class="cell" href="./#item/${i.id}"><i class="sw ${{ green: "st-g", yellow: "st-y", red: "st-r" }[i.st] || "st-nw"}"></i><span class="id">${i.id}</span><span class="tt">${esc(ticketTitle(i))}</span></a>`,
        )
        .join("")}</div>`;
    }
    html += `</div>`;
  }
  if (parked) html += `<p class="note">${t().parked(parked)}</p>`;
  html += `</div>`;
  $("#app").innerHTML = html;

  for (const btn of document.querySelectorAll("[data-trk]"))
    btn.onclick = () => {
      const sec = btn.dataset.trk;
      page.openTracks.has(sec) ? page.openTracks.delete(sec) : page.openTracks.add(sec);
      btn.setAttribute("aria-expanded", page.openTracks.has(sec));
      btn.nextElementSibling.hidden = !page.openTracks.has(sec);
    };
}

// tooltip on bar segments: hover on desktop, tap on touch
const tip = $("#tip");
function showTip(el, x, y) {
  tip.textContent = el.dataset.tip;
  tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, x - tip.offsetWidth / 2)) + "px";
  tip.style.top = Math.max(8, y - tip.offsetHeight - 14) + "px";
  tip.style.opacity = 1;
}
const hideTip = () => (tip.style.opacity = 0);
document.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  const el = e.target.closest("[data-tip]");
  el ? showTip(el, e.clientX, e.clientY) : hideTip();
});
document.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  const el = e.target.closest("[data-tip]");
  if (!el) return hideTip();
  const r = el.getBoundingClientRect();
  showTip(el, r.left + r.width / 2, r.top);
});
addEventListener("scroll", hideTip, { passive: true });

for (const lang of ["ru", "en"])
  $("#" + lang).onclick = () => {
    page.lang = lang;
    try {
      localStorage.setItem("drill.lang", lang);
    } catch {}
    render();
  };

// back: return to where we came from if it's this app, else go home
try {
  const ref = new URL(document.referrer);
  if (ref.origin === location.origin)
    $("#back").onclick = (e) => {
      e.preventDefault();
      history.back();
    };
} catch {}

render();
load().then(render);
