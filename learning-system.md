# Learning System — how every drill session runs

> The goal: learn → do it yourself → remember. Not "read and forget".
> This file is the protocol. Open a Claude session, say **"drill"**, and point it here. Any session can run it — the state lives in learning-log.md, not in chat history.

## The three laws

1. **Recall beats re-reading.** You remember what you retrieve from your own head, not what you re-read. Every session starts by pulling old items OUT of memory before putting new ones in.
2. **Doing beats watching.** Every concept gets a tiny hands-on exercise (write 10 lines of code, sketch the flow, debug a snippet). If you only talked about it, you don't have it.
3. **Out loud beats in your head.** Every answer is spoken in English, 60–90 seconds, as if the interviewer is listening. If you can't say it, you don't know it — and the interview is a speaking exam anyway.

## Session protocol (fits in one 1.5 hr slot)

**Phase 0 — Revisit queue (10–15 min).**
Claude reads learning-log.md, takes today's due items (✅ → due in 7 days, 🟡 → 3 days, ❌ → next day) and quizzes you cold. No peeking at answer files. Re-score each item.

**Phase 1 — Pre-test (5 min).**
New item from the triaged Core-40 queue. Before any teaching, Claude asks you the question raw. Score 0–10. This tells both of you the real starting point — and pre-testing itself boosts retention.

**Phase 2 — Lesson, as a written file (20–25 min).**
Claude writes the material to `lesson-NN-topic.md` in this folder and you READ it — mechanism, not trivia, jargon defined inline. A file, not a chat message: you can re-read it, it survives the session, and it holds the build spec + recall questions in one place. Chat is for your questions while reading — interruptions are the good part.

**Phase 3 — Do it yourself (20–25 min).**
A small exercise you complete without Claude writing the code for you:
- JS/TS/LLM items → write or fix a small snippet, predict output before running
- RAG/agents items → sketch the pipeline, then implement one piece
- System design → talk through the design out loud, Claude plays skeptical interviewer
This is the "делать самостоятельно" part. Claude reviews after, not during.

**Phase 4 — Compression (5 min).**
You write the concept as **one flashcard line** in your own words into concepts.md (Q on one line, A on the next). Your words, not Claude's — that's what sticks.

**Phase 4b — Optional, for mechanism topics (5 min).**
Two aids, both optional, both only when the topic is a *mechanism* (agent loop, Q/K/V, RAG pipeline, SSE stream, event loop) rather than a fact:
- **Redraw the diagram from memory.** The lesson file carries a diagram of the mechanism. Close it, draw the same thing on paper in 90 seconds, then compare. Drawing from memory is retrieval practice for spatial knowledge; re-looking at the picture is not.
- **One Mermaid block in `concepts.md`.** The new item plus two arrows to items you already hold (`A --> B : why`). Three minutes. Links you drew yourself stick; links written for you don't.
Skip both on a bad day without guilt. Facts and behavioral items don't get diagrams.

**Phase 5 — Out-loud answer + log (10 min).**
Answer the original interview question out loud in English, 60–90 sec, timed. Claude scores 0–10 (content + clarity), fixes at most 2–3 phrasings (not every mistake), writes the log entry with status and next-revisit date.

## Friday variant — mock interview day

No new items. Claude plays an interviewer from one of your target companies (uses interview-question-bank.md + the company's real stack): 3–4 questions, all out loud in English, scored, logged. Once real interviews start, Fridays switch to prepping the nearest actual interview.

## Files (all in this folder)

- `lesson-NN-topic.md` — one per drilled topic: material to read, build spec, recall questions, your compression
- `queue.json` + `today.mjs` — the dispatcher: `node today.mjs` prints today's 2 revisits + 1 new + ship task; `done <id> g|y|r` logs it; `progress.html` is the picture
- `exam-tickets.html` — 27 tickets covering all 42 queue items, RU/EN, reference answers as spoken prose, "where people fail" per ticket. Opens straight from a wall cell in progress.html
- `core-40-priority.md` — the master list (triage now lives in queue.json: #1–16 parked)
- `learning-log.md` — session log, stats, revisit queue. **Single source of truth for progress.**
- `concepts.md` — your flashcard deck, one line per concept, your own words
- `answers-*.md` — reference answers (7 files, already written) — for reading AFTER a failed recall, not before
- `english-pack.md` — self-intro, stories, phrase bank

## Rules that keep it honest

- Bad day → run Phase 0 only (15 min revisits) and log it. Still counts. Zero is the failure mode, not minimum.
- Answer files are closed until you've tried recalling. Reading first = comfortable illusion of knowledge.
- If an item scores ✅ twice in a row on revisits → retired (still in concepts.md for pre-interview skim).
- Claude must ask for your 1–3 self-rating before scheduling anything new, and roughly 2x any time estimate (recall, not refresh — proven in May).
- English corrections: max 2–3 per session, only ones worth learning. Fluency grows from volume, not from being corrected into silence.

Last updated: 2026-09-21 — added dispatcher, progress.html, full ticket set, optional Phase 4b
