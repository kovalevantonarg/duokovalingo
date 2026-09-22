# Answers — System Design (с AI компонентами)

> Полные ответы на 10 проблем из interview-question-bank.md секция 4 + core-40 #35-37. Это где AI-стартапы отличаются от обычного frontend интервью. Всегда применяй framework: clarify → sketch → happy path → bottlenecks → trade-offs.

## Sources (canonical)

- **Anthropic — Streaming responses**: https://docs.claude.com/en/docs/build-with-claude/streaming
- **Vercel AI SDK — Streaming UI**: https://sdk.vercel.ai/docs/ai-sdk-ui
- **Designing Data-Intensive Applications (Kleppmann)** — book reference
- **System Design Primer**: https://github.com/donnemartin/system-design-primer
- **Cloudflare — Rate limiting strategies**: https://blog.cloudflare.com/counting-things-a-lot-of-different-things/
- **Yjs (CRDT)**: https://docs.yjs.dev/
- **Stripe — Idempotency keys**: https://stripe.com/blog/idempotency
- **High Scalability blog**: http://highscalability.com/

---

## Universal framework (use for каждый problem)

1. **Clarify** — спроси про scale (DAU, RPS), latency budget, geo, regulatory, integrations. **5 минут на это норм.**
2. **Sketch** — high-level boxes: client, API, LLM provider, vector DB, cache, queue. Arrows для flow.
3. **Happy path** — step-by-step через систему: что происходит, что возвращается.
4. **Bottlenecks** — где будет деградация: rate limits, latency tail, cost explosion, hot keys.
5. **Trade-offs** — назови 2-3 alternatives + почему ты выбрал то что выбрал.

> Anti-pattern: jumping в implementation details без shape системы. Всегда top-down.

---

## #SD1 — Design a Chat UI for an AI Assistant

### Моя позиция (сказать первым)
Я бы строил это как optimistic UI + SSE-стрим с отменой, которая доходит до сервера, а не только обрывает fetch. Если спросят «а почему не WebSocket» — SSE проще: обычный HTTP, та же авторизация и балансировщики, что у остального API (прокси только надо настроить, чтобы не буферизовали ответ), а двусторонний канал для чата не нужен: клиент шлёт POST, сервер стримит ответ. Паттерн «показать сразу, сверить с сервером потом» я делал во фронте годами; новое здесь только одно: отмена посреди стрима должна остановить и LLM-вызов, иначе платишь за токены, которые никто не прочитает.


### Clarify
- Single-user или multi-user shared chat?
- Streaming partial responses или wait full?
- History persistence (cross-session)?
- File attachments? Markdown / code / inline images в reply?
- Mobile-first?
- Latency target (TTFB на streaming start)?

### Architecture sketch

```
[Browser]
  ├─ React UI (chat list, message input, streaming renderer)
  ├─ State: useReducer({ messages, isStreaming, error, history })
  ├─ ReadableStream consumer для SSE
  └─ IndexedDB / localStorage для draft + offline history cache

       │ POST /api/chat (streamed)
       ▼

[Edge / API Gateway]
  ├─ Auth (JWT validation)
  ├─ Rate limit (per user)
  └─ Forward → Backend

       ▼

[Backend (Node / Next.js Route Handler)]
  ├─ Load conversation history (Postgres)
  ├─ Inject system prompt + RAG context (если applicable)
  ├─ Call LLM (Anthropic streaming)
  ├─ Pipe stream → response (text/event-stream)
  ├─ On stream end → persist message to DB (background)
  └─ Telemetry → Langfuse trace

       ▼

[Anthropic API]
```

### Happy path

1. User типит, hits Send → POST `/api/chat` с `{ conversationId, message }`
2. Backend loads last N messages из conversation
3. Backend opens SSE response, streams `data: {"delta": "Hello"}\n\n` per token
4. Frontend `ReadableStream` reader appends to current message buffer
5. На completion — backend saves entire message to DB, sends `data: [DONE]`
6. Frontend marks message complete, ready for next input

### Critical UX

- **Optimistic message** — user message появляется ДО backend response
- **Streaming indicator** — typing dots / cursor blink
- **Stop button** — user может cancel mid-stream (AbortController + backend cancel)
- **Retry на error** — keep partial state, button "Retry from here"
- **Accessibility** — `aria-live="polite"` на message area, keyboard nav (↑ для edit last)
- **Markdown rendering** — incremental (re-parse buffer на каждый chunk не tank perf)
- **Code blocks** — syntax highlight, copy button
- **Mobile** — virtual keyboard handling, scroll-to-bottom logic

### Bottlenecks / failure modes

- **Connection drop mid-stream** → reconnect логика, idempotency keys на retry
- **LLM cold start latency** → show skeleton, не пустой экран
- **Long history** → trim + summary, не shove 100 messages в prompt каждый раз
- **Concurrent message** → disable input или queue (avoid race)

