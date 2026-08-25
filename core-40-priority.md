# Core 40 — Priority Study List

> Из 150+ вопросов в interview-question-bank.md выделил 40 must-know. Это вопросы, которые приходят на КАЖДОМ интервью в AI-стартап на product/frontend/founding engineer роль.
>
> Если знаешь эти 40 уверенно — на 80% базовых вопросов отвечаешь без проблем. Остальные 20% — специфика конкретной компании, дочитываешь перед каждым раундом отдельно.

## Как пользоваться

1. Прогони список, отметь честно: ✅ знаю / 🟡 шатко / ❌ не знаю
2. ❌ → study FIRST. 🟡 → review.
3. После study каждого пункта — **проговори ответ вслух** (на английском!) под таймер 60-90 секунд
4. Если не можешь сформулировать вслух — значит не знаешь

---

## 🟦 JS/TS Fundamentals (8)

### Must-know

- [ ] **#1 Event loop** — что выполнится первым: `setTimeout(0)` или `Promise.resolve().then()`? Microtasks vs macrotasks. *(приходит в 80% JS интервью)*
- [ ] **#2 Closures** — определение + пример где это бажит (loop+setTimeout до ES6)
- [ ] **#3 Promises** — `.then` chain, `Promise.all` vs `.allSettled` vs `.race`. Что произойдёт если один `.all` зафейлит
- [ ] **#4 async/await pitfall** — `forEach` с `await` НЕ ждёт. `for...of` ждёт. Почему
- [ ] **#5 `this` binding** — 4 правила (default, implicit, explicit, new) + arrow function exception
- [ ] **#6 TS generics** — `T extends U`, `infer`, conditional types. Реализуй `Pick<T, K>` вручную
- [ ] **#7 TS utility types** — Partial, Required, Pick, Omit, Record, ReturnType, Awaited. Что что делает
- [ ] **#8 Discriminated unions** — `Result = { ok: true, data } | { ok: false, error }`. Зачем (type narrowing)

---

## ⚛️ React (8)

- [ ] **#9 Hooks rules** — почему нельзя в условиях/циклах? React tracks them by **call order**, не by name
- [ ] **#10 useEffect cleanup** — когда вызывается (unmount + перед next effect run). Что произойдёт если не cleanup'ить subscription
- [ ] **#11 useMemo vs useCallback** — useMemo memoize **value**, useCallback memoize **function**. Когда РЕАЛЬНО нужно (не "for performance" по умолчанию)
- [ ] **#12 useEffect dependencies** — пустой массив = mount only. Нет массива = every render. Object/array в deps = каждый render новая ссылка
- [ ] **#13 Reconciliation + keys** — почему `key={index}` плохо при reorder. React diff алгоритм
- [ ] **#14 Suspense** — для data fetching. Server Suspense vs client Suspense. Streaming SSR
- [ ] **#15 React Server Components** — отличие от SSR (zero bundle, run on server, can't use hooks/state). Когда RSC vs Client
- [ ] **#16 React 19 changes** — Actions, useFormStatus, useActionState, use() hook. Кратко что и зачем

---

## 🤖 LLM Engineering (10) — самое важное

- [ ] **#17 Что такое токен** — ~4 символа english, ~0.75 word. Влияет на context, cost, latency
- [ ] **#18 Context window** — что произойдёт при превышении (truncation/error). Как обходить (RAG, summarization, sliding window)
- [ ] **#19 Temperature & top_p** — temp=0 определённый, temp=1 разнообразный. top_p — nucleus sampling. Когда что
- [ ] **#20 System vs user prompt** — system задаёт role/persona/rules, user — конкретный запрос. Почему system устойчивее к injection
- [ ] **#21 Function calling / tool use** — модель **не вызывает** функцию, она возвращает JSON intent. Ты executes, returns result. Loop
- [ ] **#22 Streaming SSE** — формат `data: {...}\n\n`. Parse в JS через `ReadableStream` + decoder. Зачем (UX latency)
- [ ] **#23 Structured output** — JSON mode (OpenAI), tool use (Anthropic), Zod schema. Когда какой надёжнее
- [ ] **#24 Token economics** — output 3-5x дороже input. Cost optimization: prompt caching, model routing, batch API
- [ ] **#25 Prompt injection** — атака: "Ignore previous instructions, do X". Defense: input validation, output guardrails, structured prompts, user role isolation
- [ ] **#26 Model selection (Claude family)** — Opus самый умный, Sonnet баланс, Haiku быстрый/дешёвый. Когда что

