// Password screen shown when the API answers 401.
import { route } from "../router.js";
import { flushPending, loadState } from "../store.js";
import { app, ui } from "../ui.js";
import { $ } from "../util.js";

export function loginScreen(err) {
  document.body.classList.add("inround");
  app.innerHTML = `<div class="v-app"><div class="login"><a class="wm">duokovalingo</a><form id="lf"><input type="password" id="pw" placeholder="${ui().pw}" autocomplete="current-password" autofocus><button class="btn blue full big" type="submit">${ui().enter}</button><div class="err">${err || ""}</div></form></div></div>`;
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
