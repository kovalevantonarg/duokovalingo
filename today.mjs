#!/usr/bin/env node
// today.mjs — the dispatcher. One command, zero decisions.
//   node today.mjs              -> today's rep (terminal)
//   node today.mjs done 24 g    -> log an item (g green / y yellow / r red), regenerates progress.html
//   node today.mjs status       -> whole queue at a glance
//   node today.mjs html         -> regenerate progress.html (open it in a browser)
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("./queue.json", import.meta.url);
const HTML = new URL("./progress.html", import.meta.url);
const db = JSON.parse(readFileSync(FILE, "utf8"));
db.history ??= [];
const INTERVAL = { red: 1, yellow: 3, green: 7 };
const MARK = { new: "  ", red: "X ", yellow: "~ ", green: "OK", parked: "--" };
const NEW_ORDER = [38, 39, 22, 25, 23, 32, 27, 28, 29, 30, 31, 40, 35, 36, 37, 42];
const SECTIONS = [
  ["llm", "LLM engineering"], ["rag", "RAG"], ["agents", "Agents"], ["sysd", "System design"],
  ["behav", "Behavioral"], ["bonus", "Beyond core-40"], ["meta", "Meta"], ["js", "JS/TS (parked)"], ["react", "React (parked)"],
];

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const TODAY = iso(today);
const days = (from) => Math.floor((today - new Date(from)) / 864e5);
const byId = (id) => db.items.find((i) => i.id === id);
const save = () => writeFileSync(FILE, JSON.stringify(db, null, 2) + "\n");
const dueDate = (i) => (i.last && INTERVAL[i.st]) ? iso(new Date(new Date(i.last).getTime() + INTERVAL[i.st] * 864e5)) : null;

function due() {
  return db.items
    .filter((i) => INTERVAL[i.st] && i.last)
    .map((i) => ({ ...i, over: days(i.last) - INTERVAL[i.st] }))
    .filter((i) => i.over >= 0)
    .sort((a, b) => b.over - a.over);
}
const nextNew = () => NEW_ORDER.map(byId).find((i) => i && i.st === "new");

const cmd = process.argv[2];