---

## 🔍 RAG (5)

- [ ] **#27 Зачем RAG vs put in context** — context window лимит, cost, recency, relevant retrieval > full dump
- [ ] **#28 Chunking strategies** — fixed size, semantic, sliding window. Trade-offs. Типичный chunk: 200-500 tokens с 50-token overlap
- [ ] **#29 Embeddings basics** — vector representation смысла. Cosine similarity vs dot product. Размерность (1536 у OpenAI, 1024 у Voyage)
- [ ] **#30 Top-k + reranking** — k обычно 5-20. Reranker (Cohere/Voyage) после retrieval улучшает precision. Cost vs benefit
- [ ] **#31 RAG failure modes** — bad chunks, embedding mismatch, retriever miss, LLM ignore context. Eval: faithfulness, relevance

---

## 🛠 Agents & Tool Use (3)

- [ ] **#32 ReAct pattern** — Reasoning + Acting. Loop: think→act→observe→think. Минимальная агентная архитектура
- [ ] **#33 Tool definition** — name, description (КРИТИЧНО — модель решает по description), parameters JSON schema
- [ ] **#34 Stopping criteria** — final answer / max iterations / error / human-in-loop checkpoint. Cost & infinite-loop risk

---

## 🏗 System Design (3)

- [ ] **#35 Streaming chat UI** — SSE endpoint, ReadableStream consumer, partial state, retry, error UI, history
- [ ] **#36 RAG system end-to-end** — upload → parse → chunk → embed → store (pgvector) → retrieve → rerank → generate → cite
- [ ] **#37 Cost optimization for LLM-heavy product** — prompt caching, semantic cache, model routing, batch API, prompt compression

---

## 💬 Behavioral (3)

- [ ] **#38 "Tell me about yourself"** — 60-90 sec, English, отрепетировано вслух 5+ раз
- [ ] **#39 Pivot story** — почему frontend → AI. Конкретные факты (не "passion"), пруфы (твои проекты), forward-looking
- [ ] **#40 3 STAR stories** — technical depth, pivot proof, failure/learning. Каждая 60-90 sec

---

## Self-assessment

Прогони ОДИН раз честно. Запиши дату и сколько ✅:

- 2026-05-08: ___ из 40 ✅
- 2026-05-15: ___ из 40 ✅
- 2026-05-22: ___ из 40 ✅
- 2026-05-29: ___ из 40 ✅
- 2026-06-05: ___ из 40 ✅

**Цель**: к 2026-05-29 (через 3 недели) — минимум 30/40 ✅. К первой неделе active interviews (~2026-06-12) — 38/40 ✅.

---

## Что дальше

После self-assessment → читай **answers-*.md** файлы по слабым категориям:

- [answers-js-ts.md](answers-js-ts.md) — ✅ написан
- [answers-react.md](answers-react.md) — ✅ написан
- [answers-llm.md](answers-llm.md) — ✅ написан
- [answers-rag.md](answers-rag.md) — ✅ написан (2026-05-09)
- [answers-agents.md](answers-agents.md) — ✅ написан (2026-05-09)
- [answers-system-design.md](answers-system-design.md) — ✅ написан (2026-05-09)
- [answers-behavioral.md](answers-behavioral.md) — ✅ написан (2026-05-09)

Каждый файл = полные ответы с источниками + примерами кода.

**Все 7 answer-файлов готовы.** Следующий шаг: пройди self-assessment в каждом файле + drill behavioral вслух (см. answers-behavioral.md → "Practical drilling plan").

Last updated: 2026-05-09
