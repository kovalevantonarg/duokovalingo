// Speech in and out, both from the browser (Web Speech API): dictation into a text field, reading text aloud.
import { state } from "./state.js";

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
/** Can this browser turn speech into text? (Chrome, Edge, Safari; not Firefox.) */
export const canDictate = !!SR;
export const canSpeak = "speechSynthesis" in window;
const tag = () => (state.lang === "ru" ? "ru-RU" : "en-US");

// ---- voice choice: system voices differ a lot; the "natural"/"enhanced" ones sound far less robotic ----
const GOOD =
  /natural|neural|online|premium|enhanced|siri|google|милена|katya|yuri|dariya|svetlana|dmitry|samantha|ava|zoe|evan/i;
const BAD = /compact|espeak|novelty|whisper|bad news|bells|zarvox|trinoids|albert|fred|junior|ralph/i;
/** Voices for the current language, best first. */
export function voices() {
  if (!canSpeak) return [];
  const want = tag().slice(0, 2);
  const score = (v) =>
    (GOOD.test(v.name) ? 4 : 0) +
    (v.lang === tag() ? 2 : 0) +
    (v.localService ? 0 : 1) -
    (BAD.test(v.name) ? 10 : 0);
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith(want))
    .sort((a, b) => score(b) - score(a));
}
const voiceKey = () => "drill.voice." + state.lang;
/** The chosen voice for the current language: the one picked in settings, else the best-scoring one. */
export function voice() {
  const vs = voices();
  let saved = null;
  try {
    saved = localStorage.getItem(voiceKey());
  } catch {}
  return vs.find((v) => v.name === saved) || vs[0] || null;
}
export function setVoice(name) {
  try {
    localStorage.setItem(voiceKey(), name);
  } catch {}
}
if (canSpeak) speechSynthesis.getVoices(); // Chrome loads the list lazily
const utter = (text, rate) => {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = tag();
  u.rate = rate;
  const v = voice();
  if (v) u.voice = v;
  return u;
};

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
    speechSynthesis.speak(utter(text, rate));
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
    const u = utter(parts[i], rate);
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
