import { applyHit, intervalOf, isDue as isDueOn, dueItems } from "../lib/srs.js";
import { icon } from "./icons.js";
import { STRINGS, SECTION_LABEL } from "./i18n.js";
import { $, iso, TODAY, dLocal, days, shuffle, esc, codify } from "./util.js";
import { beep, soundOn, toggleSound } from "./sound.js";

const app = $("#app");
const NEW_ORDER = [38, 39, 22, 25, 23, 32, 27, 28, 29, 30, 31, 40, 35, 36, 37, 42];
let lang = localStorage.getItem("drill.lang") || "ru";
/** Strings for the current language. */
const ui = () => STRINGS[lang];
const fmtDate = () =>
  new Date().toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

// ---------- state ----------
let DB = { items: [], history: [] },
  live = false;
let pending = JSON.parse(localStorage.getItem("drill.pending") || "[]");
let needLogin = false;
async function loadState() {
  needLogin = false;
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.ok) {
      DB = await r.json();
      live = true;
    } else if (r.status === 401) {
      needLogin = true;
    }
  } catch {}
  if (!live && !needLogin) for (const p of pending) applyLocal(p);
  if (!needLogin) await syncCatalog();
}
// tickets.js is the catalog: any core id a ticket points to must exist as an item, or progress on it is dropped
async function syncCatalog() {
  const miss = [];
  for (const t of window.TICKETS || []) {
    if (t.sec === "parked") continue;
    for (const id of t.core || [])
      if (!DB.items.some((i) => i.id === id) && !miss.some((m) => m.id === id))
        miss.push({ id, s: t.sec, t: t.en.topic });
  }
  if (!miss.length) return;
  if (live) {
    try {
      const r = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: miss }),
      });
      if (r.ok) {
        DB = await r.json();
        return;
      }
    } catch {}
  }
  for (const m of miss) DB.items.push({ ...m, st: "new" });
  DB.items.sort((a, b) => a.id - b.id);
}
function loginScreen(err) {
  app.innerHTML = `<div class="login"><a class="wm">duokovalingo<small>core-40</small></a><form id="lf"><input type="password" id="pw" placeholder="${ui().pw}" autocomplete="current-password" autofocus><button class="btn blue full big" type="submit">${ui().enter}</button><div class="err">${err || ""}</div></form></div>`;
  $("#lf").onsubmit = async (e) => {
    e.preventDefault();
    const b = $("#lf button");
    b.disabled = true;
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: $("#pw").value }),
      });
      if (r.ok) {
        await loadState();
        await flushPending();
        return route();
      }
      const j = await r.json().catch(() => ({}));
      loginScreen(r.status === 401 ? ui().wrongpw : j.error || ui().noserver);
    } catch (e) {
      loginScreen(e.message);
    }
  };
}
// offline: record the attempt locally with the same rules the server uses (lib/srs.js)
const applyLocal = (p) => applyHit(DB, p, TODAY);
async function post(path, body) {
  body.d = TODAY;
  if (live) {
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        DB = await r.json();
        return true;
      }
    } catch {}
    live = false;
  }
  pending.push({ ...body, path });
  localStorage.setItem("drill.pending", JSON.stringify(pending));
  applyLocal(body);
  return false;
}
async function flushPending() {
  if (!live || !pending.length) return;
  for (const p of pending.slice()) {
    try {
      const r = await fetch(p.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p),
      });
      if (r.ok) {
        DB = await r.json();
        pending.shift();
      }
    } catch {
      break;
    }
  }
  localStorage.setItem("drill.pending", JSON.stringify(pending));
}
const byId = (id) => DB.items.find((i) => i.id === id);
const ticketFor = (id) => window.TICKETS.find((t) => (t.core || []).includes(id));
const due = () => dueItems(DB.items);
const ivOf = intervalOf;
const isDue = (i) => isDueOn(i);
const nextNew = () => NEW_ORDER.map(byId).find((i) => i && i.st === "new");
function streak() {
  const set = new Set(DB.history.filter((h) => h.ids && h.ids.length).map((h) => h.d));
  let n = 0,
    d = dLocal(TODAY);
  if (!set.has(TODAY)) d.setDate(d.getDate() - 1);
  while (set.has(iso(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
const xpToday = () => (DB.history.find((h) => h.d === TODAY) || {}).xp || 0;
let lastChanged = null; // cell id to pop on Home

// ---------- shared pieces ----------
const kbd = (k, dk) => `<span class="kbd${dk ? " dk" : ""}">${k}</span>`;
function header() {
  return `<header class="hdr"><a class="wm" href="#home"><span class="wmfull">duokovalingo</span><span class="wmshort">duo</span><small>core-40</small></a><span class="sp"></span><span class="stat fire">${icon.flame}${streak()}</span><span class="stat xp" style="margin-left:6px">${icon.bolt}${xpToday()}</span><button class="icb${soundOn() ? "" : " off"}" id="snd" aria-label="sound" style="margin-left:8px">${icon.sound}</button>${DB.auth ? `<button class="icb" id="lo" aria-label="${ui().logout}" title="${ui().logout}">${icon.out}</button>` : ""}<div class="seg"><button id="ru" class="${lang === "ru" ? "on" : ""}">RU</button><button id="en" class="${lang === "en" ? "on" : ""}">EN</button></div></header>`;
}
function wireHeader() {
  const lo = $("#lo");
  if (lo)
    lo.onclick = async () => {
      await fetch("/api/logout", { method: "POST" });
      DB = { items: [], history: [] };
      live = false;
      loginScreen();
    };
  const r = $("#ru"),
    e = $("#en"),
    s = $("#snd");
  if (r)
    r.onclick = () => {
      lang = "ru";
      localStorage.setItem("drill.lang", lang);
      route();
    };
  if (e)
    e.onclick = () => {
      lang = "en";
      localStorage.setItem("drill.lang", lang);
      route();
    };
  if (s)
    s.onclick = () => {
      s.classList.toggle("off", !toggleSound());
      beep(true);
    };
}
const MODE_ICON = { voice: icon.mic14, tf: icon.bolt13, gap: icon.pen, order: icon.sort, ticket: icon.doc };
function chips(id, hot) {
  const t = ticketFor(id);
  if (!t) return "";
  const d = window.DRILLS[t.n] || {};
  const b = (m, label) =>
    `<button class="chip${hot === m ? " hot" : ""}" onclick="location.hash='play/${id}/${m}'">${MODE_ICON[m]}${label}</button>`;
  return `<div class="chips">${b("voice", ui().voice)}${b("tf", "T/F")}${d.cloze ? b("gap", ui().gap) : ""}${d.steps ? b("order", ui().order) : ""}<a class="chip" href="learn.html#t${t.n}">${icon.doc}${ui().learn}</a><a class="chip" href="exam-tickets.html#t${t.n}">${icon.doc}${ui().ticket} ${t.n}</a></div>`;
}
function itemRow(i, sub) {
  const st = i.st || "new";
  return `<div class="item"><span class="sw ${st}${isDue(i) ? " due" : ""}"></span><div class="it"><div class="t"><span class="id">#${i.id}</span>${esc(i.t)}</div><div class="s">${sub}</div>${chips(i.id)}</div>${chips(i.id)}</div>`;
}
function rtop(pct, ok) {
  return `<div class="rtop"><button class="x" id="quit" aria-label="${ui().quit}">${icon.x}</button><div class="pbar${ok ? " ok" : ""}" id="pbar"><i style="width:${pct}%"></i></div><span class="combo" id="combo"></span><div class="seg rl" id="rl" role="group" aria-label="language"><button data-l="ru" class="${lang === "ru" ? "on" : ""}">RU</button><button data-l="en" class="${lang === "en" ? "on" : ""}">EN</button></div></div>`;
}
// switching language mid-round redraws the current screen in place: same question, same answer state, no progress lost
let rerender = null;
let combo = 0;
function setCombo(n) {
  combo = n;
  const c = $("#combo");
  if (!c) return;
  if (n >= 2) {
    c.innerHTML = icon.bolt13 + "×" + n;
    c.classList.remove("pop");
    void c.offsetWidth;
    c.classList.add("pop");
  } else c.innerHTML = "";
}
function setProg(i, n) {
  const p = $("#pbar");
  if (!p) return;
  p.querySelector("i").style.width = Math.round((i / n) * 100) + "%";
  if (i >= n) p.classList.add("ok");
}
const wireQuit = () => {
  const q = $("#quit");
  if (q)
    q.onclick = () => {
      location.hash = "home";
    };
  app.querySelectorAll("#rl [data-l]").forEach(
    (b) =>
      (b.onclick = () => {
        if (lang === b.dataset.l) return;
        lang = b.dataset.l;
        localStorage.setItem("drill.lang", lang);
        if (rerender) rerender();
        else
          app.querySelectorAll("#rl [data-l]").forEach((x) => x.classList.toggle("on", x.dataset.l === lang));
      }),
  );
};
// a question that exists in both languages: q.s always returns the current one
const mkQ = (S, t, ok) => {
  const q = { S, t };
  if (ok !== undefined) q.ok = ok;
  Object.defineProperty(q, "s", {
    get() {
      return this.S[lang] ?? this.S.en ?? this.S.ru;
    },
    enumerable: true,
  });
  return q;
};
const other = () => (lang === "ru" ? "en" : "ru");

// ---------- activity ----------
const ACT_TARGET = 2; // target: 2 drill days a week
function activity() {
  const W = innerWidth >= 700 ? 26 : 18,
    loc = lang === "ru" ? "ru-RU" : "en-GB";
  const H = Object.fromEntries(DB.history.filter((x) => x.ids && x.ids.length).map((x) => [x.d, x]));
  const t = dLocal(TODAY),
    mon = new Date(t);
  mon.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  const start = new Date(mon);
  start.setDate(mon.getDate() - 7 * (W - 1));
  const lvl = (c) => (c === 0 ? 0 : c === 1 ? 1 : c <= 3 ? 2 : c <= 6 ? 3 : 4);
  const fmt = (dt, o) =>
    dt.toLocaleDateString(loc, o || { weekday: "short", day: "numeric", month: "short" });
  let cells = "",
    bars = "",
    prevM = -1,
    activeDays = 0,
    weekDays = [],
    mlab = [];
  for (let w = 0; w < W; w++) {
    let wd = 0;
    const wk0 = new Date(start);
    wk0.setDate(start.getDate() + w * 7);
    if (wk0.getMonth() !== prevM) {
      mlab.push([w, fmt(wk0, { month: "short" }).replace(".", "")]);
      prevM = wk0.getMonth();
    }
    for (let r = 0; r < 7; r++) {
      const dt = new Date(wk0);
      dt.setDate(wk0.getDate() + r);
      const k = iso(dt);
      const x = H[k];
      const c = x ? x.ids.length : 0;
      if (k > TODAY) {
        cells += `<i class="dy fut"></i>`;
        continue;
      }
      if (c) {
        wd++;
        activeDays++;
      }
      const names = x
        ? x.ids
            .slice(0, 4)
            .map((id) => {
              const it = byId(id);
              return `#${id} ${esc(it ? it.t : "")}`;
            })
            .join("<br>") + (x.ids.length > 4 ? `<br>+${x.ids.length - 4}` : "")
        : "";
      cells += `<i class="dy l${lvl(c)}${k === TODAY ? " today" : ""}" data-tip="${c ? `<b>${c} ${ui().cardsN(c)}${x.xp ? ` · ${x.xp} XP` : ""}</b><br>${names}` : ui().noAct}" data-sub="${esc(fmt(dt))}"></i>`;
    }
    weekDays.push(wd);
    bars += `<i class="wbar${wd >= ACT_TARGET ? " met" : ""}${w === W - 1 ? " cur" : ""}" style="--h:${Math.min(wd, 4) / 4}" data-tip="${wd} ${ui().ofw} ${ACT_TARGET} ${ui().actDays}" data-sub="${ui().weekOf} ${esc(fmt(wk0, { day: "numeric", month: "short" }))}"></i>`;
  }
  if (mlab.length > 1 && mlab[1][0] - mlab[0][0] < 3) mlab.shift(); // first partial month would collide with the next label
  const monthsRow = mlab.map(([w, m]) => `<span style="grid-column:${w + 1}/span 4">${m}</span>`).join("");
  // best streak over all history
  const ds = Object.keys(H).sort();
  let best = 0,
    run = 0,
    prev = null;
  for (const d of ds) {
    run = prev && days(prev) - days(d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const cur = streak(),
    thisWeek = weekDays[weekDays.length - 1],
    last = ds.length ? days(ds[ds.length - 1]) : null;
  const last30 = DB.history
      .filter((x) => days(x.d) <= 29)
      .reduce((n, x) => n + (x.ids ? x.ids.length : 0), 0),
    xp30 = DB.history.filter((x) => days(x.d) <= 29).reduce((n, x) => n + (x.xp || 0), 0);
  const metWeeks = weekDays.slice(-4).filter((x) => x >= ACT_TARGET).length;
  const dl = lang === "ru" ? ["Пн", "", "Ср", "", "Пт", "", "Вс"] : ["Mon", "", "Wed", "", "Fri", "", "Sun"];
  return `<div class="sec"><span>${ui().act}</span><span class="r">${activeDays} ${ui().actDays} · ${W} ${ui().wk}</span></div>
  <div class="card actv">
    <div class="astats">
      <div class="ast"><div class="v fire">${icon.flame}${cur}</div><div class="l">${ui().streakL}<span>${ui().best} ${best}</span></div></div>
      <div class="ast"><div class="v">${thisWeek}<small>/${ACT_TARGET}</small></div><div class="l">${ui().thisWeek}<span>${metWeeks} ${ui().ofw} 4 ${ui().weeksMet}</span></div><div class="mini"><i style="width:${Math.min(1, thisWeek / ACT_TARGET) * 100}%"></i></div></div>
      <div class="ast"><div class="v">${last30}</div><div class="l">${ui().cards30}<span>${xp30} XP</span></div></div>
      <div class="ast"><div class="v">${last === null ? "—" : last === 0 ? ui().todayW : last + ui().days}</div><div class="l">${ui().lastS}<span>${last === null ? "" : last === 0 ? "" : ui().ago}</span></div></div>
    </div>
    <div class="hgrid" style="--w:${W}">
      <span></span><div class="hmonths">${monthsRow}</div>
      <div class="hdows">${dl.map((x) => `<span>${x}</span>`).join("")}</div><div class="hcells">${cells}</div>
      <span class="hrl">${ui().rhythm}</span><div class="hbars"><span class="tline" style="--t:${ACT_TARGET / 4}"></span>${bars}</div>
    </div>
    <div class="hleg"><span>${ui().lessA}</span><i class="dy l0"></i><i class="dy l1"></i><i class="dy l2"></i><i class="dy l3"></i><i class="dy l4"></i><span>${ui().moreA}</span><span class="sp"></span><span class="tl-key"><i></i>${ui().target} ${ACT_TARGET} ${ui().actDaysW}</span></div>
  </div>`;
}
// tooltip for the activity grid: hover with a mouse, tap on touch
function tipShow(el, x, y) {
  const tp = $("#tip");
  if (!tp) return;
  tp.innerHTML = (el.dataset.sub ? `<small>${el.dataset.sub}</small>` : "") + el.dataset.tip;
  const w = tp.offsetWidth,
    hh = tp.offsetHeight;
  tp.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + "px";
  tp.style.top = Math.max(8, y - hh - 12) + "px";
  tp.classList.add("on");
}
const tipHide = () => {
  const tp = $("#tip");
  if (tp) tp.classList.remove("on");
};
document.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  const el = e.target.closest(".actv [data-tip]");
  el ? tipShow(el, e.clientX, e.clientY) : tipHide();
});
document.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  const el = e.target.closest(".actv [data-tip]");
  if (el) {
    const rc = el.getBoundingClientRect();
    tipShow(el, rc.left + rc.width / 2, rc.top);
  } else tipHide();
});
addEventListener("scroll", tipHide, { passive: true });
addEventListener("hashchange", tipHide);

// ---------- home ----------
function home() {
  const d = due(),
    nn = nextNew();
  const top = d.slice(0, 2);
  const active = DB.items.filter((i) => i.st !== "parked");
  const n = (s) => active.filter((i) => i.st === s).length;
  let h =
    header() +
    `<div class="page"><a class="rmlink" href="roadmap.html"><span class="rmt">${ui().roadmap}</span><span class="rms">${ui().roadmapd}</span>${icon.arrow}</a><a class="rmlink" href="learn.html"><span class="rmt">${ui().learn}</span><span class="rms">${ui().learnd}</span>${icon.arrow}</a><div class="sec"><span>${ui().today}</span><span class="r">${fmtDate()}</span></div><div class="card">`;
  h += top.length
    ? top
        .map((i) => itemRow(i, `${ui().due} · <span class="ov">${i.over}${ui().days} ${ui().overdue}</span>`))
        .join("")
    : `<div class="item"><div class="it"><div class="s">${ui().nothing}</div></div></div>`;
  if (nn) h += itemRow(nn, ui().newi);
  if (DB.today_overrides?.ship)
    h += `<div class="item" style="align-items:center"><span class="sw ship" style="margin-top:0"></span><div class="it"><div class="t"><span class="id">${ui().ship}</span>${esc(DB.today_overrides.ship)}</div></div></div>`;
  h += `</div>`;
  h += `<div class="card quick"><div class="qi"><div class="qt">${ui().quick}<span>${ui().quickm}</span></div><p class="sub">${ui().quickd}</p></div>${kbd("Enter", 1)}<button class="btn blue big" onclick="location.hash='quick'">${ui().start} ${icon.arrow}</button></div>`;
  if (!live)
    h += `<div class="banner">${icon.warn}<span>${ui().offline}${pending.length ? ` · <b>${pending.length}</b> ${ui().pending}` : ""}</span></div>`;
  h += `<div class="sec"><span>${ui().wall}</span><span class="r">${n("green")} ${ui().cold} · ${n("yellow")} ${ui().shaky} · ${n("new")} ${ui().neww} · ${DB.items.length - active.length} ${ui().statuses.parked}</span></div><div class="card wall">`;
  for (const s of ["llm", "rag", "agents", "sysd", "behav", "js", "ts", "react", "web", "bonus", "meta"]) {
    const its = DB.items.filter((i) => i.s === s);
    if (!its.length) continue;
    const g = its.filter((i) => i.st === "green").length;
    const parked = its.every((i) => i.st === "parked");
    h +=
      `<div class="wsec"><div class="wlab"><span>${SECTION_LABEL[s]} <span class="c">${parked ? ui().statuses.parked : g + "/" + its.length}</span></span></div><div class="cells">` +
      its
        .map(
          (i) =>
            `<button class="cell ${i.st}${isDue(i) ? " due" : ""}${lastChanged === i.id ? " pop" : ""}" title="#${i.id} ${esc(i.t)} · ${ui().statuses[i.st]}" onclick="location.hash='item/${i.id}'">${i.id}</button>`,
        )
        .join("") +
      `</div></div>`;
  }
  h += `</div>`;
  h += activity() + `</div>`;
  app.innerHTML = h;
  wireHeader();
  lastChanged = null;
  document.onkeydown = (e) => {
    if (e.key === "Enter" && !e.target.closest("button,a,input")) {
      location.hash = "quick";
    }
  };
}
function itemScreen(id) {
  const i = byId(id);
  if (!i) return home();
  const t = ticketFor(id);
  const st = i.st || "new";
  const lastTxt = i.last ? `${days(i.last)}${ui().days} ${ui().ago}` : ui().never;
  const dueTxt = isDue(i)
    ? `${days(i.last) - ivOf(i)}${ui().days} ${ui().overdue}`
    : i.last && ivOf(i)
      ? `${ivOf(i) - days(i.last)}${ui().days}`
      : "—";
  app.innerHTML =
    header() +
    `<div class="page" style="max-width:704px"><a href="#home" class="btn ghost" style="align-self:flex-start;text-transform:none;letter-spacing:0;font-size:15px;margin-left:-8px;height:40px">${icon.home}${ui().home} ${kbd("Esc", 1)}</a>
    <div class="card" style="padding:24px"><div class="stt"><span class="sw ${st}" style="margin-top:0"></span>${ui().statuses[st]}${isDue(i) ? `<span style="color:var(--dim3)">·</span><span style="color:var(--warn)">${dueTxt}</span>` : ""}</div>
    <h2 class="h2" style="margin-top:8px"><span style="color:var(--dim2);margin-right:8px">#${i.id}</span>${esc(i.t)}</h2>
    <p class="sub" style="margin-top:6px">${SECTION_LABEL[i.s] || ""}${t ? ` · ${ui().ticket.toLowerCase()} ${t.n} · ${esc(t[lang].topic)}` : ""}${i.why ? ` · ${esc(i.why)}` : ""}</p>
    <div class="meta"><div><span class="k">${ui().last}</span><span class="v">${lastTxt}</span></div><div><span class="k">${ui().dueh}</span><span class="v${isDue(i) ? " ov" : ""}">${dueTxt}</span></div><div><span class="k">${ui().interval}</span><span class="v">${ivOf(i) ? ivOf(i) + ui().days + " · " + ui().statuses[st] : "—"}</span></div><div><span class="k">${ui().lastmode}</span><span class="v">${i.lastMode || "—"}</span></div></div>
    <div style="margin-top:22px"><span class="h3">${ui().drill}</span>${t ? chips(id, "voice").replace('class="chips"', 'class="chips" style="display:flex"') : ""}</div></div></div>`;
  wireHeader();
  document.onkeydown = (e) => {
    if (e.key === "Escape") location.hash = "home";
  };
}

// ---------- verdict sheet ----------
// which reference paragraph explains this statement: rare shared words (idf over the 3 paragraphs), shared word pairs, and the paragraph's own label
function bestPara(t, text) {
  const tok = (x) =>
    (x.toLowerCase().match(/[a-zа-яё0-9_]+(?:\.[0-9]+)?/g) || []).filter(
      (w) => w.length >= 3 || /\d/.test(w),
    );
  const q = tok(text),
    qs = new Set(q),
    paras = t[lang].a.map((a) => ({ a, w: tok(a.t), l: new Set(tok(a.q)) }));
  const df = (w) => paras.filter((p) => p.w.includes(w)).length || 1,
    bi = (ws) => new Set(ws.slice(1).map((w, i) => ws[i] + " " + w)),
    qb = bi(q);
  let best = paras[0].a,
    bs = -1;
  for (const p of paras) {
    const ps = new Set(p.w),
      pb = bi(p.w);
    let sc = 0;
    for (const w of qs) {
      if (ps.has(w)) sc += Math.log(1 + paras.length / df(w));
      if (p.l.has(w)) sc += 2;
    }
    for (const b of qb) if (pb.has(b)) sc += 1.5;
    if (sc > bs) {
      bs = sc;
      best = p.a;
    }
  }
  return best;
}
function sheet({ ok, title, sub, text, q, btn, btnLabel }) {
  return `<div class="sheet ${ok ? "ok" : "bad"}" id="sheet"><div style="display:flex;flex-direction:column;gap:10px"><div class="h"><span class="mark">${ok ? icon.check : icon.xs}</span><span>${title}</span>${sub ? `<span class="sep">·</span><span>${sub}</span>` : ""}</div>${text ? `<p class="vp">${text}</p>` : ""}</div>
    <div class="links"><button id="more">${ui().more}</button>${DB.explain && live && q ? `<button id="expl">${icon.spark}${ui().explain}</button>` : ""}${q ? `<a href="exam-tickets.html#t${q.t.n}" style="margin-left:auto">${ui().ticket} ${q.t.n} →</a>` : ""}</div><div id="moreBox" style="display:contents"></div>
    <button class="btn ${btn} full big" id="nx" style="margin-top:6px">${btnLabel} ${kbd("Enter", 1)}</button></div>`;
}
function wireSheet(q, stmt, next, morePara) {
  $("#nx").onclick = next;
  setTimeout(() => $("#nx") && $("#nx").scrollIntoView({ block: "nearest", behavior: "smooth" }), 120);
  const m = $("#more");
  m.onclick = () => {
    const p = morePara || bestPara(q.t, stmt);
    $("#moreBox").insertAdjacentHTML(
      "beforeend",
      `<div class="ref"><span class="rq">${esc(p.q)} · ${esc(q.t[lang].topic)}</span><p>${codify(p.t)}</p></div>`,
    );
    m.disabled = true;
    m.classList.add("on");
  };
  const ex = $("#expl");
  if (ex)
    ex.onclick = async () => {
      ex.disabled = true;
      ex.classList.add("wait");
      ex.innerHTML = icon.spark + ui().thinking;
      const p = morePara || bestPara(q.t, stmt);
      try {
        const r = await fetch("/api/explain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            stmt,
            ok: q.ok !== false,
            topic: q.t[lang].topic,
            ref: p.t,
            kill: q.t[lang].kill.replace(/<[^>]+>/g, ""),
            lang,
          }),
        });
        const j = await r.json();
        $("#moreBox").insertAdjacentHTML(
          "beforeend",
          `<div class="ref"><span class="rq">${ui().explain}${j.cached ? `<span class="cache">· cache</span>` : ""}</span><p>${codify(j.text || "✗ " + j.error)}</p></div>`,
        );
      } catch (e) {
        $("#moreBox").insertAdjacentHTML("beforeend", `<div class="ref"><p>✗ ${esc(e.message)}</p></div>`);
      }
      ex.classList.remove("wait");
      ex.classList.add("on");
      ex.innerHTML = icon.spark + ui().explain;
    };
  document.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      next();
    } else if (e.key === "m" || e.key === "M" || e.key === "ь") {
      if (!m.disabled) m.click();
    } else if (e.key === "Escape") location.hash = "home";
  };
}
function missRecap(missedQ) {
  if (!missedQ || !missedQ.length) return "";
  const rows = missedQ
    .map(({ kind, q }) => {
      const txt = kind === "gap" ? q.s.replace(/\[\[(.+?)\]\]/g, (_, a) => a.split("|")[0]) : q.s;
      return `<div class="missrow"><span class="tag">${esc(q.t[lang].topic)}</span><p>${codify(txt)}</p></div>`;
    })
    .join("");
  return `<div class="card" style="margin-top:20px;padding:16px;display:flex;flex-direction:column;gap:6px;text-align:left"><span class="h3">${ui().missedTitle} · ${missedQ.length}</span>${rows}</div>`;
}
function retryMisses(missedQ, onAllDone) {
  const tfQs = missedQ.filter((m) => m.kind === "tf").map((m) => m.q),
    gapQs = missedQ.filter((m) => m.kind === "gap").map((m) => m.q);
  const afterGap = (c, x) => {
    if (!gapQs.length) return onAllDone(c, tfQs.length, x);
    runGap(gapQs, (g) => onAllDone(c + g.correct, tfQs.length + g.total, x + g.xp));
  };
  if (tfQs.length) return runTF(tfQs, (acc) => afterGap(acc.correct, acc.xp), ui().reviewMisses);
  afterGap(0, 0);
}
function finish(id, mode, correct, total, xp, ids, missedQ) {
  const pct = total ? correct / total : 1;
  const msg = pct === 1 ? ui().perfect : pct >= 0.7 ? ui().good : ui().meh;
  const was = streak(),
    xpWas = xpToday();
  const all = ids || [id];
  Promise.all(
    all.map((cid, k) => post("/api/log", { id: cid, mode, xp: k === 0 ? xp : 0, correct, total })),
  ).then(() => {
    const m = $("#mom");
    if (m) m.innerHTML = momTiles(was, xpWas);
  });
  const hasMiss = missedQ && missedQ.length;
  const draw = () => {
    const msg = pct === 1 ? ui().perfect : pct >= 0.7 ? ui().good : ui().meh;
    app.innerHTML = `<div class="round">${rtop(100, true)}<div class="res"><span class="tag">${ui().roundOver} · ${all.map((x) => "#" + x).join(", ")}</span><div class="n" style="margin-top:24px">${correct}<small>/${total}</small></div><div class="v">${msg}</div><div class="xp">+${xp} XP</div><div class="mom" id="mom">${momTiles(was, xpWas)}</div>${missRecap(missedQ)}</div>
    ${hasMiss ? `<div class="act" style="flex-direction:row;margin-top:20px"><button class="btn blue full" id="rv">${ui().reviewMisses} · ${missedQ.length}</button></div>` : ""}
    <div class="act" style="flex-direction:row;gap:12px;margin-top:${hasMiss ? "12" : "36"}px"><button class="btn line" id="ag" style="flex:1">${ui().again} ${kbd("R", 1)}</button><button class="btn green" id="hm" style="flex:1.4">${ui().home} ${kbd("Enter", 1)}</button></div></div>`;
    wireQuit();
    const again = () => {
      location.hash = mode === "quick" ? "quick" : `play/${id}/${mode}`;
      route(true);
    };
    $("#ag").onclick = again;
    $("#hm").onclick = () => (location.hash = "home");
    if (hasMiss)
      $("#rv").onclick = () => retryMisses(missedQ, (c, t, x) => finish(id, mode + "-review", c, t, x, ids));
    document.onkeydown = (e) => {
      if (e.key === "Enter") location.hash = "home";
      else if (e.key === "r" || e.key === "R" || e.key === "к") again();
      else if (e.key === "Escape") location.hash = "home";
    };
  };
  rerender = draw;
  draw();
}
function momTiles(was, xpWas) {
  const s = streak(),
    x = xpToday();
  return `<div><b style="color:var(--fire)">${icon.flame}${s}</b><span>${ui().streak}${s !== was ? ` · ${ui().was} ${was}` : ""}</span></div><div><b style="color:var(--warn)">${icon.bolt}${x}</b><span>${ui().xpt}</span></div><div><b><span class="dy l1" style="width:14px;height:14px"></span>${ui().todayw}</b><span>${ui().onmap}</span></div>`;
}

