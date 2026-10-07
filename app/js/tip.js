// Tooltip for [data-tip] elements (heatmap days, readiness bars): hover with a mouse, tap on touch.
import { $ } from "./util.js";

export function tipShow(el, x, y) {
  const tp = $("#tip");
  if (!tp) return;
  tp.innerHTML = (el.dataset.sub ? `<small>${el.dataset.sub}</small>` : "") + el.dataset.tip;
  const w = tp.offsetWidth,
    h = tp.offsetHeight;
  tp.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + "px";
  tp.style.top = Math.max(8, y - h - 12) + "px";
  tp.classList.add("on");
}

export const tipHide = () => {
  const tp = $("#tip");
  if (tp) tp.classList.remove("on");
};