### Trade-offs

| Choice | Alternative | Why |
|--------|-------------|-----|
| SSE | WebSocket | SSE простой, unidirectional хватает. WebSocket для multi-user collab |
| ReadableStream API | EventSource | EventSource не поддерживает POST + кастомные headers |
| Optimistic UI | Pessimistic | UX ×10 для perceived latency |
| Server saves history | Client saves | Server для cross-device sync |

### Sources
- [Vercel AI SDK — Chat UI](https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot)
- [MDN — Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

---

## #SD2 — Design a RAG System (end-to-end)

### Моя позиция (сказать первым)
Моё решение по умолчанию: Postgres + pgvector, recursive-чанки 500/50, top-k ~20 и реранкер до 5 в промпт. Отдельную векторную БД не беру, пока не упрусь в масштаб: одна база вместо двух — меньше синхронизации и один бэкап. Если начнут давить «почему не Pinecone» — отвечу, что переезд стоит дёшево, пока схема простая, а операционная цена второй системы с первого дня реальна.


### Clarify
- Type of docs: PDF / web / Slack / mixed?
- Volume: 1k docs или 10M?
- Update frequency: one-time, daily, real-time?
- Multi-tenant?
- Latency target (full query response)?
- Multilingual?

### Architecture sketch

```
[INGESTION PIPELINE — async]

[User upload] → S3 / R2 → Queue
                          ↓
                  [Worker: parse]
                          ↓
                  [Worker: chunk + embed]
                          ↓
                  [Postgres + pgvector]

[QUERY PIPELINE — sync]

[User] → API
         ↓
   [Validate + auth + rate limit]
         ↓
   [Embed query]
         ↓
   [Vector search top-50 (pgvector HNSW)]
         ↓
   [Optional: rerank top-50 → top-5 (Cohere)]
         ↓
   [Assemble prompt with chunks + IDs]
         ↓
   [LLM streaming response]
         ↓
   [Stream → user, parse citations]
```

### Detailed steps

**Ingestion**:
1. Upload to S3, write metadata row (`doc_id`, `user_id`, `status='pending'`)
2. Enqueue → BullMQ / SQS / Postgres queue
3. Worker: parse (pymupdf / unstructured / llama-parse), extract text + structure
4. Chunk: 500 tokens, 50 overlap, recursive по headers
5. Embed: batch к OpenAI text-embedding-3-small (или Voyage)
6. Insert chunks `(doc_id, content, embedding, metadata)` в pgvector
7. Update `doc.status = 'ready'`, notify user

**Query**:
1. Embed user query
2. `SELECT * FROM chunks WHERE user_id=$1 ORDER BY embedding <=> $2 LIMIT 50`
3. Rerank через Cohere → top-5
4. Build prompt: `system + chunks[1..5] with [n] IDs + user_question`
5. Stream Claude response
6. Parse citations on completion → resolve `[n]` → source URLs

### Bottlenecks

- **Embedding API rate limit на ingestion** → batch + concurrency control
- **Vector search slow на > 1M** → tune HNSW `ef_search`, sharding по user_id
- **Long context cost** → cap k=5, prompt caching на system prompt
- **Stale data** → background re-index когда doc updated

### Trade-offs

| Decision | Alternative | Trade |
|----------|-------------|-------|
| pgvector | Pinecone | pgvector cheaper + collocated с metadata. Pinecone — managed scale > 10M |
| Async ingestion | Sync | Sync UX лучше (instant search), но fails на large docs. Async — стандарт |
| Rerank | No rerank | +200ms latency, +cost. Бери если quality matters |
| Hybrid (BM25 + vector) | Pure vector | +10-20% recall на queries с specific terms (IDs, names) |

### Failure modes (см. answers-rag.md #38)

### Sources
- [Anthropic — Contextual retrieval](https://www.anthropic.com/news/contextual-retrieval)
- [pgvector — Indexing](https://github.com/pgvector/pgvector#indexing)

---

## #SD3 — Design Cursor's Autocomplete

### Моя позиция (сказать первым)
Главное ограничение здесь — бюджет ~200 мс, и оно диктует всё остальное: маленькая быстрая модель, debounce, отмена запросов на каждое нажатие и выброс устаревших ответов. Debounce + AbortController + drop stale response я делал для search-as-you-type; разница только в том, что вместо REST-эндпоинта на конце модель, и из-за latency-бюджета она должна быть намного меньше, чем я бы взял для чата.


### Clarify
- Inline suggestion (single-line) vs multi-line completion?
- Latency budget (Cursor target ~200ms)?
- Privacy: code stays local или goes к LLM?
- Context window: just current file, or whole repo?
- Languages supported?

### Architecture sketch

```
[Editor (VS Code)]
  ├─ Triggers: cursor moved, character typed
  ├─ Debounce 50-100ms
  ├─ Cancel previous in-flight
  └─ Send: { fileContent, cursorPos, language, recentEdits }

       ▼

[Local context builder]
  ├─ Extract: current function, imports, related files
  ├─ Treesitter to get AST context
  └─ Tokenize, fit в budget (~4-8k tokens)

       ▼

[Edge inference]
  ├─ Specialized fast model (small + finetuned, e.g. Cursor-tab)
  ├─ Or vendor LLM с tight system prompt
  └─ Stream tokens back

       ▼

[Editor]
  ├─ Show ghost text inline
  ├─ Tab to accept, Esc to dismiss
  └─ Log accepted/rejected → telemetry для retraining
```

### Critical optimizations

**Latency** (target < 200ms TTFB):
- Edge deployment (Cloudflare Workers / Lambda@Edge)
- Small fast model (3-7B params), не frontier 200B
- Fewer tokens output (~50-100), early stopping
- Speculative decoding на model side
- Connection keepalive

**Cancellation**:
- Each keystroke triggers new request
- AbortController на client + server
- Server checks `request.signal.aborted` before each LLM step

**Quality**:
- Accept/reject signal as eval data
- Per-language fine-tuned models
- Project-specific context (recent commits, открытые files)

### Hard parts

- **FIM (Fill-in-the-Middle)** prompt format: `<prefix>...<suffix>`. Модель должна completion'ить middle, понимая right context
- **Context selection** — без RAG-like retrieval по repo: какие файлы релевантны?
- **Multi-cursor / multi-edit** — debounce shouldn't накапливать requests

### Trade-offs

| Choice | Alternative | Why |
|--------|-------------|-----|
| Small fast model (3B) | GPT-5 / Claude | Латентность × 10. Quality good enough для inline suggestion |
| Edge deploy | Centralized | Latency, geo distribution |
| Treesitter context | Token windows | AST-aware → точнее, сложнее |
| Fine-tune на code | Off-the-shelf | Лучше FIM accuracy, но cost / ML team |

### Sources
- [Cursor — Tab API blog](https://www.cursor.com/blog) (поищи "autocomplete")
- [GitHub Copilot — System architecture](https://github.blog/2023-05-17-how-github-copilot-is-getting-better-at-understanding-your-code/)

---

## #SD4 — Design a Multi-tenant LLM App

### Моя позиция (сказать первым)
По умолчанию: общая БД + Postgres RLS + tenant_id в JWT, per-tenant rate limit и жёсткий бюджетный кап до вызова модели. Отдельная БД на тенанта только для regulated-клиентов. И для EU-тенантов регион — это поле конфигурации тенанта, которое проверяется на том же уровне, что tenant_id (подробнее ниже в разделе про GDPR).


### Clarify
- B2B SaaS или consumer?
- Tenants могут иметь свои API keys?
- Data isolation требования (GDPR / SOC2 / HIPAA)?
- Per-tenant cost tracking / quota?
- Custom prompts / models per tenant?

### Architecture sketch

```
[Client] → [API Gateway with tenant_id auth]
              ↓
       [Per-tenant rate limiter]
              ↓
       [Quota check (Postgres / Redis)]
              ↓
       [Prompt assembly (tenant-specific config)]
              ↓
       [LLM call (with tenant's key OR shared key)]
              ↓
       [Usage logger → cost attribution]
              ↓
       [Response → tenant]
```

### Critical components

**1. Tenant identity**
- Auth via JWT с `tenant_id` claim
- All DB queries filtered `WHERE tenant_id = $current_tenant`
- Postgres Row-Level Security (RLS) — last line of defense

**2. Data isolation strategies**
- **Shared DB, shared schema, RLS** — cheap, default, ok для most B2B
- **Shared DB, per-tenant schema** — better isolation, complex migrations
- **Per-tenant DB** — strong isolation, expensive, нужно для regulated (HIPAA)

**3. Rate limiting**
- Per-tenant tier (free: 100/day, pro: 10k/day, enterprise: custom)
- Sliding window counter в Redis: `INCR rate:{tenant}:{minute_bucket}`
- 429 response с `Retry-After` header

**4. Cost tracking**
- На каждом LLM call: `INSERT usage_log (tenant_id, model, in_tokens, out_tokens, cost_usd, ts)`
- Daily roll-up в `tenant_usage_daily` (для dashboards / billing)
- Hard cap: pre-call check `current_month_cost < tenant.budget_limit`

**5. API key management**
- Shared key (платит ты) — easy onboarding, ты absorb cost
- BYOK (tenant's key) — они платят directly, ты на pricing markup
- Hybrid: shared free tier, BYOK для unlimited

**6. Prompt isolation**
- Никогда не leak tenant data в shared cache
- System prompts с tenant config rendered server-side, клиент НЕ контролирует
- Audit log: каждый prompt assembly → tenant_id + assembled prompt

**7. GDPR / data residency (EU-тенанты)**
- Регион хранения — поле конфигурации тенанта (`tenant.region = 'eu'`), проверяется на том же уровне, что tenant_id. Postgres и векторный индекс для EU-тенантов живут в EU-регионе.
- LLM-вызовы для EU-тенантов: провайдер с DPA и EU-обработкой. У Anthropic Messages API есть параметр `inference_geo` для выбора региона инференса; какие регионы доступны и для каких моделей — проверяю в доках перед интервью.
- Эмбеддинги: либо провайдер с EU-обработкой, либо self-hosted модель, если данные не должны покидать регион вообще.
- Логи и usage_log тоже персональные данные: TTL на хранение, удаление по запросу (right to erasure) должно проходить и по векторам, не только по строкам в Postgres.
- Это прямой мостик к моему поиску работы: я целюсь в EU-стартапы, и у них это вопрос первого созвона с клиентом, а не compliance-задача на потом.

### Bottlenecks

- **Hot tenant** (один tenant с 100x traffic) → noisy neighbor: per-tenant queue / priority lanes
- **Vector DB multi-tenancy** → see answers-rag.md #36 (metadata filtering)
- **Cost spike from one tenant** → real-time alert at 80% budget, hard cap at 100%

### Trade-offs

| Decision | Alternative | Why |
|----------|-------------|-----|
| Shared DB + RLS | Per-tenant DB | RLS дешевле, ok для < 1000 tenants. Per-DB для regulated |
| BYOK | Shared key | BYOK simpler ops, tenant absorbs cost. Shared — easier UX |
| Real-time cost track | Batch daily | Real-time нужно для hard caps; expensive |

### Sources
- [Postgres Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Stripe — Multi-tenant patterns](https://stripe.com/blog/online-migrations)

---

## #SD5 — Design "Chat with My Docs" (твой project 1)

### Моя позиция (сказать первым)
Это мой собственный проект, поэтому здесь нельзя пересказывать SD2. Интервьюер будет спрашивать «что тебя удивило», «что сломалось», «что бы переделал». Ниже — решения, которые я защищаю, и места, куда нужно вписать реальные цифры из проекта.


### Clarify
- Doc types: PDF only? Word/Markdown/HTML?
- Max doc size? Pages, MB?
- Single-user or shared workspace?
- Citations required?
- Free tier (storage / queries cap)?

### Architecture (это специализированный case SD2 + SD1)

```
[Upload]                    [Chat]
   │                           │
   ▼                           ▼
[Pre-signed S3 PUT]      [Conversation history (Postgres)]
   │                           │
   ▼                           ▼
[Webhook → enqueue]      [Embed query]
   │                           │
   ▼                           ▼
[Worker: parse + chunk +  [Vector search (pgvector)]
 embed + insert]                │
   │                           ▼
   ▼                      [Build prompt: chunks с [n]]
[Mark doc ready]                │
                                ▼
                          [Claude streaming]
                                │
                                ▼
                          [Stream → client + parse citations]
```

### Pieces in detail

**Upload**:
- Pre-signed S3 URL (client uploads directly, не через API server)
- Server records `doc_id`, `status='uploading'`
- S3 event trigger → SQS / Postgres queue → worker

**Parse + chunk**:
- pymupdf для text PDFs, llama-parse / unstructured для tables / scans
- Chunk 500 tokens с 50 overlap, recursive splitter respecting headings
- Add `doc_title` + `section_header` в начало каждого chunk (контекст)

**Embed + store**:
- Batch embed (50 chunks per call к OpenAI)
- Insert в pgvector: `(id, doc_id, user_id, content, embedding, metadata)`
- Index: HNSW on embedding, btree on user_id

**Chat**:
- See SD1 chat UI
- For RAG: see SD2 query pipeline
- System prompt requires `[n]` citations
- Frontend: hover [n] → show source chunk, click → open PDF на nu page

### Что я защищаю как свои решения
- **pgvector, а не отдельная векторная БД**: на моём объёме одна база проще, и user_id-фильтр — обычный btree-индекс рядом с HNSW.
- **Цитаты валидирую после генерации**: модель может сослаться на [5], когда в промпте 3 чанка. Невалидные ссылки убираю, а не показываю пользователю битую ссылку.
- **Ingestion асинхронный, UI честно показывает прогресс**: пока документ не проиндексирован, вопросы по нему блокируются, а не отвечаются по частичному индексу.

### Реальные цифры из проекта (заполнить до интервью)
- [Размер корпуса, на котором тестировал: сколько документов / чанков]
- [Eval: сколько пар в golden set, какой faithfulness / hit rate получил]
- [Что сломалось первым и как нашёл: конкретный баг, а не «были проблемы»]
- [Что бы переделал сейчас]
Без этих четырёх пунктов SD5 звучит как пересказ SD2, а именно по своему проекту интервьюер копает глубже всего.

### Failure modes & fixes

| Failure | Fix |
|---------|-----|
| Doc parse fails | Surface error to user, suggest alternative format |
| OCR'd PDFs (image-only) | Pre-process через Tesseract / Mistral OCR |
| Chunk обрезан посреди table | Use document-aware parser, treat tables as units |
| User asks about doc that's still ingesting | Block UI с progress, не show partial results |
| Citation [5] but only 3 chunks | Validate, strip invalid |

### Sources
- [Anthropic — Build with Claude — RAG](https://docs.claude.com/en/docs/build-with-claude/contextual-rag)
- [pgvector + Postgres setup](https://github.com/pgvector/pgvector)

---

## #SD6 — Design a Real-time Collaboration Editor (Resend Email Editor)

### Моя позиция (сказать первым)
Я бы взял CRDT (Yjs), а не OT. Аргумент под давлением: OT требует центрального сервера, который упорядочивает операции, и офлайн-редактирование с последующим слиянием на нём превращается в мучение. CRDT сливает правки без центра, а цена — рост истории документа, которую надо периодически компактить.


### Clarify
- Multiple cursors / users editing simultaneously?
- Offline support?
- Rich content (markdown, blocks like Notion)?
- Version history / undo?
- Comments / suggestions?

### CRDT vs OT — главный choice

**Operational Transformation (OT)** — Google Docs era
- Server transforms ops based on history
- Requires central server для consistency
- Simpler reasoning model
- Hard to do offline

**Conflict-free Replicated Data Types (CRDT)** — modern
- Each op is associative + commutative + idempotent
- No server needed for merge — peers exchange ops
- Naturally offline-friendly
- Memory overhead для metadata (vector clocks)

**Recommendation**: CRDT — текущий дефолт для новых коллаборативных редакторов. Yjs / Automerge — battle-tested. OT — legacy.

### Architecture sketch

```
[Client A] ←→ [WebSocket / WebRTC] ←→ [Server (relay)] ←→ [Persistence]
                                              ↓
                                         [Client B]

CRDT doc state в memory у каждого client + persisted snapshot + ops log
```

### Critical pieces

**1. Document model (Yjs Y.Doc)**
- Hierarchical блоки (paragraph, heading, image)
- Text внутри = Y.Text (CRDT) с rich attributes
- Awareness state — cursor position, selection, user info

**2. Sync protocol**
- WebSocket connection per user
- Server relays ops к other clients
- y-websocket / Hocuspocus как relay framework
- Periodic snapshot к persistence (S3 / Postgres)

**3. Presence**
- Awareness API в Yjs: ephemeral state не persisted
- Show кто editing какой block, cursor positions, user name + avatar
- Heartbeat: lose presence after 30s no signal

**4. Persistence**
- Save full doc state каждые N changes / каждые M minutes
- Append-only ops log для history / undo
- Garbage collect ops после snapshot

**5. Offline handling**
- IndexedDB persists Y.Doc локально
- On reconnect — exchange missing ops с server
- Конфликты разрешаются автоматически (CRDT property)

### Hard parts

- **Schema migrations** — old clients open new doc structure
- **Comments / suggestions** — separate Y.Map keyed по character offsets, but offsets shift с edits → use anchor refs
- **Permissions** (read-only viewer, comment-only) — server-enforced, реджектит ops по permission level
- **Performance** — Yjs CRDT может grow с history, periodic compaction
- **Email-specific**: блоки = email components (header, button, divider). React Email node tree → Y.Map structure

### Trade-offs

| Choice | Alternative | Why |
|--------|-------------|-----|
| CRDT (Yjs) | OT (ShareDB) | Better offline, no central authority. Memory tax acceptable |
| WebSocket | WebRTC | Server-mediated easier to deploy. WebRTC = NAT issues |
| Block-based | Plain text | Email = blocks (div / button / image). Block model native |

### Sources
- [Yjs docs](https://docs.yjs.dev/)
- [Resend — React Email](https://react.email/)
- [Hocuspocus](https://tiptap.dev/docs/hocuspocus)

---

## #SD7 — Cache LLM Responses (semantic vs exact)

### Моя позиция (сказать первым)
Exact-match кэш ставлю всегда: он дешёвый и безопасный. Semantic-кэш — только с высоким порогом сходства (0.95 для одиночного semantic-слоя) и только для запросов без персонального контекста. Если PM скажет «давай кэшировать всё семантически», я возражу: ложное попадание возвращает уверенный неправильный ответ на чужой вопрос, а это хуже промаха кэша. Порог снижаю только по данным eval, не на глаз.


> Формат: это concept-вопрос, а не полноценный design prompt. Но на живом интервью всё равно начинаю с одного-двух уточнений (масштаб, latency-бюджет, кто платит за токены), прежде чем отвечать.

### Короткий ответ
**2 strategies: exact match (hash key) дешевый, semantic (embedding similarity) поднимает hit rate в 3-5x. Production обычно: exact cache layer 1, semantic layer 2.**

### Exact match cache

```ts
const key = sha256(JSON.stringify({ model, system, messages, temperature }));
const cached = await redis.get(key);
if (cached) return cached;
const response = await llm.call(...);
await redis.setex(key, TTL, response);
return response;
```

- **Hit rate** низкий (5-10%) — даже маленькое изменение в prompt → miss
- **Когда работает**: deterministic prompts (extraction, classification), batch jobs
- **TTL**: 1h-24h в зависимости от data freshness

### Semantic cache

```ts
const embedding = await embed(query);
const similar = await vectorDB.search(embedding, { k: 1, threshold: 0.95 });
if (similar.length) return similar[0].cached_response;
const response = await llm.call(...);
await vectorDB.insert({ embedding, query, cached_response: response });
return response;
```

- **Hit rate** higher (20-40%) на FAQ-style traffic
- **Trade**: false positives (неточный match → wrong answer). Threshold critical
- **Implementation**: GPTCache, или roll-your-own с pgvector / Redis Vector

### Pitfalls

- **Cached errors**: если model returned bad response, cache forever — invalidation hard
- **Personalization**: ответ зависит от user context → cache key должен включать tenant/user
- **Privacy**: нельзя cache responses с PII
- **Versioning**: invalidate когда меняешь system prompt / model

### Hybrid pattern (best practice)

```
1. Check exact cache → return if hit (super fast, 100% accurate)
2. Check semantic cache → return if hit AND similarity > 0.92 (fast, mostly accurate)
3. Call LLM → return + populate both caches
```

### When NOT to cache

- Non-deterministic creative outputs (writing, ideation)
- Time-sensitive answers (sports scores, news)
- Personalized recommendations (each user different)
- Stream responses (cache full response, replay synthetically — degrades UX)

### Sources
- [Anthropic — Prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) (server-side complementary)
- [GPTCache](https://github.com/zilliztech/GPTCache)

---

## #SD8 — Streaming Responses End-to-End

### Моя позиция (сказать первым)
Стрим от провайдера проксирую через свой сервер (ключ не уходит на клиент), на клиент отдаю свой простой SSE-протокол, а не сырые события провайдера. Так фронт не зависит от формата конкретного вендора: сменил провайдера — поменял адаптер на сервере, UI не трогаешь.


> Формат: это concept-вопрос, а не полноценный design prompt. Но на живом интервью всё равно начинаю с одного-двух уточнений (масштаб, latency-бюджет, кто платит за токены), прежде чем отвечать.

### Короткий ответ
**Сервер пушит chunks через SSE. Frontend consumes через ReadableStream API. Backpressure обычно не проблема (LLM = bottleneck), но нужно cancellation + reconnect.**

### Stack

```
LLM provider (Anthropic) → SSE
  ↓
Backend (Node Route Handler)
  ├─ Receives Anthropic SSE stream
  ├─ Transforms / enriches chunks (parse, accumulate, attach metadata)
  └─ Sends own SSE / chunked HTTP response
  ↓
Frontend
  ├─ fetch().body → ReadableStream
  ├─ TextDecoderStream for utf-8
  ├─ Custom transform for SSE parsing
  └─ Update UI incrementally
```

### Backend implementation (Next.js Route Handler)

```ts
export async function POST(req: Request) {
  const { messages } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const llmStream = await client.messages.stream({
        model: process.env.ANTHROPIC_MODEL, // не хардкодь версию
        messages,
        max_tokens: 1024,
      });

      for await (const event of llmStream) {
        // guard delta.type: есть ещё thinking_delta и input_json_delta (tool use)
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const data = `data: ${JSON.stringify({ delta: event.delta.text })}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      }
      // [DONE] — это наш собственный сигнал клиенту. Сам Claude заканчивает стрим событием message_stop.
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering
    },
  });
}
```

### Frontend consumption

```ts
const response = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ messages }),
  signal: abortController.signal,
});

const reader = response.body!
  .pipeThrough(new TextDecoderStream())
  .getReader();

let buffer = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += value;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') return;
      const parsed = JSON.parse(data);
      setMessage(prev => prev + parsed.delta);
    }
  }
}
```

### SSE vs WebSocket vs HTTP chunked

| Tech | Pros | Cons | Use when |
|------|------|------|----------|
| SSE | Simple, HTTP, auto-reconnect | One-way (server → client) | Chat, notifications, streaming AI responses |
| WebSocket | Bi-directional, low overhead | Needs WS server, no auto-reconnect | Collab editing, multiplayer |
| HTTP chunked | No new tech | Manual framing | Simple streaming без typed events |

### Critical bits

- **Disable proxy buffering** (`X-Accel-Buffering: no` для Nginx, similar для Cloudflare)
- **AbortController** на client + propagate abort signal в LLM call
- **Reconnect logic** для long streams (network blips)
- **Heartbeat** (`event: ping`) каждые 30s чтобы proxy не killed connection

### Backpressure

- Reader slow → Stream buffer fills → backend ждёт → LLM call stays open
- Solution: detect slow consumer, drop / batch chunks
- На практике: LLM = bottleneck, backpressure rarely materializes

### Sources
- [MDN — ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)
- [Anthropic — Streaming Messages](https://docs.claude.com/en/docs/build-with-claude/streaming)

---

## #SD9 — Rate Limiting LLM API Calls

### Моя позиция (сказать первым)
Лимиты держу на своей стороне раньше, чем провайдер начнёт отвечать 429: token bucket в Redis по двум осям, запросы и токены, плюс очередь с приоритетами для платных тенантов. 429 от провайдера — это уже авария, а не механизм контроля.


> Формат: это concept-вопрос, а не полноценный design prompt. Но на живом интервью всё равно начинаю с одного-двух уточнений (масштаб, latency-бюджет, кто платит за токены), прежде чем отвечать.

### Короткий ответ
**Token bucket для bursty traffic, sliding window для precision. Per-user + global. Use Redis для distributed limiter. Don't forget budget caps (cost rate limiting), не только request rate.**

### Algorithms compared

**Token bucket**
- Bucket capacity = N tokens
- Tokens регенерируются rate R/sec
- Каждый request = 1 token
- Allows bursts up to N

```ts
async function checkBucket(userId: string, capacity = 10, refill = 1) {
  const key = `bucket:${userId}`;
  // Lua script для atomic refill + decrement
  // Returns true если allowed
}
```

**Sliding window log**
- Сохраняй timestamp каждого request в sorted set
- На каждый запрос: убери старые > window, count remaining
- Точнее token bucket, дороже на storage

**Fixed window counter**
- INCR на минуту: `rate:user123:2026-05-09T14:30`
- Проще, но "edge effect" (90 requests на 14:30:59 + 90 на 14:31:00 = 180 за 2 секунды)

### LLM-specific dimensions

Регулярный API rate limit = "requests per second". LLM имеют ДВА:

1. **Request rate** (RPM): обычно 50-1000/min
2. **Token rate** (TPM): обычно 50k-2M tokens/min

Anthropic / OpenAI hard-enforce оба. Твой rate limiter должен tracking оба.

```ts
async function checkLimits(userId, estimatedTokens) {
  const rpm = await incrCounter(`rpm:${userId}`, 60);
  const tpm = await incrCounterBy(`tpm:${userId}`, estimatedTokens, 60);
  if (rpm > USER_RPM_LIMIT) throw new RateLimitError('rpm');
  if (tpm > USER_TPM_LIMIT) throw new RateLimitError('tpm');
}
```

### Per-tier strategy

| Tier | RPM | TPM | $/month |
|------|-----|-----|---------|
| Free | 5 | 5k | $0 |
| Pro | 100 | 200k | $20 |
| Team | 500 | 1M | $100 |
| Enterprise | custom | custom | custom |

### Cost rate limiting

Different from RPM. Track $ spent per user / per hour. Hard cap чтобы один user не stripe'нул $1000 за 24 часа.

```ts
const monthSpent = await getUserMonthSpent(userId);
if (monthSpent + estCost > userBudget) throw new BudgetExceededError();
```

### 429 response

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 12
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1715270400
```

Client должен respect `Retry-After` + exponential backoff с jitter.

### Distributed gotchas

- Redis is your friend. Лучше Redis Cluster для HA
- Lua scripts для atomic check-and-increment
- Edge cases: clock skew, network partition during increment

### Sources
- [Cloudflare — Rate limiting strategies](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)
- [Stripe — Rate limiters](https://stripe.com/blog/rate-limiters)

---

## #SD10 — Cost Optimization for LLM-heavy Product

### Моя позиция (сказать первым)
Порядок рычагов, который я защищаю: сначала измерить стоимость по фичам, потом роутинг на модель подешевле, prompt caching на стабильном префиксе, сокращение выхода, и только потом batch. Оптимизировать без per-feature учёта — это гадание.


> Формат: это concept-вопрос, а не полноценный design prompt. Но на живом интервью всё равно начинаю с одного-двух уточнений (масштаб, latency-бюджет, кто платит за токены), прежде чем отвечать.

### Короткий ответ
**В порядке impact: 1) prompt caching (50-90% off), 2) model routing (Haiku для easy, Sonnet/Opus для hard), 3) batch API (50% off для async), 4) context trimming, 5) semantic cache, 6) output token cap.**

