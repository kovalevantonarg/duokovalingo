// drill API — one Vercel function. Routes (/api/<route>):
//   google, oauth          sign in with Google (start, callback) → signed session cookie, 90 days
//   logout, state          session end; the signed-in user's progress
//   log, done, flag        record an attempt / a graded attempt / the "not sure" flag
//   exams, check, explain  exam attempts; AI grading of an answer; AI explanation of a statement
//   push, remind           push subscription; the morning reminder (Vercel Cron, CRON_SECRET)
// Storage: _store.js (Supabase RPCs guarded by DRILL_DB_KEY, one versioned progress row per user).
// Any Google account can sign in. AI calls (check, explain) are limited per user per day, except for the owner.
import { checkPrompt, parseJson, GRADE_BODY } from "./_grade.js";
import { applyHit, migrate, setDoubt } from "../lib/srs.js";
import { createStore } from "./_store.js";
import { addSub, cleanSub, dayIn, reminder, removeSubs } from "./_push.js";
import {
  googleAuthUrl,
  googleUser,
  newState,
  readSession,
  sessionToken,
  SESSION_DAYS,
  stateCookie,
  stateError,
} from "./_auth.js";
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";

const env = (k) => process.env[k] || "";
const SB = env("SUPABASE_URL"),
  ANON = env("SUPABASE_ANON_KEY"),
  DBKEY = env("DRILL_DB_KEY");
const SECRET = env("DRILL_SECRET"),
  GID = env("GOOGLE_CLIENT_ID"),
  GSECRET = env("GOOGLE_CLIENT_SECRET");
const OWNER = env("DRILL_OWNER_EMAIL").toLowerCase(),
  AI_DAILY = Number(env("DRILL_AI_DAILY")) || 20;
const AKEY = env("ANTHROPIC_API_KEY"),
  MODEL = env("DRILL_MODEL") || "claude-sonnet-5-5";
// Web Push reminders: off unless all three VAPID values are set (`npx web-push generate-vapid-keys`)
const VAPID_PUB = env("VAPID_PUBLIC_KEY"),
  VAPID_PRIV = env("VAPID_PRIVATE_KEY"),
  VAPID_SUBJ = env("VAPID_SUBJECT");
const PUSH =
  VAPID_PUB && VAPID_PRIV && VAPID_SUBJ
    ? { publicKey: VAPID_PUB, privateKey: VAPID_PRIV, subject: VAPID_SUBJ }
    : null;
const CRON_SECRET = env("CRON_SECRET"),
  TZ = env("DRILL_TZ") || "America/Argentina/Buenos_Aires";

const store = createStore({ url: SB, anonKey: ANON, dbKey: DBKEY });
const isOwner = (user) => !!OWNER && user.email === OWNER;
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const cookieLine = (name, val, maxAge, path = "/") =>
  `${name}=${val}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
/** https://<host> of this deployment; Google only redirects to URIs registered for the client anyway. */
const origin = (req) =>
  env("DRILL_URL").replace(/\/$/, "") || `https://${req.headers["x-forwarded-host"] || req.headers.host}`;

// progress for the client; exam attempts come from /api/exams, the pre-ticket data and push subscriptions stay in the row
const out = ({ exams, legacy, pushSubs, ...db }, user) => ({
  ...db,
  auth: true,
  user: { email: user.email, name: user.name, owner: isOwner(user) },
  explain: !!AKEY,
  push: PUSH ? VAPID_PUB : null,
});
// every change goes through the ticket model; progress saved by an older version is migrated on the way (lib/srs.js)
const updater = (st) => (change) =>
  st.update((d) => {
    const moved = migrate(d);
    const r = change(d);
    return r === false && moved ? undefined : r; // a refused change still saves the migration
  });

/** One AI call for `user`; false when over today's quota. The owner has none. */
const allowAi = (user) => isOwner(user) || store.useAi(user.id, dayIn(TZ), AI_DAILY);

async function claude(payload) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": AKEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error?.message || "api " + r.status), { status: 502 });
  return j;
}

