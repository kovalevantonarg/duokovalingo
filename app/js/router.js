// Hash router: #home, #item/<id>, #play/<id>/<mode>, #quick.
import { playGap } from "./games/fill-gap.js";
import { playOrder } from "./games/order.js";
import { quick } from "./games/quick.js";
import { playTF } from "./games/true-false.js";
import { playVoice } from "./games/voice.js";
import { home, itemScreen } from "./screens/home.js";
import { loginScreen } from "./screens/login.js";
import { state } from "./state.js";
import { byId } from "./store.js";

export function route() {
  document.onkeydown = null;
  state.rerender = null;
  try {
    speechSynthesis.cancel();
  } catch {}
  window.scrollTo(0, 0);
  if (state.needLogin) return loginScreen();
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
