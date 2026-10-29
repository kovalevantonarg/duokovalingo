// The slice of vitest the labs use, small enough to run inside the lab worker: describe/it/test (+ .each,
// .skip, .only, .todo), hooks, expect with .not/.resolves/.rejects and asymmetric matchers, vi.fn/vi.spyOn.
// Semantics follow vitest where a learner could notice (toEqual ignores undefined props, toBe is Object.is,
// %i/%s/%j in .each titles); messages are written for someone reading them in a lab, not in a terminal.

// ---------------------------------------------------------------- registry

const root = { name: "", parent: null, hooks: hooks(), skip: false };
let scope = root;
let tests = [];
let hasOnly = false;

function hooks() {
  return { beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] };
}

function addSuite(name, fn, mode) {
  const s = { name: String(name), parent: scope, hooks: hooks(), skip: mode === "skip" || scope.skip };
  if (mode === "only") hasOnly = true;
  s.only = mode === "only" || scope.only;
  scope = s;
  try {
    fn?.();
  } finally {
    scope = s.parent;
  }
}

function addTest(name, fn, mode, timeout) {
  if (mode === "only") hasOnly = true;
  tests.push({
    suite: scope,
    name: String(name),
    fn,
    timeout,
    skip: mode === "skip" || mode === "todo" || scope.skip,
    only: mode === "only" || scope.only,
  });
}

/** it.each / describe.each: rows are spread into the callback when they are arrays (vitest does the same). */
const each = (add) => (table) => (title, fn, timeout) => {
  table.forEach((row, i) => {
    const args = Array.isArray(row) ? row : [row];
    add(formatTitle(String(title), args, i), () => fn(...args), timeout);
  });
};

function formatTitle(title, args, index) {
  let k = 0;
  let out = title.replace(/%([sdifjo#%])/g, (m, f) => {
    if (f === "%") return "%";
    if (f === "#") return String(index);
    const v = args[k++];
    if (f === "i") return String(Math.trunc(Number(v)));
    if (f === "d" || f === "f") return String(Number(v));
    if (f === "s") return typeof v === "string" ? v : format(v);
    return format(v);
  });
  // $name / $a.b reads fields of an object row
  if (args.length === 1 && args[0] && typeof args[0] === "object")
    out = out.replace(/\$([\w.]+)/g, (m, p) =>
      p === "index" ? String(index) : format(getPath(args[0], p).value),
    );
  return out;
}

function withModes(add) {
  const f = (name, fn, timeout) => add(name, fn, undefined, timeout);
  f.skip = (name, fn, timeout) => add(name, fn, "skip", timeout);
  f.only = (name, fn, timeout) => add(name, fn, "only", timeout);
  f.todo = (name) => add(name, undefined, "todo");
  f.skipIf = (c) => (c ? f.skip : f);
  f.runIf = (c) => (c ? f : f.skip);
  f.each = each(f);
  f.skip.each = each(f.skip);
  f.only.each = each(f.only);
  return f;
}

export const describe = withModes((name, fn, mode) => addSuite(name, fn, mode));
export const it = withModes(addTest);
export const test = it;
export const suite = describe;
export const beforeAll = (fn) => scope.hooks.beforeAll.push(fn);
export const afterAll = (fn) => scope.hooks.afterAll.push(fn);
export const beforeEach = (fn) => scope.hooks.beforeEach.push(fn);
export const afterEach = (fn) => scope.hooks.afterEach.push(fn);

// ---------------------------------------------------------------- runner

const chain = (s) => (s && s !== root ? [...chain(s.parent), s] : []);
const groupOf = (s) =>
  chain(s)
    .map((x) => x.name)
    .join(" › ");

let current = null;
/** Name of the test that is running right now (for attributing console output). */
export const __current = () => current;

/** What the test file registered: [{ group, name }] in run order. */
export function __collect() {
  return tests.map((t) => ({ group: groupOf(t.suite), name: t.name }));
}

function withTimeout(promise, ms, what) {
  let timer;
  const t = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new TimeoutError(
            `${what} timed out after ${ms} ms: a promise that never settles, or a wait that is too long`,
          ),
        ),
      ms,
    );
  });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

class TimeoutError extends Error {
  name = "TimeoutError";
}

