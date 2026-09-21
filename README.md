# superhuman — interview prep & AI learning

Private. Contains interview scores, weak spots and job-search material.

## Start here

The app lives in `app/` and runs in three places with one codebase:

- **Cloud (Vercel):** password-gated, progress in Supabase. Open it from any device, add to the iPhone home screen (it's a PWA). Project `drill` on Vercel; env vars listed in `app/README.md`.
- **Local:** `node today.mjs serve` → `localhost:4040`, same app, no password, progress in `queue.json`.
- **Terminal:** `node today.mjs` prints today's card. `node today.mjs pull` copies cloud progress into `queue.json` + `progress.html` (needs `DRILL_URL` and `DRILL_PASSWORD` in `.env`).

Cloud is the source of truth once you use it; `pull` keeps the local files in step.

Two revisits, one new item, one ship task. No deciding what to study — that was the part that kept killing sessions.
Finished an item: `node today.mjs done <id> <g|y|r>`. Whole picture: `node today.mjs status`.

## The loop

1. Build a slice of `scout` (separate repo) — code first, running in ~45 min
2. Read the lesson that explains what the code touched
3. Answer the recall questions cold, out loud
4. Write the concept in my own words into `concepts.md`
5. Log the score in `learning-log.md`

Reading-first failed twice. Build-first is the format now.

## Files

| File | What it is |
|---|---|
| `today.mjs` + `queue.json` | The dispatcher + state. `serve` runs the app, `done` logs from the terminal, `html` regenerates progress.html. |
| `app/` | The game. `index.html` (SPA), `tickets.js` (27 tickets as data), `drills.js` (traps, cloze, step sequences), `exam-tickets.html` (classic mode), `api/[route].js` (Vercel function: login, state, log, done, explain), PWA manifest + icons. |
| `plan.md` | Current plan. Applications first, drilling around them. |
| `anton-os.md` | One page. Start Rule, four roles. Never grows. |
| `learning-log.md` | Every session, every score, every gap. Source of truth. |
| `learning-system.md` | The drill protocol. |
| `core-40-priority.md` | The 40 must-know questions. |
| `core-40-deck.html` | Same 40 as flashcards. Open on phone. |
| `exam-tickets.html` | 27 exam tickets, all 42 queue items. RU/EN, spoken-prose reference, "where people fail". |
| `progress.html` | The wall, session heat map, due timeline. Cells open their ticket. |
| `concepts.md` | My own wording. The only version that survives an interview. |
| `lesson-NN-*.md` | Lesson, English. `lesson-NN-RU.md` — comprehension check, terms stay English. |
| `english-pack.md` | Self-intro, STAR stories, phrase bank. |
| `follow-list.md` | ~25 accounts + the 20-min Friday protocol. |
| `interview-log.md` | Real interview reps. |
| `resend-dossier.md` | Primary target. |
| `morning-routine.md` | 15 min: AI news in English IS the English practice. |
| `reference/` | Full answers (7 files) — read only AFTER a failed recall. |

## Rules

- Answer files are closed until recall has been attempted.
- All job-search activity from personal devices only.
- This repo stays private.
