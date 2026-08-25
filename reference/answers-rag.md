# Answers — RAG (Retrieval-Augmented Generation)

> Полные ответы на 15 вопросов из interview-question-bank.md секция 6 + core-40 #27-31. RAG = твой проект 1 (chat-with-docs). Спросят на 100% любого AI-стартап интервью где есть документ-flow.

## Sources (canonical)

- **Anthropic — Contextual retrieval**: https://www.anthropic.com/news/contextual-retrieval
- **OpenAI — Embeddings guide**: https://platform.openai.com/docs/guides/embeddings
- **Voyage AI docs**: https://docs.voyageai.com/
- **Cohere Rerank**: https://docs.cohere.com/docs/rerank-overview
- **pgvector README**: https://github.com/pgvector/pgvector
- **Pinecone learn**: https://www.pinecone.io/learn/
- **RAGAS docs**: https://docs.ragas.io/
- **LlamaIndex evals**: https://docs.llamaindex.ai/en/stable/module_guides/evaluating/
- **Lost in the Middle (Liu et al, 2023)**: https://arxiv.org/abs/2307.03172
- **Stanford CS25 — Retrieval Augmented LMs**: https://stanford-cs25.github.io/

---

## #27 / Q1 — Что такое RAG и зачем он, если можно просто положить всё в контекст

### Короткий ответ
**RAG = "найди релевантные кусочки документов, положи только их в prompt, потом ответь". Альтернатива "запихнуть весь корпус в context" — дешевле, точнее, обновляется без retrain.**

### Зачем не "просто в контекст"

Четыре причины, по которым RAG почти всегда выигрывает у "long-context everything":

1. **Cost** — в контексте каждый запрос платишь за все токены. 200k токенов × 100 запросов/день × $3/1M = $60/день только за input. RAG режет это в 50-100x.
2. **Latency** — даже Gemini 2.5 с 1M context ощутимо медленнее на full context. RAG: <1с retrieval + 2-3с generation.
3. **Recency** — модель замораживает знание на cutoff. RAG берёт freshest data из твоего store.
4. **Quality / Lost in the middle** — эмпирика: модели лучше помнят начало и конец длинного контекста, забывают середину. Релевантные 5 chunks > 100k токенов "всего подряд".

### Базовый pipeline

```
[Documents] → parse → chunk → embed → store (vector DB)
                                              ↓
[User query] → embed → search top-k → (rerank) → assemble prompt → LLM → answer (with citations)
```

### Когда RAG не нужен

- Корпус маленький (< 50k токенов, помещается в context)
- Данные нужны realtime / транзакционные → tool use / agent с API call, не embeddings
- Вопросы требуют aggregation across whole corpus ("сколько всего документов упоминают X") → SQL/analytics, не similarity search

### Why interviewer cares
Это самая частая архитектура AI-фичи в B2B SaaS. Если ты не объясняешь trade-off "RAG vs long context vs fine-tune" за 60 сек — ты не product engineer, ты junior.

