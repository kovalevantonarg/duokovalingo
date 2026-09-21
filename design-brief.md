# Design brief for Claude Design — "drill"

Paste everything below this line into Claude Design as the prompt. Attach `drill-home.png` and `drill-modes.png` from the chat as "current state, ugly on purpose, structure is right".

---

## What you are designing

**drill** is a single-user interview-prep game for a senior frontend engineer moving into AI engineering. It replaces "read a plain-text answer, type your own in a blank box" with short interactive rounds over the same material: 27 exam tickets, 42 topics (LLM engineering, RAG, agents, system design, behavioral). Runs as one HTML file with vanilla JS, served from `localhost`, opened on a MacBook and on an iPhone. Dark UI first; a light theme is optional.

The user is technical, impatient, and allergic to anything that looks like a kids' app. He wants it to feel like a well-made tool that happens to be satisfying to use — not like Duolingo's mascot, but like Duolingo's feedback loop: instant, physical, unambiguous, and over in five minutes.

## The design problem, in one sentence

Make the loop *see → answer → feedback → next* feel good enough that he starts it on a bad day, and make progress visible enough that stopping feels like leaving something unfinished.

## Screens (design all of them, mobile 390px and desktop ~900px)

1. **Home**
   - Header: wordmark `drill · core-40`, streak (🔥 12), XP today, sound toggle, RU/EN switch.
   - **Today** card: 2 items to revisit + 1 new item. Each row: status swatch, `#21 Function calling / tool use loop`, subline `revisit · 24d overdue`, and a row of mode chips: 🎤 Voice · ⚡ T/F · ✍ Gap · ⇅ Order · 📄 Ticket. Plus one "ship" row (a build task, no modes).
   - **Quick round · 5 min** — the single primary CTA on the page. Subline: "True/false and gaps over what's due today. No choosing, no typing essays."
   - Offline banner (only when the local server isn't running): amber, one line, with a code snippet.
   - **The wall**: 42 small cells grouped by section (LLM 10, RAG 5, Agents 3, System design 3, Behavioral 3, Depth 1, Meta 1, JS/TS 8 parked, React 8 parked). Cell states: green (said it cold), yellow (shaky), red (missed), new (dashed outline), parked (hatched, dim). A small dot = overdue for revisit. Cells are tappable. Currently: 3 green, 7 yellow, 16 new, 16 parked — design for that ratio and for a future 26/26 green.
   - **Sessions**: 12-week contribution heat map, Mon→Sun rows, today outlined. Sparse: 4 sessions in 16 weeks. The gaps are information, not shame — do not moralize visually.

2. **True / false** (10 statements, ~60 s)
   - Progress bar `3/10`, combo indicator `×4` that appears from the second hit.
   - Topic tag (`SAMPLING: TEMPERATURE AND TOP_P`), then the statement in large type: *"temperature = 0 guarantees the same answer for the same request."*
   - Two big buttons: `← False` / `True →` (also keyboard arrows). Full-width on mobile, side by side.
   - **After answering**: a verdict block — `Correct · False — "temp 0 = deterministic" and "higher temperature = more creative". The first is wrong because of float and batching; the second, on a factual task, produces errors, not creativity.` Then buttons: `Next →` (primary), `More` (expands the relevant reference paragraph, ~100 words of prose), `Explain differently` (calls an LLM, shows a fresh 4–7 sentence explanation; has a loading state "thinking…" and a "· cache" tag when repeated), and a small link `Ticket 4 →`.
   - Hit / miss feedback must be felt without reading: a short color pulse on the card (green / red), a tiny shake on miss, sound optional. No confetti.

3. **Fill the gap** (3–5 sentences)
   - Sentence with inline input(s) replacing a key term: *"Output costs [ 3-5 ] times more per token because every output token is a separate [ forward pass ] through the model."* Input width scales with the answer. Enter checks. Wrong → input turns red and is replaced by the correct value; right → green. Same verdict block as T/F below.

4. **Order the steps** (one mechanism, 4–8 cards)
   - Prompt: *"The tool-use loop, request to answer."* Shuffled cards with a position number, tap-to-select then tap-to-place, plus ↑ ↓ buttons and drag. `Check` marks each card green/red in place; `Again` reshuffles nothing, just clears marks; `Next →` on success.

5. **Voice interview** (3 questions, then reveal)
   - Question `1/3` in large type. Buttons: `🔊 Ask out loud` (browser TTS reads it), `🎤 Speak` (primary), `Stop`. A timer that turns red after 90 s. A live transcript box with a blinking red dot while recording and grey interim words.
   - **Reveal**: for each question — the user's transcript, then "How it sounds spoken" (the reference answer, ~100 words), then a red-accented "Where people fail" note. Then self-score, three big buttons: `✓ Said it cold` / `~ Shaky` / `✗ Couldn't`. This is the only screen that changes a wall cell's colour — give it weight.

6. **Round result**
   - Big score `8/10`, one-line verdict ("Clean." / "Good." / "Fine. The misses are tomorrow's material."), `+11 XP`, `Again` / `Home`. Should feel like a landing, not a modal.

7. **Item detail** (tap a wall cell): status, last drilled, due date, the same mode chips.

## Content reality (design with this, not lorem ipsum)

- Statements are 8–28 words, sometimes with code-ish tokens: `stop_reason`, `tool_result`, `max_tokens`, `text/event-stream`. Mixed Cyrillic and Latin in RU mode. Mono or a humanist sans with a good mono for tokens — your call, but Cyrillic must look native, not fallback.
- Reference paragraphs are 60–130 words of first-person prose. They must be pleasant to read at 15–16px on a phone.
- Numbers matter and should be legible at a glance: 24d overdue, 3/26, ×4, +11 XP.

## Design direction

- **Restraint with one loud thing.** The page is quiet; the feedback moment is loud. Think Linear / Vercel / Raycast levels of chrome, with one physical, saturated moment per answer.
- **Momentum you can see.** Streak, XP, the wall filling up, the heat map gaining a square today. These are the retention mechanics; make them prominent on Home and visible (small) inside a round.
- **Zero decisions on Home.** The Quick round button is the exit for a bad day; today's three items are the exit for a normal day. Nothing else competes.
- **Motion spec, please**: card pulse on answer (~350 ms), combo counter pop, wall cell colour change, progress bar fill, result screen entrance. Short, springy, never blocking input.
- **Touch**: 44px minimum targets, thumb-reachable primary actions on mobile, keyboard hints on desktop (← → Enter).
- **Colour**: status colours are semantic and fixed — good green, warning amber, critical red, plus a neutral for "new" and a dim hatched "parked". They never double as decoration. Icon or glyph accompanies colour everywhere (✓ ~ ✗).
- **Both themes** if you do a light one: design it, don't invert it.

## What to avoid

Mascots, badges, trophies, confetti, "Great job!" copy, gradients as decoration, rounded-everything, cards inside cards inside cards, more than one primary button per screen, tiny grey text for anything the user must read under time pressure.

## Deliverables

- Artboards for all 7 screens, mobile and desktop, dark (+ light if you go there). Include the T/F screen in both states (before answer, after answer with `More` expanded).
- Design tokens: colour (incl. the five status colours), type scale, spacing, radii, shadows, motion durations/easings.
- A component sheet: header, item row, mode chip, wall cell (all states), heat-map cell, big answer button, verdict block, cloze input (3 states), step card (4 states), transcript box, score buttons, result card, banner.
- Notes on how each screen adapts from 390 to 900.

The current implementation's structure (which screens exist, what's on them) is correct and will stay; you are replacing the look, the rhythm and the feedback, not the information architecture.
