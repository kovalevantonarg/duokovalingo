// Reads and writes the study content.
// Source of truth: content/tickets/NN-slug.json, one file per ticket with everything about it:
//   { n, tag, sec, core, ru, en, drills: { lies, cloze, steps? }, sources: [...] }
// The app loads three generated bundles (app/tickets.js, app/drills.js, app/sources.js); build them with
// `node scripts/build-content.mjs`. Never edit the bundles by hand.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";

export const ROOT = new URL("../", import.meta.url);
export const TICKETS_DIR = new URL("content/tickets/", ROOT);
const META = new URL("content/meta.json", ROOT);

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
export const fileName = (t) => `${String(t.n).padStart(2, "0")}-${slug(t.en.topic)}.json`;

/** All tickets, sorted by number. */
export function readTickets() {
  return readdirSync(TICKETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ ...JSON.parse(readFileSync(new URL(f, TICKETS_DIR), "utf8")), _file: f }))
    .sort((a, b) => a.n - b.n);
}
export const readMeta = () => JSON.parse(readFileSync(META, "utf8"));

/** Write one ticket back to its file (key order kept stable for clean diffs). */
export function writeTicket(t) {
  const { _file, n, tag, sec, core, ru, en, drills, sources } = t;
  mkdirSync(TICKETS_DIR, { recursive: true });
  writeFileSync(new URL(_file || fileName(t), TICKETS_DIR), JSON.stringify({ n, tag, sec, core, ru, en, drills, sources }, null, 2) + "\n");
}
export const writeMeta = (m) => writeFileSync(META, JSON.stringify(m, null, 2) + "\n");

const GENERATED = "// GENERATED from content/tickets/*.json by scripts/build-content.mjs. Do not edit by hand.\n";

/** The three bundles the app loads, as strings. */
export function bundles(tickets = readTickets(), meta = readMeta()) {
  const plain = tickets.map(({ n, tag, sec, core, ru, en }) => ({ n, tag, sec, core, ru, en }));
  return {
    "app/tickets.js":
      GENERATED +
      "// Shape: {n, tag, sec, core:[ids], ru:{topic, qs[3], a[{q,t}x3], kill}, en:{...}}\n" +
      `window.TICKETS = [\n${plain.map((t) => JSON.stringify(t)).join(",\n")}\n];\n`,
    "app/drills.js":
      GENERATED +
      '// Keyed by ticket n. lies: false-but-plausible statements. cloze: "[[answer|alt]]" blanks. steps: correct order, the UI shuffles.\n' +
      `window.DRILLS = {\n${tickets.map((t) => `${t.n}:${JSON.stringify(t.drills)}`).join(",\n")}\n};\n`,
    "app/sources.js":
      GENERATED +
      '// Fact ledger keyed by ticket n: w = answer slots (0-2, "k" kill, "d" drills), s = ok | fix | fix2 | soft, c = claim, e = what the source says, u = URLs.\n' +
      `window.SOURCES_CHECKED = ${JSON.stringify(meta.sourcesChecked)};\n` +
      `window.SOURCES = {\n${tickets.map((t) => `${t.n}:${JSON.stringify(t.sources || [])}`).join(",\n")}\n};\n`,
  };
}