if (cmd === "done") {
  const id = Number(process.argv[3]);
  const st = { g: "green", y: "yellow", r: "red" }[process.argv[4]];
  const it = byId(id);
  if (!it || !st) { console.log("usage: node today.mjs done <id> <g|y|r>"); process.exit(1); }
  it.st = st; it.last = TODAY;
  let h = db.history.find((x) => x.d === TODAY);
  if (!h) db.history.push((h = { d: TODAY, ids: [] }));
  if (!h.ids.includes(id)) h.ids.push(id);
  save(); writeHtml();
  console.log(`#${id} ${it.t} -> ${st}, next in ${INTERVAL[st]}d   (progress.html updated)`);
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

if (cmd === "html") { writeHtml(); console.log("progress.html written"); process.exit(0); }

// ---- today's card (terminal) ----
{
  const d = due(); const nn = nextNew();
  const dow = today.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  console.log(`\n=== TODAY - ${dow} ===\n`);
  console.log("REVISIT  (cold, no notes, out loud, 60-90s each)");
  if (!d.length) console.log("  nothing due. straight to the new one.");
  for (const i of d.slice(0, 2)) console.log(`  #${i.id} ${i.t}  [${i.st}, ${i.over}d overdue]`);
  if (d.length > 2) console.log(`  (+${d.length - 2} more in the backlog - ignore them, 2 is the cap)`);
  console.log("\nNEW  (pre-test cold first, then lesson)");
  console.log(nn ? `  #${nn.id} ${nn.t}` : "  queue empty - pick from reference/interview-question-bank.md");
  if (db.today_overrides?.ship) console.log(`\nSHIP\n  ${db.today_overrides.ship}`);
  const five = d[0] || nn;
  console.log(`\n5-MINUTE VERSION (bad day, still counts)`);
  console.log(`  #${five.id} out loud, 60 sec, then: node today.mjs done ${five.id} <g|y|r>`);
  console.log(`\n-> open a Claude session, say "drill", point it at learning-system.md`);
  console.log(`   log it:  node today.mjs done <id> <g|y|r>   |   picture:  open progress.html\n`);
}

// ---- progress.html ----
function writeHtml() {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const active = db.items.filter((i) => i.st !== "parked");
  const n = (s) => active.filter((i) => i.st === s).length;
  const d = due(); const nn = nextNew();
  const lastSession = db.history.length ? days(db.history[db.history.length - 1].d) : null;
  const GLYPH = { green: "&#10003;", yellow: "~", red: "&#10007;", new: "", parked: "&#8211;" };
  const LABEL = { green: "green — said it cold", yellow: "yellow — shaky", red: "red — missed", new: "new — never opened", parked: "parked — assumed known" };

  // the wall
  const wall = SECTIONS.map(([key, name]) => {
    const items = db.items.filter((i) => i.s === key);
    if (!items.length) return "";
    const cells = items.map((i) => {
      const dd = dueDate(i);
      const tip = `#${i.id} ${i.t}\n${LABEL[i.st]}${i.last ? `\nlast: ${i.last}` : ""}${dd ? `\ndue: ${dd}${dd <= TODAY ? " (overdue)" : ""}` : ""}${i.why ? `\n${i.why}` : ""}`;
      const overdue = dd && dd <= TODAY ? " overdue" : "";
      return `<div class="cell ${i.st}${overdue}" title="${esc(tip)}"><span class="id">${i.id}</span><span class="g">${GLYPH[i.st]}</span></div>`;
    }).join("");
    const g = items.filter((i) => i.st === "green").length;
    return `<div class="sec"><div class="sech"><span>${esc(name)}</span><span class="muted">${g}/${items.length}</span></div><div class="cells">${cells}</div></div>`;
  }).join("");

  // heat map: 16 weeks, columns = weeks, rows = Mon..Sun
  const counts = Object.fromEntries(db.history.map((h) => [h.d, h.ids.length]));
  const end = new Date(today); const dow = (end.getDay() + 6) % 7; // Mon=0
  const start = new Date(end); start.setDate(end.getDate() - dow - 7 * 15);
  let cols = ""; const monthLabels = [];
  for (let w = 0; w < 16; w++) {
    let col = "";
    for (let r = 0; r < 7; r++) {
      const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + r);
      const k = iso(dt); const c = counts[k] || 0;
      const future = dt > today;
      const lvl = c === 0 ? 0 : c === 1 ? 1 : c <= 3 ? 2 : 3;
      col += `<div class="day l${lvl}${future ? " future" : ""}${k === TODAY ? " today" : ""}" title="${k}${c ? ` — ${c} item${c > 1 ? "s" : ""}` : ""}"></div>`;
      if (r === 0 && dt.getDate() <= 7) monthLabels.push([w, dt.toLocaleDateString("en-GB", { month: "short" })]);
    }
    cols += `<div class="week">${col}</div>`;
  }
  const months = monthLabels.map(([w, m]) => `<span style="left:${w * 16}px">${m}</span>`).join("");
  const sessions = db.history.length;
  const itemsLogged = db.history.reduce((a, h) => a + h.ids.length, 0);

  // due timeline: next 14 days
  const tl = [];
  for (let k = 0; k < 14; k++) {
    const dt = new Date(today); dt.setDate(today.getDate() + k); const key = iso(dt);
    const ids = active.filter((i) => { const dd = dueDate(i); return dd && (k === 0 ? dd <= key : dd === key); }).map((i) => i.id);
    tl.push(`<div class="tl"><span class="tld${k === 0 ? " now" : ""}">${k === 0 ? "today" : dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}</span><span class="tli">${ids.length ? ids.map((x) => `<b>#${x}</b>`).join(" ") : "<i>—</i>"}</span></div>`);
  }

  const card = `
    <div class="row"><span class="k">revisit</span><span>${d.length ? d.slice(0, 2).map((i) => `<b>#${i.id}</b> ${esc(i.t)} <i>(${i.over}d overdue)</i>`).join("<br>") : "nothing due"}${d.length > 2 ? `<br><i class="muted">+${d.length - 2} in backlog, ignore — 2 is the cap</i>` : ""}</span></div>
    <div class="row"><span class="k">new</span><span>${nn ? `<b>#${nn.id}</b> ${esc(nn.t)}` : "queue empty"}</span></div>
    ${db.today_overrides?.ship ? `<div class="row"><span class="k">ship</span><span>${esc(db.today_overrides.ship)}</span></div>` : ""}
    <div class="row"><span class="k">5-min</span><span>#${(d[0] || nn).id} out loud, 60s, then <code>node today.mjs done ${(d[0] || nn).id} g|y|r</code></span></div>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>progress — core-40</title>
<style>
  :root{color-scheme:dark;--page:#0d0d0d;--surface:#1a1a19;--ink:#fff;--ink2:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--base:#383835;--ring:rgba(255,255,255,.10);
    --good:#0ca30c;--warn:#fab219;--crit:#d03b3b;--h1:#1c5cab;--h2:#3987e5;--h3:#86b6ef}
  *{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;padding:28px 24px 60px;max-width:1080px;margin-inline:auto}
  h1{font-size:15px;font-weight:600;margin:0 0 4px;letter-spacing:.02em}.sub{color:var(--muted);margin:0 0 22px;font-size:13px}
  .muted{color:var(--muted)}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:26px}
  .tile{background:var(--surface);border:1px solid var(--ring);border-radius:8px;padding:12px 14px}.tile .v{font-size:26px;font-weight:600;line-height:1.1}.tile .l{color:var(--ink2);font-size:12px;margin-top:4px}
  .tile .v.good{color:var(--good)}.tile .v.warn{color:var(--warn)}
  h2{font-size:12px;font-weight:600;color:var(--ink2);text-transform:uppercase;letter-spacing:.08em;margin:26px 0 10px}
  .card{background:var(--surface);border:1px solid var(--ring);border-radius:8px;padding:14px 16px}
  .row{display:grid;grid-template-columns:64px 1fr;gap:12px;padding:6px 0;border-top:1px solid var(--grid)}.row:first-child{border-top:0}.k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em;padding-top:2px}
  code{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:var(--page);padding:1px 6px;border-radius:4px;border:1px solid var(--grid)}
  .sec{margin-bottom:12px}.sech{display:flex;justify-content:space-between;font-size:12px;color:var(--ink2);margin-bottom:6px}
  .cells{display:flex;flex-wrap:wrap;gap:4px}
  .cell{width:44px;height:36px;border-radius:4px;border:1px solid var(--ring);background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:default;position:relative}
  .cell .id{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--ink2)}.cell .g{font-size:11px;line-height:1;color:var(--ink);min-height:11px}
  .cell.green{background:var(--good);border-color:var(--good)}.cell.green .id,.cell.green .g{color:#07300a}
  .cell.yellow{background:var(--warn);border-color:var(--warn)}.cell.yellow .id,.cell.yellow .g{color:#3a2a00}
  .cell.red{background:var(--crit);border-color:var(--crit)}
  .cell.new{background:var(--surface);border-style:dashed;border-color:var(--base)}
  .cell.parked{background:repeating-linear-gradient(135deg,var(--surface) 0 4px,var(--grid) 4px 6px);border-color:var(--grid)}.cell.parked .id,.cell.parked .g{color:var(--muted)}
  .cell.overdue::after{content:"";position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:50%;background:var(--ink);opacity:.85}
  .legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--ink2);margin:10px 0 0}.legend span::before{content:"";display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px;border:1px solid var(--ring)}
  .legend .lg::before{background:var(--good)}.legend .ly::before{background:var(--warn)}.legend .lr::before{background:var(--crit)}.legend .ln::before{border-style:dashed;border-color:var(--base)}.legend .lp::before{background:repeating-linear-gradient(135deg,var(--surface) 0 3px,var(--grid) 3px 5px)}.legend .lo::before{background:var(--ink);border-radius:50%;width:6px;height:6px;margin:0 8px 0 2px}
  .heat{position:relative;padding-top:18px}.months{position:absolute;top:0;left:0;height:14px;font-size:11px;color:var(--muted)}.months span{position:absolute}
  .weeks{display:flex;gap:3px}.week{display:flex;flex-direction:column;gap:3px}
  .day{width:13px;height:13px;border-radius:2px;background:var(--surface);border:1px solid var(--grid)}.day.l1{background:var(--h1);border-color:var(--h1)}.day.l2{background:var(--h2);border-color:var(--h2)}.day.l3{background:var(--h3);border-color:var(--h3)}
  .day.future{opacity:.25}.day.today{outline:1px solid var(--ink);outline-offset:1px}
  .hl{display:flex;gap:8px;align-items:center;font-size:11px;color:var(--muted);margin-top:8px}.hl .day{width:11px;height:11px}
  .tls{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px}.tl{background:var(--surface);border:1px solid var(--ring);border-radius:6px;padding:8px 10px;font-size:12px}.tld{display:block;color:var(--muted);margin-bottom:3px}.tld.now{color:var(--ink)}.tli b{font-family:ui-monospace,Menlo,monospace;font-weight:600}.tli i{color:var(--base)}
  b{font-weight:600}i{color:var(--muted);font-style:normal}
  .foot{color:var(--muted);font-size:12px;margin-top:30px}
