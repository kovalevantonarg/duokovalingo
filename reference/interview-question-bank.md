# Interview Question Bank — AI Startup Frontend → AI Engineer

> Что РЕАЛЬНО спрашивают на интервью в AI-стартапы для product/frontend/founding engineer ролей. Не leetcode-list, а то что попадает в практику.

## Как пользоваться

1. Прогони сначала "self-assessment" — отметь честно, где плаваешь.
2. По слабым секциям прогони активно: не перечитывай, **проговаривай вслух** ответ, пока не звучит уверенно.
3. Coding exercises — реально пиши код в редакторе, не просто читай.
4. Mock-interview сам себя: читай вопрос, говори ответ под таймер.

## Study Plan (2 недели до первого interview rep)

| День | 30 мин до build | Что |
|------|------|------|
| Mon | JS/TS deep | Closures, async, types |
| Tue | React deep | Hooks, RSC, Suspense, perf |
| Wed | LLM engineering | Streaming, function calling, structured output |
| Thu | RAG | Embeddings, chunking, retrieval |
| Fri | Coding rep | Build streaming chat UI from scratch |
| Sat | System design | Drill 2 system design problems |
| Sun | Behavioral | Refine 3 STAR stories вслух |

Неделя 2 — не повтор, а то, чего нет в неделе 1:

| День | 30 мин до build | Что |
|------|------|------|
| Mon | Agents & tool use | Loop, stopping criteria, HITL, injection через tool output |
| Tue | Evals & quality | Golden set, LLM-as-judge, regression в CI |
| Wed | Browser & web platform | Rendering pipeline, Core Web Vitals, a11y стриминга |
| Thu | LLM engineering #2 | Fine-tuning vs RAG vs prompting, cost levers |
| Fri | Coding rep | Tool-use агент с нуля |
| Sat | System design | 2 новые задачи (не те, что в неделе 1) |
| Sun | Behavioral | Конфликт, фидбэк, слабость, «почему сейчас» |

Agents и Evals — именно то, где middle отличается от senior, поэтому им отдельные дни, а не «если останется время».

---

## 1. JavaScript / TypeScript Fundamentals

> Это будут проверять **обязательно**. У тебя 10 лет TS — не страшно, но базу прогнать надо.

### Questions

1. **Объясни event loop**. Microtasks vs macrotasks. Что выполнится первым: `setTimeout(0)` или `Promise.resolve().then()`?
2. **Closures** — приведи пример где closure captures variable, и пример где это бывает багом (loop + setTimeout до ES6).
3. **`this` в JS** — 4 правила. Что такое arrow function и что она делает с `this`?
4. **`var` vs `let` vs `const`** — разница в hoisting, scope, temporal dead zone.
5. **Promises**: `.then` chain vs async/await. Что вернёт `Promise.all` если один зафейлит? А `Promise.allSettled`? `Promise.race`?
6. **Async/await pitfall**: что делает `for...of` с await vs `forEach` с await?
7. **Debouncing vs throttling** — реализуй каждый. Когда что использовать.
8. **Деструктуризация** — `const { a: { b = 'default' } = {} } = obj` — что произойдёт если obj.a undefined?
9. **TypeScript: generics** — что такое `T extends U`, conditional types, infer.
10. **TS utility types**: `Partial`, `Required`, `Pick`, `Omit`, `Record`, `ReturnType`, `Awaited`. Какой что делает.
11. **`unknown` vs `any` vs `never`** — когда что.
12. **Discriminated unions** — пример (`type Result = { ok: true, data } | { ok: false, error }`). Зачем.
13. **Type narrowing**: `typeof`, `instanceof`, `in`, user-defined type guards (`is` keyword).
14. **JSON.stringify edge cases**: что произойдёт с `undefined`, функциями, циклическими ссылками, BigInt?
15. **Equality**: `==` vs `===`, `Object.is`, NaN check.

### Practice

- Реализуй `debounce(fn, ms)` и `throttle(fn, ms)` с trailing edge.
- Реализуй `Promise.all([...])` без использования Promise.all.
- Напиши type-safe API client с generic response types.

---

## 2. React Deep

> Frontend → AI значит они хотят чтобы UI у их продукта был хорошим. React deep — must.

