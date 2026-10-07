# duokovalingo

A drill app for AI-engineering and frontend interviews: 50 exam tickets (LLM, RAG, agents, system design, JS/TS, React, browser) with spaced repetition per ticket, a daily session, quick games built from the tickets, a from-zero lesson per ticket with sources (read aloud if you like), an interview mode, and an answer checker that grades a typed or dictated answer against the hidden reference.

Live as a PWA on Vercel with Google sign-in, progress per user (works offline, optional push reminders); progress is stored in Supabase.

## Layout

| Path | What |
|---|---|
| `app/` | The deployed app (Vercel root directory). See `app/README.md` for routes, env vars and where the logic lives. |
| `app/lib/srs.js` | Spaced-repetition rules per ticket, shared by the API, the local server and the browser. |
| `app/api/` | One Vercel function: auth, progress, the answer checker. |
| `content/tickets/` | Study content, one JSON file per ticket: reference answers (RU/EN), drills, sources. The app's `tickets.js`/`drills.js`/`sources.js` are built from it. |
| `app/lessons/` | One from-zero lesson per ticket. |
| `today.mjs` | Local server and terminal helper (`serve`, `status`, `done`, `pull`). |
| `scripts/` | Content tools: validation, applying reviewed edits, rebuilding the lesson index. |
| `test/` | `node:test` suites, run in CI. |

## Run it

```sh
npm test            # unit tests + content consistency check (no dependencies)
npm run serve       # local app on http://localhost:4040, progress in queue.json
```

`queue.json` is local and not committed. `node today.mjs pull` fills it from the deployed app (needs `DRILL_URL` and `DRILL_COOKIE`, the value of the `drill` cookie of a signed-in browser, in `.env`).
