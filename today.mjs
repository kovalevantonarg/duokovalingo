#!/usr/bin/env node
// today.mjs — local helper for the drill app.
//   node today.mjs              -> what's due today (terminal)
//   node today.mjs done 12 g    -> grade ticket 12 (g green / y yellow / r red)
//   node today.mjs status       -> every ticket at a glance
//   node today.mjs serve [port] -> local server for app/ (progress in queue.json), default :4040
//   node today.mjs pull         -> fetch progress from the deployed app into queue.json (needs DRILL_URL + DRILL_COOKIE in env or .env)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { checkPrompt, parseJson, GRADE_BODY } from "./app/api/_grade.js";
import {
  applyHit,
  dueTickets,
  emptyDb,
  intervalOf,
  isTicket,
  migrate,
  resetTicket,
  setFlags,
  statusOf,
} from "./app/lib/srs.js";
import { CATALOG } from "./app/lib/catalog.js";

const FILE = new URL("./queue.json", import.meta.url);
const DIR = dirname(fileURLToPath(import.meta.url));
const APP = join(DIR, "app");
const db = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : emptyDb();
const save = () => writeFileSync(FILE, JSON.stringify(db, null, 2) + "\n");
if (migrate(db)) save();

const TODAY = new Date().toISOString().slice(0, 10);
const MARK = { new: "  ", red: "X ", yellow: "~ ", green: "OK" };
const topics = (() => {
  try {
    const src = readFileSync(join(APP, "tickets.js"), "utf8");
    return Object.fromEntries(
      JSON.parse(src.slice(src.indexOf("= [") + 2, src.lastIndexOf("]") + 1)).map((t) => [t.n, t.en.topic]),
    );
  } catch {
    return {};
  }
})();
const label = (n) => `#${String(n).padEnd(2)} ${topics[n] || ""}`;
const envFile = existsSync(join(DIR, ".env")) ? readFileSync(join(DIR, ".env"), "utf8") : "";
const env = (k) =>
  process.env[k] ||
  (envFile.match(new RegExp(`^\\s*${k}\\s*=\\s*"?([^"\\n]+)"?`, "m")) || [])[1]?.trim() ||
  "";

const cmd = process.argv[2];

if (cmd === "done") {
  const n = Number(process.argv[3]);
  const st = { g: "green", y: "yellow", r: "red" }[process.argv[4]];
  if (!isTicket(n) || !st) {
    console.log("usage: node today.mjs done <ticket> <g|y|r>");
    process.exit(1);
  }
  applyHit(db, { n, st, mode: "cli" }, TODAY);
  save();
  console.log(`${label(n)} -> ${st}, next in ${intervalOf(db.tickets[n])}d`);
} else if (cmd === "status") {
  const active = CATALOG.filter((t) => t.sec !== "parked");
  const count = (s) => active.filter((t) => statusOf(db, t.n) === s).length;
  console.log(
    `green ${count("green")} | yellow ${count("yellow")} | red ${count("red")} | new ${count("new")}`,
  );
  for (const t of active) {
    const r = db.tickets[t.n] || {};
    console.log(
      ` ${MARK[statusOf(db, t.n)]} ${label(t.n)}${r.last ? `  (${r.last})` : ""}${r.doubt ? "  ?" : ""}`,
    );
  }
} else if (cmd === "pull") {
  // the session cookie from the browser (DevTools → Application → Cookies → "drill"), since sign-in is via Google
  const base = env("DRILL_URL").replace(/\/$/, ""),
    session = env("DRILL_COOKIE");
  if (!base || !session) {
    console.log(
      "need DRILL_URL and DRILL_COOKIE (env or .env): DRILL_COOKIE is the value of the 'drill' cookie of the signed-in app",
    );
    process.exit(1);
  }
  const cookie = "drill=" + session;
  const sr = await fetch(base + "/api/state", { headers: { cookie } });
  if (!sr.ok) {
    console.log("state failed", sr.status);
    process.exit(1);
  }
  const { auth, explain, user, push, ...cloud } = await sr.json();
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, cloud);
  migrate(db);
  save();
  console.log(
    `pulled: ${Object.keys(db.tickets).length} tickets with progress, ${db.history.length} days -> queue.json`,
  );
} else if (cmd === "serve") {
  serve(Number(process.argv[3] || 4040));
} else {
  const due = dueTickets(db);
  const next = CATALOG.find((t) => t.sec !== "parked" && statusOf(db, t.n) === "new");
  console.log(
    `\n=== TODAY - ${new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ===\n`,
  );
  console.log(due.length ? "DUE" : "Nothing due.");
  for (const r of due.slice(0, 5)) console.log(`  ${label(r.n)}  [${r.st}, ${r.over}d overdue]`);
  if (due.length > 5) console.log(`  (+${due.length - 5} more)`);
  if (next) console.log(`\nNEXT NEW\n  ${label(next.n)}`);
  console.log(`\nplay: node today.mjs serve   |   grade: node today.mjs done <ticket> <g|y|r>\n`);
}

