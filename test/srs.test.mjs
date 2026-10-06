import { test } from "node:test";
import assert from "node:assert/strict";
import { applyHit, nextInterval, dueItems, dueDate, isDue, INTERVAL, MAX_IV } from "../app/lib/srs.js";

const fresh = () => ({ items: [{ id: 1, st: "new" }, { id: 2, st: "green", iv: 7, last: "2026-10-01" }], history: [] });

test("grading sets status, interval and date", () => {
  const db = fresh();
  assert.equal(applyHit(db, { id: 1, st: "yellow", xp: 10, d: "2026-10-05" }), true);
  assert.deepEqual(db.items[0], { id: 1, st: "yellow", iv: INTERVAL.yellow, last: "2026-10-05" });
  assert.deepEqual(db.history, [{ d: "2026-10-05", ids: [1], xp: 10 }]);
});

test("green after green doubles the interval, capped", () => {
  assert.equal(nextInterval({ id: 1, st: "green", iv: 7 }, "green"), 14);
  assert.equal(nextInterval({ id: 1, st: "green", iv: 60 }, "green"), MAX_IV);
  assert.equal(nextInterval({ id: 1, st: "yellow", iv: 3 }, "green"), INTERVAL.green);
  assert.equal(nextInterval({ id: 1, st: "green", iv: 28 }, "red"), INTERVAL.red);
});

test("quick games count activity but don't change status", () => {
  const db = fresh();
  applyHit(db, { id: 2, xp: 5, mode: "tf", d: "2026-10-05" });
  applyHit(db, { id: 2, xp: 5, d: "2026-10-05" });
  assert.equal(db.items[1].st, "green");
  assert.equal(db.items[1].lastMode, "tf");
  assert.deepEqual(db.history, [{ d: "2026-10-05", ids: [2], xp: 10 }]);
});

test("unknown item and bad date", () => {
  const db = fresh();
  assert.equal(applyHit(db, { id: 99, st: "red" }), false);
  applyHit(db, { id: 1, st: "red", d: "yesterday" }, "2026-10-06");
  assert.equal(db.items[0].last, "2026-10-06");
});

test("due dates and the due list", () => {
  const now = new Date(2026, 9, 9); // 9 Oct 2026, local
  const items = [
    { id: 1, st: "green", iv: 7, last: "2026-10-01" }, // due 8 Oct: 1 day over
    { id: 2, st: "red", last: "2026-10-08" },          // due 9 Oct: due today
    { id: 3, st: "yellow", last: "2026-10-08" },       // due 11 Oct
    { id: 4, st: "new" },
  ];
  assert.equal(dueDate(items[0]), "2026-10-08");
  assert.deepEqual(dueItems(items, now).map((i) => [i.id, i.over]), [[1, 1], [2, 0]]);
  assert.equal(isDue(items[2], now), false);
});
