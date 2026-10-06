// Answer feedback sounds, on by default; the header toggle persists the choice.
let enabled = localStorage.getItem("drill.snd") !== "off";
let AC = null;
/** Short success / failure tone, synthesized (no audio files). */
export function beep(ok) {
  if (!enabled) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const t = AC.currentTime;
    const tone = (f, st, dur, type = "sine", g = 0.08) => {
      const o = AC.createOscillator(),
        v = AC.createGain();
      o.type = type;
      o.frequency.value = f;
      v.gain.setValueAtTime(g, t + st);
      v.gain.exponentialRampToValueAtTime(0.0001, t + st + dur);
      o.connect(v);
      v.connect(AC.destination);
      o.start(t + st);
      o.stop(t + st + dur);
    };
    if (ok) {
      tone(660, 0, 0.09);
      tone(880, 0.09, 0.14);
    } else tone(180, 0, 0.16, "sawtooth", 0.05);
  } catch {}
}

export const soundOn = () => enabled;
export function toggleSound() {
  enabled = !enabled;
  localStorage.setItem("drill.snd", enabled ? "on" : "off");
  return enabled;
}
