// Lab runner worker: compiles the learner's TS, the test file and the fake client, links them as blob
// modules and runs the tests with vitest-lite. One worker per run (run.js), so module state, timers and
// leftover promises from one run can't leak into the next, and an infinite loop dies with terminate().
import { transform } from "../../vendor/sucrase.js";
import { CompileError, compileTs, labResolver, rewriteImports } from "./rewrite.js";
import { __collect, __run, format } from "./vitest-lite.js";

// Blob modules have no base URL to resolve "./x" against, so every import becomes absolute. vitest must be
// the very instance imported above: that's where the test file registers its tests.
const VITEST = new URL("./vitest-lite.js", import.meta.url).href;
const ZOD = new URL("../../vendor/zod.js", import.meta.url).href;

const post = (msg) => self.postMessage(msg);

// console output from the learner's code (and tests) streams to the UI as it happens, so the lines printed
// before an endless loop survive the worker being killed. Capped: a log inside a loop would flood it.
const MAX_LOGS = 200;
let logged = 0;
for (const level of ["log", "info", "warn", "error", "debug"]) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    orig(...args);
    if (logged > MAX_LOGS) return;
    const text = args.map((a) => (typeof a === "string" ? a : format(a, 400))).join(" ");
    const line =
      logged++ === MAX_LOGS ? "… (more output cut)" : (level === "log" ? "" : `[${level}] `) + text;
    post({ type: "log", line });
  };
}

// A stray rejection or a throw in a timer after its test finished: note it, but keep the run alive.
self.addEventListener("unhandledrejection", (e) => {
  e.preventDefault();
  console.warn("Unhandled rejection:", e.reason);
});
self.addEventListener("error", (e) => {
  e.preventDefault();
  console.warn("Uncaught error:", e.message);
});

self.onmessage = async ({ data }) => {
  const { code, test, shared, labModule, testTimeoutMs = 3000 } = data;
  const userFile = `${labModule}.ts`;
  const urls = {};
  const names = new Map(); // blob URL -> file name, so stack lines and link errors read naturally
  const pretty = (s) => [...names].reduce((out, [u, n]) => out.split(u).join(n), String(s));
  // " (your code, line N)" when the stack passes through the learner's module (as a blob URL, or by the
  // sourceURL name in browsers that use it). Sucrase keeps line numbers, so N is the line in the editor.
  const where = (e) => {
    const at = String(e?.stack || "").match(
      new RegExp(`(?:${reEscape(urls.lab)}|\\b${reEscape(userFile)}):(\\d+):\\d+`),
    );
    return at ? ` (your code, line ${at[1]})` : "";
  };

  let tests;
  try {
    // Compile everything first so a syntax error is reported before anything runs.
    const js = {
      shared: compileTs(transform, shared, "fake-client.ts"),
      lab: compileTs(transform, code, userFile),
      test: compileTs(transform, test, "lab.test.ts"),
    };
    const blob = (name, src, file) => {
      const resolve = labResolver({
        vitest: VITEST,
        zod: ZOD,
        shared: urls.shared,
        lab: urls.lab,
        labModule,
      });
      const out = rewriteImports(src, resolve, file);
      urls[name] = URL.createObjectURL(
        new Blob([out + `\n//# sourceURL=${file}`], { type: "text/javascript" }),
      );
      names.set(urls[name], file);
    };
    // dependencies first: the URL of a module must exist before anything that imports it is rewritten
    blob("shared", js.shared, "fake-client.ts");
    blob("lab", js.lab, userFile);
    blob("test", js.test, "lab.test.ts");

    // The learner's module alone first: a throw at its top level is their bug, not a test failure.
    try {
      await import(urls.lab);
    } catch (e) {
      throw new CompileError(`${userFile} failed while loading: ${pretty(errorText(e))}${where(e)}`);
    }
    try {
      await import(urls.test);
    } catch (e) {
      // the usual cause: the test imports a name the learner renamed or stopped exporting
      const missing = String(e?.message).match(
        /(?:does not provide an export named|import not found:|binding name) '?"?([\w$]+)/,
      );
      throw new CompileError(
        missing
          ? `The tests import "${missing[1]}" from @lab/${labModule}, but ${userFile} doesn't export it`
          : `The test file failed to load: ${pretty(errorText(e))}`,
      );
    }
    tests = __collect();
  } catch (e) {
    post({ type: "done", compileError: e instanceof CompileError ? e.message : pretty(errorText(e)) });
    return;
  }

  post({ type: "collected", tests });
  const results = await __run({
    timeoutMs: testTimeoutMs,
    onResult: (r) => {
      const line = r.stack && where({ stack: r.stack });
      if (line) r.error += line;
      delete r.stack;
      post({ type: "result", result: r });
    },
  });
  post({ type: "done", results });
};

const errorText = (e) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