### Questions

1. **Hooks rules** — почему нельзя в условиях, в циклах? Как React связывает hook с компонентом?
2. **`useState` lazy initialization** — когда нужно `useState(() => expensive())`?
3. **`useEffect` cleanup** — когда вызывается? Что произойдёт если не cleanup'ить subscription?
4. **`useEffect` dependencies** — что произойдёт если dependency массив пустой? отсутствует? содержит objects/arrays?
5. **`useMemo` vs `useCallback`** — когда РЕАЛЬНО нужно (не просто "for performance")?
6. **`useRef`** — три use cases: DOM ref, mutable value, previous value.
7. **`useReducer` vs `useState`** — когда что.
8. **Reconciliation** — как React решает что rerender'ить? Роль `key` в списках. Почему `key={index}` плохо.
9. **Suspense** — что это? Как работает с data fetching? Server vs client.
10. **React Server Components** — отличие от SSR? Почему их называют "zero-bundle"? Когда RSC vs Client.
11. **Streaming SSR** — как работает? Что такое selective hydration?
12. **Context** — pitfall с rerender (provider value меняется → всё дерево rerender).
13. **Controlled vs uncontrolled inputs** — пример каждого.
14. **Forwarding refs** — когда `forwardRef` нужен.
15. **Error boundaries** — что ловят, что НЕ ловят (async, event handlers).
16. **React 19 features**: Actions, useFormStatus, useActionState, use() — кратко что и зачем.

### Practice

- Напиши custom hook `useDebounceValue(value, ms)`.
- Построй `<VirtualList>` с виртуализацией (10k items rendered плавно).
- Реализуй `<Combobox>` с keyboard navigation, ARIA, accessibility.

---

## 3. Browser & Web Platform

> Спрашивают реже, но если позиция — frontend product engineer, могут.

### Questions

1. **Critical rendering path** — порядок: HTML→CSSOM→Render Tree→Layout→Paint→Composite. Что blocks render?
2. **Reflow vs repaint** — что дороже, как избежать.
3. **`will-change`, `transform: translateZ(0)`** — для чего, когда злоупотребление.
4. **Network: HTTP/1 vs HTTP/2 vs HTTP/3** — главные отличия (multiplexing, head-of-line, QUIC).
5. **CORS** — preflight когда? Какие headers критичны.
6. **Cookies vs localStorage vs sessionStorage** — разница, когда что, security implications.
7. **CSP** — что это, зачем (XSS защита).
8. **Service workers** — что такое? Use cases (offline, caching, push).
9. **Streams API** — почему важно для AI (LLM streaming responses)? Reader/writer.
10. **`fetch` vs `XMLHttpRequest`** — почему fetch не cancel'ится easily, AbortController.
11. **Web Workers** — когда стоит выносить в worker, ограничения.
12. **Performance budget** — Core Web Vitals: LCP, FID/INP, CLS. Что приемлемо.

### Practice

- Сделай fetch с AbortController + timeout.
- Implement infinite scroll с IntersectionObserver.

---

## 4. System Design (с AI компонентами)

> Это где AI-стартапы ОТЛИЧАЮТСЯ от обычного frontend интервью. Жди.

### Questions / problems

