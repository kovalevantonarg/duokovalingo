import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../app/api/_store.js";

/** In-memory fake of the Supabase RPCs (supabase/migrations/20261007_users.sql). */
function fakeSupabase() {
  const db = {
    users: {},
    progress: {},
    exams: [],
    usage: {},
    legacy: { items: [{ id: 1, st: "green" }], history: [] },
    calls: [],
  };
  let interfere = 0; // simulate N concurrent writes landing between a read and our write
  const fns = {
    drill_user_login: ({ p_id, p_email, p_owner }) => {
      db.users[p_id] = { email: p_email };
      if (p_owner && !db.progress[p_id]) db.progress[p_id] = { data: structuredClone(db.legacy), version: 1 };
      if (p_owner) db.exams.forEach((e) => (e.user ??= p_id));
      return { id: p_id, email: p_email };
    },
    drill_progress_get: ({ p_user }) => {
      const r = db.progress[p_user];
      return r ? { data: structuredClone(r.data), version: r.version } : { data: null, version: 0 };
    },
    drill_progress_put: ({ p_user, p_data, p_version }) => {
      const r = db.progress[p_user];
      if (interfere > 0) {
        interfere--;
        if (r) r.version++;
        return null;
      }
      if (p_version === 0) return r ? null : ((db.progress[p_user] = { data: p_data, version: 1 }), 1);
      if (!r || r.version !== p_version) return null;
      r.data = p_data;
      return ++r.version;
    },
    drill_user_exam_add: ({ p_user, p_exam }) => void db.exams.push({ ...p_exam, user: p_user }),
    drill_user_exams: ({ p_user, p_ticket, p_full }) =>
      db.exams
        .filter((e) => e.user === p_user && (p_ticket === null || e.n === p_ticket))
        .map(({ user, ...e }) => (p_full ? e : { n: e.n, score: e.score })),
    drill_ai_use: ({ p_user, p_day, p_limit }) => {
      const k = p_user + p_day;
      if ((db.usage[k] || 0) >= p_limit) return null;
      return (db.usage[k] = (db.usage[k] || 0) + 1);
    },
  };
  const fetch = async (url, opts) => {
    const fn = url.split("/rpc/")[1];
    db.calls.push(fn);
    const out = fns[fn](JSON.parse(opts.body));
    return { ok: true, status: 200, text: async () => (out == null ? "null" : JSON.stringify(out)) };
  };
  return { db, fetch, interfereNext: (n) => (interfere = n) };
}
const make = (s) => createStore({ url: "https://x", anonKey: "a", dbKey: "k", fetch: s.fetch });

test("a new user starts empty; the first write creates the row", async () => {
  const s = fakeSupabase();
  const u = make(s).forUser("g1");
  const { changed } = await u.update((db) => void db.history.push({ d: "2026-10-07" }));
  assert.equal(changed, true);
  assert.deepEqual(s.db.progress.g1, { data: { items: [], history: [{ d: "2026-10-07" }] }, version: 1 });
});

test("users don't see each other's progress or exams", async () => {
  const s = fakeSupabase();
  const store = make(s);
  await store.forUser("a").update((db) => void (db.mark = "a"));
  await store.forUser("a").addExam({ n: 1, score: 7, answer: "x" });
  const b = store.forUser("b");
  assert.equal((await b.read()).db.mark, undefined);
  assert.deepEqual(await b.exams(), []);
  assert.deepEqual(await store.forUser("a").exams(), [{ n: 1, score: 7 }]);
  assert.equal((await store.forUser("a").exams(1))[0].answer, "x");
});

test("a concurrent write makes update re-read and re-apply instead of overwriting", async () => {
  const s = fakeSupabase();
  const u = make(s).forUser("a");
  await u.update(() => {});
  s.interfereNext(2);
  let runs = 0;
  await u.update((db) => {
    runs++;
    db.history.push({ d: "2026-10-07" });
  });
  assert.equal(runs, 3);
  assert.equal(s.db.progress.a.data.history.length, 1);
});

test("gives up after repeated conflicts; false skips the write", async () => {
  const s = fakeSupabase();
  const u = make(s).forUser("a");
  s.interfereNext(10);
  await assert.rejects(
    u.update(() => {}),
    /another device/,
  );
  const calls = s.db.calls.length;
  assert.equal((await u.update(() => false)).changed, false);
  assert.ok(!s.db.calls.slice(calls).includes("drill_progress_put"));
});

test("the owner's first sign-in takes over the single-user progress", async () => {
  const s = fakeSupabase();
  const store = make(s);
  await store.login("me", "me@x.com", "Me", true);
  assert.equal((await store.forUser("me").read()).db.items[0].st, "green");
  await store.login("colleague", "c@x.com", "C", false);
  assert.equal((await store.forUser("colleague").read()).db.items.length, 0);
});

test("AI quota per user per day", async () => {
  const s = fakeSupabase();
  const store = make(s);
  assert.equal(await store.useAi("c", "2026-10-07", 2), true);
  assert.equal(await store.useAi("c", "2026-10-07", 2), true);
  assert.equal(await store.useAi("c", "2026-10-07", 2), false);
  assert.equal(await store.useAi("c", "2026-10-08", 2), true);
  assert.equal(await store.useAi("d", "2026-10-07", 2), true);
});
