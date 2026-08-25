# Lesson 01 — Tokens & Context Window (Core-40 #17, #18)

> Session 2026-07-18. Pre-test scores: #17 → 3/10, #18 → 4/10.
> Order: **read → build → recall → compress.** Do not skip to Part 4. The compression only works if the material passed through your hands first.
> Reference (RU, shorter): `answers-llm.md` §#17–18. This file is the deeper English version.

---

# PART 1 — The material

## 1.1 What a token actually is

A token is a **subword unit** — a chunk of text drawn from a fixed vocabulary (roughly 50k–200k entries) that the model was trained on. Models do not see words, and they do not see characters. They see integers, each one an index into that vocabulary.

```
"Hello, world!"  →  [9906, 11, 1917, 0]          # 4 tokens
"unbelievable"   →  ["un", "believ", "able"]     # 3 tokens
"антон"          →  5+ tokens
```

**Do not call a token a "symbol."** Russian *символ* means *character*, English "symbol" does not. Saying "a token is a symbol" in an interview signals you don't know the concept. Say **"a subword unit"** or **"a chunk of text from the model's vocabulary."**

### How the vocabulary is built: BPE

BPE = **byte-pair encoding**. Start with individual characters, then repeatedly find the most frequent adjacent pair in the training corpus and merge it into a new vocabulary entry. Repeat until you hit the target vocabulary size.

The consequence that matters: **frequency determines token length.** Common English words (` the`, ` and`, ` is`) become single tokens because they appeared constantly during vocabulary construction. Rare words get split into pieces. This is why the "~4 characters" rule is an *average*, not a law — it's the statistical outcome of frequency-based merging on an English-heavy corpus.

### The numbers to memorize

**1 token ≈ 4 characters of English ≈ 0.75 of a word.**

These are the same fact in two units. Say either one, never mix them — "4 words per token" is a 5x error and it's the exact mistake you made in May. Practical inversion: **1,000 words ≈ 1,300 tokens.** 100 words ≈ 130 tokens.

### Why non-English text costs more

The vocabulary was built mostly from English text, so English got the efficient merges. Cyrillic, Chinese, Arabic, and Hindi were tokenized into much smaller pieces — often **2–4x more tokens for the same meaning.**

This is a product decision, not trivia: a Russian-language feature can cost triple its English equivalent, and it eats the context window three times faster. Bring this up in an interview when discussing internationalization and you sound like someone who has actually shipped.

Other patterns worth knowing: numbers often tokenize per-digit (so long numeric IDs are expensive), code is relatively efficient because of repeated patterns, and whitespace and punctuation are usually one token each.

## 1.2 The three consequences

Tokens are one concept with three downstream effects. Naming all three is what separates a fluent answer from a shallow one.

**Cost.** You pay per token, on both sides — input *and* output. Critically, **output tokens typically cost 3–5x more than input tokens.** The reason is mechanical: input is processed in parallel in a single forward pass, while output is generated sequentially, one token at a time, each requiring a full pass through the model. The practical consequence: the biggest cost lever is usually *making the model produce less*, not making the prompt shorter. "Answer in one sentence" saves more money than trimming your system prompt.

**Latency.** Input size drives **time-to-first-token** (the model must read everything before it starts). Output size drives **total generation time**, linearly — 500 output tokens take roughly 5x as long as 100. For UX this is why streaming matters: you can't reduce total time much, but you can make the first token arrive fast so the interface feels alive.

**Context budget.** Tokens are the currency the context window is denominated in. Everything competing for space — system prompt, conversation history, retrieved documents, tool definitions, tool results — is priced in tokens.

## 1.3 The context window

The context window is the **maximum number of tokens the model can process in one request — input plus generated output together.**

| Model | Context window |
|---|---|
| Claude Sonnet / Opus / Haiku (4.x) | 200k tokens (~150k words) |
| GPT-4o | 128k |
| Gemini 2.5 | 1M+ |

Verify current numbers before an interview — they move.

### What actually happens when you exceed it

**The API returns an error, before generation starts.** It is not graceful truncation. The model does not silently drop the oldest messages. Validation happens upfront and the request is rejected:

```json
{
  "error": {
    "type": "invalid_request_error",
    "message": "input too long: ... tokens, max ..."
  }
}
```

Remember it as: **fail fast, not silent.** This is good design — silent truncation would produce wrong answers with no signal, which is far worse than an error you can handle.

### The `max_tokens` trap

The window must fit **input + `max_tokens`**, not just input. `max_tokens` is your declared ceiling on the response, and it is reserved up front.

So: window 200k, prompt 195k, `max_tokens: 8000` → **rejected**, even though the prompt alone fits comfortably.

Defensive practice in production: count input tokens, then set

```
max_tokens = min(desired_response_length, context_window - input_tokens - safety_margin)
```

