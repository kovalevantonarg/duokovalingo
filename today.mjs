#!/usr/bin/env node
// today.mjs — the dispatcher. One command, zero decisions.
//   node today.mjs              -> today's rep
//   node today.mjs done 24 g    -> log an item (g green / y yellow / r red)
//   node today.mjs status       -> whole queue at a glance
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("./queue.json", import.meta.url);
const db = JSON.parse(readFileSync(FILE, "utf8"));
const INTERVAL = { red: 1, yellow: 3, green: 7 };
const MARK = { new: "  ", red: "X ", yellow: "~ ", green: "OK", parked: "--" };
// new items in the order they actually matter, not in id order
const NEW_ORDER = [38, 39, 22, 25, 23, 32, 27, 28, 29, 30, 31, 40, 35, 36, 37, 42];

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const days = (from) => Math.floor((today - new Date(from)) / 864e5);
const byId = (id) => db.items.find((i) => i.id === id);
const save = () => writeFileSync(FILE, JSON.stringify(db, null, 2) + "\n");

function due() {
  return db.items
    .filter((i) => INTERVAL[i.st] && i.last)
    .map((i) => ({ ...i, over: days(i.last) - INTERVAL[i.st] }))
    .filter((i) => i.over >= 0)
    .sort((a, b) => b.over - a.over);
}

const cmd = process.argv[2];

if (cmd === "done") {
  const id = Number(process.argv[3]);
  const st = { g: "green", y: "yellow", r: "red" }[process.argv[4]];
  const it = byId(id);
  if (!it || !st) { console.log("usage: node today.mjs done <id> <g|y|r>"); process.exit(1); }
  it.st = st; it.last = iso(today);
  save();
  console.log(`#${id} ${it.t} -> ${st}, next in ${INTERVAL[st]}d`);
  process.exit(0);
}

if (cmd === "status") {
  const n = (s) => db.items.filter((i) => i.st === s).length;
  console.log(`green ${n("green")} | yellow ${n("yellow")} | red ${n("red")} | new ${n("new")} | parked ${n("parked")}`);
  for (const i of db.items.filter((x) => x.st !== "parked")) {
    const age = i.last ? ` (${days(i.last)}d ago)` : "";
    console.log(` ${MARK[i.st]} #${String(i.id).padEnd(2)} ${i.t}${age}`);
  }
  process.exit(0);
}

// ---- today's card ----
const d = due();
const nextNew = NEW_ORDER.map(byId).find((i) => i && i.st === "new");
const dow = today.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

console.log(`\n=== TODAY - ${dow} ===\n`);

console.log("REVISIT  (cold, no notes, out loud, 60-90s each)");
if (!d.length) console.log("  nothing due. straight to the new one.");
for (const i of d.slice(0, 2)) console.log(`  #${i.id} ${i.t}  [${i.st}, ${i.over}d overdue]`);
if (d.length > 2) console.log(`  (+${d.length - 2} more in the backlog - ignore them, 2 is the cap)`);

console.log("\nNEW  (pre-test cold first, then lesson)");
console.log(nextNew ? `  #${nextNew.id} ${nextNew.t}` : "  queue empty - pick from reference/interview-question-bank.md");

if (db.today_overrides?.ship) console.log(`\nSHIP\n  ${db.today_overrides.ship}`);

const five = d[0] || nextNew;
console.log(`\n5-MINUTE VERSION (bad day, still counts)`);
console.log(`  #${five.id} out loud, 60 sec, then: node today.mjs done ${five.id} <g|y|r>`);

console.log(`\n-> open a Claude session, say "drill", point it at learning-system.md`);
console.log(`   log it:  node today.mjs done <id> <g|y|r>\n`);
