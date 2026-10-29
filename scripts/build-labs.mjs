#!/usr/bin/env node
// Builds app/labs/*.json from the lab sources in labs/ (an ordinary vitest project: README, tests, stub, solution
// per lab). The app runs the same tests in the browser (app/js/labs/run.js), so the JSON carries the sources as is.
// Run after editing a lab: node scripts/build-labs.mjs
import { createHash } from "node:crypto";
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

/** WALKTHROUGH.md → intro, steps [{ title, body }], the full solution section and the interview answer. */
export function parseWalkthrough(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  const title = (lines[0].match(/^#\s+(?:Разбор:\s*)?(.+)$/) || [])[1] || "";
  const secs = [];
  let cur = { h: "", body: [] };
  let fence = false;
  for (const l of lines.slice(1)) {
    if (l.startsWith("```")) fence = !fence;
    const m = !fence && l.match(/^##\s+(.+)$/);
    if (m) secs.push((cur = { h: m[1].trim(), body: [] }));
    else cur.body.push(l);
  }
  const intro = lines
    .slice(1, secs.length ? lines.indexOf(`## ${secs[0].h}`) : undefined)
    .join("\n")
    .trim();
  const text = (s) => s.body.join("\n").trim();
  const steps = secs
    .filter((s) => /^Шаг\s+\d+/.test(s.h))
    .map((s) => ({ title: s.h.replace(/^Шаг\s+\d+\.\s*/, ""), body: text(s) }));
  const whole = secs.find((s) => /^Собираем/.test(s.h));
  const talk = secs.find((s) => /интервью/i.test(s.h));
  return { title, intro, steps, whole: whole ? text(whole) : "", talk: talk ? text(talk) : "" };
}

/** repeat/README.md → title, task, intro, the checked behaviours and the hints (revealed one by one). */
export function parseRepeat(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  const title = (lines[0].match(/^#\s+(?:Повторение:\s*)?(.+)$/) || [])[1] || "";
  const secs = [];
  let cur = { h: "", body: [] };
  for (const l of lines.slice(1)) {
    const m = l.match(/^##\s+(.+)$/);
    if (m) secs.push((cur = { h: m[1].trim(), body: [] }));
    else cur.body.push(l);
  }
  const head = lines
    .slice(1, secs.length ? lines.indexOf(`## ${secs[0].h}`) : undefined)
    .join("\n")
    .trim();
  const paras = head
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const task = (paras.find((p) => p.startsWith("**Задача:**")) || "").replace("**Задача:**", "").trim();
  const intro = paras.filter((p) => !p.startsWith("**Задача:**"));
  const items = (s) =>
    (s?.body || [])
      .join("\n")
      .split(/\n(?=- )/)
      .map((x) => x.trim())
      .filter((x) => x.startsWith("- "))
      .map((x) => x.slice(2).replace(/\s*\n\s*/g, " "));
  const checks = items(secs.find((s) => /провер/i.test(s.h))).map((x) => {
    const m = x.match(/^\*\*(.+?)\*\*\s*(.*)$/s);
    return m ? { title: m[1], body: m[2] } : { title: "", body: x };
  });
  const cap = (x) => x.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
  return {
    title: cap(title),
    task: cap(task),
    intro,
    checks,
    hints: items(secs.find((s) => /Подсказ/i.test(s.h))),
  };
}

/** One exercise for the browser runner: test source, its module, starter code and the reference. */
function exercise(testPath) {
  const test = read(testPath);
  const mod = (test.match(/from ['"]@lab\/([\w-]+)['"]/) || [])[1];
  const tests = parseTests(test);
  return {
    module: mod,
    file: `src/${mod}.ts`,
    testFile: testPath.split("/").pop(),
    total: tests.length,
    tests,
    stub: read(`src/${mod}.ts`),
    solution: read(`solutions/${mod}.ts`),
    test,
  };
}

function build() {
  mkdirSync(OUT, { recursive: true });
  const shared = read("shared/fake-client.ts");
  const index = [];
  for (const dir of readdirSync(new URL("labs/", ROOT))
    .filter((d) => /^\d\d-/.test(d))
    .sort()) {
    const files = readdirSync(new URL(`labs/${dir}/`, ROOT));
    const has = (f) => files.includes(f);
    const r = parseReadme(read(`labs/${dir}/README.md`));
    const main = exercise(`labs/${dir}/${files.find((f) => f.endsWith(".test.ts"))}`);
    // the lesson that walks through the solution, and a similar exercise to repeat it on your own
    const walk = has("WALKTHROUGH.md") ? parseWalkthrough(read(`labs/${dir}/WALKTHROUGH.md`)) : null;
    let repeat = null;
    if (has("repeat")) {
      const rf = readdirSync(new URL(`labs/${dir}/repeat/`, ROOT));
      repeat = {
        ...parseRepeat(read(`labs/${dir}/repeat/README.md`)),
        ...exercise(`labs/${dir}/repeat/${rf.find((f) => f.endsWith(".test.ts"))}`),
      };
    }
    const lab = { id: r.num, slug: dir, ...r, ...main, walk, repeat, shared };
    writeFileSync(new URL(`${r.num}.json`, OUT), JSON.stringify(lab));
    index.push({
      id: r.num,
      title: r.title,
      tickets: r.tickets,
      total: main.total,
      edges: r.edges.length,
      steps: walk?.steps.length || 0,
      repeat: repeat ? { title: repeat.title, total: repeat.total } : null,
    });
  }
  // blocks from the root README: "## Блок 1: ядро агента" followed by a table whose rows start with the lab number
  const blocks = [];
  let cur = null;
  for (const l of read("README.md").split("\n")) {
    const h = l.match(/^##\s+(Блок.+)$/);
    if (h) blocks.push((cur = { title: h[1].trim(), ids: [] }));
    else if (/^##\s/.test(l)) cur = null;
    const row = cur && l.match(/^\|\s*(\d\d)\b/);
    if (row) cur.ids.push(row[1]);
  }
  const known = new Set(blocks.flatMap((b) => b.ids));
  const rest = index.filter((l) => !known.has(l.id)).map((l) => l.id);
  if (rest.length) blocks.push({ title: "", ids: rest });
  writeFileSync(new URL("index.json", OUT), JSON.stringify({ blocks, labs: index }));
  // a content hash the app puts into the JSON URLs: a new build is a new URL, so no cache serves an old lab
  const hash = createHash("sha256");
  for (const f of readdirSync(OUT)
    .filter((f) => f.endsWith(".json"))
    .sort())
    hash.update(readFileSync(new URL(f, OUT)));
  writeFileSync(
    new URL("version.js", OUT),
    `// Generated by scripts/build-labs.mjs: changes whenever any lab JSON changes.\nexport const LABS_V = "${hash.digest("hex").slice(0, 10)}";\n`,
  );
  console.log(`labs: ${index.length} labs, ${index.reduce((a, l) => a + l.total, 0)} tests → app/labs/`);
}

if (import.meta.url === `file://${process.argv[1]}`) build();
