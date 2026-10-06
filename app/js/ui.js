// Shared UI pieces: current-language strings, header, item rows and chips, the round top bar, question helpers.
import { STRINGS } from "./i18n.js";
import { icon } from "./icons.js";
import { route } from "./router.js";
import { loginScreen } from "./screens/login.js";
import { beep, soundOn, toggleSound } from "./sound.js";
import { state } from "./state.js";
import { isDue, streak, ticketFor, xpToday } from "./store.js";
import { $, esc } from "./util.js";

export const app = $("#app");

/** Strings for the current language. */
export const ui = () => STRINGS[state.lang];

export const fmtDate = () =>
  new Date().toLocaleDateString(state.lang === "ru" ? "ru-RU" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export const kbd = (k, dk) => `<span class="kbd${dk ? " dk" : ""}">${k}</span>`;

export function header() {
  return `<header class="hdr"><a class="wm" href="#home"><span class="wmfull">duokovalingo</span><span class="wmshort">duo</span><small>core-40</small></a><span class="sp"></span><span class="stat fire">${icon.flame}${streak()}</span><span class="stat xp" style="margin-left:6px">${icon.bolt}${xpToday()}</span><button class="icb${soundOn() ? "" : " off"}" id="snd" aria-label="sound" style="margin-left:8px">${icon.sound}</button>${state.db.auth ? `<button class="icb" id="lo" aria-label="${ui().logout}" title="${ui().logout}">${icon.out}</button>` : ""}<div class="seg"><button id="ru" class="${state.lang === "ru" ? "on" : ""}">RU</button><button id="en" class="${state.lang === "en" ? "on" : ""}">EN</button></div></header>`;
}

export function wireHeader() {
  const lo = $("#lo");
  if (lo)
    lo.onclick = async () => {
      await fetch("/api/logout", { method: "POST" });
      state.db = { items: [], history: [] };
      state.live = false;
      loginScreen();
    };
  const r = $("#ru"),
    e = $("#en"),
    s = $("#snd");
  if (r)
    r.onclick = () => {
      state.lang = "ru";
      localStorage.setItem("drill.lang", state.lang);
      route();
    };
  if (e)
    e.onclick = () => {
      state.lang = "en";
      localStorage.setItem("drill.lang", state.lang);
      route();
    };
  if (s)
    s.onclick = () => {
      s.classList.toggle("off", !toggleSound());
      beep(true);
    };
}

export const MODE_ICON = {
  voice: icon.mic14,
  tf: icon.bolt13,
  gap: icon.pen,
  order: icon.sort,
  ticket: icon.doc,
};

export function chips(id, hot) {
  const t = ticketFor(id);
  if (!t) return "";
  const d = window.DRILLS[t.n] || {};
  const b = (m, label) =>
    `<button class="chip${hot === m ? " hot" : ""}" onclick="location.hash='play/${id}/${m}'">${MODE_ICON[m]}${label}</button>`;
  return `<div class="chips">${b("voice", ui().voice)}${b("tf", "T/F")}${d.cloze ? b("gap", ui().gap) : ""}${d.steps ? b("order", ui().order) : ""}<a class="chip" href="learn.html#t${t.n}">${icon.doc}${ui().learn}</a><a class="chip" href="exam-tickets.html#t${t.n}">${icon.doc}${ui().ticket} ${t.n}</a></div>`;
}

export function itemRow(i, sub) {
  const st = i.st || "new";
  return `<div class="item"><span class="sw ${st}${isDue(i) ? " due" : ""}"></span><div class="it"><div class="t"><span class="id">#${i.id}</span>${esc(i.t)}</div><div class="s">${sub}</div>${chips(i.id)}</div>${chips(i.id)}</div>`;
}

export function rtop(pct, ok) {
  return `<div class="rtop"><button class="x" id="quit" aria-label="${ui().quit}">${icon.x}</button><div class="pbar${ok ? " ok" : ""}" id="pbar"><i style="width:${pct}%"></i></div><span class="combo" id="combo"></span><div class="seg rl" id="rl" role="group" aria-label="language"><button data-l="ru" class="${state.lang === "ru" ? "on" : ""}">RU</button><button data-l="en" class="${state.lang === "en" ? "on" : ""}">EN</button></div></div>`;
}

// switching language mid-round redraws the current screen in place: same question, same answer state, no progress lost
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

export const wireQuit = () => {
  const q = $("#quit");
  if (q)
    q.onclick = () => {
      location.hash = "home";
    };
  app.querySelectorAll("#rl [data-l]").forEach(
    (b) =>
      (b.onclick = () => {
        if (state.lang === b.dataset.l) return;
        state.lang = b.dataset.l;
        localStorage.setItem("drill.lang", state.lang);
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
