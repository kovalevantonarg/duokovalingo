// Vercel Web Analytics and Speed Insights (scripts in index.html). The app routes by #hash, which the scripts
// don't see, so every screen sends its own page view. The path is the hash route without "#" (a "#" in the path
// shows up as "%23" in the dashboard) and without query parts (no dictionary words leave the app); the route
// folds ids ("/t/12" → "/t/[n]") so the dashboard groups screens of one kind.
let last = "";
export function pageview(hashPath) {
  const path =
    "/" +
    String(hashPath || "home")
      .replace(/^#?\/?/, "")
      .split("?")[0];
  if (path === last) return;
  last = path;
  const route = path.replace(/\/\d+(?=\/|$)/g, "/[n]");
  window.va?.("pageview", { route, path });
  // Speed Insights reads the route from its script tag when it reports (INP and CLS come in on leaving)
  const si = document.getElementById("si");
  if (si) si.dataset.route = route;
}
