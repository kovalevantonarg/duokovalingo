// The in-browser labs runner, minus the browser: the real lab test files go through the vendored sucrase,
// the shared import rewriting and vitest-lite, against labs/solutions (all pass) and labs/src stubs (all fail).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { transform } from "../app/vendor/sucrase.js";
import { compileTs, labResolver, rewriteImports, CompileError } from "../app/js/labs/rewrite.js";
import { __collect, __run } from "../app/js/labs/vitest-lite.js";

const root = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const url = (p) => new URL(p, root).href;

// labs/labs/01-tool-loop/tool-loop.test.ts imports "@lab/tool-loop", and so on
const labs = readdirSync(new URL("labs/labs/", root))
  .sort()
  .map((dir) => {
    const file = readdirSync(new URL(`labs/labs/${dir}/`, root)).find((f) => f.endsWith(".test.ts"));
    const test = read(`labs/labs/${dir}/${file}`);
    return { dir, file, test, module: test.match(/from ["']@lab\/([\w-]+)["']/)[1] };
  });

const tmp = mkdtempSync(join(tmpdir(), "labs-runner-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
let n = 0;

/** Compile, write as .mjs files wired like the worker's blob modules, import, run. */
async function runLab(lab, codePath) {
  const id = n++;
  const file = (name) => join(tmp, `${id}-${name}.mjs`);
  const resolve = labResolver({
    vitest: url("app/js/labs/vitest-lite.js"),
    zod: url("app/vendor/zod.js"),
    shared: pathToFileURL(file("shared")).href,
    lab: pathToFileURL(file("lab")).href,
    labModule: lab.module,
  });
  const emit = (name, src, ts) =>
    writeFileSync(file(name), rewriteImports(compileTs(transform, src, ts), resolve, ts));
  emit("shared", read("labs/shared/fake-client.ts"), "fake-client.ts");
  emit("lab", read(codePath), `${lab.module}.ts`);
  emit("test", lab.test, lab.file);
  await import(pathToFileURL(file("test")).href);
  const collected = __collect();
  const results = await __run({ timeoutMs: 3000 });
  assert.equal(results.length, collected.length);
  return results;
}

test("vitest-lite passes all 65 lab tests against the reference solutions", async () => {
  let total = 0;
  for (const lab of labs) {
    const results = await runLab(lab, `labs/solutions/${lab.module}.ts`);
    const failed = results.filter((r) => !r.ok).map((r) => `${r.group} > ${r.name}: ${r.error}`);
    assert.deepEqual(failed, [], lab.dir);
    total += results.length;
  }
  assert.equal(total, 65);
});

test("against the stubs every test fails with the lab's TODO error, readable, no crash", async () => {
  let total = 0;
  for (const lab of labs) {
    const results = await runLab(lab, `labs/src/${lab.module}.ts`);
    const todo = `TODO: lab ${lab.dir.slice(0, 2)}`;
    for (const r of results) {
      assert.equal(r.ok, false, `${r.name} should fail on a stub`);
      assert.ok(r.error.includes(todo), `${r.name}: ${r.error}`);
      assert.ok(r.error.length < 1500, "messages stay short");
    }
    total += results.length;
  }
  assert.equal(total, 65);
});

test("it.each titles, matcher messages and the import map", async () => {
  const src = `
    import { describe, it, expect, vi } from "vitest";
    import { z } from "zod";
    describe("g", () => {
      it.each([429, 500])("%i retries", (s) => expect(s).toBeGreaterThan(400));
      it("toBe", () => expect(3).toBe(2));
      it("toEqual", () => expect({ a: 1, b: [1, 2], u: undefined }).toEqual({ a: 1, b: [1, 3] }));
      it("ignores undefined", () => expect({ a: 1, u: undefined }).toEqual({ a: 1 }));
      it("mock", () => { const f = vi.fn().mockReturnValueOnce(1); f("x"); expect(f).not.toHaveBeenCalled(); });
      it("rejects", async () => { await expect(Promise.reject(Object.assign(new Error("e"), { status: 503 }))).rejects.toMatchObject({ status: 503 }); });
      it("zod", () => expect(z.object({ a: z.string() }).safeParse({ a: 1 }).success).toBe(false));
      it("hangs", () => new Promise(() => {}));
    });`;
  const p = join(tmp, "adhoc.mjs");
  const resolve = labResolver({ vitest: url("app/js/labs/vitest-lite.js"), zod: url("app/vendor/zod.js") });
  writeFileSync(p, rewriteImports(compileTs(transform, src, "adhoc.test.ts"), resolve, "adhoc.test.ts"));
  await import(pathToFileURL(p).href);
  const r = await __run({ timeoutMs: 50 });
  const by = Object.fromEntries(r.map((x) => [x.name, x]));
  assert.deepEqual(r.map((x) => x.name).slice(0, 2), ["429 retries", "500 retries"]);
  assert.equal(r[0].group, "g");
  assert.equal(by.toBe.error, "expected 3 to be 2");
  assert.match(by.toEqual.error, /first difference at \.b\[1\]: expected 3, received 2/);
  assert.equal(by["ignores undefined"].ok, true);
  assert.match(by.mock.error, /not to be called, but it was called 1 time\n {2}calls:\n {4}1: \("x"\)/);
  assert.equal(by.rejects.ok, true);
  assert.equal(by.zod.ok, true);
  assert.match(by.hangs.error, /TimeoutError: Test timed out after 50 ms/);

  assert.throws(
    () => compileTs(transform, "const a = ;", "x.ts"),
    (e) => e instanceof CompileError && e.line === 1,
  );
  assert.throws(() => rewriteImports('import x from "lodash"', resolve, "x.ts"), /can't import "lodash"/);
});

// the repeat tasks (labs/labs/NN-*/repeat/*.test.ts) go through the same runner
const repeats = readdirSync(new URL("labs/labs/", root))
  .sort()
  .filter((dir) => readdirSync(new URL(`labs/labs/${dir}/`, root)).includes("repeat"))
  .map((dir) => {
    const file = readdirSync(new URL(`labs/labs/${dir}/repeat/`, root)).find((f) => f.endsWith(".test.ts"));
    const test = read(`labs/labs/${dir}/repeat/${file}`);
    return { dir, file, test, module: test.match(/from ["']@lab\/([\w-]+)["']/)[1] };
  });

test("repeat tasks: all pass on their references, all fail on their stubs", async () => {
  assert.ok(repeats.length >= 5);
  for (const lab of repeats) {
    const ok = await runLab(lab, `labs/solutions/${lab.module}.ts`);
    assert.deepEqual(
      ok.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`),
      [],
      lab.dir,
    );
    const stub = await runLab(lab, `labs/src/${lab.module}.ts`);
    assert.equal(stub.filter((r) => r.ok).length, 0, lab.dir + " stub");
  }
});
