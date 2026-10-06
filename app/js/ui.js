// Shared UI pieces: current-language strings, the app frame (header + tab bar), ticket rows, the round top bar, question helpers.
import { STRINGS } from "./i18n.js";
import { icon } from "./icons.js";
import { openSettings } from "./screens/settings.js";
import { persist, state } from "./state.js";
import { lastScore, rec, status, streak, xpToday } from "./store.js";
import { $, esc } from "./util.js";
import { isDue } from "../lib/srs.js";

export const app = $("#app");

/** Strings for the current language. */
export const ui = () => STRINGS[state.lang];

export const setLang = (l) => {
  state.lang = l;
  persist("drill.lang", l);
  document.documentElement.lang = l;
};

export const fmtDate = (d = new Date(), o = { weekday: "short", day: "numeric", month: "short" }) =>
  d.toLocaleDateString(state.lang === "ru" ? "ru-RU" : "en-GB", o);

export const kbd = (k, dk) => `<span class="kbd${dk ? " dk" : ""}">${k}</span>`;

export const TABS = [
  { id: "home", icon: "today", match: ["home"] },
  { id: "tickets", icon: "deck", match: ["tickets", "t", "exam", "interview"] },
  { id: "learn", icon: "book", match: ["learn"] },
  { id: "progress", icon: "chart", match: ["progress"] },
];

/** Bottom tab bar (phones) / top tabs (desktop), drawn once; `setTab` marks the current one. */
export function drawTabs() {
  const nav = $("#tabs");
  nav.innerHTML = TABS.map(
    (t) => `<a href="#${t.id}" data-tab="${t.id}">${icon[t.icon]}<span>${ui().tabs[t.id]}</span></a>`,
  ).join("");
}
export function setTab(screen) {
  const cur = TABS.find((t) => t.match.includes(screen));
  document.querySelectorAll("#tabs a").forEach((a) => {
    const on = cur && a.dataset.tab === cur.id;
    a.classList.toggle("on", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

/** Header: brand (or a back link), streak and today's XP, settings. */
export function header(back) {
  const left = back
    ? `<a class="hback" href="#${back.href}">${icon.back}<span>${esc(back.label)}</span></a>`
    : `<a class="wm" href="#home"><span class="wmfull">duokovalingo</span><span class="wmshort">duo</span></a>`;
  return `<header class="hdr">${left}<span class="sp"></span><span class="stat fire" title="${ui().streak}">${icon.flame}${streak()}</span><span class="stat xp" style="margin-left:6px" title="${ui().xpt}">${icon.bolt}${xpToday()}</span><button class="icb" id="cfg" aria-label="${ui().settings}" title="${ui().settings}" style="margin-left:6px">${icon.gear}</button></header>`;
}

/**
 * Render a tab screen: header + content in the given scope class (v-app, v-exam, v-learn, v-map).
 * Returns the content element.
 */
export function frame(html, { back, scope = "v-app", cls = "page" } = {}) {
  document.body.classList.remove("inround");
  app.innerHTML = header(back) + `<main class="${scope}"><div class="${cls}">${html}</div></main>`;
  wireHeader();
  return app.querySelector("main > div");
}

export function wireHeader() {
  const c = $("#cfg");
  if (c) c.onclick = openSettings;
}

/** Round screens (games, session) take the whole screen: no header, no tab bar. */
export function roundFrame(html) {
  document.body.classList.add("inround");
  app.innerHTML = `<div class="v-app">${html}</div>`;
}

export const MODE_ICON = {
  voice: icon.mic14,
  tf: icon.bolt13,
  gap: icon.pen,
  order: icon.sort,
  ticket: icon.doc,
};

export const scoreCls = (n) => (n >= 8 ? "g" : n >= 5 ? "y" : "r");

/** One ticket as a tappable row: status, number, topic, sub line, last exam score, doubt mark. */
export function ticketRow(t, sub = "", href = `t/${t.n}`) {
  const st = status(t.n),
    r = rec(t.n),
    sc = lastScore(t.n);
  return `<a class="trow" href="#${href}"><span class="sw ${st}${isDue(r) ? " due" : ""}"></span><span class="tn">${t.n}</span><span class="tt"><b>${esc(t[state.lang].topic)}</b>${sub ? `<small>${sub}</small>` : ""}</span>${r.doubt ? `<span class="dbt" title="${ui().doubt}">?</span>` : ""}${sc != null ? `<span class="scb ${scoreCls(sc)}">${sc}</span>` : ""}${icon.chev}</a>`;
}

export function rtop(pct, ok) {
  return `<div class="rtop"><button class="x" id="quit" aria-label="${ui().quit}">${icon.x}</button><div class="pbar${ok ? " ok" : ""}" id="pbar"><i style="width:${pct}%"></i></div><span class="combo" id="combo"></span><div class="seg rl" id="rl" role="group" aria-label="language"><button data-l="ru" class="${state.lang === "ru" ? "on" : ""}">RU</button><button data-l="en" class="${state.lang === "en" ? "on" : ""}">EN</button></div></div>`;
}

export function setCombo(n) {
  state.combo = n;
  const c = $("#combo");
  if (!c) return;
  if (n >= 2) {
    c.innerHTML = icon.bolt13 + "×" + n;
    c.classList.remove("pop");
    void c.offsetWidth;
    c.classList.add("pop");
  } else c.innerHTML = "";
}

export function setProg(i, n) {
  const p = $("#pbar");
  if (!p) return;
  p.querySelector("i").style.width = Math.round((i / n) * 100) + "%";
  if (i >= n) p.classList.add("ok");
}

/** Leave a round: back to the screen it was started from. */
export const exitRound = () => {
  location.hash = state.back || "home";
};

// switching language mid-round redraws the current screen in place: same question, same answer state, no progress lost
export const wireQuit = () => {
  const q = $("#quit");
  if (q) q.onclick = exitRound;
  app.querySelectorAll("#rl [data-l]").forEach(
    (b) =>
      (b.onclick = () => {
        if (state.lang === b.dataset.l) return;
        setLang(b.dataset.l);
        if (state.rerender) state.rerender();
        else
          app
            .querySelectorAll("#rl [data-l]")
            .forEach((x) => x.classList.toggle("on", x.dataset.l === state.lang));
      }),
  );
};

// a question that exists in both languages: q.s always returns the current one
export const mkQ = (S, t, ok) => {
  const q = { S, t };
  if (ok !== undefined) q.ok = ok;
  Object.defineProperty(q, "s", {
    get() {
      return this.S[state.lang] ?? this.S.en ?? this.S.ru;
    },
    enumerable: true,
  });
  return q;
};

export const other = () => (state.lang === "ru" ? "en" : "ru");
