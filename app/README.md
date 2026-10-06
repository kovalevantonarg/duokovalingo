# duokovalingo — deploy notes

Static SPA + one Vercel function (`api/[route].js`). No build step; the function's one dependency is `web-push`.

## The app

One page (`index.html`), four tabs in a bottom bar: **Сегодня** (Start: what's due, or the next new ticket),
**Билеты** (search, filters, a ticket's path: lesson → practice → exam), **Разборы** (from-zero lessons, read
aloud), **Прогресс** (readiness per track, exam score history, activity). Settings (language, sound,
reminders, lessons offline, sign out) open in a sheet from the header.

The unit of progress is the **ticket**. Each has a status (new / red / yellow / green) and an interval
(`lib/srs.js`). Only graded attempts move it: the out-loud self-score, the AI-graded exam, or an AI grade of
a spoken answer. Quick games (true/false, gaps, order) count as activity only. "Сомневаюсь" flags a ticket so
the next session takes it first.

Hash routes: `#home`, `#tickets`, `#t/<n>`, `#exam/<n>`, `#learn`, `#learn/<n>`, `#progress`; full-screen
rounds `#session`, `#interview`, `#play/<n>/<tf|gap|order|voice>`. The old standalone pages
(`/exam-tickets.html#t12`, `/learn.html#t5`, `/map.html`) redirect to `/?from=…` and open the matching route.

## Where the logic lives

| File | What |
|---|---|
| `js/app.js` | Entry: global listeners, tab bar, service worker, boot. |
| `js/state.js`, `js/store.js` | The one mutable state object; progress from the API, the offline queue, ticket queries, exam attempts. |
| `js/router.js`, `js/ui.js` | Routes; shared pieces (header, tab bar, ticket rows, round top bar). |
| `js/screens/` | `home` (Today), `tickets` (list + ticket page), `exam`, `learn`, `progress`, `activity`, `settings` (+ bottom sheet), `verdict` (answer feedback, end of round), `login`. |
| `js/games/` | `session` (the daily Start), `true-false` (with swipe), `fill-gap`, `order`, `voice`, `interview`. |
| `js/speech.js` | Dictation (SpeechRecognition) and read-aloud (speechSynthesis). |
| `js/chart.js` | The exam score chart (inline SVG). |
| `css/` | `theme.css` tokens; `app.css` (scoped `.v-app`, plus the shell), `exam.css` (`.v-exam`), `learn.css` (`.v-learn`), `map.css` (`.v-map`). |
| `sw.js` | Service worker: app shell network-first, static files and lessons stale-while-revalidate, `/api` never cached; push notifications. |
| `lib/srs.js` | Spaced-repetition rules and the migration from the old per-item progress. Imported by the API, `today.mjs` and the browser. |
| `lib/catalog.js` | **Generated** ticket list (number, section, old item ids) for `srs.js`. |
| `api/[route].js` | Auth and routes: login, logout, state, log, done, flag, exams, check, explain, push, remind. |
| `api/_grade.js` | The answer checker: prompt, JSON schema, parser. Shared with `today.mjs`. |
| `api/_store.js` | Progress storage: versioned read-modify-write with retry, exam attempts in their own table; falls back to the old RPCs until the migration in `supabase/migrations/` has run. |
| `api/_push.js` | Reminder text and push-subscription helpers. |
| `tickets.js`, `drills.js`, `sources.js` | **Generated** bundles. Source: `content/tickets/NN-slug.json`; rebuild with `node scripts/build-content.mjs`. |
| `lessons/` | One lesson JSON per ticket, loaded on demand. |

## Dev loop (repo root)

- `npm test`: unit tests (SRS and migration, grader, storage, push) plus a consistency check of all content.
- Edit a ticket: change `content/tickets/NN-slug.json`, then `node scripts/build-content.mjs`. `npm test` fails if you forget.
- `node scripts/apply-fixes.mjs fixes.json`: apply reviewed text edits to the ticket files and rebuild.
- `node scripts/build-lesson-index.mjs`: rebuild `lessons/index.json` after editing a lesson.
- `npm run serve`: local server on :4040 against `queue.json`, same API, no auth (no push).

## Progress migration

Progress saved before tickets were the unit (one record per drill item, `items[]`) is converted on the first
read: each ticket takes the status of its most recently graded core item, day history maps to tickets, and
the old data stays in the row under `legacy`. See `migrate()` in `lib/srs.js`.

## Exam check

`/api/check` grades the answer against the hidden reference (`api/_grade.js`). The grade is stored as an exam
attempt and sets the ticket's status (8+ green, 5–7 yellow, else red). Interview-mode answers (one question,
`kind: "interview"`) are stored too but only count as activity. Needs `ANTHROPIC_API_KEY`; `DRILL_MODEL`
picks the model (default `claude-sonnet-5-5`).

## Vercel project `drill` (root directory: `app`)

| var | what |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | publishable key: it can only call the `drill_*` RPC functions; the tables live in the private `drill` schema |
| `DRILL_DB_KEY` | the key the RPC functions check |
| `DRILL_SECRET` | HMAC secret for the session cookie |
| `DRILL_PASSWORD` | the one password |
| `ANTHROPIC_API_KEY` | optional: the answer checker and "Explain differently" |
| `DRILL_MODEL` | optional, default `claude-sonnet-5-5` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional: push reminders (`npx web-push generate-vapid-keys`; subject like `mailto:you@example.com`). All three or push stays off. |
| `CRON_SECRET` | needed with push: Vercel Cron sends it to `/api/remind` (daily, `vercel.json`) |
| `DRILL_TZ` | optional: time zone for "already practiced today" in reminders (default `America/Argentina/Buenos_Aires`) |

## Auth

`POST /api/login {password}` → `drill=<exp>.<hmac>` cookie, HttpOnly, Secure, SameSite=Lax, 90 days. Every
other route needs it (except `/api/remind`, which checks `CRON_SECRET`). Single user by design.
