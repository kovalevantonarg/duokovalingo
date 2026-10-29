import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLab, resetLab, MAX_CODE } from "../app/lib/labs.js";
import { parseReadme, parseTests } from "../scripts/build-labs.mjs";
import { md } from "../app/js/md.js";

test("lab progress: code, runs, best result, first green, solution opened", () => {
  const db = { tickets: {}, history: [] };
  assert.equal(applyLab(db, { id: "x1" }), false, "bad id");
  assert.equal(applyLab(db, { id: "01", code: "let a", at: 123 }, "2026-10-29"), true);
  assert.deepEqual(db.labs["01"], { started: "2026-10-29", code: "let a", at: 123, last: "2026-10-29" });
  applyLab(db, { id: "01", passed: 5, total: 16 }, "2026-10-29");
  applyLab(db, { id: "01", passed: 3, total: 16 }, "2026-10-30");
  assert.equal(db.labs["01"].best, 5);
  assert.equal(db.labs["01"].green, undefined);
  applyLab(db, { id: "01", passed: 16, total: 16 }, "2026-10-31");
  applyLab(db, { id: "01", passed: 16, total: 16 }, "2026-11-02");
  assert.equal(db.labs["01"].green, "2026-10-31", "the first green day stays");
  assert.equal(db.labs["01"].runs, 4);
  assert.equal(
    applyLab(db, { id: "01", passed: 17, total: 16 }, "2026-11-02"),
    false,
    "impossible result ignored",
  );
  assert.equal(
    applyLab(db, { id: "01", code: "x".repeat(MAX_CODE + 1) }, "2026-11-02"),
    false,
    "oversized code ignored",
  );
  applyLab(db, { id: "01", solution: true }, "2026-11-03");
  assert.equal(db.labs["01"].sol, "2026-11-03");
  applyLab(db, { id: "01", read: true, talk: true }, "2026-11-03");
  assert.equal(resetLab(db, "01"), true);
  assert.deepEqual(
    db.labs["01"],
    { started: "2026-10-29", read: "2026-11-03", talk: "2026-11-03", last: "2026-11-03" },
    "walkthrough and interview marks survive a reset",
  );
  assert.equal(
    applyLab(db, { id: "01r", passed: 3, total: 13 }, "2026-11-04"),
    true,
    "the repeat task has its own record",
  );
  assert.equal(db.labs["01r"].passed, 3);
  assert.equal(resetLab(db, "01r"), true);
  assert.equal(db.labs["01r"], undefined);
});

test("lab README and tests parse into the app's lab format", () => {
  const r = parseReadme(`# 07. Demo lab

**Билеты:** 7 Tool use, 38 Граница runtime.

**Задача:** \`run\` in \`src/x.ts\`.

Why it matters.

## Edge-кейсы

- **First case.** Body one.
- **Second** body two.

Для интервью: a note.

## Живой эксперимент (по желанию)

Try it.

## Прод-сценарий (ответь вслух)

> What breaks first?
`);
  assert.equal(r.num, "07");
  assert.equal(r.title, "Demo lab");
  assert.deepEqual(r.tickets, [7, 38]);
  assert.equal(r.task, "`run` in `src/x.ts`.");
  assert.deepEqual(r.intro, ["Why it matters."]);
  assert.deepEqual(r.edges, [
    { title: "First case.", body: "Body one." },
    { title: "Second", body: "body two." },
  ]);
  assert.deepEqual(r.note, ["Для интервью: a note."]);
  assert.equal(r.experiment, "Try it.");
  assert.equal(r.scenario, "What breaks first?");
  const t = parseTests(`describe('g one', () => {
  it('plain', async () => {
    expect(1).toBe(1)
  })
  it.each([429, 500])('%i retries', async (s) => {
    x()
  })
})`);
  assert.deepEqual(
    t.map((x) => x.group + "|" + x.name),
    ["g one|plain", "g one|429 retries", "g one|500 retries"],
  );
  assert.match(t[0].code, /expect\(1\)/);
});

test("markdown subset: escaped, inline marks, fences, lists, quotes", () => {
  assert.equal(
    md("a **b** `<c>` [d](https://x.y)"),
    '<p>a <b>b</b> <code>&lt;c&gt;</code> <a href="https://x.y" target="_blank" rel="noopener">d</a></p>',
  );
  assert.equal(md("- one\n- two"), "<ul><li>one</li><li>two</li></ul>");
  assert.equal(md("> q"), "<blockquote>q</blockquote>");
  assert.match(
    md("```ts\nconst a = 1 < 2\n```"),
    /<pre class="mdpre"><span class="lang">ts<\/span><code>const a = 1 &lt; 2<\/code><\/pre>/,
  );
});
