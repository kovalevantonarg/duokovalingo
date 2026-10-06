#!/usr/bin/env node
// Validates the study content in app/: tickets.js, drills.js, sources.js and lessons/*.json.
// Run: node scripts/check-content.mjs   (exit code 1 on any problem; also runs in `npm test`)
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const APP = new URL("../app/", import.meta.url);
const read = (p) => readFileSync(new URL(p, APP), "utf8");
const loadGlobal = (file, name) => { const ctx = { window: {} }; vm.runInNewContext(read(file), ctx); return ctx.window[name]; };

export function checkContent() {
  const problems = [];
  const bad = (where, msg) => problems.push(`${where}: ${msg}`);
  const TICKETS = loadGlobal("tickets.js", "TICKETS");
  const DRILLS = loadGlobal("drills.js", "DRILLS");
  const SOURCES = loadGlobal("sources.js", "SOURCES");
  const blanks = (s) => (s.match(/\[\[/g) || []).length;

  const seen = new Set();
  for (const t of TICKETS) {
    const id = `ticket ${t.n}`;
    if (seen.has(t.n)) bad(id, "duplicate number"); seen.add(t.n);
    for (const lang of ["ru", "en"]) {
      const x = t[lang];
      if (!x?.topic) bad(id, `${lang}.topic missing`);
      if (x?.qs?.length !== 3) bad(id, `${lang}: expected 3 questions`);
      if (x?.a?.length !== 3 || x.a.some((a) => !a.q || !a.t)) bad(id, `${lang}: expected 3 answers with q and t`);
      if (!x?.kill) bad(id, `${lang}.kill missing`);
    }

    const d = DRILLS[t.n];
    if (!d) { bad(id, "no drills"); continue; }
    for (const lang of ["ru", "en"]) {
      if (d.lies?.[lang]?.length !== 2) bad(id, `drills: expected 2 ${lang} lies`);
      if (d.cloze?.[lang]?.length !== 3) bad(id, `drills: expected 3 ${lang} cloze`);
    }
    d.cloze?.ru?.forEach((s, i) => {
      const en = d.cloze.en[i] || "";
      if (!blanks(s)) bad(id, `cloze ${i} has no blank`);
      if (blanks(s) !== blanks(en)) bad(id, `cloze ${i}: ${blanks(s)} RU blanks vs ${blanks(en)} EN`);
      for (const c of [s, en]) if (blanks(c) !== (c.match(/\]\]/g) || []).length) bad(id, `cloze ${i}: unbalanced [[ ]]`);
    });
    if (d.steps) {
      const ru = d.steps.ru.items, en = d.steps.en.items;
      if (ru.length !== en.length || ru.length < 4 || ru.length > 6) bad(id, "steps: 4–6 items, same count in RU and EN");
      for (const s of [...ru, ...en]) if (s.length > 70) bad(id, `step longer than 70 chars: ${s.slice(0, 40)}…`);
    }

    for (const s of SOURCES[t.n] || []) if (!s.u?.length || s.u.some((u) => !/^https?:\/\//.test(u))) bad(id, `source without a URL: ${s.c?.slice(0, 40)}`);
  }

  // lessons: one per ticket, index in sync, decode quotes still present in the answers
  const index = JSON.parse(read("lessons/index.json"));
  const files = readdirSync(new URL("lessons/", APP)).filter((f) => /^L\d+\.json$/.test(f));
  for (const t of TICKETS) if (!files.includes(`L${t.n}.json`)) bad(`ticket ${t.n}`, "no lesson");
  for (const f of files) {
    const L = JSON.parse(read(`lessons/${f}`)); const id = `lesson ${L.n}`;
    const t = TICKETS.find((x) => x.n === L.n);
    if (!t) { bad(id, "no matching ticket"); continue; }
    if (!index[L.n]) bad(id, "missing from lessons/index.json");
    for (const lang of ["ru", "en"]) {
      const x = L[lang];
      if (!x?.title || !x.why || !(x.sections?.length >= 4) || !(x.terms?.length >= 5) || !(x.check?.length >= 5)) { bad(id, `${lang}: incomplete`); continue; }
      if (index[L.n]?.[lang]?.title !== x.title) bad(id, `${lang}: title differs from lessons/index.json`);
      const said = t[lang].a.map((a) => a.t).join(" ") + " " + t[lang].kill;
      for (const dq of x.decode || []) if (!said.includes(dq.s)) bad(id, `${lang} decode quotes text that's no longer in the answer: "${dq.s.slice(0, 50)}"`);
    }
    for (const s of L.sources || []) if (!/^https?:\/\//.test(s.url || "")) bad(id, `source without a URL: ${s.claim?.slice(0, 40)}`);
  }
  return { problems, counts: { tickets: TICKETS.length, lessons: files.length } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { problems, counts } = checkContent();
  if (problems.length) { console.error(problems.join("\n")); console.error(`\n${problems.length} problem(s)`); process.exit(1); }
  console.log(`content ok: ${counts.tickets} tickets, ${counts.lessons} lessons`);
}