// ---- local server: app/ reads and writes queue.json through the same /api as the Vercel function ----
function serve(port) {
  const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".css": "text/css",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
  };
  const MODEL = env("DRILL_MODEL") || "claude-sonnet-5-5";
  const CACHE = join(DIR, "explain-cache.json");
  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  const out = () => {
    const { exams, legacy, ...rest } = db;
    return { ...rest, auth: false, explain: !!env("ANTHROPIC_API_KEY") };
  };
  const json = (res, code, obj) => {
    res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(obj));
  };
  const body = (req) =>
    new Promise((ok) => {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        try {
          ok(JSON.parse(b || "{}"));
        } catch {
          ok({});
        }
      });
    });
  const claude = async (payload) => {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env("ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || "api " + r.status);
    console.log(`  claude ${MODEL}  in ${j.usage?.input_tokens} out ${j.usage?.output_tokens}`);
    return j;
  };
  // the old standalone pages now live inside the app (same redirects as vercel.json)
  const OLD = {
    "/exam-tickets": "exam",
    "/exam-tickets.html": "exam",
    "/learn": "learn",
    "/learn.html": "learn",
    "/map": "map",
    "/map.html": "map",
    "/roadmap": "map",
    "/roadmap.html": "map",
  };

  createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    if (OLD[p]) {
      res.writeHead(301, { location: "/?from=" + OLD[p] });
      return res.end();
    }
    if (p === "/api/state") return json(res, 200, out());
    if (p === "/api/exams") {
      const all = Array.isArray(db.exams) ? db.exams : [],
        n = url.searchParams.get("n");
      return json(
        res,
        200,
        n ? all.filter((e) => e.n === Number(n)) : all.map(({ answer, verdict, ...e }) => e),
      );
    }
    if (req.method === "POST" && (p === "/api/log" || p === "/api/done")) {
      const hit = await body(req);
      if (!applyHit(db, hit, TODAY)) return json(res, 400, { error: "bad ticket" });
      save();
      console.log(
        `  ${hit.d || TODAY}  #${hit.n ?? "item " + hit.id}  ${hit.mode || ""}  ${hit.st ? "-> " + hit.st : ""}  +${hit.xp || 0}xp`,
      );
      return json(res, 200, out());
    }
    if (req.method === "POST" && p === "/api/flag") {
      const b = await body(req);
      const flags = {};
      if ("doubt" in b) flags.doubt = !!b.doubt;
      if ("read" in b) flags.read = !!b.read;
      if (setFlags(db, b.n, flags, b.d)) save();
      return json(res, 200, out());
    }
    if (req.method === "POST" && p === "/api/reset") {
      const b = await body(req);
      if (resetTicket(db, b.n)) save();
      return json(res, 200, out());
    }
    if (req.method === "POST" && p === "/api/check") {
      if (!env("ANTHROPIC_API_KEY")) return json(res, 400, { error: "no_key" });
      const b = await body(req);
      if (String(b.answer || "").trim().length < 40) return json(res, 400, { error: "too_short" });
      const { sys, user } = checkPrompt(b);
      let g;
      try {
        const j = await claude(GRADE_BODY(MODEL, sys, user));
        if (j.stop_reason === "max_tokens")
          return json(res, 502, { error: "grader ran out of tokens, try again" });
        g = parseJson((j.content || []).map((c) => c.text || "").join(""));
      } catch (e) {
        return json(res, 502, { error: e.message });
      }
      const n = Number(b.n),
        interview = b.kind === "interview";
      db.exams = Array.isArray(db.exams) ? db.exams : [];
      db.exams.push({
        n,
        lang: b.lang === "en" ? "en" : "ru",
        d: TODAY,
        t: Date.now(),
        score: g.score,
        q: g.questions,
        chars: String(b.answer || "").length,
        answer: String(b.answer || "").slice(0, 1500),
        verdict: g.verdict.slice(0, 300),
        ...(interview ? { kind: "interview" } : {}),
      });
      const st = g.score >= 8 ? "green" : g.score >= 5 ? "yellow" : "red";
      applyHit(
        db,
        { n, xp: g.score, mode: interview ? "interview" : "exam", ...(interview ? {} : { st }) },
        TODAY,
      );
      save();
      return json(res, 200, { ...g, attempts: db.exams.filter((e) => e.n === n).slice(-20) });
    }
    if (req.method === "POST" && p === "/api/explain") {
      const b = await body(req);
      if (!env("ANTHROPIC_API_KEY"))
        return json(res, 400, { error: "no ANTHROPIC_API_KEY (env or .env next to today.mjs)" });
      const ck = [b.lang, b.ok, b.stmt].join("|");
      if (cache[ck]) return json(res, 200, { text: cache[ck], cached: true });
      const sys = `You are explaining one statement from an AI-engineering interview drill to a software engineer who is learning LLM engineering. Answer in ${b.lang === "ru" ? "Russian; technical terms stay in English" : "English"}. 4-7 sentences of connected prose, no bullet points, no headings. Start from the mechanism, not the rule. One concrete analogy or a tiny example if it genuinely helps. If the statement is false, say precisely which part is false and give the true version. Do not repeat the reference text; explain it differently.`;
      const user = `Statement: "${b.stmt}"\nThis statement is ${b.ok ? "TRUE" : "FALSE"}.\nTopic: ${b.topic}\nReference answer (facts only, do not quote): ${b.ref}\nCommon trap: ${b.kill}`;
      try {
        const j = await claude({
          model: MODEL,
          max_tokens: 600,
          system: sys,
          messages: [{ role: "user", content: user }],
        });
        const text = (j.content || [])
          .map((c) => c.text || "")
          .join("")
          .trim();
        cache[ck] = text;
        writeFileSync(CACHE, JSON.stringify(cache, null, 1));
        return json(res, 200, { text });
      } catch (e) {
        return json(res, 502, { error: e.message });
      }
    }
    if (p.startsWith("/api/")) return json(res, 404, { error: "no such route" });
    const f = p === "/" ? "/index.html" : decodeURIComponent(p);
    const fp = join(APP, f);
    if (!fp.startsWith(APP) || f.includes("..") || !existsSync(fp)) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, {
      "content-type": MIME[extname(fp)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(readFileSync(fp));
  }).listen(port, () => {
    const u = `http://localhost:${port}/`;
    console.log(
      `\ndrill: ${u}\nprogress writes to queue.json. Grading and "Explain differently": ${env("ANTHROPIC_API_KEY") ? "on (" + MODEL + ")" : "off — set ANTHROPIC_API_KEY or put it in .env"}. Ctrl-C to stop.\n`,
    );
    if (process.platform === "darwin" && !process.argv.includes("--no-open")) exec(`open ${u}`);
  });
}
