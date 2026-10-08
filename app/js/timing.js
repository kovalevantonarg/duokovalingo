// Honest time estimates. Defaults assume studying new technical material, not skimming; after a few real
// measurements on this device the estimates use your own pace instead.
const read = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : null;
};
const round5 = (m) => Math.max(5, Math.round(m / 5) * 5);

/** Default study pace for a lesson, words per minute: slow end and fast end. */
const WPM = [55, 80];
const MIN_SAMPLES = 3;

/** Personal pace from finished lessons (words per minute), or null until there are enough measurements. */
function myWpm() {
  const xs = read("learn.samples", []).map((s) => s.words / s.min);
  return xs.length >= MIN_SAMPLES ? median(xs) : null;
}

/** [low, high] minutes to study a lesson of `words` words. */
export function lessonMinutes(words) {
  const w = myWpm();
  if (w) return [round5((words / w) * 0.85), round5((words / w) * 1.15)];
  return [round5(words / WPM[1]), round5(words / WPM[0])];
}
export const lessonLabel = (words, ru) => {
  const [lo, hi] = lessonMinutes(words);
  return lo === hi ? `≈ ${lo} ${ru ? "мин" : "min"}` : `≈ ${lo}–${hi} ${ru ? "мин" : "min"}`;
};

/**
 * Count active study time on a lesson: seconds while the tab is visible and there was input in the last 90 s.
 * Returns stop(), which saves the time. Totals accumulate per lesson across visits.
 */
export function trackLesson(n) {
  let last = Date.now(),
    active = 0,
    lastInput = Date.now();
  const poke = () => (lastInput = Date.now());
  const evs = ["scroll", "pointerdown", "keydown", "wheel", "touchstart"];
  evs.forEach((e) => addEventListener(e, poke, { passive: true }));
  const tick = setInterval(() => {
    const now = Date.now();
    if (document.visibilityState === "visible" && now - lastInput < 90e3) active += now - last;
    last = now;
  }, 5e3);
  return function stop() {
    clearInterval(tick);
    evs.forEach((e) => removeEventListener(e, poke));
    const t = read("learn.time", {});
    t[n] = (t[n] || 0) + active / 60e3;
    write("learn.time", t);
  };
}

/** A lesson was finished (marked read): keep its words/minutes as a pace sample, if the time looks real. */
export function lessonDone(n, words) {
  const min = read("learn.time", {})[n] || 0;
  if (min < 3 || !words) return;
  const xs = read("learn.samples", []).filter((s) => s.n !== n);
  xs.push({ n, words, min: Math.round(min * 10) / 10 });
  write("learn.samples", xs.slice(-20));
}

/** Minutes for a daily session over k tickets: warm-up plus each ticket out loud; personal after 3 sessions. */
export function sessionMinutes(k) {
  const xs = read("session.samples", []).map((s) => s.min / Math.max(1, s.k));
  return round5(xs.length >= MIN_SAMPLES ? median(xs) * k : 3 + 5 * k);
}
export function sessionDone(k, startedAt) {
  const min = (Date.now() - startedAt) / 60e3;
  if (min < 2 || min > 120) return;
  const xs = read("session.samples", []);
  xs.push({ k, min: Math.round(min) });
  write("session.samples", xs.slice(-20));
}

/** Where reading stopped in a lesson: index of the section, kept per lesson. */
export const lessonPos = (n) => read("learn.pos", {})[n] ?? 0;
export function setLessonPos(n, i) {
  const p = read("learn.pos", {});
  if (p[n] === i) return;
  p[n] = i;
  write("learn.pos", p);
}
