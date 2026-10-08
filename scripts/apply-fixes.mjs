#!/usr/bin/env node
// Applies a batch of reviewed text edits to content/tickets/*.json, then rebuilds the app bundles.
// Usage: node scripts/apply-fixes.mjs fixes.json
//   fixes.json = { "answers": [{ "n": 1, "where": "ru.a[1]" | "en.kill", "old": "exact text", "new": "replacement" }],
//                  "drills":  [{ "n": 1, "kind": "cloze" | "steps", "lang": "ru", "i": 2, "new": "..." }] }
// Every "old" must be found verbatim, or the script stops without writing anything.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readTickets, writeTicket } from "./content-lib.mjs";

const batch = JSON.parse(readFileSync(process.argv[2], "utf8"));
const tickets = readTickets();
const touched = new Set();

const missing = [];
for (const fix of batch.answers || []) {
  const t = tickets.find((x) => x.n === fix.n);
  const [lang, field] = fix.where.split(".");
  const slot = field.match(/^a\[(\d)\]$/);
  const current = slot ? t[lang].a[+slot[1]].t : t[lang].kill;
  if (!current.includes(fix.old)) { missing.push(`${fix.n} ${fix.where}: "${fix.old.slice(0, 50)}"`); continue; }
  const next = current.replace(fix.old, fix.new);
  if (slot) t[lang].a[+slot[1]].t = next; else t[lang].kill = next;
  touched.add(t);
}
if (missing.length) { console.error("Not found, nothing written:\n" + missing.join("\n")); process.exit(1); }

for (const e of batch.drills || []) {
  const t = tickets.find((x) => x.n === e.n);
  if (e.kind === "steps") t.drills.steps[e.lang].items[e.i] = e.new; else t.drills[e.kind][e.lang][e.i] = e.new;
  touched.add(t);
}

for (const t of touched) writeTicket(t);
execFileSync(process.execPath, [new URL("./build-content.mjs", import.meta.url).pathname], { stdio: "inherit" });
console.log(`applied ${(batch.answers || []).length} answer edits and ${(batch.drills || []).length} drill edits to ${touched.size} ticket file(s); run npm test next`);
