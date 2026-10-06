#!/usr/bin/env node
// Rebuilds app/lessons/index.json (titles and reading length per lesson) from app/lessons/L*.json.
// Run after editing a lesson: node scripts/build-lesson-index.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const DIR = new URL("../app/lessons/", import.meta.url);
const textOf = (block) => typeof block === "string" ? block
  : [block.ex, block.fe, block.warn, ...(block.list || []), ...(block.ol || []), ...(block.table?.rows.flat() || [])].filter(Boolean).join(" ");
const words = (x) => [x.why, ...x.sections.flatMap((s) => [s.h, ...s.body.map(textOf)])]
  .join(" ").replace(/<[^>]+>/g, "").split(/\s+/).filter(Boolean).length;

const index = {};
for (const f of readdirSync(DIR).filter((f) => /^L\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))) {
  const L = JSON.parse(readFileSync(new URL(f, DIR), "utf8"));
  index[L.n] = { ru: { title: L.ru.title, words: words(L.ru) }, en: { title: L.en.title, words: words(L.en) } };
}
writeFileSync(new URL("index.json", DIR), JSON.stringify(index));
console.log(`lessons/index.json: ${Object.keys(index).length} lessons`);
