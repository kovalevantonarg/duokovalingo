// Main-thread entry for running a lab: one fresh module worker per run (worker.js), killed after the
// results or after timeoutMs, whichever comes first. The kill is the only defence against `while (true) {}`
// in the learner's code: a per-test timeout can't interrupt a synchronous loop.

/**
 * @param {{ code: string, test: string, shared: string, labModule: string, timeoutMs?: number,
 *   testTimeoutMs?: number, onResult?: (r: object) => void }} opts
 *   code: the learner's TS; test: the lab's .test.ts; shared: shared/fake-client.ts;
 *   labModule: the name in the test's `@lab/<name>` import; onResult streams each test as it finishes.
 * @returns {Promise<{ ok: boolean, passed: number, total: number,
 *   results: { group: string, name: string, ok: boolean, error?: string, ms: number }[],
 *   compileError?: string, timedOut?: boolean, logs: string[], ms: number }>}
 */
export function runLab({ code, test, shared, labModule, timeoutMs = 15000, testTimeoutMs = 3000, onResult }) {
  const t0 = performance.now();
  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  let tests = null; // [{ group, name }] once the test file has loaded
  const done = [];
  const logs = [];

  return new Promise((resolve) => {
    const finish = (extra) => {
      clearTimeout(timer);
      worker.terminate();
      const results = extra.results || done;
      const passed = results.filter((r) => r.ok).length;
      resolve({
        ok: !extra.compileError && !extra.timedOut && results.length > 0 && passed === results.length,
        passed,
        total: results.length,
        ...extra,
        logs,
        results,
        ms: Math.round(performance.now() - t0),
      });
    };

    const timer = setTimeout(() => {
      const secs = `${Math.round(timeoutMs / 100) / 10} s`;
      if (!tests)
        return finish({
          timedOut: true,
          compileError: `Your code didn't finish loading within ${secs}: an endless loop at the top level?`,
        });
      // tests reported so far keep their result; the one in flight is the likely culprit
      const results = tests.map(
        (t, i) =>
          done[i] || {
            ...t,
            ok: false,
            ms: 0,
            error:
              i === done.length
                ? `Stopped after ${secs}: this test never finished. An endless loop (while/for that never exits) or code that blocks?`
                : `Not run: the run was stopped after ${secs} while an earlier test was stuck`,
          },
      );
      finish({ timedOut: true, results });
    }, timeoutMs);

    worker.onmessage = ({ data }) => {
      if (data.type === "log") logs.push(data.line);
      else if (data.type === "collected") tests = data.tests;
      else if (data.type === "result") {
        done.push(data.result);
        onResult?.(data.result);
      } else if (data.type === "done")
        finish(
          data.compileError ? { compileError: data.compileError, results: [] } : { results: data.results },
        );
    };
    // the worker itself failed to start or load its own modules (offline cache miss, old browser)
    worker.onerror = (e) => {
      e.preventDefault?.();
      finish({ compileError: `The test runner failed to start: ${e.message || "worker error"}` });
    };

    worker.postMessage({ code, test, shared, labModule, testTimeoutMs });
  });
}