/** Run every registered test one by one and reset the registry (one test file per run).
 * onResult fires after each test, so the worker can stream progress and a killed run still has partial results. */
export async function __run({ timeoutMs = 3000, onResult } = {}) {
  const list = tests;
  const only = hasOnly;
  tests = [];
  hasOnly = false;
  const started = new Set();
  const lastIndex = new Map(); // suite -> index of its last test, to know when to run afterAll
  list.forEach((t, i) => chain(t.suite).forEach((s) => lastIndex.set(s, i)));
  const results = [];

  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const suites = chain(t.suite);
    const r = { group: groupOf(t.suite), name: t.name, ok: true, ms: 0 };
    if (t.skip || (only && !t.only)) {
      r.skipped = true;
    } else {
      const t0 = performance.now();
      try {
        for (const s of [root, ...suites])
          if (!started.has(s)) {
            started.add(s);
            for (const h of s.hooks.beforeAll) await withTimeout(h(), timeoutMs, "beforeAll");
          }
        for (const s of [root, ...suites])
          for (const h of s.hooks.beforeEach) await withTimeout(h(), timeoutMs, "beforeEach");
        current = t.name;
        await withTimeout(Promise.resolve().then(t.fn), t.timeout ?? timeoutMs, "Test");
        for (const s of [root, ...suites].reverse())
          for (const h of s.hooks.afterEach) await withTimeout(h(), timeoutMs, "afterEach");
      } catch (e) {
        r.ok = false;
        r.error = describeError(e);
        if (!(e instanceof AssertionError) && e?.stack) r.stack = String(e.stack);
      }
      current = null;
      r.ms = Math.round(performance.now() - t0);
    }
    for (const s of suites.reverse())
      if (lastIndex.get(s) === i && started.has(s)) for (const h of s.hooks.afterAll) await settle(h);
    results.push(r);
    onResult?.(r);
  }
  for (const h of root.hooks.afterAll) await settle(h);
  Object.assign(root.hooks, hooks());
  return results;
}

// afterAll failures have no test to fail; they must not abort the run either
const settle = async (h) => {
  try {
    await h();
  } catch {}
};

function describeError(e) {
  if (e instanceof AssertionError) return e.message;
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return `Thrown value (not an Error): ${format(e)}`;
}

// ---------------------------------------------------------------- formatting

const MAX = 600;
const clip = (s, n = MAX) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Short human-readable value: strings quoted, objects as compact JSON-ish, errors as Name: message. */
export function format(v, n = MAX) {
  return clip(show(v, new Set()), n);
}