// ---------- true / false ----------
const splitS = (x) =>
  x
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
const okS = (s) => {
  const w = s.split(/\s+/).length;
  return (
    w >= 8 &&
    w <= 28 &&
    /^[A-ZА-ЯЁ]/.test(s) &&
    !/^(Поэтому|Потому|И |А |Плюс|Отсюда|So |And |But |Because|Which|That's|Plus|Then )/.test(s)
  );
};
function sentences(t) {
  return t[lang].a.flatMap((a) => splitS(a.t)).filter(okS);
}
// true statements with a twin in the other language: same paragraph, nearest position. Any sentence of that paragraph is still true.
function trueQs(t) {
  const o = other(),
    out = [];
  t[lang].a.forEach((a, p) => {
    const A = splitS(a.t),
      B = splitS((t[o].a[p] || { t: "" }).t);
    A.forEach((x, k) => {
      if (!okS(x)) return;
      let tw = null;
      if (B.length) {
        const j = A.length > 1 && B.length > 1 ? Math.round((k / (A.length - 1)) * (B.length - 1)) : 0;
        for (let d = 0; d < B.length && !tw; d++) {
          for (const c of [j - d, j + d]) if (!tw && B[c] && okS(B[c])) tw = B[c];
        }
        tw = tw || B[Math.min(j, B.length - 1)];
      }
      out.push(mkQ({ [lang]: x, [o]: tw || x }, t, true));
    });
  });
  return out;
}
const liesQs = (t) => {
  const d = window.DRILLS[t.n] || {};
  return (d.lies?.[lang] || []).map((x, k) => mkQ({ ru: d.lies.ru?.[k], en: d.lies.en?.[k] }, t, false));
};
const clozeQs = (t) => {
  const d = window.DRILLS[t.n] || {};
  return (d.cloze?.[lang] || []).map((x, k) => mkQ({ ru: d.cloze.ru?.[k], en: d.cloze.en?.[k] }, t));
};
function buildTF(ids, n = 10) {
  const ts = ids.map(ticketFor).filter(Boolean);
  if (!ts.length) return [];
  const pool = [];
  for (const t of ts) {
    liesQs(t).forEach((q) => pool.push(q));
    shuffle(trueQs(t))
      .slice(0, 6)
      .forEach((q) => pool.push(q));
  }
  const secs = new Set(ts.map((t) => t.sec));
  const extra = shuffle(window.TICKETS.filter((t) => secs.has(t.sec) && !ts.includes(t))).slice(0, 3);
  for (const t of extra)
    liesQs(t)
      .slice(0, 1)
      .forEach((q) => pool.push(q));
  const f = shuffle(pool.filter((p) => !p.ok)).slice(0, Math.ceil(n * 0.4));
  const tr = shuffle(pool.filter((p) => p.ok)).slice(0, n - f.length);
  return shuffle(f.concat(tr));
}
function tfScreen(title, q, i, n) {
  return `<div class="round">${rtop(Math.round((i / n) * 100))}<div class="body"><span class="tag">${esc(q.t[lang].topic)}</span><p class="stmt">${codify(q.s)}</p></div>
  <div class="act"><div class="pair"><button class="ans" id="f">${kbd("←", 1).replace('class="kbd dk"', 'class="kbd dk" style="left:14px"')}${ui().false}</button><button class="ans" id="t">${ui().true}${kbd("→", 1).replace('class="kbd dk"', 'class="kbd dk" style="right:14px"')}</button></div><div class="hint"><span>${kbd("Enter")} ${ui().hintNext}</span><span>${kbd("M")} ${ui().hintMore}</span><span>${kbd("Esc")} ${ui().hintQuit}</span></div></div><div id="sheetSlot"></div></div>`;
}
function runTF(qs, onDone, title, acc) {
  let i = 0;
  acc = acc || { correct: 0, xp: 0, missedQ: [] };
  const step = () => {
    if (i >= qs.length) {
      rerender = null;
      return onDone(acc);
    }
    const q = qs[i];
    let ans = null,
      moreOpen = false;
    const show = (v, redraw) => {
      const ok = v === q.ok;
      const picked = $(v ? "#t" : "#f"),
        oth = $(v ? "#f" : "#t");
      picked.classList.add("pick");
      if (!ok) picked.classList.add("bad");
      oth.classList.add("dim");
      picked.disabled = oth.disabled = true;
      setProg(i + 1, qs.length);
      $("#sheetSlot").innerHTML = sheet({
        ok,
        title: ok ? ui().resok : ui().resbad,
        sub: q.ok ? ui().true : ui().false,
        text: "",
        q,
        btn: ok ? "green" : "red",
        btnLabel: ui().next,
      });
      wireSheet(q, q.s, () => {
        i++;
        step();
      });
      const m = $("#more"),
        open = m.onclick;
      m.onclick = () => {
        moreOpen = true;
        open();
      };
      if (moreOpen || (!ok && !redraw)) m.click();
    };
    const answer = (v) => {
      if (ans !== null) return;
      ans = v;
      const ok = v === q.ok;
      beep(ok);
      setCombo(ok ? combo + 1 : 0);
      if (ok) {
        acc.correct++;
        acc.xp += 1;
      } else {
        acc.missedQ.push({ kind: "tf", q });
      }
      show(v, false);
    };
    const draw = () => {
      app.innerHTML = tfScreen(title, q, i, qs.length);
      wireQuit();
      setCombo(combo);
      if (ans !== null) return show(ans, true);
      $("#t").onclick = () => answer(true);
      $("#f").onclick = () => answer(false);
      document.onkeydown = (e) => {
        if (e.key === "ArrowRight") answer(true);
        else if (e.key === "ArrowLeft") answer(false);
        else if (e.key === "Escape") location.hash = "home";
      };
    };
    rerender = draw;
    draw();
  };
  step();
}
function playTF(id) {
  combo = 0;
  const qs = buildTF([id]);
  runTF(
    qs,
    (acc) =>
      finish(
        id,
        "tf",
        acc.correct,
        qs.length,
        acc.xp + (acc.correct === qs.length ? 3 : 0),
        null,
        acc.missedQ,
      ),
    ui().tf,
  );
}

// ---------- fill the gap ----------
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[«»"'`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .trim();
function gapScreen(q, i, n) {
  const answers = [];
  let k = 0;
  const html = esc(q.s).replace(/\[\[(.+?)\]\]/g, (_, a) => {
    const alts = a.split("|").map((x) => x.trim());
    answers.push(alts);
    const w = Math.min(280, Math.max(96, alts[0].length * 13 + 34));
    return `<input class="inp" id="g${k++}" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:${w}px">`;
  });
  return {
    answers,
    html: `<div class="round">${rtop(Math.round((i / n) * 100))}<div class="body"><span class="tag">${esc(q.t[lang].topic)}</span><p class="cloze">${html}</p></div><div class="act"><button class="btn blue full big" id="chk">${ui().check} ${kbd("Enter", 1)}</button></div><div id="sheetSlot"></div></div>`,
  };
}
function runGap(qs, onDone, acc) {
  let i = 0;
  acc = acc || { correct: 0, total: 0, xp: 0, missedQ: [] };
  const step = () => {
    if (i >= qs.length) {
      rerender = null;
      return onDone(acc);
    }
    const q = qs[i];
    let res = null,
      moreOpen = false;
    const typed = [];
    const show = (answers, redraw) => {
      const { all, per, misses } = res;
      answers.forEach((alts, j) => {
        const el = $("#g" + j);
        if (!el) return;
        const ok = per[j] !== false;
        el.classList.add(ok ? "ok" : "bad");
        el.disabled = true;
        if (!ok || !el.value) el.value = ok ? typed[j] || alts[0] : alts[0];
      });
      setProg(i + 1, qs.length);
      $("#chk").closest(".act").style.display = "none";
      const text = all
        ? ""
        : misses
            .map(
              ([v, j]) =>
                `${ui().youwrote} <code>${esc(v || "—")}</code> — ${ui().correctis} <b>${esc((answers[j] || [""])[0])}</b>`,
            )
            .join("<br>");
      const okN = per.filter((x) => x).length;
      $("#sheetSlot").innerHTML = sheet({
        ok: all,
        title: all ? ui().resok : ui().resbad,
        sub: per.length > 1 ? `${okN} ${ui().of} ${per.length}` : "",
        text,
        q,
        btn: all ? "green" : "red",
        btnLabel: ui().next,
      });
      wireSheet(
        q,
        q.s.replace(/\[\[(.+?)\]\]/g, (_, a) => a.split("|")[0]),
        () => {
          i++;
          step();
        },
        bestPara(
          q.t,
          q.s.replace(/\[\[(.+?)\]\]/g, (_, a) => a.replace(/\|/g, " ")),
        ),
      );
      const m = $("#more"),
        open = m.onclick;
      m.onclick = () => {
        moreOpen = true;
        open();
      };
      if (moreOpen || (!all && !redraw)) m.click();
    };
    const check = (answers) => {
      if (res) return;
      let all = true;
      const per = [],
        misses = [];
      answers.forEach((alts, j) => {
        const el = $("#g" + j);
        const raw = el.value;
        typed[j] = raw;
        const v = norm(raw);
        const ok =
          alts.some((a) => norm(a) === v) ||
          (v.length > 3 && alts.some((a) => norm(a).startsWith(v) && v.length >= norm(a).length - 1));
        per.push(ok);
        acc.total++;
        if (ok) {
          acc.correct++;
          acc.xp += 2;
        } else {
          all = false;
          misses.push([raw, j]);
        }
      });
      if (!all) acc.missedQ.push({ kind: "gap", q });
      beep(all);
      setCombo(all ? combo + 1 : 0);
      res = { all, per, misses };
      show(answers, false);
    };
    const draw = () => {
      const { answers, html } = gapScreen(q, i, qs.length);
      app.innerHTML = html;
      wireQuit();
      setCombo(combo);
      answers.forEach((_, j) => {
        const el = $("#g" + j);
        if (!el) return;
        if (typed[j] != null) el.value = typed[j];
        el.oninput = () => {
          typed[j] = el.value;
        };
      });
      if (res) return show(answers, true);
      if ($("#g0")) $("#g0").focus();
      $("#chk").onclick = () => check(answers);
      document.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          check(answers);
        } else if (e.key === "Escape") location.hash = "home";
      };
    };
    rerender = draw;
    draw();
  };
  step();
}
function playGap(id) {
  combo = 0;
  const t = ticketFor(id);
  const qs = shuffle(clozeQs(t)).slice(0, 3);
  if (!qs.length) return home();
  runGap(qs, (acc) => finish(id, "gap", acc.correct, acc.total, acc.xp, null, acc.missedQ));
}

