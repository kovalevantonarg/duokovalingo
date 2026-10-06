#!/usr/bin/env node
// Builds app/tickets.js, app/drills.js and app/sources.js from content/tickets/*.json.
//   node scripts/build-content.mjs          write the bundles
//   node scripts/build-content.mjs --check  exit 1 if the committed bundles are out of date
import { readFileSync, writeFileSync } from "node:fs";
import { ROOT, bundles } from "./content-lib.mjs";

const out = bundles();
const stale = Object.entries(out).filter(([p, s]) => { try { return readFileSync(new URL(p, ROOT), "utf8") !== s; } catch { return true; } });
if (process.argv.includes("--check")) {
  if (stale.length) { console.error("Out of date, run `node scripts/build-content.mjs`: " + stale.map(([p]) => p).join(", ")); process.exit(1); }
  console.log("bundles up to date");
} else {
  for (const [p, s] of stale) writeFileSync(new URL(p, ROOT), s);
  console.log(stale.length ? `wrote ${stale.map(([p]) => p).join(", ")}` : "bundles already up to date");
}