function show(v, seen) {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "bigint") return `${v}n`;
  if (typeof v === "symbol") return v.toString();
  if (typeof v === "function")
    return v._isMockFunction
      ? `vi.fn()`
      : v.prototype && /^class\b/.test(Function.prototype.toString.call(v))
        ? `class ${v.name}`
        : `[Function${v.name ? " " + v.name : ""}]`;
  if (v === null || typeof v !== "object") return String(v);
  if (isAsymmetric(v)) return v.toString();
  if (seen.has(v)) return "[Circular]";
  seen.add(v);
  try {
    if (v instanceof Error) {
      const extra = Object.keys(v).filter((k) => !["stack", "message", "name"].includes(k));
      const props = extra.length ? ` { ${extra.map((k) => `${k}: ${show(v[k], seen)}`).join(", ")} }` : "";
      return `${v.name}: ${v.message}${props}`;
    }
    if (v instanceof Date) return `Date(${isNaN(v) ? "Invalid" : v.toISOString()})`;
    if (v instanceof RegExp) return String(v);
    if (Array.isArray(v) || ArrayBuffer.isView(v)) {
      const items = Array.from(v, (x) => show(x, seen));
      return `${Array.isArray(v) ? "" : v.constructor.name + " "}[${items.join(", ")}]`;
    }
    if (v instanceof Map)
      return `Map {${[...v].map(([k, x]) => `${show(k, seen)} => ${show(x, seen)}`).join(", ")}}`;
    if (v instanceof Set) return `Set {${[...v].map((x) => show(x, seen)).join(", ")}}`;
    if (typeof Headers !== "undefined" && v instanceof Headers)
      return `Headers ${show(Object.fromEntries(v), seen)}`;
    if (typeof v.then === "function") return "Promise {…}";
    const name = v.constructor && v.constructor !== Object ? v.constructor.name + " " : "";
    const body = Object.keys(v)
      .map((k) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${show(v[k], seen)}`)
      .join(", ");
    return `${name}{${body ? " " + body + " " : ""}}`;
  } finally {
    seen.delete(v);
  }
}

// ---------------------------------------------------------------- equality

const isAsymmetric = (v) => v && typeof v.asymmetricMatch === "function";
const tag = (v) => Object.prototype.toString.call(v);
const pathStr = (p) => p.map((k) => (typeof k === "number" ? `[${k}]` : `.${k}`)).join("") || "(root)";

/** First difference between a and b, or null when equal. strict = toStrictEqual (undefined props and
 * classes count); partial = toMatchObject (b is a subset of a). */
function diff(a, b, opt, path = [], seen = []) {
  if (isAsymmetric(b)) return b.asymmetricMatch(a) ? null : { path, a, b };
  if (isAsymmetric(a)) return a.asymmetricMatch(b) ? null : { path, a, b };
  if (Object.is(a, b)) return null;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return { path, a, b };
  // toMatchObject lets a plain object describe any received value, e.g. an Error with a status field
  const shapeOnly = opt.partial && [Object.prototype, null].includes(Object.getPrototypeOf(b));
  if (!shapeOnly && tag(a) !== tag(b)) return { path, a, b };
  if (opt.strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return { path, a, b, why: "type" };
  if (seen.some(([x, y]) => x === a && y === b)) return null;
  seen = [...seen, [a, b]];

  if (a instanceof Date) return a.getTime() === b.getTime() ? null : { path, a, b };
  if (a instanceof RegExp) return String(a) === String(b) ? null : { path, a, b };
  if (a instanceof Error && b instanceof Error && (a.message !== b.message || a.name !== b.name))
    return { path, a, b };
  if (a instanceof Map) {
    if (a.size !== b.size) return { path, a, b };
    for (const [k, v] of a) {
      if (!b.has(k)) return { path: [...path, String(k)], a: v, b: undefined };
      const d = diff(v, b.get(k), opt, [...path, String(k)], seen);
      if (d) return d;
    }
    return null;
  }
  if (a instanceof Set) {
    if (a.size !== b.size) return { path, a, b };
    for (const v of a)
      if (!b.has(v) && ![...b].some((w) => !diff(v, w, opt, [], seen))) return { path, a, b };
    return null;
  }
  if (Array.isArray(a) || ArrayBuffer.isView(a)) {
    if (a.length !== b.length) return { path, a, b, why: "length" };
    for (let i = 0; i < a.length; i++) {
      const d = diff(a[i], b[i], opt, [...path, i], seen);
      if (d) return d;
    }
    return null;
  }
  // plain objects, class instances, errors' extra props
  const keys = (o) => Object.keys(o).filter((k) => opt.strict || o[k] !== undefined);
  const bk = keys(b);
  if (!opt.partial) {
    const ak = keys(a);
    const missing = ak.find((k) => !bk.includes(k));
    if (missing !== undefined) return { path: [...path, missing], a: a[missing], b: undefined, why: "extra" };
  }
  for (const k of bk) {
    if (!(k in Object(a))) return { path: [...path, k], a: undefined, b: b[k], why: "missing" };
    const d = diff(a[k], b[k], opt, [...path, k], seen);
    if (d) return d;
  }
  return null;
}

export const equals = (a, b, strict = false) => !diff(a, b, { strict });

// ---------------------------------------------------------------- expect

export class AssertionError extends Error {
  name = "AssertionError";
}

function explainDiff(received, expected, d, verb) {
  let s = `expected values ${verb}\n  expected: ${format(expected)}\n  received: ${format(received)}`;
  if (d && d.path.length) {
    const what =
      d.why === "extra"
        ? `received has ${format(d.a, 120)} that expected doesn't have`
        : d.why === "missing"
          ? `missing in received (expected ${format(d.b, 120)})`
          : `expected ${format(d.b, 120)}, received ${format(d.a, 120)}`;
    s += `\n  first difference at ${pathStr(d.path)}: ${what}`;
  }
  return s;
}

