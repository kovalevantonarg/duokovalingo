# Learning Log — Interview Prep Drilling

> 1 урок = 1 вопрос из core-40-priority.md. После каждого урока — твой ответ (вслух, English) → оценка → entry в этот лог.
>
> **Spaced repetition правило**: ✅ → revisit через 7 дней, 🟡 → через 3 дня, ❌ → завтра.
> **Session format**: см. learning-system.md (read → build → recall → compress).

## Conventions

- ✅ = могу проговорить вслух уверенно за 60-90с
- 🟡 = понимаю, но формулировка шатается / забуду через неделю
- ❌ = не знал / запутался / сильные gaps

## Stats

> Do not hand-maintain this. Run `node today.mjs status` — `queue.json` is the single source of truth.
> Log an item the moment you finish it: `node today.mjs done <id> <g|y|r>`.

As of 2026-09-21: 3 green (#17, #18, attention/caching), 7 yellow (#19, #20, #21, #24, #26, #33, #34),
16 new in queue, 16 parked (JS/React — the May decision).

## What to do today

`node today.mjs` — prints 2 revisits + 1 new item + the open ship task. No choosing.

---

## Sessions

### 2026-09-06 — Sessions 6-7: scout slice 3 (caching) + exam tickets

**Slice 3 shipped**: prompt caching. Breakpoint moves to the end of the conversation each step, static one on system+tools. Fresh input per step collapsed ~19000 -> 2.

Clean run: new 718, cache write 19077, cache read 28742, out 2492.
**$0.12199 without caching -> $0.07980 with = 1.53x**, measured within one run.

Methodology point he now owns: comparing across runs of a non-deterministic agent measures the route, not the optimisation. The with/without computation on the same run is the valid A/B — he built it accidentally by writing `report()`.

Money now: cache writes 60%, output 31%, reads 7%, new 2%. Caching fixed re-sending; it cannot fix dumping 20k-char raw pages. That is slice 4 (Haiku distills pages before Sonnet sees them — patch given, not yet run).

Also fixed: maxRetries 5 + timeout after a connection timeout killed a run; usage report moved to `process.on('exit')` so a crashed run still reports cost.

**Conceptual breakthrough — attention.** He asked how caching actually works and pushed back on tactical answers ("будто часть чего-то рассказал, но не концептуально"). Taught Q/K/V properly. He came back with it correct and unprompted: "Q — это квери, сравнивает отношение к каждому из KV (которые постоянны), а квери каждый раз новое." **✅**

From that he derived the output-is-3-5x-more-expensive fact from mechanism rather than memory: prompt K/V computed in one parallel pass, output needs one full pass per token. #17 and #18 -> ✅.

**Built `exam-tickets.html`** — 10 tickets, 3 questions each, RU/EN toggle, textarea for written answers, timer, red "where people fail" block per ticket. Went through three revisions on his feedback: (1) speaking aloud is impractical daily -> typing in English is now the default mode, speaking 1-2x/week; (2) needed both languages — EN is not a translation but the spoken interview script; (3) **reference answers rewritten from bullet lists into connected prose** — his objection was right, lists train enumeration, prose trains speech.

**Status**: #17 ✅, #18 ✅, #19 🟡, #20 🟡, #21 🟡, #24 🟡, #26 🟡, #33 🟡, #34 🟡, attention/caching ✅ (beyond Core-40).

**Next**: run slice 4, then draw tickets 3, 5, 7 cold.

---

### 2026-08-25 — Session 5: scout slice 2 — tool use (#21, #33, #34)

**Shipped**: agent loop with a custom `fetch_url` tool. Model returns intent -> Anton's code executes -> tool_result appended -> loop. MAX_STEPS cap, errors returned as tool_result strings instead of thrown.

**Run (Resend), 5 steps, 6 pages fetched**:
```
[step 1] in    712  out  129  tool_use
[step 2] in 10589  out  136  tool_use
[step 3] in 18175  out  165  tool_use
[step 4] in 19054  out  199  tool_use
[step 5] in 20714  out 2048  max_tokens
total: in 69244  out 2677  $0.16526
```

**The two numbers that teach everything**:
1. Input grew 712 -> 20714 (29x). Final context ~20.7k unique tokens, but 69.2k were sent — **the same pages paid for ~3.3x** because every step resends the whole conversation. Statelessness, felt.
2. **Cost structure inverted.** Slice 1: output = 99% of the bill. Slice 2: input = 84%. Same lesson both times — measure, don't assume; architecture decides where the money is.

Cost 10x vs slice 1 ($0.017 -> $0.165). 1000 dossiers: $10 -> $165.

**Quality**: night and day. Founders now THREE, sourced from /about (Zeno Rocha, Bu Kinoshita, Jonni Lundy) — slice 1 gave one and invented his employer. 13 real open roles with exact titles + locations + source URLs. Funding, acquisitions (Mergent Apr 2025, Briefer Aug 2025), 3M users, YC W23 — all sourced.

**Notable**: his agent returned `Backend Engineer (MTA), Trust & Safety` where my earlier manual web research said `Core Sending`. His tooling is now fresher than the notes I handed him. Also surfaced 2x Recruiter roles = they are scaling hiring.

**Limitation found**: `resend.com/careers/product-engineer` -> 63 chars, `jobs.ashbyhq.com/resend` -> 58 chars. Client-rendered SPAs; regex HTML stripping can't run JS. Seed for a later slice (headless browser or Ashby API).

**max_tokens truncation, third occurrence** — step 5 stopped at exactly 2048, final answer cut mid-word. Still no alarm on `output_tokens === max_tokens`. Add it.

**Core-40 closed by building**: #21 (tool use loop — model returns intent, code executes), #33 (tool description IS the prompt), #34 (stopping criteria: MAX_STEPS + stop_reason). Plus #18 and #24 reinforced hard.

**Next**: cost. Anton now feels why the mitigation ladder exists — prompt caching + not resending full page text.

---

### 2026-08-25 — Session 4: FIRST WORKING BUILD (scout, slice 1)

Format changed: **build-first, material after.** Reading-first failed twice (lesson-01 Part 2 never reached, twice). Now: paste runnable code -> run -> break it -> explanation attaches to code he touched. Anton's words: "заебало просто читать", "чтобы я не просто учился, а была польза".

**Project**: `scout` — company name in, interview dossier out. New repo at `~/Code/scout`, separate from ai-journey-90-days. Chosen over alternatives because he needs dossiers for THIS WEEK's applications.

**Shipped**: working script, raw @anthropic-ai/sdk, claude-sonnet-5, token + cost accounting printed per run.

**Debugging he worked through (all real, all valuable)**:
1. ERR_MODULE_NOT_FOUND — file never created. Lesson: first line of the stack names the answer.
2. 401 — stale `ANTHROPIC_API_KEY` exported in shell profile; dotenv does NOT override existing env vars. Fixed with `dotenv.config({ override: true })`. Lesson: explicit project state beats ambient environment.
3. 400 `temperature is deprecated for this model` — **temperature is deprecated on Claude 4.7+/5, only the default is accepted.** Broke lesson-02's temperature material for this model family. Replacement knob is `effort` (low/medium/high/xhigh/max).

**First run numbers (Resend)**: input 110, output 1005, cost $0.01027.
- Output = **97.9% of cost**. 9x the tokens, 46x the money. #17/#24 made physical.
- Output 1005 against max_tokens 1024 — nearly clipped.

**The key observation**: with the "write UNKNOWN, never guess" rule, the model marked founders and open roles UNKNOWN — honest but useless. Anton already knows the founder is Zeno Rocha (found via web earlier same session). So: honest-but-useless vs useful-but-false, and neither is acceptable. **That is the motivation for retrieval, owned from his own terminal instead of asserted by me.**

**Core-40 touched by building**: #17 (tokens), #18 (max_tokens as reservation), #19 (temperature — and its deprecation), #20 (system/user boundary), #24 (token economics), #26 (model selection).

**Next**: experiment 5 (remove the UNKNOWN rule, watch it invent) -> then slice 2, tool use + real sources.

---

### 2026-08-11 — Session 3: Tokens re-drill + Temperature/top_p + System vs User (#17, #19, #20)

Folder cleaned same day (45 entries -> 12 live files). Deck built: `core-40-deck.html` — all 40 questions, short answers, pointer to the deep write-up per card.

**Re-drill of #17 (tokens), cold**: **6/10**, up from 3/10 in July.
- Both May/July repeat errors are GONE: said "минимальный кусок текста" not "symbol", and "читает **и** создаёт" not output-only. Also said 4 **символа** (characters), not words — the chars-vs-words confusion that survived three months is fixed.
- Bonus: framed the non-English penalty as "1-2 characters per token" rather than the 2-4x multiplier. Same fact, cleaner mechanics.
- Gap: named zero of the three consequences unprompted. Second attempt gave "compute, cost, performance" — cost exact, performance ~ latency but vague, **compute is the cause not a consequence**, and **context budget missing entirely** (the bridge to #18).
- Coaching note: the second answer was a polished slogan ("the fundamental unit of compute, cost and performance in AI systems"). Flagged that fluent phrasing raises interviewer expectations the follow-up then collapses. Plain + mechanical beats polished + hollow.

**Pre-test #19 (temperature/top_p)**: **0/10** — "have no idea". Honest. Expected; frontend never touches sampling params.

**Pre-test #20 (system vs user prompt)**: **3/10** — got "under the hood" + "what the user writes". Missed role/rules/constraints framing, and did not touch the security half of the question at all.

**Material**: `lesson-02-sampling-prompts.md` — sampling's position in the pipeline, temperature mechanics (logits/T), near-determinism at temp 0 (float non-associativity + batching), nucleus sampling vs top_k, production temperature table, instruction hierarchy, and the senior point: **the system prompt is a trained prior, not a security boundary.**

**Status**: #17 🟡 (close to ✅ — needs the three consequences automatic), #18 🟡, #19 ❌, #20 ❌.

**Open loop**:
- [ ] lesson-01 Parts 2-4: `experiments/day-18-tokens/`, 7 recall questions, 2 cards
- [ ] lesson-02 Part 2: `experiments/day-19-sampling/` — temperature diversity measurement + the injection/delimiter experiment
- [ ] lesson-02 Part 3: 8 recall questions out loud

**Decision**: skip #1-16 (JS/TS + React) as full lessons — 10 years of frontend, opportunity cost too high. Rapid-fire spot-check instead, later.

**Next revisit**: #19/#20 -> 3 days after Part 3 scores land.

---

### 2026-08-11 — Gap entry (no session)

Not a drill. Logged so the record stays honest.

**24 days, zero sessions.** Last activity in this folder: 2026-07-29 (follow-list). Drill block planned for Jul 20 – Aug 7 did not run. concepts.md still holds two placeholder cards. Stats below are unchanged since 2026-07-18 — that's the whole point of writing this down.

**Second occurrence of the same pattern**: May → July was 58 days, July → August is 24. Shorter, which is real progress, but the mechanism is identical — drilling with no external event on the calendar stops within about two weeks.

**Structural fix, not a motivational one** (see plan re-anchor 2026-08-11): applications go out FIRST, drilling resumes around them. Do not schedule another prep-then-apply block; it has now failed twice.

**Next**: lesson-01 Parts 2–4 during the week of 17 Aug, after the first three applications are sent.

---

### 2026-07-18 — Session 2: Tokens + Context window (#17, #18) — RE-DRILL after 2-month gap

**Context**: items were due 2026-05-21, revisited 58 days late. Restart session.

**Cold recall (no notes)**:
- Q1 "What is a token?" → **3/10**. Got: cost dimension, "more tokens = more money". Wrong: "token is a symbol generated by LLM" — RU false friend (символ ≠ symbol), and framed as output-only. Missing: BPE / subword unit, the 4-chars ≈ 0.75-word numbers, input-side tokenization, output 3-5x cost asymmetry, latency, context budget, Cyrillic 2-4x penalty.
- Q2 "Near the context limit — what happens?" → **4/10**. Got: summarization as a mitigation (correct, one rung of five). Missing: the mechanical answer — error thrown upfront before generation, not truncation. Also missing `max_tokens` accounting trap, sliding window, RAG, prompt caching, lost-in-the-middle.

**Repeat-offender errors from May** (same mistakes, second time):
1. chars vs words confusion in the token ratio
2. "what happens at the limit" — still not "upfront error"
Both are now explicitly called out in lesson-01. Watch for a third occurrence.

**Material**: `lesson-01-tokens-context.md` written (English, deeper than answers-llm.md §17-18).

**Status**: 🟡 / 🟡 — unchanged pending Part 2 (build) + Part 3 (recall).

**Open loop — to close this session**:
- [ ] Part 2: `experiments/day-18-tokens/` — tokenizer script, predict-then-measure on EN / RU / code, record RU:EN ratio
- [ ] Part 3: 7 recall questions, out loud in English, scored
- [ ] Part 4: write both cards in `concepts.md` in own words

**Next revisit**: 3 days after Part 3 scores land.

---

### 2026-05-18 — Session 1: Tokens + Context window (#17, #18)

**Format**: 5-phase lesson (pre-test → lesson → compression → quiz → log).
Topic chosen by skipping JS/React blocks — Anton has 10y on those, opportunity cost too high.

**Pre-test (4/10)**: Got "unit of consumption" direction. MCP-tools-in-context as real example. Missed: how token is formed (BPE), why Cyrillic ≈ 2-4x cost, what "lives" in context window besides user message.

**Quiz scores (4 questions)**:
- Q1 (stuffing handbook): 4/10 — lost-in-the-middle named but mechanism flipped (модель якобы выдаёт из начала/конца, а не теряет середину). Conflated RAG with chunk overlap. Cost & latency dimensions missing.
- Q2 (3x cost surge debug): 3/10 — "порядок — хз" was the killer. Cyrillic guess too specific as first hypothesis. Missed model selection (Opus→Sonnet→Haiku is biggest lever), output verbosity, prompt caching.
- Q3 (close to limit + max_tokens): 5/10 — got "error" но не "upfront before generation". Wrong error name. Missed defensive `max_tokens` strategy.
- Q4 (RU vs EN localization): 4/10 — confused chars vs words (1 token ≈ 4 chars OR 0.75 word, NOT 4 words). Cost stated as 2x (low end of 2-4x range). Fabricated "auto-translate under the hood" mechanism — Anthropic does not auto-translate.

**Status**: 🟡 shaky for both #17 and #18 — directional grasp, mechanical confusion.

**Next revisit**: 2026-05-21 (3 days). → MISSED, done 2026-07-18.

**Mock-interviewer aggregate score**: 4/10 average.

---

## Format per entry

```
### #N — Title (YYYY-MM-DD)
**Status**: ✅ / 🟡 / ❌
**My answer (gist, 1-3 предложения как ты сформулировал)**:
**Gaps / что я не сказал / неточность**:
**Next revisit**: YYYY-MM-DD
**Mock-interviewer score (0-10)**:
```

Last updated: 2026-09-06