// ---------- order the steps ----------
function playOrder(id) {
  const t = ticketFor(id);
  const st0 = window.DRILLS[t.n]?.steps?.[lang];
  if (!st0) return home();
  combo = 0;
  const ST = () => window.DRILLS[t.n]?.steps?.[lang] || st0;
  let cur = shuffle(st0.items.map((s, i) => i));
  if (cur.every((v, i) => v === i)) cur.reverse();
  let sel = null,
    tries = 0,
    lastRes = null;
  const render = (result) => {
    const st = ST();
    app.innerHTML = `<div class="round">${rtop(result && result.ok ? 100 : 0, result && result.ok)}<div class="body"><span class="tag">${esc(t[lang].topic)}</span><p class="q">${esc(st.title)}</p>
      <div class="steps">${cur.map((idx, pos) => `<div class="step${sel === pos ? " sel" : ""}${result ? (idx === pos ? " ok" : " bad") : ""}" data-pos="${pos}" draggable="${!result}"><span class="n">${pos + 1}</span><span class="sx">${codify(st.items[idx])}</span><span class="mv"><button data-up="${pos}" aria-label="up">${icon.up}</button><button data-dn="${pos}" aria-label="down">${icon.down}</button></span></div>`).join("")}</div></div>
      ${result ? "" : `<div class="act"><button class="btn blue full big" id="chk">${ui().check} ${kbd("Enter", 1)}</button><div class="hint"><span>${kbd("↑")}${kbd("↓")} ${ui().hintMove}</span><span>${kbd("Enter")} ${ui().hintCheck}</span></div></div>`}<div id="sheetSlot"></div></div>`;
    wireQuit();
    const move = (a, b) => {
      if (b < 0 || b >= cur.length) return;
      const v = cur.splice(a, 1)[0];
      cur.splice(b, 0, v);
      sel = b;
      render();
    };
    app.querySelectorAll("[data-up]").forEach(
      (b) =>
        (b.onclick = (e) => {
          e.stopPropagation();
          move(+b.dataset.up, +b.dataset.up - 1);
        }),
    );
    app.querySelectorAll("[data-dn]").forEach(
      (b) =>
        (b.onclick = (e) => {
          e.stopPropagation();
          move(+b.dataset.dn, +b.dataset.dn + 1);
        }),
    );
    app.querySelectorAll(".step").forEach((li) => {
      const pos = +li.dataset.pos;
      li.onclick = () => {
        if (result) return;
        if (sel === null) {
          sel = pos;
          render();
        } else if (sel === pos) {
          sel = null;
          render();
        } else move(sel, pos);
      };
      li.ondragstart = (e) => {
        e.dataTransfer.setData("text", pos);
      };
      li.ondragover = (e) => e.preventDefault();
      li.ondrop = (e) => {
        e.preventDefault();
        move(+e.dataTransfer.getData("text"), pos);
      };
    });
    const check = () => {
      tries++;
      const n = cur.filter((v, i) => v === i).length;
      const ok = n === cur.length;
      beep(ok);
      setCombo(ok ? combo + 1 : 0);
      drawResult({ ok, n });
    };
    if ($("#chk")) $("#chk").onclick = check;
    if (!result)
      document.onkeydown = (e) => {
        if (e.key === "Enter") check();
        else if (e.key === "ArrowUp" && sel !== null) {
          e.preventDefault();
          move(sel, sel - 1);
        } else if (e.key === "ArrowDown" && sel !== null) {
          e.preventDefault();
          move(sel, sel + 1);
        } else if (e.key === "Escape") location.hash = "home";
      };
  };
  const drawResult = ({ ok, n }) => {
    lastRes = { ok, n };
    render({ ok, n });
    const st = ST();
    const wrong = cur.map((v, i) => (v !== i ? i + 1 : null)).filter(Boolean);
    $("#sheetSlot").innerHTML = sheet({
      ok,
      title: ok ? ui().resok : ui().resbad,
      sub: `${n} ${ui().of} ${cur.length} ${ui().inplace}`,
      text: ok ? "" : `${ui().swapped}: ${wrong.join(", ")}`,
      q: { t, ok: true },
      btn: ok ? "green" : "red",
      btnLabel: ok ? ui().next : ui().tryagain,
    });
    wireSheet(
      { t, ok: true },
      st.title,
      ok
        ? () => {
            rerender = null;
            finish(id, "order", 1, 1, tries === 1 ? 5 : 2);
          }
        : () => {
            lastRes = null;
            render();
          },
      bestPara(t, st.title),
    );
  };
  rerender = () => (lastRes ? drawResult(lastRes) : render());
  render();
}

