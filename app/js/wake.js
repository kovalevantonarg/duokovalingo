// Keep the screen on while reading a lesson, like a video player does (Screen Wake Lock API).
// The browser drops the lock when the tab is hidden, so it is taken again when the page comes back.
let lock = null,
  want = false;

async function take() {
  if (!want || lock || document.visibilityState !== "visible" || !navigator.wakeLock) return;
  try {
    lock = await navigator.wakeLock.request("screen");
    lock.addEventListener("release", () => (lock = null));
    if (!want) release(); // left the screen while the request was in flight
  } catch {
    lock = null; // battery saver, no permission, unsupported: the screen just dims as usual
  }
}

function release() {
  want = false;
  lock?.release().catch(() => {});
  lock = null;
}

document.addEventListener("visibilitychange", take);

/** Keep the screen awake until the returned function is called. */
export function keepAwake() {
  want = true;
  take();
  return release;
}