### #1 — Anthropic prompt caching

- Cached input tokens — 90% скидка ($0.30 vs $3 / 1M на Sonnet)
- Cache lifetime: 5 minutes (или 1 hour beta)
- Cache stable parts: system prompt, RAG chunks (если повторяющиеся), examples
- Mark via `cache_control: { type: 'ephemeral' }`

```ts
{
  system: [
    { type: 'text', text: longSystemPrompt, cache_control: { type: 'ephemeral' } }
  ],
  messages: [...]
}
```

**Best for**: chatbot с большим system prompt + repeated queries.

### #2 — Model routing

```
Easy task (classification, extraction) → Haiku ($1/$5)
Medium task (summary, simple chat) → Sonnet ($3/$15)
Hard task (reasoning, code) → Opus ($15/$75)
```

Implement через классификатор (cheap Haiku call) → route → execution. Even with double call, total cost dropping 5-10x на long tail.

### #3 — Batch API

- Anthropic / OpenAI Batch API = 50% off на input + output
- Trade: response latency 0-24 hours
- Use cases: nightly analysis, data labelling, eval runs, bulk content generation

### #4 — Context trimming

- Sliding window последних N exchanges, не full history
- Summary старых exchanges → одно сообщение
- Drop low-importance metadata
- На chat with 100 messages: тримминг режет per-call cost в 5-10x