// ---------- voice ----------
function playVoice(id) {
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
      u.lang = lang === "ru" ? "ru-RU" : "en-US";
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
    const d = t[lang];
    app.innerHTML = `<div class="round">${rtop(Math.round((qi / 3) * 100))}<div class="body" style="gap:10px"><span class="qn">${lang === "ru" ? "Вопрос" : "Question"} ${qi + 1} / 3</span><p class="q">${codify(d.qs[qi])}</p>
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
        rec.lang = lang === "ru" ? "ru-RU" : "en-US";
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
    $("#ask").onclick = () => speak(t[lang].qs[qi]);
    $("#rec").onclick = startRec;
    $("#stp").onclick = stopRec;
    $("#nxq").onclick = () => {
      stopAll();
      if (qi < 2) {
        qi++;
        render();
      } else reveal();
    };
    rerender = () => {
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
    const d = t[lang];
    rerender = reveal;
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
      lastChanged = ids[0];
      app.innerHTML = `<div class="round">${rtop(100, true)}<div class="res"><span class="tag">${ids.map((x) => "#" + x).join(", ")} → ${ui().statuses[st]}</span><div class="n" style="margin-top:24px;color:${{ green: "var(--good)", yellow: "var(--warn)", red: "var(--crit)" }[st]}">${{ green: "✓", yellow: "~", red: "✗" }[st]}</div><div class="v">${{ green: ui().g, yellow: ui().y, red: ui().r }[st]}</div><div class="xp">+${xp} XP</div><div class="mom">${momTiles(was, xpWas)}</div></div>
        <div class="act" style="flex-direction:row;gap:12px;margin-top:36px"><button class="btn green full big" id="hm">${ui().home} ${kbd("Enter", 1)}</button></div></div>`;
      rerender = null;
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

// ---------- quick round ----------
function quick() {
  const d = due()
    .slice(0, 3)
    .map((i) => i.id);
  const nn = nextNew();
  const ids = d.length ? d : nn ? [nn.id] : [17];
  combo = 0;
  const qs = buildTF(ids, 8);
  runTF(
    qs,
    (acc) => {
      const ts = ids.map(ticketFor).filter(Boolean);
      const gq = shuffle(ts.flatMap((t) => clozeQs(t))).slice(0, 5);
      runGap(gq, (g) =>
        finish(
          ids[0],
          "quick",
          acc.correct + g.correct,
          qs.length + g.total,
          acc.xp + g.xp,
          ids,
          acc.missedQ.concat(g.missedQ),
        ),
      );
    },
    ui().quick,
  );
}

// ---------- router ----------
function route() {
  document.onkeydown = null;
  rerender = null;
  try {
    speechSynthesis.cancel();
  } catch {}
  window.scrollTo(0, 0);
  if (needLogin) return loginScreen();
  const h = location.hash.slice(1) || "home";
  const [scr, a, b] = h.split("/");
  if (scr === "play") {
    const id = +a;
    if (!byId(id)) return home();
    (({ tf: playTF, gap: playGap, order: playOrder, voice: playVoice })[b] || home)(id);
    return;
  }
  if (scr === "quick") return quick();
  if (scr === "item") return itemScreen(+a);
  home();
}
window.addEventListener("hashchange", () => route());
loadState().then(async () => {
  await flushPending();
  route();
});