// morning reminder (Vercel Cron): for every user with push on; nothing due or already practiced today → no push
async function remind() {
  const today = dayIn(TZ);
  const report = { users: 0, sent: 0, failed: 0, removed: 0 };
  for (const { user, data } of await store.withPush()) {
    report.users++;
    migrate(data);
    const msg = reminder(data, today);
    const subs = Array.isArray(data.pushSubs) ? data.pushSubs : [];
    if (!msg || !subs.length) continue;
    const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url });
    const results = await Promise.allSettled(
      subs.map((s) => webpush.sendNotification(s, payload, { vapidDetails: PUSH, TTL: 12 * 3600 })),
    );
    const gone = subs.filter((s, i) => {
      const r = results[i];
      return r.status === "rejected" && [404, 410].includes(r.reason?.statusCode);
    });
    if (gone.length)
      await updater(store.forUser(user))((d) =>
        removeSubs(
          d,
          gone.map((s) => s.endpoint),
        ),
      );
    const failed = results.filter((r) => r.status === "rejected").length;
    report.sent += subs.length - failed;
    report.failed += failed;
    report.removed += gone.length;
  }
  return report;
}

// graded exam → the score sets the ticket's status; an interview answer (one question) only counts as activity
const stFromScore = (sc) => (sc >= 8 ? "green" : sc >= 5 ? "yellow" : "red");
const examRecord = (p, g) => ({
  n: Number(p.n),
  lang: p.lang === "en" ? "en" : "ru",
  d: new Date().toISOString().slice(0, 10),
  t: Date.now(),
  score: g.score,
  q: g.questions,
  chars: String(p.answer || "").length,
  answer: String(p.answer || "").slice(0, 1500),
  verdict: g.verdict.slice(0, 300),
  ...(p.kind === "interview" ? { kind: "interview" } : {}),
});

const EXPLAIN_SYS = (lang) =>
  `You are explaining one statement from an AI-engineering interview drill to a software engineer who is learning LLM engineering. Answer in ${lang === "ru" ? "Russian; technical terms stay in English" : "English"}. 4-7 sentences of connected prose, no bullet points, no headings. Start from the mechanism, not the rule. One concrete analogy or a tiny example if it genuinely helps. If the statement is false, say precisely which part is false and give the true version. Do not repeat the reference text; explain it differently.`;

