// Builds the browser bundles in app/vendor/ that the in-browser labs runner needs:
//   sucrase.js     TS -> JS (types stripped, ESM kept) inside the lab worker
//   zod.js         zod v4 as ESM, the same major the labs pin in labs/package.json
//   codemirror.js  CodeMirror 6 + a createEditor() helper for the lab editor
//
// Rebuild: node scripts/build-vendor.mjs
// The app has no build step and the repo has no npm deps for the browser, so the tools are installed into
// a throwaway folder (os.tmpdir()/drill-vendor-build, or $VENDOR_BUILD_DIR) and only the minified output is
// committed. Bump the versions below on purpose; zod must stay on the labs' major.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "app/vendor");
const work = process.env.VENDOR_BUILD_DIR || join(tmpdir(), "drill-vendor-build");

const labsZod = JSON.parse(readFileSync(join(root, "labs/package.json"), "utf8")).dependencies.zod;
const deps = {
  esbuild: "0.28.2",
  sucrase: "3.35.1",
  zod: labsZod.replace(/^[\^~]/, ""),
  "@codemirror/autocomplete": "6.20.4",
  "@codemirror/commands": "6.11.1",
  "@codemirror/lang-javascript": "6.2.5",
  "@codemirror/language": "6.13.1",
  "@codemirror/state": "6.7.6",
  "@codemirror/view": "6.43.15",
  "@lezer/highlight": "1.2.5",
};

mkdirSync(work, { recursive: true });
writeFileSync(join(work, "package.json"), JSON.stringify({ private: true, dependencies: deps }, null, 2));
execFileSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], {
  cwd: work,
  stdio: "inherit",
});
const esbuild = await import(pathToFileURL(join(work, "node_modules/esbuild/lib/main.js")).href);

// The CodeMirror entry: just the pieces a code editor for short TS files needs (no autocomplete popups,
// folding, lint or search), which keeps the bundle around a third of `basicSetup`.
const codemirrorEntry = `
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, drawSelection, dropCursor,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentOnInput, bracketMatching, syntaxHighlighting, HighlightStyle, indentUnit } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { tags as t } from "@lezer/highlight";

// Colors follow app/css/theme.css.
const c = {
  bg: "#0e1526", fg: "#f3efe6", gutter: "#121a2c", line: "#22304a", dim: "#98a3ba",
  accent: "#ff7a59", blue: "#7aa2ff", green: "#5dd39e", amber: "#ffc14d", violet: "#c3a6ff",
};
const mono = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const theme = EditorView.theme({
  "&": { color: c.fg, backgroundColor: c.bg, fontSize: "13px", height: "100%" },
  ".cm-scroller": { fontFamily: mono, lineHeight: "1.55" },
  ".cm-content": { caretColor: c.accent, padding: "10px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: c.accent, borderLeftWidth: "2px" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
    { backgroundColor: "#2b3d63" },
  ".cm-gutters": { backgroundColor: c.gutter, color: "#5d6a86", border: "none", borderRight: "1px solid " + c.line },
  ".cm-activeLine": { backgroundColor: "#ffffff08" },
  ".cm-activeLineGutter": { backgroundColor: "#ffffff0a", color: c.dim },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "#ff7a5933", outline: "1px solid #ff7a5966" },
  ".cm-nonmatchingBracket": { color: "#ff6b6b" },
}, { dark: true });

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: c.accent },
  { tag: [t.string, t.special(t.string), t.regexp], color: c.green },
  { tag: [t.number, t.bool, t.null, t.atom], color: c.amber },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#6f7b95", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.blue },
  { tag: [t.typeName, t.className, t.namespace], color: c.violet },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: c.fg },
  { tag: [t.propertyName], color: "#e6dccb" },
  { tag: [t.operator, t.punctuation, t.bracket], color: c.dim },
  { tag: t.invalid, color: "#ff6b6b" },
]);

/** Mount a TypeScript editor into parent. onRun fires on Mod-Enter; Mod-s is swallowed so the browser
 * "save page" dialog never opens mid-exercise. */
export function createEditor(parent, { doc = "", readOnly = false, onChange, onRun, dark = true } = {}) {
  const ro = new Compartment();
  let quiet = false; // setValue() is the caller's own change: don't echo it back through onChange
  const roExt = (on) => [EditorState.readOnly.of(on), EditorView.editable.of(!on)];
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), drawSelection(),
        dropCursor(), indentOnInput(), bracketMatching(), closeBrackets(), highlightActiveLine(),
        EditorState.tabSize.of(2), indentUnit.of("  "), javascript({ typescript: true }),
        syntaxHighlighting(highlight), dark ? theme : [],
        keymap.of([
          { key: "Mod-Enter", preventDefault: true, run: () => (onRun?.(), true) },
          { key: "Mod-s", preventDefault: true, run: () => true },
          ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab,
        ]),
        EditorView.updateListener.of((u) => u.docChanged && !quiet && onChange?.(u.state.doc.toString())),
        ro.of(roExt(readOnly)),
      ],
    }),
  });
  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue(text) {
      quiet = true;
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      } finally {
        quiet = false;
      }
    },
    setReadOnly: (on) => view.dispatch({ effects: ro.reconfigure(roExt(on)) }),
    focus: () => view.focus(),
  };
}
export { EditorView, EditorState };
`;

const entries = {
  "sucrase.js": `export { transform } from "sucrase";`,
  "zod.js": `export * from "zod"; export { z, z as default } from "zod";`,
  "codemirror.js": codemirrorEntry,
};

// `z.locales` re-exports ~45 translations (over half of zod's bundle). Error messages stay English, so the
// namespace keeps only `en`; anything else the labs use is untouched.
const zodEnglishOnly = {
  name: "zod-english-only",
  setup(b) {
    b.onResolve({ filter: /\/locales\/index\.js$/ }, (a) =>
      a.importer.includes("/zod/")
        ? { path: join(a.resolveDir, a.path), namespace: "zod-locales" }
        : undefined,
    );
    b.onLoad({ filter: /.*/, namespace: "zod-locales" }, (a) => ({
      contents: `export { default as en } from "./en.js";`,
      resolveDir: dirname(a.path),
    }));
  },
};

mkdirSync(out, { recursive: true });
for (const [file, contents] of Object.entries(entries)) {
  await esbuild.build({
    plugins: [zodEnglishOnly],
    stdin: { contents, resolveDir: work, loader: "js", sourcefile: file },
    outfile: join(out, file),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    legalComments: "eof",
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning",
  });
  console.log(`app/vendor/${file}  ${(statSync(join(out, file)).size / 1024).toFixed(1)} KB`);
}
