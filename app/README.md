# duokovalingo — deploy notes

Static SPA + one Vercel function (`api/[route].js`). No build step, no npm deps.

## Detailed lessons

`study.html#t1` opens the Russian lesson for ticket 1; all 50 tickets have one.
Edit `lessons-content.md`, then run `node build-lessons.mjs` to regenerate the
committed `lessons.js`. No runtime Markdown library or deployment build is needed.
`node build-lessons.mjs --check` verifies coverage, required sections and freshness.
Interview references remain bilingual in `tickets.js`; lessons are in Russian.

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
