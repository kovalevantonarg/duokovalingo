#!/usr/bin/env node
// Applies a batch of reviewed text edits to the tickets and drills.
// Usage: node scripts/apply-fixes.mjs fixes.json
//   fixes.json = { "answers": [{ "n": 1, "where": "ru.a[1]" | "en.kill", "old": "exact text", "new": "replacement" }],
//                  "drills":  [{ "n": 1, "kind": "lies" | "cloze" | "steps", "lang": "ru", "i": 2, "new": "..." }] }
// Every "old" must be found verbatim, or the script stops without writing anything.
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const APP = new URL("../app/", import.meta.url);
const read = (f) => readFileSync(new URL(f, APP), "utf8");
const load = (f, name) => { const ctx = { window: {} }; vm.runInNewContext(read(f), ctx); return ctx.window[name]; };
const header = (f) => read(f).split("\n").filter((l) => l.startsWith("//")).join("\n");

const batch = JSON.parse(readFileSync(process.argv[2], "utf8"));
const tickets = load("tickets.js", "TICKETS");
const drills = load("drills.js", "DRILLS");

const missing = [];
for (const fix of batch.answers || []) {
  const t = tickets.find((x) => x.n === fix.n);
  const [lang, field] = fix.where.split(".");
  const slot = field.match(/^a\[(\d)\]$/);
  const current = slot ? t[lang].a[+slot[1]].t : t[lang].kill;
  if (!current.includes(fix.old)) { missing.push(`${fix.n} ${fix.where}: "${fix.old.slice(0, 50)}"`); continue; }
  const next = current.replace(fix.old, fix.new);
  if (slot) t[lang].a[+slot[1]].t = next; else t[lang].kill = next;
}
if (missing.length) { console.error("Not found, nothing written:\n" + missing.join("\n")); process.exit(1); }

for (const e of batch.drills || []) {
  const d = drills[e.n];
  if (e.kind === "steps") d.steps[e.lang].items[e.i] = e.new; else d[e.kind][e.lang][e.i] = e.new;
}

writeFileSync(new URL("tickets.js", APP), `${header("tickets.js")}\nwindow.TICKETS = [\n${tickets.map((t) => JSON.stringify(t)).join(",\n")}\n];\n`);
const keys = Object.keys(drills).sort((a, b) => a - b);
writeFileSync(new URL("drills.js", APP), `${header("drills.js")}\nwindow.DRILLS = {\n${keys.map((k) => `${k}:${JSON.stringify(drills[k])}`).join(",\n")}\n};\n`);
console.log(`applied ${(batch.answers || []).length} answer edits and ${(batch.drills || []).length} drill edits; run npm test next`);