export default async function handler(req, res) {
  const route = String(req.query.route || "");
  const body = req.body && typeof req.body === "object" ? req.body : {};
  res.setHeader("cache-control", "no-store");
  try {
    const configured = SB && ANON && DBKEY && SECRET;

    // ---- sign-in ----
    if (route === "google") {
      if (!configured || !GID || !GSECRET)
        return res.status(500).json({
          error: "server not configured: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / DRILL_SECRET / Supabase",
        });
      // start on the same host Google will return to, or the state cookie would belong to another host
      const home = origin(req);
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      if (host && new URL(home).host !== host) {
        res.setHeader("location", home + "/api/google");
        return res.status(302).end();
      }
      const st = newState(SECRET);
      res.setHeader("set-cookie", cookieLine(st.cookieName, "1", 900, "/api"));
      res.setHeader(
        "location",
        googleAuthUrl({ clientId: GID, redirectUri: home + "/api/oauth", state: st.state }),
      );
      return res.status(302).end();
    }
    if (route === "oauth") {
      const fail = (why) => {
        res.setHeader("location", "/?auth_error=" + encodeURIComponent(why));
        return res.status(302).end();
      };
      if (req.query.error) return fail(String(req.query.error));
      const state = String(req.query.state || "");
      const bad = stateError(state, req.headers.cookie, SECRET);
      if (bad) return fail(bad);
      let user;
      try {
        user = await googleUser({
          code: String(req.query.code || ""),
          clientId: GID,
          clientSecret: GSECRET,
          redirectUri: origin(req) + "/api/oauth",
        });
      } catch (e) {
        return fail(e.message);
      }
      await store.login(user.id, user.email, user.name, isOwner(user));
      res.setHeader("set-cookie", [
        cookieLine("drill", sessionToken(user, SECRET), SESSION_DAYS * 86400),
        cookieLine(stateCookie(state.split(".")[0]), "", 0, "/api"),
      ]);
      res.setHeader("location", "/");
      return res.status(302).end();
    }
    if (route === "logout") {
      res.setHeader("set-cookie", cookieLine("drill", "", 0));
      return res.status(200).json({ ok: true });
    }
    if (route === "remind") {
      if (!CRON_SECRET || !safeEq(req.headers.authorization || "", `Bearer ${CRON_SECRET}`))
        return res.status(401).json({ error: "auth" });
      if (!PUSH) return res.status(200).json({ sent: 0, skipped: "push not configured" });
      return res.status(200).json(await remind());
    }

    // ---- everything else needs a session ----
    if (!configured)
      return res.status(500).json({
        error: "server not configured: SUPABASE_URL / SUPABASE_ANON_KEY / DRILL_DB_KEY / DRILL_SECRET",
      });
    const user = readSession(req.headers.cookie, SECRET);
    if (!user) return res.status(401).json({ error: "auth", google: !!GID });
    const mine = store.forUser(user.id);
    const update = updater(mine);
    const post = req.method === "POST";

    if (route === "state") {
      const { db } = await update(() => false);
      return res.status(200).json(out(db, user));
    }
    if (route === "log" || route === "done") {
      if (!post) return res.status(405).json({ error: "method" });
      const { db, result } = await update((d) => applyHit(d, body));
      if (result === false) return res.status(400).json({ error: "bad ticket" });
      return res.status(200).json(out(db, user));
    }
    if (route === "flag") {
      if (!post) return res.status(405).json({ error: "method" });
      const { db } = await update((d) => setDoubt(d, body.n, !!body.doubt));
      return res.status(200).json(out(db, user));
    }
    if (route === "push") {
      // { sub } subscribes this browser, { sub, off: true } unsubscribes it
      if (!post) return res.status(405).json({ error: "method" });
      if (!PUSH) return res.status(400).json({ error: "push not configured" });
      const sub = cleanSub(body.sub);
      const endpoint =
        sub?.endpoint || (body.off && typeof body.sub?.endpoint === "string" ? body.sub.endpoint : "");
      if (!endpoint) return res.status(400).json({ error: "bad subscription" });
      await update((d) => (body.off ? removeSubs(d, [endpoint]) : sub ? addSub(d, sub) : false));
      return res.status(200).json({ ok: true, on: !body.off });
    }
    if (route === "exams") {
      // ?n=12 → that ticket's attempts with answer and verdict; no n → all attempts, scores only
      const n = req.query.n ? Number(req.query.n) : null;
      if (n !== null && !(Number.isInteger(n) && n > 0 && n < 1000))
        return res.status(400).json({ error: "bad ticket" });
      return res.status(200).json(await mine.exams(n));
    }
    if (route === "check") {
      if (!post) return res.status(405).json({ error: "method" });
      if (!AKEY) return res.status(400).json({ error: "no_key" });
      if (String(body.answer || "").trim().length < 40) return res.status(400).json({ error: "too_short" });
      if (!(await allowAi(user))) return res.status(429).json({ error: "limit", limit: AI_DAILY });
      const { sys, user: prompt } = checkPrompt(body);
      const j = await claude(GRADE_BODY(MODEL, sys, prompt));
      if (j.stop_reason === "max_tokens")
        return res.status(502).json({ error: "grader ran out of tokens, try again" });
      const text = (j.content || []).map((c) => c.text || "").join("");
      let g;
      try {
        g = parseJson(text);
      } catch {
        return res.status(502).json({ error: "bad grader output: " + text.slice(0, 200) });
      }
      let attempts = [];
      try {
        const exam = examRecord(body, g);
        if (!(Number.isInteger(exam.n) && exam.n > 0 && exam.n < 1000)) throw new Error("bad ticket");
        await mine.addExam(exam);
        const graded = exam.kind ? {} : { st: stFromScore(g.score) };
        await update((d) =>
          applyHit(d, { n: exam.n, d: exam.d, xp: g.score, mode: exam.kind || "exam", ...graded }),
        );
        attempts = (await mine.exams(exam.n)).slice(-20);
      } catch (e) {
        g.saveError = e.message;
      }
      return res.status(200).json({ ...g, attempts });
    }
    if (route === "explain") {
      if (!post) return res.status(405).json({ error: "method" });
      if (!AKEY) return res.status(400).json({ error: "no ANTHROPIC_API_KEY on the server" });
      const p = body;
      const ck = [p.lang, p.ok, String(p.stmt || "").slice(0, 300)].join("|");
      const cached = await store.rpc("drill_cache_get", { p_id: ck });
      if (cached) return res.status(200).json({ text: cached, cached: true });
      if (!(await allowAi(user))) return res.status(429).json({ error: "limit", limit: AI_DAILY });
      const prompt = `Statement: "${p.stmt}"\nThis statement is ${p.ok ? "TRUE" : "FALSE"}.\nTopic: ${p.topic}\nReference answer (facts only, do not quote): ${p.ref}\nCommon trap: ${p.kill}`;
      const j = await claude({
        model: MODEL,
        max_tokens: 600,
        system: EXPLAIN_SYS(p.lang),
        messages: [{ role: "user", content: prompt }],
      });
      const text = (j.content || [])
        .map((c) => c.text || "")
        .join("")
        .trim();
      await store.rpc("drill_cache_set", { p_id: ck, p_body: text });
      return res.status(200).json({ text });
    }
    return res.status(404).json({ error: "no such route" });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