const plural = (n) => `${n} time${n === 1 ? "" : "s"}`;
const isMock = (f) => typeof f === "function" && f._isMockFunction;
function needMock(f) {
  if (!isMock(f)) throw new AssertionError(`expected a vi.fn() mock, received ${format(f)}`);
  return f.mock;
}
const callsList = (m) =>
  m.calls.length
    ? "\n  calls:\n" +
      m.calls.map((c, i) => `    ${i + 1}: (${c.map((x) => format(x, 200)).join(", ")})`).join("\n")
    : "";

function getPath(obj, path) {
  const keys = Array.isArray(path) ? path : String(path).match(/[^.[\]]+/g) || [];
  let cur = obj;
  for (const k of keys) {
    if (cur == null || !(k in Object(cur))) return { found: false };
    cur = cur[k];
  }
  return { found: true, value: cur };
}

/** Each matcher returns [pass, messageWhenItShouldPass, messageWhenItShouldFail]. */
const matchers = {
  toBe(r, e) {
    const hint =
      !Object.is(r, e) && typeof r === "object" && r && equals(r, e)
        ? "\n  (they are equal, but not the same object: use toEqual for a deep comparison)"
        : "";
    return [
      Object.is(r, e),
      `expected ${format(r)} to be ${format(e)}${hint}`,
      `expected ${format(r)} not to be ${format(e)}`,
    ];
  },
  toEqual(r, e) {
    const d = diff(r, e, {});
    return [
      !d,
      explainDiff(r, e, d, "to be deeply equal"),
      `expected ${format(r)} not to equal ${format(e)}`,
    ];
  },
  toStrictEqual(r, e) {
    const d = diff(r, e, { strict: true });
    return [
      !d,
      explainDiff(r, e, d, "to be strictly equal"),
      `expected ${format(r)} not to strictly equal ${format(e)}`,
    ];
  },
  toMatchObject(r, e) {
    const d = typeof r === "object" && r !== null ? diff(r, e, { partial: true }) : { path: [] };
    return [!d, explainDiff(r, e, d, "to match object"), `expected ${format(r)} not to match ${format(e)}`];
  },
  toHaveLength(r, n) {
    const len = r?.length;
    return [
      len === n,
      typeof len !== "number"
        ? `expected ${format(r)} to have a length, but it has none`
        : `expected length ${n}, received length ${len}: ${format(r)}`,
      `expected ${format(r)} not to have length ${n}`,
    ];
  },
  toContain(r, item) {
    const pass =
      typeof r === "string"
        ? r.includes(item)
        : r != null && typeof r[Symbol.iterator] === "function" && [...r].some((x) => x === item);
    return [
      pass,
      `expected ${format(r)} to contain ${format(item)}`,
      `expected ${format(r)} not to contain ${format(item)}`,
    ];
  },
  toContainEqual(r, item) {
    const pass = r != null && [...r].some((x) => equals(x, item));
    return [
      pass,
      `expected ${format(r)} to contain an item equal to ${format(item)}`,
      `expected ${format(r)} not to contain ${format(item)}`,
    ];
  },
  toBeInstanceOf(r, C) {
    const name = C?.name || "(anonymous class)";
    const cls = r?.constructor?.name;
    const got = cls ? `${/^[AEIOU]/.test(cls) ? "an" : "a"} ${cls}` : format(r);
    return [
      typeof C === "function" && r instanceof C,
      `expected ${format(r)} to be an instance of ${name}, but it is ${got}`,
      `expected ${format(r)} not to be an instance of ${name}`,
    ];
  },
  toBeGreaterThan: (r, n) => [
    r > n,
    `expected ${format(r)} to be > ${format(n)}`,
    `expected ${format(r)} not to be > ${format(n)}`,
  ],
  toBeGreaterThanOrEqual: (r, n) => [
    r >= n,
    `expected ${format(r)} to be >= ${format(n)}`,
    `expected ${format(r)} not to be >= ${format(n)}`,
  ],
  toBeLessThan: (r, n) => [
    r < n,
    `expected ${format(r)} to be < ${format(n)}`,
    `expected ${format(r)} not to be < ${format(n)}`,
  ],
  toBeLessThanOrEqual: (r, n) => [
    r <= n,
    `expected ${format(r)} to be <= ${format(n)}`,
    `expected ${format(r)} not to be <= ${format(n)}`,
  ],
  toBeCloseTo(r, n, digits = 2) {
    return [
      Math.abs(r - n) < 10 ** -digits / 2,
      `expected ${format(r)} to be close to ${n}`,
      `expected ${format(r)} not to be close to ${n}`,
    ];
  },
  toBeTruthy: (r) => [!!r, `expected ${format(r)} to be truthy`, `expected ${format(r)} to be falsy`],
  toBeFalsy: (r) => [!r, `expected ${format(r)} to be falsy`, `expected ${format(r)} to be truthy`],
  toBeNull: (r) => [r === null, `expected ${format(r)} to be null`, `expected value not to be null`],
  toBeUndefined: (r) => [
    r === undefined,
    `expected ${format(r)} to be undefined`,
    `expected value not to be undefined`,
  ],
  toBeDefined: (r) => [
    r !== undefined,
    `expected value to be defined, received undefined`,
    `expected ${format(r)} to be undefined`,
  ],
  toBeNaN: (r) => [Number.isNaN(r), `expected ${format(r)} to be NaN`, `expected value not to be NaN`],
  toBeTypeOf: (r, t) => [
    typeof r === t,
    `expected ${format(r)} to be of type ${t}, but it is ${typeof r}`,
    `expected ${format(r)} not to be of type ${t}`,
  ],
  toMatch(r, p) {
    const pass = typeof r === "string" && (typeof p === "string" ? r.includes(p) : p.test(r));
    return [
      pass,
      `expected ${format(r)} to match ${format(p)}`,
      `expected ${format(r)} not to match ${format(p)}`,
    ];
  },
  toHaveProperty(r, path, ...value) {
    const { found, value: v } = getPath(r, path);
    const p = Array.isArray(path) ? path.join(".") : path;
    if (!value.length)
      return [
        found,
        `expected ${format(r)} to have property "${p}"`,
        `expected ${format(r)} not to have property "${p}"`,
      ];
    const ok = found && equals(v, value[0]);
    return [
      ok,
      found
        ? `expected property "${p}" to equal ${format(value[0])}, received ${format(v)}`
        : `expected ${format(r)} to have property "${p}"`,
      `expected property "${p}" not to equal ${format(value[0])}`,
    ];
  },
  // `this.rejected`: under .rejects the received value is already the thrown error
  toThrow(r, expected) {
    let threw = false;
    let err;
    if (this.rejected) [threw, err] = [true, r];
    else if (typeof r !== "function")
      throw new AssertionError(`toThrow needs a function, received ${format(r)}`);
    else
      try {
        r();
      } catch (e) {
        [threw, err] = [true, e];
      }
    const msg = err?.message ?? String(err);
    const got = threw ? `it threw ${format(err)}` : "it did not throw";
    if (expected === undefined)
      return [
        threw,
        `expected the function to throw, but ${got}`,
        `expected the function not to throw, but ${got}`,
      ];
    let pass;
    let want;
    if (typeof expected === "string")
      [pass, want] = [threw && msg.includes(expected), `an error containing ${format(expected)}`];
    else if (expected instanceof RegExp)
      [pass, want] = [threw && expected.test(msg), `an error matching ${expected}`];
    else if (typeof expected === "function")
      [pass, want] = [threw && err instanceof expected, `an instance of ${expected.name}`];
    else if (expected instanceof Error)
      [pass, want] = [threw && msg === expected.message, `an error with message ${format(expected.message)}`];
    else
      [pass, want] = [
        threw && !diff(err, expected, { partial: true }),
        `an error matching ${format(expected)}`,
      ];
    return [pass, `expected to throw ${want}, but ${got}`, `expected not to throw ${want}, but ${got}`];
  },
  toHaveBeenCalled(r) {
    const m = needMock(r);
    return [
      m.calls.length > 0,
      `expected the mock to be called, but it was never called`,
      `expected the mock not to be called, but it was called ${plural(m.calls.length)}${callsList(m)}`,
    ];
  },
  toHaveBeenCalledTimes(r, n) {
    const m = needMock(r);
    return [
      m.calls.length === n,
      `expected the mock to be called ${plural(n)}, but it was called ${plural(m.calls.length)}${callsList(m)}`,
      `expected the mock not to be called ${plural(n)}`,
    ];
  },
  toHaveBeenCalledOnce: (r) => matchers.toHaveBeenCalledTimes(r, 1),
  toHaveBeenCalledWith(r, ...args) {
    const m = needMock(r);
    const pass = m.calls.some((c) => equals(c, args));
    const shown = `(${args.map((x) => format(x, 200)).join(", ")})`;
    return [
      pass,
      `expected the mock to be called with ${shown}${m.calls.length ? "" : ", but it was never called"}${callsList(m)}`,
      `expected the mock not to be called with ${shown}${callsList(m)}`,
    ];
  },
  toHaveBeenLastCalledWith(r, ...args) {
    const m = needMock(r);
    const shown = `(${args.map((x) => format(x, 200)).join(", ")})`;
    return [
      m.calls.length > 0 && equals(m.calls.at(-1), args),
      `expected the last call to be ${shown}${callsList(m)}`,
      `expected the last call not to be ${shown}`,
    ];
  },
  toHaveBeenNthCalledWith(r, n, ...args) {
    const m = needMock(r);
    const shown = `(${args.map((x) => format(x, 200)).join(", ")})`;
    return [
      m.calls.length >= n && equals(m.calls[n - 1], args),
      `expected call #${n} to be ${shown}${callsList(m)}`,
      `expected call #${n} not to be ${shown}`,
    ];
  },
  toHaveReturnedWith(r, v) {
    const m = needMock(r);
    return [
      m.results.some((x) => x.type === "return" && equals(x.value, v)),
      `expected the mock to return ${format(v)}`,
      `expected the mock not to return ${format(v)}`,
    ];
  },
  toSatisfy: (r, fn) => [
    !!fn(r),
    `expected ${format(r)} to satisfy ${fn.name || "the predicate"}`,
    `expected ${format(r)} not to satisfy the predicate`,
  ],
};
matchers.toThrowError = matchers.toThrow;
matchers.toBeCalled = matchers.toHaveBeenCalled;
matchers.toBeCalledTimes = matchers.toHaveBeenCalledTimes;
matchers.toBeCalledWith = matchers.toHaveBeenCalledWith;

