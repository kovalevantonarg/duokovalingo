import { test } from "node:test";
import assert from "node:assert/strict";
import { plural, reminder, cleanSub, addSub, removeSubs, dayIn, MAX_SUBS } from "../app/api/_push.js";

const forms = ["билет", "билета", "билетов"];
// ticket 2: green on Oct 1 with a 7-day gap → due Oct 8; ticket 1: red on Oct 5 → due Oct 6
const db = () => ({
  schema: 2,
  tickets: { 1: { st: "red", iv: 1, last: "2026-10-05" }, 2: { st: "green", iv: 7, last: "2026-10-01" } },
  history: [{ d: "2026-10-05", tickets: [1], xp: 10 }],
});

test("russian plural forms", () => {
  const got = [1, 2, 5, 11, 12, 14, 21, 22, 25, 101, 111].map((n) => plural(n, forms));
  assert.deepEqual(got, [
    "билет",
    "билета",
    "билетов",
    "билетов",
    "билетов",
    "билетов",
    "билет",
    "билета",
    "билетов",
    "билет",
    "билетов",
  ]);
});

test("reminder text when tickets are due", () => {
  assert.deepEqual(reminder(db(), "2026-10-06"), {
    title: "duokovalingo",
    body: "1 билет на повтор · 5 минут",
    url: "/#session",
    due: 1,
  });
  assert.equal(reminder(db(), "2026-10-08").body, "2 билета на повтор · 10 минут");
});

test("no reminder when nothing is due", () => {
  assert.equal(reminder({ ...db(), history: [] }, "2026-10-05"), null);
  assert.equal(reminder({ schema: 2, tickets: {}, history: [] }, "2026-10-06"), null);
});

test("no reminder when already practiced today", () => {
  const d = db();
  d.history.push({ d: "2026-10-08", tickets: [2], xp: 5 });
  assert.equal(reminder(d, "2026-10-08"), null);
});

test("dayIn gives the local date of a time zone", () => {
  const t = new Date("2026-10-06T02:00:00Z");
  assert.equal(dayIn("UTC", t), "2026-10-06");
  assert.equal(dayIn("America/Argentina/Buenos_Aires", t), "2026-10-05");
});

test("subscriptions: validate, dedupe, cap, remove", () => {
  const sub = (i) => ({
    endpoint: `https://push.example/${i}`,
    keys: { p256dh: "p" + i, auth: "a" + i },
    expirationTime: null,
  });
  assert.deepEqual(cleanSub(sub(1)), {
    endpoint: "https://push.example/1",
    keys: { p256dh: "p1", auth: "a1" },
  });
  assert.equal(cleanSub({ ...sub(1), endpoint: "http://push.example/1" }), null);
  assert.equal(cleanSub({ endpoint: "https://x", keys: { p256dh: 1, auth: "a" } }), null);
  assert.equal(cleanSub({ ...sub(1), endpoint: "https://x/" + "a".repeat(2000) }), null);

  const d = {};
  for (let i = 0; i < 7; i++) addSub(d, cleanSub(sub(i)));
  addSub(d, cleanSub(sub(3)));
  assert.equal(d.pushSubs.length, MAX_SUBS);
  assert.deepEqual(
    d.pushSubs.map((s) => s.endpoint.slice(-1)),
    ["2", "4", "5", "6", "3"],
  );

  assert.equal(removeSubs(d, ["https://push.example/9"]), false);
  assert.equal(removeSubs(d, ["https://push.example/2", "https://push.example/3"]), true);
  assert.equal(d.pushSubs.length, 3);
  removeSubs(
    d,
    d.pushSubs.map((s) => s.endpoint),
  );
  assert.equal("pushSubs" in d, false);
});