### #5 — Semantic cache (см. SD7)

- 20-40% hit rate на FAQ-style traffic
- Cost ≈ embedding ($0.02/1M) vs full LLM call ($3-15/1M)
- ROI огромный для recurring queries

### #6 — Output token cap

Output обычно в 5x дороже input. Если задача — extraction / classification, cap `max_tokens: 200`. Не дай модели рассуждать на 4000 токенов "for free".

### #7 — Compression / summarization

- For RAG: вместо 10 длинных chunks → суммаризированные пер chunk (Haiku batch job overnight)
- For chat history: rolling summary каждые 20 messages

### #8 — Self-hosted для commodity tasks

- Embedding с BGE-m3 на own GPU вместо OpenAI
- Reranker BGE-reranker-base own
- Classification — small fine-tuned model
- Math: $2k/month GPU rental, vs $20k/month OpenAI embedding bills

### Cost monitoring dashboard

Per-feature, per-tenant, per-model breakdown. Alert когда:
- Daily cost > 1.5x baseline
- Single tenant > X% total cost
- Specific endpoint suddenly 10x more expensive (likely bug)

### Senior signal

> "Сначала меряй. Top-down: какая фича жрёт 80% cost? Top-N users? Retry storm? Bug? Cost optimization без profiling = premature."