1. **Design a chat UI for an AI assistant** — streaming, история, context, error states, retry, accessibility.
2. **Design a RAG system** — упоминай: chunking strategy, embedding model, vector DB choice, retrieval, reranking, response generation.
3. **Design Cursor's autocomplete** — debouncing, partial completion, cancellation, ranking.
4. **Design a multi-tenant LLM app** — rate limiting per user, cost tracking, prompt isolation, key management.
5. **Design "chat with my docs"** — upload, parse, chunk, embed, store, retrieve, answer.
6. **Design a real-time collaboration editor** (Resend Email Editor): CRDTs vs OT, presence, conflict resolution. Реальный кейс: у Resend есть multiplayer-редактор писем, сделан на Liveblocks — прочитай их пост перед любым разговором с Resend ([resend.com/blog/multiplayer-editor](https://resend.com/blog/multiplayer-editor)).
7. **How would you cache LLM responses?** — semantic cache vs exact match. When to cache, when not.
8. **How would you implement streaming responses end-to-end?** — SSE vs WebSocket vs HTTP streaming. Backpressure.
9. **Rate limiting LLM API calls** — token bucket, leaky bucket, sliding window. Per user vs global.
10. **Cost optimization for LLM-heavy product** — caching, model routing, batch API, prompt compression.

### Framework для system design ответа

1. **Clarify** — questions about scale (DAU, RPS, latency requirements, geos)
2. **Sketch** — high-level boxes (frontend, API, LLM provider, vector DB, cache, queue)
3. **Walk through happy path** — step by step
4. **Identify bottlenecks** — где деградация при scale
5. **Discuss trade-offs** — сложность vs стоимость vs latency

### Practice

- Дай себе 30 минут — устно расскажи design "chat with PDFs". Записывай себя.

---

## 5. LLM Engineering Core

> Это **главное**. AI-стартап будет проверять умеешь ли ты реально работать с LLM.

### Questions

1. **Что такое токен?** Сколько токенов в "Hello world"? Почему важно знать.
2. **Context window** — что это, что произойдёт если превысить, как обходить (RAG, summarization).
3. **Temperature** — что меняет, когда `0`, когда `1+`. Когда top_p, когда top_k.
4. **System prompt vs user prompt** — разница в эффекте на модель.
5. **Few-shot prompting** — пример, когда работает, когда не помогает.
6. **Chain of thought** — что это, "let's think step by step", когда полезно.
7. **Structured output** — JSON mode vs function calling vs Zod schema. Когда что у Anthropic/OpenAI.
8. **Function calling / tool use** — как это работает на самом деле, кто исполняет функцию, и как ты строишь loop.
9. **Streaming responses** — SSE format `data: {...}\n\n`. Как parse в JS. Как UI показать частичный ответ.
10. **Token economics** — input tokens vs output tokens (output обычно в 3-5x дороже у Claude/GPT). Cost optimization tactics.
11. **Hallucinations** — что это, как минимизировать (RAG, structured output, eval, temp=0).
12. **Prompt injection** — что это, реальный пример атаки, как защититься (input validation, output guardrails, structured prompts).
13. **Anthropic vs OpenAI API** — главные отличия. Когда какой выбрать.
14. **Caching** — Anthropic prompt caching: что это, когда выигрыш, как использовать.
15. **Model selection** — Claude Opus vs Sonnet vs Haiku — когда что. Trade-off speed/cost/quality.

### Practice

- Напиши function calling loop на TypeScript: модель вызывает tool, ты возвращаешь result, она использует.
- Сделай streaming chat с SSE и показывай частичный ответ в UI.
- Build a "structured extraction" — extract `{name, email, intent}` from user message via Zod schema + Anthropic.

---

## 6. RAG (Retrieval-Augmented Generation)

> Твой проект 1 = chat-with-docs. Они **точно** спросят про RAG.

### Questions

1. **Что такое RAG, зачем** — почему не просто "положить всё в контекст"?
2. **Chunking strategies** — fixed size, semantic, sliding window. Trade-offs.
3. **Chunk size** — почему 200-500 tokens обычно? Что произойдёт если 50? 5000?
4. **Embeddings** — что такое vector embedding intuitively. Cosine similarity vs dot product vs Euclidean.
5. **Embedding models** — OpenAI text-embedding-3, Voyage AI, Cohere. Какие размерности бывают и какой trade-off у большей размерности.
6. **Vector databases** — Pinecone, Weaviate, pgvector, Chroma, Qdrant. Когда что.
7. **pgvector** — как индексируется (HNSW vs IVF). Зачем.
8. **Top-k retrieval** — типичные значения (5-10), почему не 100.
9. **Reranking** — зачем после retrieval. Cohere Rerank, Voyage Rerank. Cost vs benefit.
10. **Hybrid search** — vector + BM25 (keyword). Зачем оба.
11. **Metadata filtering** — пример use case (filter by user_id, by date).
12. **Citations** — как заставить LLM ссылаться на источник.
13. **Failure modes RAG** — bad chunks, embedding mismatch, retriever too narrow, LLM ignores context.
14. **Eval RAG** — RAGAS, faithfulness, answer relevance, context precision/recall.
15. **When NOT to use RAG** — small docs (просто в контекст), realtime data (нужен tool/agent).

### Practice

- Set up pgvector locally, embed 100 PDF chunks, run similarity search.
- Compare top-10 retrieval с reranking vs без — какие отличия.

---

## 7. Agents & Tool Use

> Твой проект 2 = research agent. Спросят.

### Questions

1. **Что такое agent в LLM-смысле?** Минимальное определение: LLM в loop, который может вызывать tools.
2. **ReAct pattern** — что значит (Reasoning + Acting). Sequence: think→act→observe→think→...
3. **Tools / function calling** — формат: name, description, parameters schema. Почему description критичен.
4. **Stopping criteria** — final answer vs max iterations vs error. Как избежать infinite loop.
5. **Memory в агенте** — short-term (conversation), long-term (vector DB, summaries).
6. **Multi-agent vs single-agent** — когда multi нужен. Pitfall: complexity explosion.
7. **LangGraph vs LangChain vs vanilla** — когда что, и что заставило бы тебя сменить выбор посреди проекта. Мнение формируй своё: если компания сидит на LangChain, заученный хейт против него вредит.
8. **Agent observability** — Langfuse, Helicone, LangSmith. Что трекать (tokens, latency, tool calls, errors).
9. **Error handling в агенте** — что делать если tool вернул ошибку? Retry с другим prompt? Surface to user?
10. **Cost control** — max iterations, timeout, budget per task.
11. **Human in the loop** — когда нужно (high-stakes actions: send email, make payment, delete file).
12. **Determinism vs autonomy** — trade-off. Когда выбрать workflow (predictable steps) vs agent (LLM decides).

### Practice

- Build minimal agent от руки (без LangChain): tool definitions → loop → API call → parse → call tool → repeat.
- Implement web search agent на Anthropic + Exa API.

---

## 8. Evals & Quality

> Это где middle vs senior отличается. Уметь говорить про evals — отличает product engineer от "просто LLM-фана".

### Questions

1. **Зачем нужны evals?** — без них любое изменение prompt'а это lottery.
2. **Типы evals**: deterministic (regex, schema), LLM-as-judge, human eval, A/B test.
3. **Golden dataset** — что это, как собирать (real user data, anonymize, label).
4. **Regression testing** — как делать для prompt changes.
5. **LLM-as-judge** — pitfalls (bias, sycophancy, prompt leak). Когда работает.
6. **Metrics**: accuracy, faithfulness, relevance, toxicity, latency, cost. Какая для какой задачи.
7. **Eval frameworks** — Braintrust, Promptfoo, OpenAI evals, custom. Trade-offs.
8. **Continuous eval** — production logs → labeling → eval set update.
9. **Eval before vs after deploy** — pre-prod gate vs prod monitoring.

### Practice

- Возьми один из своих RAG прототипов — собери 10 question/answer pairs, прогони eval suite.

---

## 9. Coding Exercises (типичные форматы)

### Take-home (typical 4-12 hours)

- **"Build a chat with docs"** — most common AI startup take-home. Spec обычно: upload PDF, chat, citations.
- **"Build an agent for X"** — given a goal (e.g., research a topic), build minimal agent with 2-3 tools.
- **"Build a streaming chat UI"** — with editing, retry, branch conversations.
- **"Add an AI feature to existing app"** — they give you their codebase, you add e.g., autocomplete or summarization.

### Pair programming (45-60 min)

- **Implement debounced search** with AbortController.
- **Build a streaming chat component** — SSE consumer, partial state.
- **Refactor this React component** for performance.
- **Implement a tool-use loop** in TypeScript (mock LLM API given).

### System design coding (live, 60 min)

- Whiteboard architecture, then implement core piece (e.g., the streaming endpoint, or the agent loop).

### Frontend live coding

- "Build a Combobox component without a library" — keyboard nav, async loading, ARIA.
- "Implement a simple Kanban board with drag-drop".

### Tips для take-home

- Read spec **twice**. Clarify ambiguous parts in writing before starting.
- **First 30 min — sketch architecture** in README, no code. Then code.
- Time-box: 50% build, 25% tests, 25% README + polish.
- README: explain decisions, trade-offs, what you'd do differently.
- **Demo video (3 min Loom)** — часто впечатляет больше, чем код.
- Don't over-engineer. **"a v0, not a v1"** — формулировка из принципа «Keep shipping» на [resend.com/about](https://resend.com/about).

---

## 10. Behavioral

### Questions you'll get

1. **Tell me about yourself** (60-90 sec)
2. **Why pivot from frontend to AI?**
3. **Why our company specifically?** — must have specific answer (not "I love AI")
4. **Tell me about a hard project** — STAR
5. **Tell me about a time something went wrong**
6. **Tell me about a time you disagreed with someone**
7. **What's a feature in our product you'd improve?** — must have real answer
8. **Where do you see yourself in 2 years?**
9. **What questions do you have for us?** — see section 11

### Pivot story (specific to твоя ситуация)

Не: "I think AI is the future"
А: "After 10 years of frontend, I noticed I was solving the same UX problems repeatedly. Last year I started building LLM apps as side projects — first a [X], then [Y]. The product surface area of AI engineering is fundamentally new — streaming UIs, agentic flows, eval harnesses. My frontend skills transfer 100%, but I get to apply them to problems that didn't exist 18 months ago. That's why I'm doing 90 days in public — three projects, all on my site."

→ Refine эту версию своими словами, потом отрепетируй вслух 5 раз.

### STAR stories — подготовь 3

1. **Technical depth**: hardest frontend problem (например performance, complex state, или migration)
2. **Pivot proof**: какой AI-проект ты ship'нул и что узнал
3. **Failure/learning**: что-то пошло не так, что вынес

Каждая: **60-90 секунд устно**, не больше.

---

## 11. Reverse questions (что спрашивать ТЫ)

> 99% кандидатов спрашивают плохо ("what's a typical day"). Хорошие вопросы → +1 уровень в их глазах.

### Хорошие вопросы

1. **"What's the hardest engineering problem the team is wrestling with right now?"** — показывает что ты думаешь как контрибьютор
2. **"How do you measure quality of LLM features in production?"** — показывает что ты понимаешь evals
3. **"What does a product engineer ship in their first month here?"** — конкретика, не abstraction
4. **"How do you decide between using a framework like LangChain vs building from scratch?"** — провоцирует discussion на technical opinion
5. **"What's a recent decision the team made that you disagreed with, but went along with?"** — psychological safety probe
6. **"How does the team think about AI feature reliability vs shipping speed?"** — показывает sensitivity к их trade-offs
7. **"What's the cultural difference between this company and your previous places?"** — личный insight

### Плохие вопросы (избегать)

- "What's the company culture like?" → too generic
- "What are the benefits?" → ask recruiter, not interviewer
- "Do you do code reviews?" → table stakes, ничего не показывает
- "How fast can I be promoted?" → ego signal

---

## Self-assessment checklist

Прогони перед каждой неделей study. Где **не уверен на 8/10** — туда study time на этой неделе.

### JS/TS
- [ ] Event loop / microtasks (8/10)
- [ ] Closures
- [ ] this binding / arrow functions
- [ ] Promises chain
- [ ] async/await pitfalls
- [ ] TS generics
- [ ] TS utility types
- [ ] Discriminated unions

### React
- [ ] Hooks rules + lifecycle
- [ ] useEffect cleanup
- [ ] useMemo vs useCallback
- [ ] Reconciliation + keys
- [ ] Suspense
- [ ] RSC
- [ ] React 19 changes

### LLM
- [ ] Token / context window
- [ ] Temperature, top_p
- [ ] Function calling loop
- [ ] Streaming SSE
- [ ] Cost optimization

### RAG
- [ ] Chunking strategies
- [ ] Embeddings basics
- [ ] Top-k + reranking
- [ ] Hybrid search
- [ ] RAG failure modes

### Agents
- [ ] ReAct pattern
- [ ] Tool definition format
- [ ] Stopping criteria
- [ ] Memory types

### System design
- [ ] Chat UI design
- [ ] RAG system design
- [ ] Streaming end-to-end
- [ ] Rate limiting + caching LLM

### Behavioral
- [ ] "Tell me about yourself" (60 sec, English, отрепетировано)
- [ ] Pivot story
- [ ] 3 STAR stories
- [ ] Reverse questions ready

---

Last updated: 2026-05-08
