// Pull down from the top to reload. Only in the home-screen app (Safari and Chrome tabs have their own).
// Off during a round (.round on screen) and while there's typed text, so a stray swipe never loses work.
(() => {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (!standalone || !("ontouchstart" in window)) return;

  const THRESHOLD = 72, MAX = 120;
  const css = document.createElement("style");
  css.textContent = `
  #ptr{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 8px);z-index:100;width:40px;height:40px;margin-left:-20px;border-radius:50%;
    background:#121a2c;border:1px solid #22304a;box-shadow:0 6px 20px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;
    color:#98a3ba;transform:translateY(-70px);opacity:0;pointer-events:none;transition:transform 180ms ease,opacity 180ms ease}
  #ptr.drag{transition:none}
  #ptr.ready{color:#ff7a59;border-color:#ff7a59}
  #ptr svg{transition:transform 160ms ease}
  #ptr.ready svg{transform:rotate(180deg)}
  #ptr.spin svg{display:none}
  #ptr.spin::after{content:"";width:18px;height:18px;border-radius:50%;border:2.5px solid #ff7a59;border-right-color:transparent;animation:ptrspin .7s linear infinite}
  @keyframes ptrspin{to{transform:rotate(360deg)}}
  @media(prefers-reduced-motion:reduce){#ptr,#ptr svg{transition:none}}`;
  document.head.appendChild(css);
  const el = document.createElement("div");
  el.id = "ptr"; el.setAttribute("aria-hidden", "true");
  el.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>';
  const mount = () => document.body.appendChild(el);
  document.body ? mount() : document.addEventListener("DOMContentLoaded", mount);

  let y0 = null, x0 = 0, dist = 0, busy = false;
  const blocked = (t) =>
    busy || window.scrollY > 0 || document.querySelector(".round") ||
    (t && t.closest && t.closest("input,textarea,select,[contenteditable],.tlwrap")) ||
    [...document.querySelectorAll("textarea,input[type=text]")].some((f) => f.value && f.value.trim());
  const show = (d) => {
    const p = Math.min(d, MAX);
    el.style.transform = `translateY(${p - 60}px)`;
    el.style.opacity = Math.min(1, p / 40);
    el.classList.toggle("ready", p >= THRESHOLD);
  };
  const reset = () => { el.classList.remove("drag", "ready"); el.style.transform = ""; el.style.opacity = ""; y0 = null; dist = 0; };

  addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || blocked(e.target)) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dist = 0;
  }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (y0 === null) return;
    const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
    if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) { if (dist) reset(); else y0 = null; return; }
    dist = dy * 0.5; el.classList.add("drag"); show(dist);
  }, { passive: true });
  addEventListener("touchend", () => {
    if (y0 === null) return;
    if (dist >= THRESHOLD) {
      busy = true; el.classList.remove("drag", "ready"); el.classList.add("spin");
      el.style.transform = "translateY(12px)"; el.style.opacity = 1;
      setTimeout(() => location.reload(), 250);
    } else reset();
  });
  addEventListener("touchcancel", reset);
})();