function assertion(received, { not = false, mode = null, label } = {}) {
  const api = {};
  for (const [name, m] of Object.entries(matchers)) {
    const check = (value, rejected, args) => {
      const [pass, failMsg, notMsg] = m.call({ rejected }, value, ...args);
      if (pass === not) {
        throw new AssertionError((label ? `${label}: ` : "") + (not ? notMsg : failMsg));
      }
    };
    api[name] = (...args) => {
      if (!mode) return check(received, false, args);
      if (!received || typeof received.then !== "function")
        throw new AssertionError(`expected a promise for .${mode}, received ${format(received)}`);
      return Promise.resolve(received).then(
        (v) => {
          if (mode === "rejects")
            throw new AssertionError(`expected the promise to reject, but it resolved with ${format(v)}`);
          check(v, false, args);
        },
        (e) => {
          if (mode === "resolves")
            throw new AssertionError(`expected the promise to resolve, but it rejected with ${format(e)}`);
          check(e, true, args);
        },
      );
    };
  }
  Object.defineProperty(api, "not", { get: () => assertion(received, { not: !not, mode, label }) });
  Object.defineProperty(api, "resolves", {
    get: () => assertion(received, { not, mode: "resolves", label }),
  });
  Object.defineProperty(api, "rejects", { get: () => assertion(received, { not, mode: "rejects", label }) });
  return api;
}