### Sources
- [Anthropic — Prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching)
- [Anthropic — Batch API](https://docs.claude.com/en/api/creating-message-batches)
- [Anthropic — Pricing](https://www.anthropic.com/pricing)

---

## Self-assessment checklist (System Design)

- [ ] Применяю framework (clarify → sketch → happy → bottlenecks → trade-offs) на каждом
- [ ] Спроектирую chat UI с streaming + cancellation + accessibility
- [ ] Опишу RAG end-to-end pipeline за 5 минут
- [ ] Объясню Cursor autocomplete + почему latency главное
- [ ] Multi-tenant isolation + cost tracking + RLS
- [ ] Chat-with-docs (мой проект 1) могу нарисовать на whiteboard
- [ ] CRDT vs OT — когда что
- [ ] Semantic vs exact cache — когда что, hybrid pattern
- [ ] SSE / WebSocket / chunked HTTP — когда что
- [ ] Token bucket / sliding window / fixed counter — когда что
- [ ] 5+ cost optimization tactics в порядке impact

---

## Связанные файлы
- [interview-question-bank.md](interview-question-bank.md) — секция 4 (System Design)
- [core-40-priority.md](core-40-priority.md) — #35-37 (System Design must-knows)
- [career-ai-pivot.md](career-ai-pivot.md) — projects 1-3 (применяй design thinking)
- [answers-llm.md](answers-llm.md) — primitives (streaming, tool use, caching basics)
- [answers-rag.md](answers-rag.md) — RAG components
- [answers-agents.md](answers-agents.md) — agent loops + observability
- answers-behavioral.md — TODO (next)

Last updated: 2026-05-09
