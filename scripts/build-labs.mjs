#!/usr/bin/env node
// Builds app/labs/*.json from the lab sources in labs/ (an ordinary vitest project: README, tests, stub, solution
// per lab). The app runs the same tests in the browser (app/js/labs/run.js), so the JSON carries the sources as is.
// Run after editing a lab: node scripts/build-labs.mjs
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const ROOT = new URL("../labs/", import.meta.url);
const OUT = new URL("../app/labs/", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

/** README → title, tickets, task, intro, edge cases, interview note, experiment, production scenario. */
export function parseReadme(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  const [, num, title] = lines[0].match(/^#\s+(\d+)\.\s+(.+)$/) || [];
  const sections = [];
  let cur = { h: "", lines: [] };
  for (const l of lines.slice(1)) {
    const m = l.match(/^##\s+(.+)$/);
    if (m) sections.push((cur = { h: m[1], lines: [] }));
    else cur.lines.push(l);
  }
  const head = sections.length ? lines.slice(1, lines.indexOf(`## ${sections[0].h}`)) : lines.slice(1);
  const paras = (ls) =>
    ls
      .join("\n")
      .split(/\n{2,}(?![^`]*```)/)
      .map((p) => p.trim())
      .filter(Boolean);
  const top = paras(head);
  const tickets = (top.find((p) => p.startsWith("**Билеты:**")) || "")
    .replace("**Билеты:**", "")
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter(Number.isInteger);
  const task = (top.find((p) => p.startsWith("**Задача:**")) || "").replace("**Задача:**", "").trim();
  const intro = top.filter((p) => !p.startsWith("**Билеты:**") && !p.startsWith("**Задача:**"));
  const sec = (re) => sections.find((s) => re.test(s.h));
  const edgeSec = sec(/^Edge/i);
  const edges = [];
  const note = [];
  for (const p of paras(edgeSec?.lines || [])) {
    if (/^- /.test(p))
      for (const item of p.split(/\n(?=- )/)) {
        const m = item.replace(/^- /, "").match(/^\*\*(.+?)\*\*\s*(.*)$/s);
        edges.push(
          m ? { title: m[1].trim(), body: m[2].trim() } : { title: "", body: item.replace(/^- /, "").trim() },
        );
      }
    else note.push(p);
  }
  const exp = sec(/эксперимент/i);
  const prod = sec(/Прод-сценарий/i);
  const scenario = paras(prod?.lines || [])
    .map((p) => p.replace(/^>\s?/gm, ""))
    .join("\n\n");
  return {
    num,
    title,
    tickets,
    task,
    intro,
    edges,
    note,
    experiment: exp ? paras(exp.lines).join("\n\n") : "",
    scenario,
  };
}

/** The tests as a spec before the first run: describe → it names, with it.each expanded and the source of each. */
export function parseTests(src) {
  const lines = src.split("\n");
  const out = [];
  let group = "";
  lines.forEach((l, i) => {
    const d = l.match(/^describe\((['"`])(.+?)\1/);
    if (d) group = d[2];
    const it = l.match(/^(\s+)it(\.each\((\[[^\]]*\])\))?\((['"`])(.+?)\4/);
    if (!it) return;
    // the test body: up to the closing line with the same indent
    const end = lines.findIndex((x, j) => j > i && x.startsWith(it[1] + "})"));
    const code = lines.slice(i, end + 1).join("\n");
    if (it[3]) {
      const vals = it[3]
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const v of vals) out.push({ group, name: it[5].replace(/%[isd]/, v), code });
    } else out.push({ group, name: it[5], code });
  });
  return out;
}

function build() {
  mkdirSync(OUT, { recursive: true });
  const shared = read("shared/fake-client.ts");
  const index = [];
  for (const dir of readdirSync(new URL("labs/", ROOT))
    .filter((d) => /^\d\d-/.test(d))
    .sort()) {
    const files = readdirSync(new URL(`labs/${dir}/`, ROOT));
    const testFile = files.find((f) => f.endsWith(".test.ts"));
    const test = read(`labs/${dir}/${testFile}`);
    const mod = (test.match(/from ['"]@lab\/([\w-]+)['"]/) || [])[1];
    const r = parseReadme(read(`labs/${dir}/README.md`));
    const tests = parseTests(test);
    const lab = {
      id: r.num,
      slug: dir,
      ...r,
      module: mod,
      file: `src/${mod}.ts`,
      testFile,
      total: tests.length,
      tests,
      stub: read(`src/${mod}.ts`),
      solution: read(`solutions/${mod}.ts`),
      test,
      shared,
    };
    writeFileSync(new URL(`${r.num}.json`, OUT), JSON.stringify(lab));
    index.push({ id: r.num, title: r.title, tickets: r.tickets, total: tests.length, edges: r.edges.length });
  }
  // the block structure from the root README ("## Блок 1: ядро агента")
  const block = (read("README.md").match(/^##\s+(Блок.+)$/m) || [])[1] || "";
  writeFileSync(new URL("index.json", OUT), JSON.stringify({ block, labs: index }));
  console.log(`labs: ${index.length} labs, ${index.reduce((a, l) => a + l.total, 0)} tests → app/labs/`);
}

if (import.meta.url === `file://${process.argv[1]}`) build();
