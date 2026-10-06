// Entry point of the drill app (index.html). Modules hold the code; this file wires global listeners and boots.
import { route } from "./router.js";
import { tipHide, tipShow } from "./screens/activity.js";
import { flushPending, loadState } from "./store.js";

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

window.addEventListener("hashchange", () => route());

loadState().then(async () => {
  await flushPending();
  route();
});
