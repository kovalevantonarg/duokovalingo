import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyHit,
  nextInterval,
  dueTickets,
  dueDate,
  isDue,
  migrate,
  setDoubt,
  ticketOfItem,
  emptyDb,
  INTERVAL,
  MAX_IV,
} from "../app/lib/srs.js";

const fresh = () => ({ ...emptyDb(), tickets: { 2: { st: "green", iv: 7, last: "2026-10-01" } } });

test("grading sets status, interval and date", () => {
  const db = fresh();
  assert.equal(applyHit(db, { n: 1, st: "yellow", xp: 10, d: "2026-10-05" }), true);
  assert.deepEqual(db.tickets[1], { st: "yellow", iv: INTERVAL.yellow, last: "2026-10-05" });
  assert.deepEqual(db.history, [{ d: "2026-10-05", tickets: [1], xp: 10 }]);
});

test("green after green doubles the interval, capped", () => {
  assert.equal(nextInterval({ st: "green", iv: 7 }, "green"), 14);
  assert.equal(nextInterval({ st: "green", iv: 60 }, "green"), MAX_IV);
  assert.equal(nextInterval({ st: "yellow", iv: 3 }, "green"), INTERVAL.green);
  assert.equal(nextInterval({ st: "green", iv: 28 }, "red"), INTERVAL.red);
});

test("quick games count activity but don't change status", () => {
  const db = fresh();
  applyHit(db, { n: 2, xp: 5, mode: "tf", d: "2026-10-05" });
  applyHit(db, { n: 2, xp: 5, d: "2026-10-05" });
  assert.equal(db.tickets[2].st, "green");
  assert.equal(db.tickets[2].mode, "tf");
  assert.deepEqual(db.history, [{ d: "2026-10-05", tickets: [2], xp: 10 }]);
});

test("unknown ticket, old item ids and bad date", () => {
  const db = fresh();
  assert.equal(applyHit(db, { n: 999, st: "red" }), false);
  assert.equal(applyHit(db, { st: "red" }), false);
  // item 27 sits in tickets 10 and 15: the first active ticket wins
  assert.equal(ticketOfItem(27), 10);
  assert.equal(ticketOfItem(3), 26);
  applyHit(db, { id: 17, st: "red", d: "yesterday" }, "2026-10-06");
  assert.equal(db.tickets[1].last, "2026-10-06");
});

test("doubt flag: set, unset, cleared by a grade", () => {
  const db = fresh();
  assert.equal(setDoubt(db, 2, true), true);
  assert.equal(setDoubt(db, 2, true), false);
  assert.equal(db.tickets[2].doubt, true);
  applyHit(db, { n: 2, st: "green", d: "2026-10-09" });
  assert.equal(db.tickets[2].doubt, undefined);
  assert.equal(setDoubt(db, 999, true), false);
});

test("due dates and the due list", () => {
  const now = new Date(2026, 9, 9); // 9 Oct 2026, local
  const db = {
    ...emptyDb(),
    tickets: {
      1: { st: "green", iv: 7, last: "2026-10-01" }, // due 8 Oct: 1 day over
      2: { st: "red", last: "2026-10-08" }, // due 9 Oct: due today
      3: { st: "yellow", last: "2026-10-08" }, // due 11 Oct
      26: { st: "red", last: "2026-09-01" }, // parked: never due
      4: { doubt: true },
    },
  };
  assert.equal(dueDate(db.tickets[1]), "2026-10-08");
  assert.deepEqual(
    dueTickets(db, now).map((r) => [r.n, r.over]),
    [
      [1, 1],
      [2, 0],
    ],
  );
  assert.equal(isDue(db.tickets[3], now), false);
});

test("migration: items become tickets, history maps to tickets, old data kept", () => {
  const old = {
    items: [
      { id: 17, st: "yellow", iv: 3, last: "2026-09-20", lastMode: "voice" },
      { id: 18, st: "green", iv: 14, last: "2026-09-25" },
      { id: 27, st: "red", last: "2026-09-25" }, // same day as 18: ticket 10 takes the weaker one
      { id: 3, st: "parked" },
      { id: 19, st: "new" },
    ],
    history: [{ d: "2026-09-25", ids: [18, 27, 3], xp: 12 }],
    roadmap: { x: 1 },
    exams: [{ n: 1, score: 7 }],
  };
  const db = structuredClone(old);
  assert.equal(migrate(db), true);
  assert.equal(db.schema, 2);
  assert.deepEqual(db.tickets[1], { st: "yellow", last: "2026-09-20", iv: 3, mode: "voice" });
  assert.deepEqual(db.tickets[2], { st: "green", last: "2026-09-25", iv: 14 });
  assert.equal(db.tickets[10].st, "red");
  assert.equal(db.tickets[15].st, "red");
  assert.equal(db.tickets[4], undefined);
  assert.deepEqual(db.history, [{ d: "2026-09-25", tickets: [2, 10, 26], xp: 12 }]);
  assert.deepEqual(db.exams, old.exams);
  assert.deepEqual(db.legacy.items, old.items);
  assert.equal(db.roadmap, undefined);
  assert.equal(migrate(db), false, "idempotent");
  const empty = { items: [], history: [] };
  migrate(empty);
  assert.deepEqual(empty, emptyDb());
});
