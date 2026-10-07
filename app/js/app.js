// Entry point of the app (index.html): global listeners, the tab bar, offline support, boot.
import { go, route, upgradeOldLink } from "./router.js";
import { tipHide, tipShow } from "./tip.js";
import { state } from "./state.js";
import { flushPending, loadAttempts, loadState } from "./store.js";
import { drawTabs } from "./ui.js";

upgradeOldLink();
document.documentElement.lang = state.lang;
drawTabs();
document.addEventListener("langchange", drawTabs);

// tooltips on [data-tip] (heatmap days, readiness bars): hover with a mouse, tap on touch
document.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  const el = e.target.closest("[data-tip]");
  el ? tipShow(el, e.clientX, e.clientY) : tipHide();
});
document.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  const el = e.target.closest("[data-tip]");
  if (el) {
    const rc = el.getBoundingClientRect();
    tipShow(el, rc.left + rc.width / 2, rc.top);
  } else tipHide();
});
addEventListener("scroll", tipHide, { passive: true });
addEventListener("hashchange", () => {
  tipHide();
  go();
});

// back online: send what was recorded offline; redraw unless a round is in progress
addEventListener("online", async () => {
  await loadState();
  await flushPending();
  if (!document.body.classList.contains("inround")) route();
});

// the service worker caches the app shell and lessons, so it opens and works offline
if ("serviceWorker" in navigator && location.hostname !== "localhost")
  navigator.serviceWorker.register("/sw.js").catch(() => {});

loadState().then(async () => {
  await flushPending();
  route();
  // exam scores are cached locally; refresh the cache in the background for the next screen
  if (state.live) loadAttempts();
});
