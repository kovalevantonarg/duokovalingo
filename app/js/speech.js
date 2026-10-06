// Speech in and out, both from the browser (Web Speech API): dictation into a text field, reading text aloud.
import { state } from "./state.js";

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
/** Can this browser turn speech into text? (Chrome, Edge, Safari; not Firefox.) */
export const canDictate = !!SR;
export const canSpeak = "speechSynthesis" in window;
const tag = () => (state.lang === "ru" ? "ru-RU" : "en-US");

/**
 * Start dictation. `onText(final, interim)` gets the recognised text so far: final grows, interim is the
 * current guess. Recognition restarts itself after pauses until `stop()` is called.
 */
export function dictate(onText, { initial = "", onEnd } = {}) {
  if (!SR) return null;
  let final = initial && !/\s$/.test(initial) ? initial + " " : initial;
  let on = true;
  const rec = new SR();
  rec.lang = tag();
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (e) => {
    let interim = "";
    for (let k = e.resultIndex; k < e.results.length; k++) {
      const r = e.results[k];
      if (r.isFinal) final += r[0].transcript.trim() + " ";
      else interim += r[0].transcript;
    }
    onText(final, interim);
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") on = false;
  };
  rec.onend = () => {
    if (on) {
      try {
        rec.start();
      } catch {}
    } else onEnd?.(final);
  };
  try {
    rec.start();
  } catch {}
  return {
    stop() {
      on = false;
      try {
        rec.stop();
      } catch {}
      return final;
    },
    get text() {
      return final;
    },
  };
}

/** Say one short text. */
export function speak(text, rate = 0.95) {
  if (!canSpeak) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = tag();
    u.rate = rate;
    speechSynthesis.speak(u);
  } catch {}
}

/** Split long text into sentence-sized chunks: some engines cut off utterances longer than ~15 seconds. */
export function chunks(text, max = 220) {
  const out = [];
  for (const s of text.split(/(?<=[.!?…:;])\s+/)) {
    if (!s.trim()) continue;
    if (out.length && (out[out.length - 1] + " " + s).length <= max) out[out.length - 1] += " " + s;
    else out.push(s.trim());
  }
  return out;
}

/**
 * Read a list of texts aloud, one after another. `onPart(i)` fires as part i starts; `onDone` at the end.
 * Returns { pause, resume, stop }.
 */
export function readAloud(parts, { onPart, onDone, rate = 1, from = 0 } = {}) {
  if (!canSpeak) return null;
  speechSynthesis.cancel();
  let i = from,
    stopped = false;
  const next = () => {
    if (stopped) return;
    if (i >= parts.length) return onDone?.();
    const u = new SpeechSynthesisUtterance(parts[i]);
    u.lang = tag();
    u.rate = rate;
    u.onend = () => {
      i++;
      next();
    };
    u.onerror = (e) => {
      if (e.error !== "interrupted" && e.error !== "canceled") {
        i++;
        next();
      }
    };
    onPart?.(i);
    speechSynthesis.speak(u);
  };
  next();
  return {
    pause: () => speechSynthesis.pause(),
    resume: () => speechSynthesis.resume(),
    stop() {
      stopped = true;
      speechSynthesis.cancel();
    },
    get index() {
      return i;
    },
  };
}

export function stopSpeaking() {
  try {
    if (canSpeak) speechSynthesis.cancel();
  } catch {}
}
