// Progress data: loading it from the API, saving attempts (or queueing them offline), and queries over items and history.
import { applyHit, dueItems, intervalOf, isDue as isDueOn } from "../lib/srs.js";
import { state } from "./state.js";
import { TODAY, dLocal, iso } from "./util.js";

export const NEW_ORDER = [38, 39, 22, 25, 23, 32, 27, 28, 29, 30, 31, 40, 35, 36, 37, 42];

export async function loadState() {
  state.needLogin = false;
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.ok) {
      state.db = await r.json();
      state.live = true;
    } else if (r.status === 401) {
      state.needLogin = true;
    }
  } catch {}
  if (!state.live && !state.needLogin) for (const p of state.pending) applyLocal(p);
  if (!state.needLogin) await syncCatalog();
}

// tickets.js is the catalog: any core id a ticket points to must exist as an item, or progress on it is dropped
export async function syncCatalog() {
  const miss = [];
  for (const t of window.TICKETS || []) {
    if (t.sec === "parked") continue;
    for (const id of t.core || [])
      if (!state.db.items.some((i) => i.id === id) && !miss.some((m) => m.id === id))
        miss.push({ id, s: t.sec, t: t.en.topic });
  }
  if (!miss.length) return;
  if (state.live) {
    try {
      const r = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: miss }),
      });
      if (r.ok) {
        state.db = await r.json();
        return;
      }
    } catch {}
  }
  for (const m of miss) state.db.items.push({ ...m, st: "new" });
  state.db.items.sort((a, b) => a.id - b.id);
}

// offline: record the attempt locally with the same rules the server uses (lib/srs.js)
export const applyLocal = (p) => applyHit(state.db, p, TODAY);

export async function post(path, body) {
  body.d = TODAY;
  if (state.live) {
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        state.db = await r.json();
        return true;
      }
    } catch {}
    state.live = false;
  }
  state.pending.push({ ...body, path });
  localStorage.setItem("drill.pending", JSON.stringify(state.pending));
  applyLocal(body);
  return false;
}

export async function flushPending() {
  if (!state.live || !state.pending.length) return;
  for (const p of state.pending.slice()) {
    try {
      const r = await fetch(p.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p),
      });
      if (r.ok) {
        state.db = await r.json();
        state.pending.shift();
      }
    } catch {
      break;
    }
  }
  localStorage.setItem("drill.pending", JSON.stringify(state.pending));
}

export const byId = (id) => state.db.items.find((i) => i.id === id);

export const ticketFor = (id) => window.TICKETS.find((t) => (t.core || []).includes(id));

export const due = () => dueItems(state.db.items);

export const ivOf = intervalOf;

export const isDue = (i) => isDueOn(i);

export const nextNew = () => NEW_ORDER.map(byId).find((i) => i && i.st === "new");

export function streak() {
  const set = new Set(state.db.history.filter((h) => h.ids && h.ids.length).map((h) => h.d));
  let n = 0,
    d = dLocal(TODAY);
  if (!set.has(TODAY)) d.setDate(d.getDate() - 1);
  while (set.has(iso(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export const xpToday = () => (state.db.history.find((h) => h.d === TODAY) || {}).xp || 0;
