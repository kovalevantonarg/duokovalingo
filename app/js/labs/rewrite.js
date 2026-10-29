// Turning lab TypeScript into importable ES modules. Pure functions, shared by the browser worker and the
// Node test (test/labs-runner.test.mjs), so both run exactly the same code path.

/** Stands in for a value import of the real SDK: the labs only use it for types, and the browser can't call
 * the API anyway. Constructing it explains why instead of failing with a bare link error. */
export const SDK_STUB =
  "data:text/javascript," +
  encodeURIComponent(
    "export default class Anthropic { constructor() { throw new Error('The real Anthropic SDK is not " +
      "available in the browser runner: use the fake client from shared/fake-client') } }",
  );

export class CompileError extends Error {
  constructor(message, file, line, column) {
    super(message);
    this.name = "CompileError";
    Object.assign(this, { file, line, column });
  }
}

/** TS -> JS with the vendored sucrase. Line numbers are preserved, so runtime stack lines still point at
 * the learner's source. Syntax errors come back as CompileError with a 1-based line:column. */
export function compileTs(transform, source, file) {
  try {
    return transform(source, { transforms: ["typescript"], filePath: file }).code;
  } catch (e) {
    const { line, column } = e.loc || {};
    const msg = String(e.message)
      .replace(/^Error transforming [^:]+: /, "")
      .replace(/ \(\d+:\d+\)$/, "");
    throw new CompileError(
      line ? `${file}:${line}:${column}: ${msg}` : `${file}: ${msg}`,
      file,
      line,
      column,
    );
  }
}

// Static `import ... from "x"`, `import "x"`, `export ... from "x"`, at the start of a statement. The clause
// between the keyword and `from` never holds quotes, so it can't swallow a string literal.
const STATIC = /(^|[;\n}])(\s*(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?)(["'])([^"'\n]+)\3/g;
const DYNAMIC = /(\bimport\s*\(\s*)(["'])([^"'\n]+)\2(\s*\))/g;

/** Rewrite every import specifier through resolve(spec) -> URL. An unknown specifier is a CompileError,
 * because a blob module can't resolve bare names or relative paths on its own. */
export function rewriteImports(code, resolve, file) {
  const to = (spec) => {
    const url = resolve(spec);
    if (url) return url;
    throw new CompileError(
      `${file}: can't import "${spec}" here: the browser runner only provides zod, vitest and shared/fake-client`,
      file,
    );
  };
  return code
    .replace(STATIC, (_, pre, head, q, spec) => pre + head + q + to(spec) + q)
    .replace(DYNAMIC, (_, head, q, spec, tail) => head + q + to(spec) + q + tail);
}

/** The module map the labs see, mirroring labs/vitest.config.ts: `@lab/<name>` is the learner's file. */
export function labResolver({ vitest, zod, shared, lab, labModule }) {
  return (spec) => {
    if (spec === "vitest") return vitest;
    if (spec === "zod" || spec === "zod/v4") return zod;
    if (spec === "@anthropic-ai/sdk") return SDK_STUB;
    if (spec === `@lab/${labModule}`) return lab;
    if (/^\.\.?\/.*shared\/fake-client(\.[jt]s)?$/.test(spec)) return shared;
    return null;
  };
}
