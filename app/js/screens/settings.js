// Bottom sheet, and the settings sheet in it: language, sound, reminders, offline lessons, sign out.
import { icon } from "../icons.js";
import { route } from "../router.js";
import { beep, soundOn, toggleSound } from "../sound.js";
import { emptyDb } from "../../lib/srs.js";
import { persist, state } from "../state.js";
import { setLang, ui } from "../ui.js";
import { $, esc } from "../util.js";
import { loginScreen } from "./login.js";

/** Open a bottom sheet with `html`; `wire(el)` attaches handlers. Closes on the backdrop, Esc or swipe down. */
export function openSheet(html, wire) {
  closeSheet();
  const root = document.createElement("div");
  root.id = "sheetRoot";
  root.className = "v-app";
  root.innerHTML = `<div class="bdrop"></div><div class="bsheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add("on"));
  root.querySelector(".bdrop").onclick = closeSheet;
  const keys = document.onkeydown;
  document.onkeydown = (e) => {
    if (e.key === "Escape") closeSheet();
  };
  root._keys = keys;
  const sh = root.querySelector(".bsheet");
  let y0 = null;
  sh.addEventListener("touchstart", (e) => (y0 = sh.scrollTop <= 0 ? e.touches[0].clientY : null), {
    passive: true,
  });
  sh.addEventListener(
    "touchmove",
    (e) => {
      if (y0 === null) return;
      const dy = e.touches[0].clientY - y0;
      sh.style.transform = dy > 0 ? `translateY(${dy}px)` : "";
    },
    { passive: true },
  );
  sh.addEventListener("touchend", (e) => {
    if (y0 === null) return;
    const dy = e.changedTouches[0].clientY - y0;
    y0 = null;
    if (dy > 90) closeSheet();
    else sh.style.transform = "";
  });
  wire?.(sh);
  return sh;
}

export function closeSheet() {
  const root = $("#sheetRoot");
  if (!root) return;
  document.onkeydown = root._keys || null;
  root.remove();
}

// ---- reminders (Web Push): the server sends one in the morning when something is due ----
const pushable = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const b64 = (s) => {
  const p = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
async function currentSub() {
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}
async function setReminders(on) {
  const reg = await navigator.serviceWorker.ready;
  if (on) {
    if ((await Notification.requestPermission()) !== "granted") throw new Error(ui().pushDenied);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64(state.db.push),
    });
    const r = await fetch("/api/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sub }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
  } else {
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sub, off: true }),
      }).catch(() => {});
      await sub.unsubscribe();
    }
  }
}

// ---- lessons for offline reading: fetch them all once, the service worker keeps them ----
async function saveLessons(btn) {
  btn.disabled = true;
  try {
    const idx = await (await fetch("lessons/index.json")).json();
    const ns = Object.keys(idx);
    let done = 0;
    for (const n of ns) {
      await fetch(`lessons/L${n}.json`).catch(() => {});
      btn.textContent = `${++done}/${ns.length}`;
    }
    persist("learn.offline", "1");
    btn.textContent = ui().saved;
  } catch {
    btn.textContent = ui().failed;
    btn.disabled = false;
  }
}

export function openSettings() {
  const row = (label, sub, ctl) =>
    `<div class="srow"><div class="sl"><b>${label}</b>${sub ? `<small>${sub}</small>` : ""}</div>${ctl}</div>`;
  const toggle = (id, on) =>
    `<button class="tgl${on ? " on" : ""}" id="${id}" role="switch" aria-checked="${!!on}"><i></i></button>`;
  const html = `<h3 class="sh">${ui().settings}</h3>
    ${row(ui().language, "", `<div class="seg"><button data-l="ru" class="${state.lang === "ru" ? "on" : ""}">RU</button><button data-l="en" class="${state.lang === "en" ? "on" : ""}">EN</button></div>`)}
    ${row(ui().sound, ui().soundd, toggle("sndT", soundOn()))}
    ${state.db.push && pushable() ? row(ui().reminders, ui().remindersd, toggle("pushT", false)) : ""}
    ${"serviceWorker" in navigator ? row(ui().offlineLessons, ui().offlineLessonsd, `<button class="btn line" id="offl">${localStorage.getItem("learn.offline") ? ui().saved : ui().save}</button>`) : ""}
    <div class="sfoot">${state.live ? ui().synced : `${icon.warn}${ui().offlineShort}${state.pending.length ? ` · ${state.pending.length} ${ui().pending}` : ""}`}</div>
    ${state.db.auth ? `<div class="sfoot">${ui().signedIn} <b>${esc(state.db.user?.email || "")}</b></div><button class="btn line full" id="lo">${icon.out}${ui().logout}</button>` : ""}`;
  openSheet(html, (sh) => {
    sh.querySelectorAll("[data-l]").forEach(
      (b) =>
        (b.onclick = () => {
          setLang(b.dataset.l);
          closeSheet();
          document.dispatchEvent(new Event("langchange"));
          route();
          openSettings();
        }),
    );
    sh.querySelector("#sndT").onclick = (e) => {
      const on = toggleSound();
      e.currentTarget.classList.toggle("on", on);
      e.currentTarget.setAttribute("aria-checked", on);
      beep(true);
    };
    const pt = sh.querySelector("#pushT");
    if (pt) {
      currentSub().then((s) => {
        pt.classList.toggle("on", !!s);
        pt.setAttribute("aria-checked", !!s);
      });
      pt.onclick = async () => {
        const on = !pt.classList.contains("on");
        pt.disabled = true;
        try {
          await setReminders(on);
          pt.classList.toggle("on", on);
          pt.setAttribute("aria-checked", on);
        } catch (e) {
          sh.querySelector(".sfoot").textContent = String(e.message || e);
        }
        pt.disabled = false;
      };
    }
    const off = sh.querySelector("#offl");
    if (off) off.onclick = () => saveLessons(off);
    const lo = sh.querySelector("#lo");
    if (lo)
      lo.onclick = async () => {
        await fetch("/api/logout", { method: "POST" }).catch(() => {});
        state.db = emptyDb();
        state.live = false;
        try {
          localStorage.removeItem("drill.db");
        } catch {}
        closeSheet();
        loginScreen();
      };
  });
}