Most teams learn this by shipping a bug where long conversations fail only for the users who talk the most.

## 1.4 Lost-in-the-middle

Even when you stay inside the limit, quality is not uniform across the context. Models attend best to the **beginning and the end** of a long context and **degrade in the middle** (Liu et al., 2023).

Get the direction right — in May you flipped it. The middle is the weak zone.

Practical use: put critical instructions at the **very start** or the **very end**. Never bury the important constraint in the middle of a long document. And the strategic implication: **a large context window is not permission to dump everything in.** Retrieval usually beats stuffing even when stuffing technically fits.

## 1.5 The mitigation ladder

Cheapest and dumbest first. In an interview, walking *up* this ladder demonstrates engineering judgment — you're showing you reach for complexity only when forced.

**1. Sliding window.** Keep the last N messages, drop the rest. Free, trivial, and loses information silently. Fine for short-memory chat.

**2. Summarization.** Compress older turns into a running summary, keep recent turns verbatim. This is what most long-lived chat products actually do. *This was your answer — it was correct, it's just one rung of five.*

**3. RAG (retrieval-augmented generation).** Don't put it in context at all. Store documents, retrieve only the relevant chunks per query. The right answer whenever the corpus is larger than the window or mostly irrelevant to any single question.

**4. Hierarchical / map-reduce.** Split a long document into parts, process each independently, then combine the results. For summarizing something far larger than the window.

**5. Prompt caching.** Doesn't save context space — saves *money and latency* when a long prefix (system prompt, big document, tool definitions) repeats across requests. Cached input tokens are dramatically cheaper. Orthogonal to the other four: use it alongside them.

## 1.6 How this gets asked

- "How would you estimate the cost of this feature?" → count expected input and output tokens, apply the 3–5x output asymmetry, multiply by volume.
- "Users report the app got slow." → separate time-to-first-token (input size) from total time (output size); check whether context is growing unbounded across turns.
- "Our costs tripled last month." → check model selection first (Opus→Sonnet→Haiku is the biggest single lever), then output verbosity, then unbounded history growth, then prompt caching.
- "We're hitting the context limit." → walk the ladder, and ask what the data actually is before choosing a rung.

---

# PART 2 — Build it (~20–30 min)

Create `experiments/day-18-tokens/` in `ai-journey-90-days`. Install a tokenizer — `tiktoken` (JS or Python bindings) is the fastest to get running; `@anthropic-ai/tokenizer` or the API's token-counting endpoint also work.

Write a script that takes a string and prints **the token count and the actual token strings** (seeing the split is the point — don't just print a number).

Then run three inputs, and **write your prediction down before running each one:**

1. An English paragraph of ~100 words
2. **The same paragraph in Russian**
3. A chunk of JSON or TypeScript, ~20 lines

Record for each: predicted count, actual count, error. Then compute the **Russian/English ratio** from #1 and #2.

Prediction-before-measurement is the entire mechanism here. Being wrong is when it sticks — a number you were surprised by is remembered, a number you read is not.

**Stretch (only if time remains):** add a `budgetedMaxTokens(prompt, windowSize, safetyMargin)` function implementing the formula from §1.3. Ten lines, and it makes the trap physical instead of theoretical.

Log it in `notes/day-18.md`: Shipped / Learned / Next.

---

# PART 3 — Recall (do this cold, after the build)

Close this file. Answer **out loud, in English**, 60–90 seconds each, then bring the answers back to the session for scoring.

1. What is a token, and why does an engineer care? (Name all three consequences.)
2. Roughly how many tokens is a 1,000-word English document? And the same document in Russian?
3. You're near the context limit and you send the request. What exactly happens, and when?
4. Your prompt is 195k tokens, the window is 200k, `max_tokens` is 8000. Result? Why?
5. Costs tripled this month. Name your first four hypotheses, in order.
6. Walk the mitigation ladder from cheapest to most complex.
7. Where in a long context should critical instructions go, and why?

**7+ out of 10 on questions 1 and 3 moves both items to ✅.**

---

# PART 4 — Main idea (you write this — do not skip)

Write these in your own words in `concepts.md`, after Parts 1–3. Not copied from above. If you can't write it without looking, you haven't got it yet.

**Q:** What is a token and why does it matter?
**A:** _______________

**Q:** What happens when you exceed the context window, and what do you do about it?
**A:** _______________

**One sentence — the single thing I'll still remember in six months:**
_______________

---

Sources: [Anthropic — Token counting](https://docs.claude.com/en/docs/build-with-claude/token-counting) · [Anthropic — Models overview](https://docs.claude.com/en/docs/about-claude/models/overview) · [Anthropic — Prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) · [Lost in the Middle (Liu et al., 2023)](https://arxiv.org/abs/2307.03172) · [OpenAI tiktoken](https://github.com/openai/tiktoken)
