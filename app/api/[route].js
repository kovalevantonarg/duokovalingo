// drill API — one Vercel function: login, logout, state, log, done, flag, exams, explain, check, push, remind.
// Storage: app/api/_store.js (Supabase RPCs guarded by DRILL_DB_KEY, versioned writes).
// Auth: single password (DRILL_PASSWORD) → HMAC-signed HttpOnly cookie (DRILL_SECRET), 90 days.
// /api/remind is the exception: Vercel Cron calls it with `authorization: Bearer ${CRON_SECRET}`.
import { createHmac, timingSafeEqual } from "node:crypto";
import { checkPrompt, parseJson, GRADE_BODY } from "./_grade.js";
import { applyHit, migrate, setDoubt } from "../lib/srs.js";
import { createStore } from "./_store.js";
import { addSub, cleanSub, dayIn, reminder, removeSubs } from "./_push.js";
import webpush from "web-push";

const env = (k) => process.env[k] || "";
const SB = env("SUPABASE_URL"), ANON = env("SUPABASE_ANON_KEY"), DBKEY = env("DRILL_DB_KEY");
const PW = env("DRILL_PASSWORD"), SECRET = env("DRILL_SECRET"), AKEY = env("ANTHROPIC_API_KEY"), MODEL = env("DRILL_MODEL") || "claude-sonnet-5-5";
// Web Push reminders: off unless all three VAPID values are set (`npx web-push generate-vapid-keys`)
const VAPID_PUB = env("VAPID_PUBLIC_KEY"), VAPID_PRIV = env("VAPID_PRIVATE_KEY"), VAPID_SUBJ = env("VAPID_SUBJECT");
const PUSH = VAPID_PUB && VAPID_PRIV && VAPID_SUBJ ? { publicKey: VAPID_PUB, privateKey: VAPID_PRIV, subject: VAPID_SUBJ } : null;
const CRON_SECRET = env("CRON_SECRET"), TZ = env("DRILL_TZ") || "America/Argentina/Buenos_Aires";
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
// progress for the client; exam attempts are served by /api/exams, the pre-ticket data and push subscriptions stay in the row only
const out = ({ exams, legacy, pushSubs, ...db }) => ({ ...db, auth: true, explain: !!AKEY, push: PUSH ? VAPID_PUB : null });
// every change goes through the ticket model; progress saved by an older version is migrated on the way (lib/srs.js)
const update = (change) =>
  store.update((d) => {
    const moved = migrate(d);
    const r = change(d);
    // a refused change still saves the migration (undefined = write, but no result)
    return r === false && moved ? undefined : r;
  });

// morning reminder (Vercel Cron): nothing due or already practiced today → no push; dead subscriptions are dropped
async function remind() {
  const { db } = await update(() => false);
  const msg = reminder(db, dayIn(TZ));
  const subs = Array.isArray(db.pushSubs) ? db.pushSubs : [];
  if (!msg || !subs.length) return { sent: 0, subs: subs.length, due: msg?.due ?? 0 };
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url });
  const results = await Promise.allSettled(
    subs.map((s) => webpush.sendNotification(s, payload, { vapidDetails: PUSH, TTL: 12 * 3600 })),
  );
  const gone = subs.filter((s, i) => {
    const r = results[i];
    return r.status === "rejected" && [404, 410].includes(r.reason?.statusCode);
  });
  if (gone.length) await update((d) => removeSubs(d, gone.map((s) => s.endpoint)));
  const failed = results.filter((r) => r.status === "rejected").length;
  return { sent: subs.length - failed, failed, removed: gone.length, due: msg.due, body: msg.body };
}

// graded exam → the score sets the ticket's status; an interview answer (one question) only counts as activity
const stFromScore = (sc) => (sc >= 8 ? "green" : sc >= 5 ? "yellow" : "red");
const examRecord = (p, g) => ({
  n: Number(p.n), lang: p.lang === "en" ? "en" : "ru", d: new Date().toISOString().slice(0, 10), t: Date.now(),
  score: g.score, q: g.questions, chars: String(p.answer || "").length,
  answer: String(p.answer || "").slice(0, 1500), verdict: g.verdict.slice(0, 300),
  ...(p.kind === "interview" ? { kind: "interview" } : {}),
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
    if (route === "remind") {
      if (!CRON_SECRET || !safeEq(req.headers.authorization || "", `Bearer ${CRON_SECRET}`)) return res.status(401).json({ error: "auth" });
      if (!PUSH) return res.status(200).json({ sent: 0, skipped: "push not configured" });
      if (!SB || !ANON || !DBKEY) return res.status(500).json({ error: "server not configured: SUPABASE_URL / SUPABASE_ANON_KEY / DRILL_DB_KEY" });
      return res.status(200).json(await remind());
    }
    if (!authed(req)) return res.status(401).json({ error: "auth" });
    if (!SB || !ANON || !DBKEY) return res.status(500).json({ error: "server not configured: SUPABASE_URL / SUPABASE_ANON_KEY / DRILL_DB_KEY" });

    if (route === "state") {
      const { db } = await update(() => false);
      await store.moveLeftoverExams(db);
      return res.status(200).json(out(db));
    }
    if (route === "log" || route === "done") {
      if (req.method !== "POST") return res.status(405).json({ error: "method" });
      const { db, result } = await update((d) => applyHit(d, body));
      if (result === false) return res.status(400).json({ error: "bad ticket" });
      return res.status(200).json(out(db));
    }
    if (route === "flag") {
      if (req.method !== "POST") return res.status(405).json({ error: "method" });
      const { db } = await update((d) => setDoubt(d, body.n, !!body.doubt));
      return res.status(200).json(out(db));
    }
    if (route === "push") {
      // { sub } subscribes this browser, { sub, off: true } unsubscribes it
      if (req.method !== "POST") return res.status(405).json({ error: "method" });
      if (!PUSH) return res.status(400).json({ error: "push not configured" });
      const sub = cleanSub(body.sub);
      const endpoint = sub?.endpoint || (body.off && typeof body.sub?.endpoint === "string" ? body.sub.endpoint : "");
      if (!endpoint) return res.status(400).json({ error: "bad subscription" });
      await update((d) => (body.off ? removeSubs(d, [endpoint]) : sub ? addSub(d, sub) : false));
      return res.status(200).json({ ok: true, on: !body.off });
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
        const graded = exam.kind ? {} : { st: stFromScore(g.score) };
        await update((d) => applyHit(d, { n: exam.n, d: exam.d, xp: g.score, mode: exam.kind || "exam", ...graded }));
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
