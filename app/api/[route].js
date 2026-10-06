// drill API — one Vercel function: login, logout, state, log, done, sync, exams, explain, check.
// Storage: app/api/_store.js (Supabase RPCs guarded by DRILL_DB_KEY, versioned writes).
// Auth: single password (DRILL_PASSWORD) → HMAC-signed HttpOnly cookie (DRILL_SECRET), 90 days.
import { createHmac, timingSafeEqual } from "node:crypto";
import { checkPrompt, parseJson, GRADE_BODY } from "./_grade.js";
import { applyHit } from "../lib/srs.js";
import { createStore } from "./_store.js";

const env = (k) => process.env[k] || "";
const SB = env("SUPABASE_URL"), ANON = env("SUPABASE_ANON_KEY"), DBKEY = env("DRILL_DB_KEY");
const PW = env("DRILL_PASSWORD"), SECRET = env("DRILL_SECRET"), AKEY = env("ANTHROPIC_API_KEY"), MODEL = env("DRILL_MODEL") || "claude-sonnet-5-5";
const COOKIE = "drill";
const DAY = 864e5;

const sign = (s) => createHmac("sha256", SECRET).update(s).digest("hex");
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const token = () => { const exp = Date.now() + 90 * DAY; return `${exp}.${sign("v1:" + exp)}`; };
function authed(req) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`)); if (!m) return false;
  const [exp, sig] = m[1].split("."); if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEq(sig, sign("v1:" + exp));
}
const setCookie = (res, val, maxAge) => res.setHeader("set-cookie", `${COOKIE}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);

const store = createStore({ url: SB, anonKey: ANON, dbKey: DBKEY });
const rpc = store.rpc;
// progress for the client; exam attempts are served separately by /api/exams
const out = ({ exams, ...db }) => ({ ...db, auth: true, explain: !!AKEY });

const SECS = new Set(["llm", "rag", "agents", "sysd", "behav", "bonus", "meta", "js", "ts", "react", "web"]);
// add catalog items the client knows about (new tickets) but the stored state doesn't have yet
function syncItems(db, list) {
  let added = 0;
  for (const x of Array.isArray(list) ? list.slice(0, 200) : []) {
    const id = Number(x && x.id);
    if (!Number.isInteger(id) || id < 1 || id > 999 || !SECS.has(x.s) || db.items.some((i) => i.id === id)) continue;
    db.items.push({ id, s: x.s, t: String(x.t || "").slice(0, 120), st: "new" }); added++;
  }
  if (added) db.items.sort((a, b) => a.id - b.id);
  return added;
}

// one attempt → activity + status/interval; the rules live in lib/srs.js (shared with today.mjs and the browser)
const logHit = (db, p) => applyHit(db, p);

// graded exam → the score sets the status of the ticket's core items (a drill session for each)
const stFromScore = (sc) => (sc >= 8 ? "green" : sc >= 5 ? "yellow" : "red");
const examRecord = (p, g) => ({
  n: Number(p.n), lang: p.lang === "en" ? "en" : "ru", d: new Date().toISOString().slice(0, 10), t: Date.now(),
  score: g.score, q: g.questions, chars: String(p.answer || "").length,
  answer: String(p.answer || "").slice(0, 1500), verdict: g.verdict.slice(0, 300),
});