### Sources
- [Anthropic — Contextual retrieval](https://www.anthropic.com/news/contextual-retrieval)
- [Lost in the Middle paper](https://arxiv.org/abs/2307.03172)

---

## #28 / Q2-Q3 — Chunking strategies + размер чанка

### Короткий ответ
**Chunk = единица retrieval. Типичный размер 200-500 токенов с 50-100 token overlap. Выбор стратегии важнее оптимизации embedding-модели.**

### 4 базовые стратегии

**1. Fixed-size (character/token)**
- Самый простой: режь каждые N токенов, добавь overlap
- Pros: deterministic, легко
- Cons: режет посреди предложения, теряет смысл на стыках

**2. Recursive / structural**
- Разбивай по hierarchy: paragraph → sentence → word
- LangChain `RecursiveCharacterTextSplitter` так делает по умолчанию
- Pros: сохраняет границы предложений
- Cons: chunks разного размера, надо tune separators

**3. Semantic chunking**
- Embed каждое предложение, кластеризуй смежные с высокой similarity
- Pros: chunks семантически когерентны
- Cons: дороже на ingestion, harder to reason about

**4. Document-aware (markdown/code/HTML)**
- По headers (H1/H2), по функциям, по секциям
- Pros: respects структуру автора
- Cons: only works для structured docs

### Размер chunk — почему 200-500 токенов

| Размер | Что произойдёт |
|--------|----------------|
| **50 токенов** | Слишком мало контекста — модель не понимает о чём кусок. Embeddings шумные. Retrieval ловит wrong chunks. |
| **200-500** | Sweet spot. Достаточно контекста для embedding semantics + достаточно мелко для precision. |
| **1000-2000** | Один chunk покрывает большую тему. Embedding "размывается" — менее specific match. |
| **5000+** | Embedding теряет detail. Проще положить всё в context, чем embedding'и считать. |

### Overlap

Типично **10-20% от chunk size** (50-100 токенов на 500-token chunk). Зачем: если ответ на стыке двух chunks — overlap гарантирует, что хотя бы один chunk его содержит целиком.

### Контекстуальные хаки (state-of-the-art 2024-2025)

**Contextual Retrieval (Anthropic)**: перед embedding каждого chunk, добавь LLM-генерированный context "этот chunk из документа X, секция Y, говорит про Z". Поднимает recall на 35-49%.

```
Original chunk: "Margins improved 5% YoY."
With context: "From ACME Q3 2024 earnings call, Financial Highlights section. Margins improved 5% YoY."
```

### Practice tip

В take-home: **не overthink chunking стратегию**. Стартуй с recursive 500-token + 50 overlap. Меряй retrieval quality. Меняй только если проседает.

### Sources
- [Anthropic Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
- [LangChain Text Splitters](https://python.langchain.com/docs/concepts/text_splitters/)
- [Pinecone — Chunking strategies](https://www.pinecone.io/learn/chunking-strategies/)

---

## #29 / Q4 — Embeddings: что это intuitively + similarity metrics

### Короткий ответ
**Embedding = вектор чисел (обычно 768-3072 dim), представляющий смысл текста. Similar смыслы → vectors близки в этом пространстве. Cosine similarity — самая популярная метрика.**

### Intuitively

Tokenizer берёт слово → embedding model превращает в вектор. Геометрически: тексты с похожим смыслом — рядом, разные — далеко.

```
embed("dog") ≈ [0.21, -0.45, 0.83, ...]   (1536 чисел)
embed("puppy") ≈ [0.19, -0.41, 0.79, ...]  (близко к dog)
embed("car") ≈ [-0.62, 0.31, 0.05, ...]   (далеко)
```

### 3 similarity metrics

**1. Cosine similarity** = угол между векторами, range [-1, 1]
```
cos(A, B) = (A · B) / (||A|| × ||B||)
```
- Игнорирует магнитуду, только направление
- **Default выбор** для text embeddings (большинство моделей нормализованы)

**2. Dot product** = простое скалярное произведение
```
A · B = Σ aᵢ × bᵢ
```
- Дешевле cosine (нет нормализации)
- Если embeddings уже нормализованы — `dot == cosine`
- OpenAI embeddings нормализованы → dot product = cosine, юзай dot для скорости

**3. Euclidean (L2) distance** = "длина прямой" между точками
```
d(A, B) = √Σ (aᵢ - bᵢ)²
```
- Учитывает магнитуду
- Реже для text, чаще для image/audio embeddings

### Когда что
- Text RAG → cosine (или dot если нормализованы)
- Multimodal / unnormalized → cosine
- Для clustering / outlier detection → euclidean

### Practical pitfall

Если миксуешь embeddings от разных моделей (OpenAI + Voyage) в одном index — **сломается**. Эмбеддинги разных моделей живут в разных пространствах.

### Sources
- [OpenAI — Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [Pinecone — Vector similarity explained](https://www.pinecone.io/learn/vector-similarity/)

---

## #30 / Q5 — Embedding models: OpenAI vs Voyage vs Cohere + размерность

### Короткий ответ
**В 2025 топ-3: OpenAI text-embedding-3, Voyage AI (лучше всех на benchmarks), Cohere Embed v3. Размерность 768-3072. Чем больше — тем точнее, но дороже storage.**

### Major players (state of 2026-Q2)

| Модель | Dim | Контекст | Цена / 1M tokens | Заметки |
|--------|-----|----------|------------------|---------|
| OpenAI text-embedding-3-large | 3072 | 8k | $0.13 | Default. Поддерживает Matryoshka (можно truncate dim) |
| OpenAI text-embedding-3-small | 1536 | 8k | $0.02 | Самый дешёвый, неплохой |
| Voyage voyage-3 | 1024 | 32k | $0.06 | Топ MTEB benchmark, домен-специфичные модели (code, finance, law) |
| Cohere embed-english-v3 | 1024 | 512 | $0.10 | Хорошо с rerank-v3 в одном пайплайне |
| BGE / BAAI (open source) | 768-1024 | 512-8k | self-hosted | Free если на своём GPU |

### Размерность — trade-off

- **Больше dim** → выше точность retrieval (особенно на edge cases), больше storage, медленнее search
- **Меньше dim** → меньше точность, дешевле, быстрее

**Matryoshka embeddings** (OpenAI, Nomic): можешь truncate первые N dimensions и потерять только marginal quality. Например, text-embedding-3-large 3072 → 256 dim теряет ~3% точности, экономит ~12x storage.

### Domain-specific модели

Voyage publishes специализированные модели:
- `voyage-code-3` для кода
- `voyage-finance-2` для финансовых документов
- `voyage-law-2` для legal

В нишевых доменах эти бьют generic OpenAI на 10-15% recall.

### Что выбирать в проекте

- **Прототип / MVP** → text-embedding-3-small (дёшево, хватит)
- **Production / quality matters** → voyage-3 + rerank
- **Конкретный домен** → проверь, есть ли domain-specific модель Voyage / Cohere
- **On-prem / privacy** → BGE-M3, self-hosted

### Sources
- [Voyage AI docs](https://docs.voyageai.com/)
- [MTEB Leaderboard (Hugging Face)](https://huggingface.co/spaces/mteb/leaderboard)
- [OpenAI — text-embedding-3](https://openai.com/blog/new-embedding-models-and-api-updates)

---

## #31 / Q6 — Vector databases: Pinecone vs Weaviate vs pgvector vs Chroma vs Qdrant

### Короткий ответ
**Для большинства проектов хватит pgvector в Postgres. Pinecone / Qdrant — когда scale > 10M vectors. Weaviate если нужны hybrid+graph фичи. Chroma — только для прототипов.**

### Сравнение

| DB | Hosted | Self-host | Hybrid search | Filter | Best for |
|----|--------|-----------|---------------|--------|----------|
| **pgvector** | Любой managed Postgres (Neon, Supabase, RDS) | Да | Да (через FTS / ParadeDB) | SQL where | 90% случаев. Если уже есть Postgres — берёшь сразу |
| **Pinecone** | Только cloud | Нет | Sparse-dense (alpha) | Metadata | Easy ops, hosted-only продукт. Pricey at scale |
| **Qdrant** | Cloud + self | Да | Да (sparse vectors built-in) | Rich filter DSL | Performance-sensitive, on-prem |
| **Weaviate** | Cloud + self | Да | BM25 + vector native | Rich | Когда хочется граф-связи + RAG в одном |
| **Chroma** | — | Да (embedded) | Limited | Basic | Локальная разработка / Jupyter notebooks |
| **Milvus** | Cloud + self | Да | Да | Да | Big scale (миллиарды) |

### Decision tree

```
У тебя уже есть Postgres? → pgvector
Нужно > 10M vectors с p99 < 50ms? → Pinecone / Qdrant
Сложные filters + bigger dataset + on-prem? → Qdrant
Прототип / Jupyter? → Chroma
Хочешь knowledge graph поверх RAG? → Weaviate
```

### Подвох с Pinecone
- Сложно делать exact match filter на больших dataset
- Нет full-text search — для hybrid придётся ставить отдельный Elasticsearch / OpenSearch
- Lock-in: миграция оттуда — re-embed весь корпус

### Что использовать в твоём chat-with-docs project
**pgvector**. Causes:
- Bun/Next.js stack → Supabase / Neon один SQL connection обслуживает и data, и embeddings
- На interview можно показать "I picked pgvector because..." — это zero-bullshit choice
- Production-ready: Notion, Cursor, многие YC RAG-стартапы на pgvector

### Sources
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [Supabase — pgvector guide](https://supabase.com/docs/guides/ai/vector-columns)
- [Comparing vector DBs (LangChain blog)](https://blog.langchain.dev/)

---

## #32 / Q7 — pgvector: HNSW vs IVFFlat индексы

### Короткий ответ
**HNSW = граф соседей, лучший recall, дороже build/memory. IVFFlat = кластеризация, дешевле build, нужно tuning. Для < 1M vectors HNSW почти всегда выбор.**

### Зачем индекс
Без индекса pgvector делает sequential scan — O(n) на каждый запрос. На 100k vectors это ~100ms, на 1M — секунды. Индекс делает ANN (approximate nearest neighbor) с ~5-50ms latency.

### HNSW (Hierarchical Navigable Small World)

```sql
CREATE INDEX ON docs USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

- **Структура**: многоуровневый граф соседних точек, верхние уровни sparse, нижние dense
- **Параметры**:
  - `m` (connections per node): 16-64. Больше → лучше recall, больше memory
  - `ef_construction` (build accuracy): 64-200. Больше → дольше build, лучше index
  - `ef_search` (query accuracy, runtime): 40-200, выставляешь per query
- **Pros**: high recall (95-99%), стабильно быстрый
- **Cons**: build медленный, RAM-hungry (~2-3x size of vectors)

### IVFFlat (Inverted File with Flat compression)

```sql
CREATE INDEX ON docs USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

- **Структура**: k-means кластеры. Query → найди ближайшие N кластеров → exact search внутри
- **Параметры**:
  - `lists`: ≈ √n (например, 100 для 10k, 1000 для 1M)
  - `probes` (runtime): сколько кластеров проверять. Больше → recall, медленнее
- **Pros**: быстрый build, меньше RAM
- **Cons**: recall шатается, requires recall tuning, перестраивай при изменении distribution

### Когда что

- **< 1M vectors, latency-sensitive** → HNSW
- **> 10M vectors, can tolerate recall < 90%** → IVFFlat
- **Часто insert / update** → IVFFlat (HNSW дорого rebuild)
- **Read-heavy / append-only** → HNSW

### Practice gotcha

`vector_cosine_ops` vs `vector_l2_ops` vs `vector_ip_ops` — должен совпадать с твоей метрикой. Если эмбеддинги нормализованы (OpenAI), можешь юзать `vector_ip_ops` (inner product / dot product) — он быстрее cosine.

### Sources
- [pgvector — Indexing](https://github.com/pgvector/pgvector#indexing)
- [Supabase — HNSW vs IVFFlat](https://supabase.com/blog/increase-performance-pgvector-hnsw)

---

## #33 / Q8 — Top-k retrieval: типичные значения и почему не 100

### Короткий ответ
**Типично k=5-20. Маленькое k → можешь промахнуться (recall miss). Большое k → шум в context, дороже, "lost in the middle" effect.**

### Trade-off curve

| k | Что происходит |
|---|----------------|
| 1-3 | Fast, дешево. Recall падает: если правильный chunk на позиции 4 — мимо |
| **5-10** | **Sweet spot для большинства RAG**. Достаточно chunks для покрытия + не перегружает prompt |
| 20-50 | Нужен только если потом rerank до top-3-5 (rerank умеет фильтровать шум) |
| 100+ | Почти всегда плохо: prompt перегружен, model теряется, дорого |

### Почему "просто увеличить k" не работает

1. **Lost in the middle**: модель забывает середину длинного контекста. На k=50 средние 30 chunks игнорируются.
2. **Context cost**: 50 chunks × 500 токенов = 25k input токенов на каждый запрос. Кратно дороже.
3. **Distractor problem**: каждый нерелевантный chunk — потенциальный отвлекатель, hallucination triggers.

### Паттерн "retrieve широко → rerank → take top-N"

```
embed query → vector search top-50 (recall) → rerank top-50 (precision) → take top-5 → prompt
```

Это стандартный production pattern. Дешевле и точнее, чем "просто k=5 на embedding match".

### Practice tip
В chat-with-docs:
- Start: k=10, no rerank → меряй faithfulness
- Если promp короткий и хочешь больше recall → retrieve k=30, rerank до top-5
- Метрики: hit@k (правильный ли chunk в топ-k), MRR (mean reciprocal rank)

### Sources
- [Pinecone — top-k retrieval explained](https://www.pinecone.io/learn/)
- [Lost in the Middle paper](https://arxiv.org/abs/2307.03172)

---

## #34 / Q9 — Reranking: зачем после retrieval, Cohere Rerank vs Voyage Rerank

### Короткий ответ
**Reranker — отдельная модель, которая берёт query + top-K chunks, ставит более точную similarity, возвращает sorted top-N. Cost: лишний API call. Benefit: precision @ k поднимается на 10-30%.**

### Почему vector search не идеален

Embedding similarity — это approximation. Модель компрессит весь смысл в один вектор. Для ranking нужен более precise signal — cross-encoder, который видит query И chunk одновременно.

```
Vector search (bi-encoder): embed(query) vs embed(chunk) — independent
Reranker (cross-encoder): score(query, chunk) — модель видит оба сразу, much smarter
```

### Major players

| Reranker | Latency / req | Цена | Заметки |
|----------|---------------|------|---------|
| **Cohere Rerank 3.5** | ~150ms на 100 docs | $2 / 1k searches | Топ accuracy на English |
| **Voyage rerank-2** | ~100ms | $0.05 / 1M tokens | Дешевле, multilingual |
| **Jina rerank** | ~80ms | Free tier есть | Open weights |
| Self-hosted (BGE-reranker) | depends | Free | На своём GPU |

### Когда стоит rerank

- **Domain-precision matters** (медицина, юриспруденция, finance) — обязательно
- **Большой корпус, retrieval ловит много шума** — обязательно
- **Маленький корпус (< 1000 docs), embedding точный** — не нужен
- **Latency-critical (< 500ms total)** — посчитай budget сначала

### Cost vs benefit на практике

Если retrieval @k=10 ловит правильный chunk на позиции 3-7 — reranker почти всегда поднимет его на 1-2. Это "cheap signal boost" для quality.

### Sources
- [Cohere Rerank docs](https://docs.cohere.com/docs/rerank-overview)
- [Voyage Rerank](https://docs.voyageai.com/docs/reranker)

---

## #35 / Q10 — Hybrid search: vector + BM25 (зачем оба)

### Короткий ответ
**Vector search ловит смысл, BM25 ловит exact matches (имена, IDs, термины). Hybrid = vector + BM25 + reciprocal rank fusion. Поднимает recall на 10-20% over pure vector.**

### Где vector search фейлит

```
Query: "What's the cap on Q3 bonus payouts mentioned in section 4.2?"
```
- "cap" / "Q3" / "4.2" — exact terms, embedding может промахнуться
- BM25 (TF-IDF style keyword match) — найдёт "4.2" сразу

```
Query: "How does the system handle authentication failures?"
```
- "authentication failures" — concept, BM25 может не найти если документ говорит "auth errors", "login problems"
- Vector — поймает синонимы

### Hybrid pipeline

1. Run vector search → top-50 by similarity
2. Run BM25 / FTS search → top-50 by keyword
3. Combine via **Reciprocal Rank Fusion (RRF)**:

```
RRF score = Σ 1 / (k + rank_in_method)   # k обычно = 60
```

4. Top-N по RRF → optional rerank → final

### Implementations

- **pgvector + Postgres FTS** (built-in `tsvector`): hybrid одним SQL запросом
- **Weaviate**: built-in `hybrid()` query, alpha-weighted
- **Pinecone**: sparse-dense vectors (alpha), но нужно pre-compute sparse vectors
- **Qdrant**: native sparse vectors via SPLADE / BM25 hybrid

### Когда hybrid обязателен

- Корпус с много proper nouns / IDs / version numbers (e.g. release notes, code docs)
- Multi-language content
- Юридические / scientific тексты с specific terminology

### Когда pure vector хватает

- Conversational, no jargon ("какие есть варианты доставки?")
- User не использует точную терминологию из документов

### Sources
- [Anthropic — Contextual retrieval (mentions hybrid)](https://www.anthropic.com/news/contextual-retrieval)
- [Weaviate — Hybrid search](https://weaviate.io/blog/hybrid-search-explained)

---

## #36 / Q11 — Metadata filtering: примеры use case

### Короткий ответ
**Метаданные на chunks (user_id, doc_type, date, language) позволяют фильтровать поиск. Критично для multi-tenancy, recency, compliance.**

### Use cases

**1. Multi-tenancy (изолируй данные пользователей)**
```sql
SELECT * FROM chunks
WHERE user_id = $1
ORDER BY embedding <=> $2
LIMIT 10;
```
Без этого — utenant A может увидеть данные tenant B. Security blocker.

**2. Recency boost / expiry**
```sql
WHERE created_at > NOW() - INTERVAL '90 days'
```
RAG over chat history, news, legal updates — старое часто шумит.

**3. Doc type / source**
```sql
WHERE doc_type IN ('contract', 'amendment')
AND jurisdiction = 'CA'
```
Например, legal RAG: только contracts из California.

**4. Permissions / ACL**
```sql
WHERE acl_groups && $user_acl_groups  -- array overlap
```
Enterprise RAG: пользователь видит только chunks из docs к которым у него access.

**5. Language / locale**
```sql
WHERE language = 'en'
```
Multi-language корпус — фильтр по языку запроса.

### Pre-filter vs post-filter

- **Pre-filter** (filter ДО ANN search): correct semantics, но ломает индексы. Postgres с pgvector — handles ok через partial index. Pinecone — поддерживает natively, но slow на high cardinality.
- **Post-filter** (retrieve k больше → filter в Python): дешевле для DB, но recall может упасть если фильтр режет много.

Pinecone и Qdrant умеют pre-filter "smart" — pushing filter в индекс.

### Schema design tip

В pgvector делай separate columns под top-3 metadata fields (для btree index), всё остальное в JSONB:
```sql
CREATE TABLE chunks (
  id uuid primary key,
  user_id uuid not null,
  doc_id uuid not null,
  created_at timestamptz not null,
  metadata jsonb,
  embedding vector(1536),
  content text
);
CREATE INDEX ON chunks (user_id);
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);
```

### Sources
- [Pinecone — Metadata filtering](https://docs.pinecone.io/guides/data/filter-with-metadata)
- [Qdrant — Filtering](https://qdrant.tech/documentation/concepts/filtering/)

---

## #37 / Q12 — Citations: как заставить LLM ссылаться на источник

### Короткий ответ
**Подавай chunks с явным id ([1], [2]…), в system promptе требуй "cite using [n]". Дополнительно: post-process — extract ссылки и валидируй, что они существуют.**

### Базовый паттерн

**1. Format chunks with IDs**
```
Context:
[1] (source: contract.pdf, page 4)
   "Payment shall be made within 30 days..."

[2] (source: amendment.pdf, page 1)
   "The payment term is hereby extended to 60 days..."

Question: When are payments due?

Answer (cite using [n]):
```

**2. System prompt rule**
```
You are a research assistant. Always cite your sources using [n] notation
matching the context numbers. If the context doesn't contain the answer,
say "I don't know" — do not invent information.
```

**3. Output**
> Per amendment [2], payments are due within 60 days, superseding the original 30-day term [1].

### Anthropic — Citations API (built-in)

Claude поддерживает native citations через `citations: { enabled: true }` параметр на content blocks. Возвращает structured `citations` array с char-offsets обратно в source — без post-processing.

```ts
{
  role: "user",
  content: [
    {
      type: "document",
      source: { type: "text", media_type: "text/plain", data: "..." },
      citations: { enabled: true }
    },
    { type: "text", text: "Question..." }
  ]
}
```

### Validation step

LLM может галлюцинировать `[5]` когда у тебя только 3 chunks. Post-process:
```ts
const citedIds = [...response.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]));
const invalid = citedIds.filter(id => id > chunks.length || id < 1);
if (invalid.length) {
  // retry, или strip invalid citations, или surface as warning
}
```

### UI pattern

В chat-with-docs UI:
- Inline `[1]` → hover показывает chunk text
- Click → opens source PDF на нужной странице
- Side panel: список всех cited sources

### Sources
- [Anthropic — Citations API](https://docs.claude.com/en/docs/build-with-claude/citations)
- [Perplexity engineering blog — Citations](https://www.perplexity.ai/)

---

## #38 / Q13 — Failure modes RAG (и как их ловить)

### Короткий ответ
**4 главных failure modes: bad chunks, embedding mismatch, retriever miss, LLM игнорирует context. Каждая требует своей диагностики и фикса.**

### Failure 1 — Bad chunks (ingestion qualitiy)

**Симптомы**: chunks обрезаны посреди предложения; таблицы превратились в кашу; PDF из image не parse; markdown потерял headers.

**Диагностика**: спот-чек 20 random chunks. Можешь ли ты сам, читая chunk, понять о чём он без контекста? Если нет — chunk bad.

**Fix**:
- Use document-aware parser (pymupdf, unstructured, llama-parse)
- Tables → preserve as markdown / extract отдельно
- Add doc title + section header в начало каждого chunk

### Failure 2 — Embedding mismatch (semantic gap)

**Симптомы**: query "how do I cancel my subscription" не находит chunk "Cancellation policy: send email to billing@..."

**Причина**: embedding модели иногда плохо матчат question → answer phrasing.

**Fix**:
- **HyDE** (Hypothetical Document Embeddings): сгенерируй fake "ideal answer" из LLM, embed его, search по нему
- **Query expansion**: extra paraphrases query, search по всем
- Лучше embedding модель (Voyage > generic)

### Failure 3 — Retriever miss (правильный chunk не в top-k)

**Симптомы**: chunk существует в DB, релевантный, но top-10 его не возвращает.

**Диагностика**: смотришь rank correct chunk vs returned. Если correct на 25-50 — retrieval narrow.

**Fix**:
- Bigger k + rerank
- Hybrid search (BM25 + vector)
- Better embedding model
- Contextual retrieval (Anthropic style)

### Failure 4 — LLM ignores / contradicts context

**Симптомы**: правильный chunk в context, но answer hallucinated.

**Причина**: LLM использует prior knowledge поверх context. Особенно частит на well-known темах.

**Fix**:
- System prompt: "Only use information from the Context section. If absent, say 'I don't know'."
- Lower temperature (0)
- Stronger model (Sonnet > Haiku) для critical apps
- LLM-as-judge eval to catch это in CI

### Diagnostic decision tree

```
Wrong answer →
  1. Was correct chunk in context?
     NO → retrieval problem (Failure 2 or 3)
     YES → continue
  2. Did LLM cite the chunk?
     NO → LLM ignored context (Failure 4)
     YES → check chunk quality (Failure 1)
```

### Sources
- [LangChain — RAG troubleshooting](https://python.langchain.com/docs/concepts/rag/)
- [Anthropic — Reducing hallucinations](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/reduce-hallucinations)

---

## #39 / Q14 — Eval RAG: RAGAS, faithfulness, answer relevance, context precision/recall

### Короткий ответ
**4 ключевые метрики: faithfulness (answer соответствует контексту), answer relevance (ответ на вопрос), context precision (топ-k не содержит шума), context recall (топ-k содержит нужную инфу). RAGAS / DeepEval / Braintrust автоматизируют.**

### 4 главные метрики

**1. Faithfulness**
- "Все ли claims в ответе подтверждены контекстом?"
- LLM-as-judge: extract claims из answer → для каждого check, supports ли его context
- Score 0-1

**2. Answer relevance**
- "Отвечает ли answer на изначальный вопрос?"
- Reverse-generation: сгенерировать "вероятный вопрос" из answer, посчитать similarity к оригинальному
- Score 0-1

**3. Context precision**
- "Релевантны ли retrieved chunks к запросу?"
- Mean precision @ k positions
- Если top-1 релевантен — precision высокая. Если только 5-й релевантен — низкая

**4. Context recall**
- "Содержит ли retrieved context всю инфу нужную для ответа?"
- Требует **ground-truth answer** — берёшь GT, разбиваешь на claims, для каждого check, есть ли подтверждение в context

### Practical setup

**Golden dataset**: 50-200 пар (question, ground-truth-answer, ground-truth-source). Собирай вручную или semi-auto (LLM генерит вопросы по chunks, ты curates).

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall

results = evaluate(
    dataset,  # ваш golden set
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
)
```

### CI integration

Каждый PR с изменением prompt / retriever / embedding model → run eval → fail если регрессия > 5%.

### Other tools

- **Braintrust** — proprietary, лучший UX для prompt engineering loops
- **Promptfoo** — open source, YAML-based
- **LangSmith** — если уже на LangChain
- **DeepEval / RAGAS** — open source eval frameworks

### Pitfall: LLM-as-judge bias

- Favors verbose answers
- Often agrees with majority opinion (sycophancy)
- May not detect subtle hallucinations

→ Always have **human-labeled subset** (10-20 examples) как ground truth для validation самого judge.

### Sources
- [RAGAS docs](https://docs.ragas.io/)
- [Braintrust eval guide](https://www.braintrust.dev/docs/guides/evals)

---

## #40 / Q15 — When NOT to use RAG

### Короткий ответ
**RAG — overengineering для маленьких корпусов, realtime data, аналитики через corpus, или когда нужна агентная логика. Знать "когда не RAG" — отличает senior от cargo-culter.**

### Когда RAG не нужен

**1. Корпус маленький (< 50k токенов)**
Просто положи всё в context. Один Sonnet call за $0.60 на 200k context — дешевле чем поднимать pgvector + ingestion pipeline.

**2. Real-time / транзакционные данные**
"Сколько заказов сегодня?" — это SQL / API call, не embedding match. Tool use / agent с DB tool, не RAG.

**3. Aggregation across whole corpus**
"Сколько документов упоминают X" — RAG retrieve top-k, не считает global. Делай structured query / SQL / counter index.

**4. Вопрос требует reasoning over precise structure**
"Найди все contracts где payment term > 60 days AND renewal в next 90 days" — это structured query, не similarity search.

**5. Latency-critical (< 200ms total)**
RAG pipeline (embed + search + rerank + LLM) обычно 1.5-3 сек. Если SLA жёстче — pre-compute / cache / меньше steps.

**6. Cold start с нулём данных**
Если у пользователя 5 документов — RAG overkill. Просто prompt с full content.

### Альтернативы RAG

- **Long context** — Gemini 2.5 1M, Claude 200k. Если данных мало.
- **Tool use / agents** — для realtime data
- **Fine-tune** — для consistent style / format (но не для facts!)
- **Structured query** (SQL / GraphQL) — для precise filtering / aggregation
- **Hybrid systems** — RAG для unstructured docs + SQL для structured data, LLM решает что использовать

### Senior signal

На interview спрашивают "Built X with RAG". Сильный ответ: "Сначала мы попробовали без RAG, просто кладя последние N docs в context. Это работало для tier-1 пользователей. RAG ввели когда [конкретная метрика] упала на dataset > 100 docs". Это показывает, что ты не cargo-cult'ишь "AI-фичу = RAG".

### Sources
- [Anthropic — When to use RAG vs long context](https://docs.claude.com/en/docs/build-with-claude/contextual-rag)
- [LlamaIndex — RAG vs alternatives](https://docs.llamaindex.ai/)

---

## Self-assessment checklist (RAG)

После прочтения отметь честно:

- [ ] Могу за 60с объяснить зачем RAG vs long-context
- [ ] Знаю 4 chunking strategies + когда какая
- [ ] Объясню sweet spot chunk size + почему
- [ ] Cosine vs dot vs euclidean — когда что
- [ ] Назову 3 embedding модели + когда какую брать
- [ ] Аргументирую выбор pgvector vs Pinecone
- [ ] HNSW vs IVFFlat — trade-off
- [ ] Дам осмысленный k + объясню почему не 100
- [ ] Объясню reranker и когда обязателен
- [ ] Знаю hybrid search и реализую RRF
- [ ] Спроектирую schema с metadata filtering
- [ ] Реализую citations + validate их programmatically
- [ ] Назову 4 RAG failure modes + диагностика каждого
- [ ] Знаю 4 RAGAS метрики + что они меряют
- [ ] Назову 3+ случая когда RAG НЕ нужен

---

## Связанные файлы
- [interview-question-bank.md](interview-question-bank.md) — секция 6 (RAG)
- [core-40-priority.md](core-40-priority.md) — #27-31 (RAG must-knows)
- [career-ai-pivot.md](career-ai-pivot.md) — project 1 = chat-with-docs (apply this knowledge)
- [answers-llm.md](answers-llm.md) — base LLM concepts (предпосылка для RAG)
- answers-agents.md — TODO (next)

Last updated: 2026-05-09
