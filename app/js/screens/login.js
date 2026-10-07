// Sign-in screen, shown when the API answers 401: one button, Google does the rest (api/_auth.js).
import { icon } from "../icons.js";
import { app, ui } from "../ui.js";
import { esc } from "../util.js";

export function loginScreen() {
  const err = new URLSearchParams(location.search).get("auth_error");
  if (err) history.replaceState(null, "", "/" + location.hash);
  document.body.classList.add("inround");
  app.innerHTML = `<div class="v-app"><div class="login"><a class="wm">duokovalingo</a><p class="sub">${ui().loginLead}</p>
    <a class="btn line full big gbtn" href="/api/google">${icon.google}${ui().google}</a>
    <div class="err">${err ? esc(ui().loginFailed + (err === "access_denied" ? "" : ` (${err})`)) : ""}</div><a class="priv" href="/privacy">${ui().privacy}</a></div></div>`;
}
