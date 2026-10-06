import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../app/api/_store.js";

/** In-memory fake of the Supabase RPCs, with or without the migration applied. */
function fakeSupabase({ migrated = true } = {}) {
  const db = { data: { items: [{ id: 1, st: "new" }], history: [] }, version: 5, exams: [], calls: [] };
  let interfere = 0; // simulate N concurrent writes landing between a read and our write
  const fns = {
    drill_state_get: () => ({ data: structuredClone(db.data), version: db.version }),
    drill_state_put: ({ p_data, p_version }) => {
      if (interfere > 0) { interfere--; db.version++; return null; }
      if (p_version !== db.version) return null;
      db.data = p_data; return ++db.version;
    },
    drill_load: () => structuredClone(db.data),
    drill_save: ({ p_data }) => { db.data = p_data; return null; },
    drill_exam_add: ({ p_exam }) => { db.exams.push(p_exam); return null; },
    drill_exams: ({ p_ticket, p_full }) => db.exams.filter((e) => p_ticket === null || e.n === p_ticket).map((e) => (p_full ? e : { n: e.n, score: e.score })),
  };
  const fetch = async (url, opts) => {
    const fn = url.split("/rpc/")[1]; const args = JSON.parse(opts.body); db.calls.push(fn);
    const missing = !migrated && ["drill_state_get", "drill_state_put", "drill_exam_add", "drill_exams"].includes(fn);
    if (missing) return { ok: false, status: 404, text: async () => '{"code":"PGRST202","message":"Could not find the function"}' };
    const out = fns[fn](args);
    return { ok: true, status: 200, text: async () => (out === null ? "null" : JSON.stringify(out)) };
  };
  return { db, fetch, interfereNext: (n) => (interfere = n) };
}
const make = (s) => createStore({ url: "https://x", anonKey: "a", dbKey: "k", fetch: s.fetch });

test("update writes with the version it read", async () => {
  const s = fakeSupabase(); const store = make(s);
  const { changed } = await store.update((db) => { db.items[0].st = "green"; });
  assert.equal(changed, true);
  assert.equal(s.db.data.items[0].st, "green");
  assert.equal(s.db.version, 6);
});

test("a concurrent write makes update re-read and re-apply instead of overwriting", async () => {
  const s = fakeSupabase(); const store = make(s);
  s.interfereNext(2);
  let runs = 0;
  await store.update((db) => { runs++; db.history.push({ d: "2026-10-06", ids: [1] }); });
  assert.equal(runs, 3);
  assert.equal(s.db.data.history.length, 1);
});

test("gives up after repeated conflicts", async () => {
  const s = fakeSupabase(); const store = make(s);
  s.interfereNext(10);
  await assert.rejects(store.update(() => {}), /another device/);
});

test("change returning false skips the write", async () => {
  const s = fakeSupabase(); const store = make(s);
  const r = await store.update(() => false);
  assert.equal(r.changed, false);
  assert.ok(!s.db.calls.includes("drill_state_put"));
});

test("exams go to their own table and come back with or without texts", async () => {
  const s = fakeSupabase(); const store = make(s);
  await store.addExam({ n: 1, score: 7, answer: "a", verdict: "v" });
  assert.deepEqual(await store.exams(), [{ n: 1, score: 7 }]);
  assert.equal((await store.exams(1))[0].answer, "a");
  assert.equal(s.db.data.exams, undefined);
});

test("before the migration: old RPCs, exams inside the progress row", async () => {
  const s = fakeSupabase({ migrated: false }); const store = make(s);
  await store.update((db) => { db.items[0].st = "yellow"; });
  await store.addExam({ n: 2, score: 4, answer: "x", verdict: "y" });
  assert.equal(s.db.data.items[0].st, "yellow");
  assert.equal(s.db.data.exams.length, 1);
  assert.deepEqual(await store.exams(), [{ n: 2, score: 4 }]);
  assert.equal((await store.exams(2))[0].answer, "x");
});