export default async function handler(req, res) {
  const route = String(req.query.route || "");
  const body = (req.body && typeof req.body === "object") ? req.body : {};
  res.setHeader("cache-control", "no-store");
  try {
    if (route === "login") {
      if (req.method !== "POST") return res.status(405).json({ error: "method" });
      if (!PW || !SECRET) return res.status(500).json({ error: "server not configured: DRILL_PASSWORD / DRILL_SECRET" });
      if (!safeEq(body.password || "", PW)) { await new Promise((r) => setTimeout(r, 400)); return res.status(401).json({ error: "wrong password" }); }
      setCookie(res, token(), 90 * 86400); return res.status(200).json({ ok: true });
    }
    if (route === "logout") { setCookie(res, "", 0); return res.status(200).json({ ok: true }); }
    if (!authed(req)) return res.status(401).json({ error: "auth" });
    if (!SB || !ANON || !DBKEY) return res.status(500).json({ error: "server not configured: SUPABASE_URL / SUPABASE_ANON_KEY / DRILL_DB_KEY" });

    if (route === "state") {
      const { db } = await store.read();
      await store.moveLeftoverExams(db);
      return res.status(200).json(out(db));
    }
    if (route === "log" || route === "done") {
      if (req.method !== "POST") return res.status(405).json({ error: "method" });
      const { db, result } = await store.update((d) => logHit(d, body));
      if (result === false) return res.status(400).json({ error: "bad id" });
      return res.status(200).json(out(db));
    }
    if (route === "sync") {
      if (req.method !== "POST") return res.status(405).json({ error: "method" });
      const { db } = await store.update((d) => syncItems(d, body.items) > 0 || false);
      return res.status(200).json(out(db));
    }
    if (route === "exams") {
      // ?n=12 → that ticket's attempts with answer and verdict; no n → all attempts, scores only
      const n = req.query.n ? Number(req.query.n) : null;
      if (n !== null && !(Number.isInteger(n) && n > 0 && n < 1000)) return res.status(400).json({ error: "bad ticket" });
      return res.status(200).json(await store.exams(n));
    }
    if (route === "check") {
      if (req.method !== "POST") return res.status(405).json({ error: "method" });
      if (!AKEY) return res.status(400).json({ error: "no_key" });
      if (!body || String(body.answer || "").trim().length < 40) return res.status(400).json({ error: "too_short" });
      const { sys, user } = checkPrompt(body);
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": AKEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(GRADE_BODY(MODEL, sys, user)) });
      const j = await r.json(); if (!r.ok) return res.status(502).json({ error: j.error?.message || ("api " + r.status) });
      if (j.stop_reason === "max_tokens") return res.status(502).json({ error: "grader ran out of tokens, try again" });
      const text = (j.content || []).map((c) => c.text || "").join("");
      let g; try { g = parseJson(text); } catch { return res.status(502).json({ error: "bad grader output: " + text.slice(0, 200) }); }
      let attempts = [];
      try {
        const exam = examRecord(body, g);
        if (!(Number.isInteger(exam.n) && exam.n > 0 && exam.n < 1000)) throw new Error("bad ticket");
        await store.addExam(exam);
        const core = (Array.isArray(body.core) ? body.core : []).slice(0, 10);
        if (core.length) await store.update((d) => { for (const id of core) logHit(d, { id, d: exam.d, st: stFromScore(g.score), xp: g.score, mode: "exam" }); });
        attempts = (await store.exams(exam.n)).slice(-20);
      } catch (e) { g.saveError = e.message; }
      return res.status(200).json({ ...g, attempts });
    }
    if (route === "explain") {
      if (req.method !== "POST") return res.status(405).json({ error: "method" });
      if (!AKEY) return res.status(400).json({ error: "no ANTHROPIC_API_KEY on the server" });
      const p = body; const ck = [p.lang, p.ok, String(p.stmt || "").slice(0, 300)].join("|");
      const cached = await rpc("drill_cache_get", { p_id: ck }); if (cached) return res.status(200).json({ text: cached, cached: true });
      const sys = `You are explaining one statement from an AI-engineering interview drill to a senior frontend engineer (10 years, TypeScript) who is learning LLM engineering. Answer in ${p.lang === "ru" ? "Russian; technical terms stay in English" : "English"}. 4-7 sentences of connected prose, no bullet points, no headings. Start from the mechanism, not the rule. One concrete analogy or a tiny example if it genuinely helps. If the statement is false, say precisely which part is false and give the true version. Do not repeat the reference text; explain it differently.`;
      const user = `Statement: "${p.stmt}"\nThis statement is ${p.ok ? "TRUE" : "FALSE"}.\nTopic: ${p.topic}\nReference answer (facts only, do not quote): ${p.ref}\nCommon trap: ${p.kill}`;
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": AKEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 600, system: sys, messages: [{ role: "user", content: user }] }) });
      const j = await r.json(); if (!r.ok) return res.status(502).json({ error: j.error?.message || ("api " + r.status) });
      const text = (j.content || []).map((c) => c.text || "").join("").trim();
      await rpc("drill_cache_set", { p_id: ck, p_body: text }); return res.status(200).json({ text });
    }
    return res.status(404).json({ error: "no such route" });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}