export function expect(received, label) {
  return assertion(received, { label });
}

// Asymmetric matchers: objects that decide equality themselves inside toEqual / toHaveBeenCalledWith.
const asym = (name, sample, match) => ({
  asymmetricMatch: match,
  toString: () => `${name}(${format(sample, 200)})`,
});
expect.anything = () => asym("Anything", "", (v) => v != null);
expect.any = (C) =>
  asym("Any", C?.name, (v) =>
    C === String
      ? typeof v === "string" || v instanceof String
      : C === Number
        ? typeof v === "number" || v instanceof Number
        : C === Boolean
          ? typeof v === "boolean"
          : C === Function
            ? typeof v === "function"
            : C === Object
              ? typeof v === "object" && v !== null
              : v instanceof C,
  );
expect.arrayContaining = (arr) =>
  asym("ArrayContaining", arr, (v) => Array.isArray(v) && arr.every((x) => v.some((y) => equals(y, x))));
expect.objectContaining = (obj) =>
  asym(
    "ObjectContaining",
    obj,
    (v) => v != null && typeof v === "object" && !diff(v, obj, { partial: true }),
  );
expect.stringContaining = (s) => asym("StringContaining", s, (v) => typeof v === "string" && v.includes(s));
expect.stringMatching = (re) =>
  asym(
    "StringMatching",
    re,
    (v) => typeof v === "string" && (typeof re === "string" ? new RegExp(re) : re).test(v),
  );