</style></head><body>
<h1>core-40 &middot; progress</h1>
<p class="sub">${today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} &middot; regenerate: <code>node today.mjs html</code> (auto after every <code>done</code>)</p>

<div class="tiles">
  <div class="tile"><div class="v good">${n("green")}<span class="muted" style="font-size:14px;font-weight:400"> / ${active.length}</span></div><div class="l">green &middot; said it cold</div></div>
  <div class="tile"><div class="v warn">${n("yellow")}</div><div class="l">yellow &middot; shaky, in rotation</div></div>
  <div class="tile"><div class="v">${n("new")}</div><div class="l">new &middot; never opened</div></div>
  <div class="tile"><div class="v">${d.length}</div><div class="l">due today (cap 2)</div></div>
  <div class="tile"><div class="v">${lastSession === null ? "—" : lastSession + "d"}</div><div class="l">since last logged session</div></div>
</div>

<h2>Today</h2>
<div class="card">${card}</div>

<h2>The wall &middot; ${active.length} active, ${db.items.length - active.length} parked</h2>
${wall}
<div class="legend"><span class="lg">green</span><span class="ly">yellow</span><span class="lr">red</span><span class="ln">new</span><span class="lp">parked</span><span class="lo">overdue for revisit</span></div>

<h2>Sessions &middot; last 16 weeks &middot; ${sessions} sessions, ${itemsLogged} items logged</h2>
<div class="card"><div class="heat"><div class="months">${months}</div><div class="weeks">${cols}</div></div>
<div class="hl">less <div class="day"></div><div class="day l1"></div><div class="day l2"></div><div class="day l3"></div> more &nbsp;&middot;&nbsp; rows Mon&rarr;Sun &nbsp;&middot;&nbsp; the gaps are the data, not a verdict</div></div>

<h2>Coming due &middot; next 14 days</h2>
<div class="tls">${tl.join("")}</div>

<p class="foot">Hover any cell for the item, status, last drilled, due date. Data: <code>queue.json</code>. Log: <code>node today.mjs done &lt;id&gt; g|y|r</code>.</p>
</body></html>`;
  writeFileSync(HTML, html);
}
