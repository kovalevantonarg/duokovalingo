// drill API — one Vercel function, five routes: login, logout, state, log, done, explain.
// Storage: Supabase RPC guarded by DRILL_DB_KEY (anon key can only call the functions; the tables live in a private schema).
// Auth: single password (DRILL_PASSWORD) → HMAC-signed HttpOnly cookie (DRILL_SECRET), 90 days.
import { createHmac, timingSafeEqual } from "node:crypto";

const env = (k) => process.env[k] || "";
const SB = env("SUPABASE_URL"), ANON = env("SUPABASE_ANON_KEY"), DBKEY = env("DRILL_DB_KEY");
const PW = env("DRILL_PASSWORD"), SECRET = env("DRILL_SECRET"), AKEY = env("ANTHROPIC_API_KEY"), MODEL = env("DRILL_MODEL") || "claude-sonnet-5";
const INTERVAL = { red: 1, yellow: 3, green: 7 };
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

async function rpc(fn, args = {}) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: ANON, authorization: `Bearer ${ANON}`, "content-type": "application/json" }, body: JSON.stringify({ p_key: DBKEY, ...args }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const load = () => rpc("drill_load");
const save = (data) => rpc("drill_save", { p_data: data });
const out = (db) => ({ ...db, auth: true, explain: !!AKEY });

function logHit(db, p) {
  const it = db.items.find((i) => i.id === Number(p.id)); if (!it) return false;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(p.d || "") ? p.d : new Date().toISOString().slice(0, 10);
  let h = db.history.find((x) => x.d === d); if (!h) db.history.push((h = { d, ids: [], xp: 0 }));
  if (!h.ids.includes(it.id)) h.ids.push(it.id);
  h.xp = (h.xp || 0) + (Number(p.xp) || 0);
  if (p.st && INTERVAL[p.st]) { it.st = p.st; it.last = d; }
  if (p.mode) it.lastMode = String(p.mode).slice(0, 20);
  if (p.transcript) it.lastAnswer = String(p.transcript).slice(0, 600);
  return true;
}

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

    if (route === "state") { const db = await load(); return res.status(200).json(out(db)); }
    if (route === "log" || route === "done") {
      if (req.method !== "POST") return res.status(405).json({ error: "method" });
      const db = await load(); if (!logHit(db, body)) return res.status(400).json({ error: "bad id" });
      await save(db); return res.status(200).json(out(db));
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