expect.not = {
  arrayContaining: (a) => {
    const m = expect.arrayContaining(a);
    return asym("NotArrayContaining", a, (v) => !m.asymmetricMatch(v));
  },
  objectContaining: (o) => {
    const m = expect.objectContaining(o);
    return asym("NotObjectContaining", o, (v) => !m.asymmetricMatch(v));
  },
};
expect.assertions = () => {};
expect.hasAssertions = () => {};

// ---------------------------------------------------------------- vi

const allMocks = new Set();

function fn(impl) {
  const once = [];
  let base = impl;
  let name = "vi.fn()";
  const mock = { calls: [], results: [], instances: [], contexts: [], lastCall: undefined };
  function spy(...args) {
    mock.calls.push(args);
    mock.lastCall = args;
    mock.instances.push(this);
    mock.contexts.push(this);
    const f = once.length ? once.shift() : base;
    try {
      const value = f
        ? new.target
          ? Reflect.construct(f, args, new.target)
          : f.apply(this, args)
        : undefined;
      mock.results.push({ type: "return", value });
      return value;
    } catch (e) {
      mock.results.push({ type: "throw", value: e });
      throw e;
    }
  }
  Object.assign(spy, {
    _isMockFunction: true,
    mock,
    getMockName: () => name,
    mockName: (n) => ((name = n), spy),
    getMockImplementation: () => base,
    mockImplementation: (f) => ((base = f), spy),
    mockImplementationOnce: (f) => (once.push(f), spy),
    mockReturnValue: (v) => spy.mockImplementation(() => v),
    mockReturnValueOnce: (v) => spy.mockImplementationOnce(() => v),
    mockResolvedValue: (v) => spy.mockImplementation(() => Promise.resolve(v)),
    mockResolvedValueOnce: (v) => spy.mockImplementationOnce(() => Promise.resolve(v)),
    mockRejectedValue: (e) => spy.mockImplementation(() => Promise.reject(e)),
    mockRejectedValueOnce: (e) => spy.mockImplementationOnce(() => Promise.reject(e)),
    mockReturnThis: () =>
      spy.mockImplementation(function () {
        return this;
      }),
    mockClear() {
      Object.assign(mock, { calls: [], results: [], instances: [], contexts: [], lastCall: undefined });
      return spy;
    },
    mockReset() {
      spy.mockClear();
      once.length = 0;
      base = impl;
      return spy;
    },
    mockRestore: () => spy.mockReset(),
  });
  allMocks.add(spy);
  return spy;
}

const unsupported = (what) => () => {
  throw new Error(`${what} is not supported by the in-browser test runner`);
};

export const vi = {
  fn,
  isMockFunction: isMock,
  spyOn(obj, key) {
    const original = obj[key];
    const spy = fn(original);
    const restore = spy.mockRestore;
    spy.mockRestore = () => {
      restore();
      obj[key] = original;
      return spy;
    };
    obj[key] = spy;
    return spy;
  },
  clearAllMocks: () => (allMocks.forEach((m) => m.mockClear()), vi),
  resetAllMocks: () => (allMocks.forEach((m) => m.mockReset()), vi),
  restoreAllMocks: () => (allMocks.forEach((m) => m.mockRestore()), vi),
  useFakeTimers: unsupported("vi.useFakeTimers"),
  useRealTimers: () => vi,
  mock: unsupported("vi.mock"),
};
