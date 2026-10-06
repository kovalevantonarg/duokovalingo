# duokovalingo — deploy notes

Static SPA + one Vercel function (`api/[route].js`). No build step, no npm deps.

## Where the logic lives

| File | What |
|---|---|
| `js/app.js` | Entry of the drill app (`index.html`): global listeners and boot. The rest is split by responsibility: `state.js` (the one mutable state object), `store.js` (progress data, API, offline queue), `router.js`, `ui.js` (shared pieces), `screens/` (home, activity, verdict sheet + finish, login), `games/` (true-false, fill-gap, order, voice, quick), helpers `i18n.js`, `icons.js`, `util.js`, `sound.js`. |
| `js/exam.js`, `js/learn.js`, `js/map.js` | Scripts of the other three pages (exam, lessons, knowledge map). |
| `css/theme.css` | Shared design tokens (surfaces, text, accent and status colours, fonts). Each page's stylesheet in `css/` builds on it. |
| `lib/srs.js` | Spaced-repetition rules (intervals, what's due). The only copy: imported by the API, by `today.mjs` and by `index.html` (as an ES module). |
| `api/_grade.js` | "Check my answer": prompt, JSON schema, parser. Shared with `today.mjs`. |
| `api/[route].js` | Auth and routes. |
| `api/_store.js` | Progress storage: versioned read-modify-write with retry (two devices can't overwrite each other), exam attempts in their own table; falls back to the old RPCs until the migration in `supabase/migrations/` has run. |
| `tickets.js`, `drills.js`, `sources.js` | **Generated** bundles the pages load. The source is `content/tickets/NN-slug.json` at the repo root (one file per ticket: answers, drills, sources); rebuild with `node scripts/build-content.mjs`. |
| `lessons/` | One lesson JSON per ticket, loaded on demand by `learn.html`. |

## Dev loop (repo root)

- `npm test` — unit tests for `lib/srs.js` and `api/_grade.js`, plus a consistency check of all content (3 questions/answers per language, cloze blanks match RU/EN, every lesson's decode quotes still exist in its answer, sources have URLs).
- Edit a ticket: change `content/tickets/NN-slug.json`, then `node scripts/build-content.mjs`. `npm test` fails if you forget.
- `node scripts/apply-fixes.mjs fixes.json` — apply a batch of reviewed text edits to the ticket files and rebuild (refuses if any `old` text isn't found).
- `node scripts/build-lesson-index.mjs` — rebuild `lessons/index.json` after editing a lesson.
- `npm run serve` — local server on :4040 against `queue.json`.

## Lessons ("Разбор с нуля")

`learn.html#t1` opens the from-zero lesson for ticket 1, RU and EN; all 50 tickets have one.
Data: `lessons/L{n}.json` (+ `lessons/index.json` with titles and word counts), loaded on demand.
Each lesson: why they ask, sections (terms defined on first use, mechanism, real outputs, frontend
parallel, traps), glossary, decoding of the reference answer, self-check, sources.

## Exam check

`exam-tickets.html`: "Check my answer" POSTs the typed answer + the hidden reference to `/api/check`
(prompt and JSON schema in `api/_grade.js`, shared with `today.mjs`). The grade is stored in
`db.exams` and counts as a drill session for the ticket's core items (score 8+ green, 5–7 yellow,
else red). Needs `ANTHROPIC_API_KEY`; `DRILL_MODEL` picks the model (default `claude-sonnet-5-5`).

## Vercel project `drill` (root directory: `app`)

Environment variables (all targets):

| var | what |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | publishable key — it can only call the `drill_*` RPC functions; the tables live in the private `drill` schema |
| `DRILL_DB_KEY` | the key the RPC functions check (row `db_key` in `drill.secrets`) |
| `DRILL_SECRET` | HMAC secret for the session cookie |
| `DRILL_PASSWORD` | the one password. Rotate in Vercel → Settings → Environment Variables, then redeploy |
| `ANTHROPIC_API_KEY` | optional — turns on "Explain differently" |
| `DRILL_MODEL` | optional, default `claude-sonnet-5` |

## Supabase (project `kovalevantonarg's Project`)

Schema `drill`: `state(id, data jsonb, updated_at)`, `secrets(name, value)`, `explain_cache(key, body)`.
Public RPC: `drill_load(p_key)`, `drill_save(p_key, p_data)`, `drill_cache_get`, `drill_cache_set` — `security definer`, every call checks `p_key` against `drill.secrets`. Migration name: `drill_state_and_rpc`.

## Auth

`POST /api/login {password}` → `drill=<exp>.<hmac>` cookie, HttpOnly, Secure, SameSite=Lax, 90 days. Every other route needs it. Wrong password sleeps 400 ms. Single user by design.

## Local

`node ../today.mjs serve` serves this folder with the same API against `queue.json` (no auth). `state.js` is generated there and gitignored.
