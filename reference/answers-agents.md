# Answers — Agents & Tool Use

> Полные ответы на 12 вопросов из interview-question-bank.md секция 7 + core-40 #32-34. Это твой проект 2 (research-agent). Спросят на любом интервью где упоминается "AI agent" / "tool use" / "LangGraph".

## Sources (canonical)

- **Anthropic — Building effective agents**: https://www.anthropic.com/research/building-effective-agents
- **Anthropic — Tool use overview**: https://docs.claude.com/en/docs/build-with-claude/tool-use/overview
- **OpenAI — Function calling guide**: https://platform.openai.com/docs/guides/function-calling
- **LangGraph docs**: https://langchain-ai.github.io/langgraph/
- **Langfuse docs**: https://langfuse.com/docs
- **ReAct paper (Yao et al, 2022)**: https://arxiv.org/abs/2210.03629
- **Anthropic Cookbook — Agents**: https://github.com/anthropics/anthropic-cookbook/tree/main/tool_use
- **Latent Space — State of Agents**: https://www.latent.space/

---

## Q1 — Что такое agent в LLM-смысле

### Короткий ответ
**Agent = LLM в loop, который может вызывать tools, наблюдать результат и решать следующий шаг сам. Минимум: модель + tool registry + execution loop + stopping condition.**

### Спектр от workflow до agent (по Anthropic)

```
    Predictable                                     Autonomous
    ←─────────────────────────────────────────────→
    [Single LLM]  [Workflow]   [Workflow + tool]   [Agent]
     prompt         steps       fixed steps with    LLM выбирает
     → answer    chained        LLM in каждом       инструменты + loop
                 (you orchestrate)                   (LLM orchestrates)
```

- **Workflow** — ты decide последовательность steps, LLM делает свою часть в каждом
- **Agent** — LLM решает что делать следующим, ты предоставляешь tools

### Минимальное определение agent (working def)

> Система, где LLM динамически направляет свои собственные actions и выбор tools, продолжая цикл "think → act → observe" пока не достигнет цели или stopping criterion.

### Когда agent vs workflow

**Workflow когда**:
- Steps известны заранее
- Predictability важнее flexibility
- Cost-sensitive (workflow дешевле — fewer LLM calls)

**Agent когда**:
- Задача open-ended (research, debugging)
- Steps зависят от intermediate findings
- Variable problem complexity

### Anti-pattern: "agent для всего"

Anthropic в "Building effective agents" жёстко: **start simple. Most production AI features should be workflows, not agents.** Агент → когда workflow доказанно недостаточен.

### Sources
- [Anthropic — Building effective agents](https://www.anthropic.com/research/building-effective-agents)

---

## Q2 — ReAct pattern (Reasoning + Acting)

### Короткий ответ
**ReAct = template "Thought → Action → Observation → Thought → ..." пока модель не вернёт финальный answer. Самая базовая агентная архитектура.**

### Структура (из оригинальной paper)

```
Question: Where was the founder of Anthropic born?

Thought: I need to find who founded Anthropic.
Action: search("Anthropic founder")
Observation: Anthropic was co-founded by Dario Amodei and Daniela Amodei.

Thought: I need Dario's birthplace specifically.
Action: search("Dario Amodei birthplace")
Observation: Dario Amodei was born in San Francisco, California.

Thought: I have the answer.
Final Answer: San Francisco, California.
```

### Почему "reasoning + acting" вместе работает

- **Reasoning alone** (chain-of-thought) — model может галлюцинировать факты
- **Acting alone** (просто tool calls) — нет планирования, легко увязнуть
- **Combo**: thoughts ground действия в плане, actions ground reasoning в реальности

### Modern implementation — через native tool use

В 2025 не пишешь ReAct руками через regex parsing. Anthropic / OpenAI tool use API делает это natively:

```ts
while (response.stop_reason !== 'end_turn') {
  if (response.stop_reason === 'tool_use') {
    const toolUse = response.content.find(b => b.type === 'tool_use');
    const result = await executeTool(toolUse.name, toolUse.input);
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: result }]
    });
    response = await client.messages.create({ model, tools, messages });
  }
}
```

### Когда ReAct underperforms

- Сложные multi-step plans → лучше **plan-and-execute** (сначала план целиком, потом execution)
- High-stakes действия → **human in the loop** на каждый action
- Низкая latency → ReAct делает много round-trips, рассмотри parallel tool calls

### Sources
- [ReAct paper](https://arxiv.org/abs/2210.03629)
- [Anthropic Tool use loop](https://docs.claude.com/en/docs/build-with-claude/tool-use/overview#multi-turn-tool-use)

---

## Q3 — Tools / function calling: формат и почему description критичен

### Короткий ответ
**Tool = JSON schema с name + description + parameters. Модель решает "вызывать или нет" по description, не по name. Слабая description = модель промахивается.**

### Anatomy

```ts
{
  name: "get_weather",                    // identifier (snake_case)
  description: "Get current weather for a city. Use this when the user asks about weather conditions, temperature, or what to wear based on weather. Returns temp in celsius and conditions.",
  input_schema: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "City name in English (e.g., 'Buenos Aires', 'San Francisco')"
      },
      units: {
        type: "string",
        enum: ["celsius", "fahrenheit"],
        description: "Temperature unit. Default: celsius"
      }
    },
    required: ["city"]
  }
}
```

### Почему description критична

- Модель никогда не видит твой Python/TS код. Она видит только описание
- Description — это "as-if-prompt" для модели "когда вызвать"
- На 5+ tools дисциплина в descriptions определяет accuracy

### Best practices descriptions

**1. Tell model WHEN to use the tool, not just what it does**
```
❌ "Sends an email."
✅ "Send an email to a recipient. Use this when the user explicitly asks
   to send/email/notify someone. Do NOT use for drafting — use draft_email
   for that."
```

**2. Document edge cases in description**
```
"Returns top-10 results. If user asks for more, paginate by passing offset.
 Returns empty array if no matches (not an error)."
```

**3. Include examples on параметры**
```
{
  query: {
    type: "string",
    description: "Search query. Examples: 'Q3 revenue 2024', 'invoice #1234'"
  }
}
```

**4. Use parameter names AS prompts**
- `customer_email` лучше `email_addr` — модель понимает domain

### Multi-tool decision

Когда у тебя 10+ tools, модель путается. Стратегии:
- **Group**: разбей на под-агентов (e.g., research_agent vs email_agent), каждый держит < 5 tools
- **Tool selection step**: первый LLM call выбирает 3-5 relevant tools из всех, потом второй call с этим subset
- **Hierarchical tools**: один "search" tool с типом параметра вместо 10 отдельных search_emails / search_docs / etc.

### Sources
- [Anthropic — How to implement tool use](https://docs.claude.com/en/docs/build-with-claude/tool-use/overview)
- [OpenAI — Function calling guide](https://platform.openai.com/docs/guides/function-calling)

---

## Q4 — Stopping criteria: как избежать infinite loop

### Короткий ответ
**4 типа stop: 1) модель вернула final answer (`stop_reason='end_turn'`), 2) max iterations (hard cap), 3) timeout (wall-clock), 4) cost budget. Production agent ВСЕГДА имеет хотя бы 2-3 из них.**

### Каждый critical

```ts
const MAX_ITERATIONS = 20;
const MAX_WALL_TIME_MS = 60_000;
const MAX_TOKEN_BUDGET = 50_000;
const HUMAN_APPROVAL_TOOLS = new Set(['send_email', 'make_payment', 'delete_file']);

let iteration = 0;
let totalTokens = 0;
const start = Date.now();

while (true) {
  iteration += 1;
  if (iteration > MAX_ITERATIONS) throw new Error('max_iterations');
  if (Date.now() - start > MAX_WALL_TIME_MS) throw new Error('timeout');
  if (totalTokens > MAX_TOKEN_BUDGET) throw new Error('cost_limit');

  const response = await llm.call({ tools, messages });
  totalTokens += response.usage.input_tokens + response.usage.output_tokens;

  if (response.stop_reason === 'end_turn') {
    return response.content;
  }

  if (response.stop_reason === 'tool_use') {
    for (const tool of toolUseBlocks(response)) {
      if (HUMAN_APPROVAL_TOOLS.has(tool.name)) {
        await waitForUserApproval(tool);
      }
      const result = await execute(tool);
      messages.push(toolResultMessage(tool, result));
    }
    continue;
  }

  throw new Error(`unexpected stop_reason: ${response.stop_reason}`);
}
```

### Common infinite-loop patterns

**1. Modal "I keep trying same tool with same args"**
- Detect via memo of (tool, args) hashes — если повторяется → break or change strategy

**2. Tool returns error → model retries forever**
- Limit retries per tool (3 max), then surface error to user

**3. Model disagrees with itself across iterations**
- Add "previous attempts" summary в context каждые N steps

### Sane defaults для prod

| Param | Value | Why |
|-------|-------|-----|
| max_iterations | 10-20 | Почти все honest tasks укладываются. >20 = bug |
| wall_clock | 60-120s | UX cap. После — async / background |
| token_budget | 50-100k | $0.30-1.50 per task на Sonnet |
| max_per_tool_retries | 3 | Чтоб не зацикливался на failing tool |

### Sources
- [Anthropic — Multi-turn tool use](https://docs.claude.com/en/docs/build-with-claude/tool-use/overview)
- [LangGraph — Recursion limit](https://langchain-ai.github.io/langgraph/)

---

## Q5 — Memory в агенте: short-term, long-term, semantic

### Короткий ответ
**3 типа: short-term (conversation history в context), long-term (persistent storage с retrieval), semantic (vector store с прошлыми interactions). Большинство агентов ограничиваются short-term — это нормально.**

### Short-term (working memory)

- Это твои `messages` array в LLM call
- Lives в context window только для этой сессии
- Limit: чем больше — тем дороже + slow + lost-in-middle

**Trimming strategies**:
1. **Sliding window**: keep last N exchanges
2. **Summary + recent**: summarize old, keep recent verbatim
3. **Importance-based**: rank past messages, keep top-K

### Long-term (persistent memory)

- Сохраняешь в external store (Postgres, vector DB)
- Загружаешь по ключу или по semantic search в начале сессии
- Use cases: user preferences, prior project state, learned facts

```ts
// Pseudo-API
const memory = await db.memories.find({ userId, topic: 'preferences' });
const systemPrompt = `${baseSystem}\n\nUser preferences:\n${memory}`;
```

### Semantic memory (vectorized history)

- Каждый прошлый exchange embed'ишь и кладёшь в vector store
- При новом запросе — retrieve top-k relevant past exchanges
- Это "RAG over my own conversation history"

**Frameworks**:
- **MemGPT / Letta** — explicit memory tiers (working, archival)
- **mem0** — abstraction layer для memory CRUD
- LangGraph `MemorySaver` — built-in checkpoint persistence

### Pattern: "user_facts" memory

Вместо raw history, агент извлекает structured facts:
```json
{
  "name": "Anton",
  "location": "Buenos Aires",
  "preferred_stack": ["Next.js", "TypeScript", "Anthropic API"],
  "current_project": "chat-with-docs"
}
```
Cheaper, более точный, easier to validate.

### Pitfall

**Memory ≠ truth**. Старые preferences протухают. Реализуй TTL / periodic re-validation. Worse: memory injection — ничто не мешает другому юзеру записать фейк memory если share session.

### Sources
- [LangGraph — Memory](https://langchain-ai.github.io/langgraph/concepts/memory/)
- [mem0 docs](https://docs.mem0.ai/)

---

## Q6 — Multi-agent vs single-agent

### Короткий ответ
**Default: single-agent. Multi-agent рассмотри только когда tool count > 10, или когда задача декомпозируется на независимые поддомены. Multi-agent добавляет сложности экспоненциально.**

### Когда multi-agent имеет смысл

**1. Tool overload**
Если у одного агента > 10 tools, accuracy выбора падает. Разбей по доменам:
- `research_agent` (search, summarize, cite)
- `email_agent` (draft, send, schedule)
- `code_agent` (read_file, edit, run_tests)

**2. Параллельные задачи**
Manager agent декомпозирует → spawns 3 worker'ов в parallel → собирает results.
Например, "compare these 5 products" → 5 параллельных research под-задач.

**3. Specialization**
Разные модели для разных задач:
- GPT-5 для creative writing
- Claude Sonnet для analytical / coding
- Haiku для cheap classification

### Архитектуры multi-agent

**Supervisor pattern**: один LLM-orchestrator выбирает к какому sub-agent отправить запрос
```
User → Supervisor → [Agent A | Agent B | Agent C] → Supervisor → User
```

**Hierarchical**: дерево агентов, каждый node имеет свой scope
```
CEO → CTO → SWE_agent
          → DevOps_agent
    → CMO → Marketing_agent
```

**Network**: peer-to-peer, агенты direct talk друг к другу
- Самая мощная, самая хаотичная

### Подвохи

**1. Cost explosion**
3 agents × 5 LLM calls each = 15 calls. Латентность складывается, токены ×3-10.

**2. Debug nightmare**
Когда что-то ломается — какой агент виноват? Какая communication потерялась? Без observability — швах.

**3. Coordination problems**
Agents disagree → recovery? Loops между agents → break? Кто owns final decision?

### Anthropic's стойкая позиция

> "Most production AI applications use workflows or single agents. Multi-agent systems should be reserved for cases where the parallelism or specialization clearly outweighs the operational complexity."

### Sources
- [Anthropic — Building effective agents](https://www.anthropic.com/research/building-effective-agents)
- [LangGraph — Multi-agent](https://langchain-ai.github.io/langgraph/concepts/multi_agent/)

---

## Q7 — LangGraph vs LangChain vs vanilla — honest opinion

### Короткий ответ
**LangChain — over-abstracted, magic, сложно дебажить. LangGraph — explicit state machine, гораздо лучше. Vanilla (just SDK + your own loop) — выигрывает для простых агентов и take-home demos. На interview скажи: "vanilla для < 5 tools, LangGraph для production multi-step с branching".**

### LangChain (legacy)

- Изначально chain abstractions (LCEL, RunnableSequence)
- Magic methods, неочевидные defaults
- Под капотом — куча обёрток
- Криминал: разные функции одного name делают разное в разных версиях
- **Critique mainstream**: "LangChain solves problems that you only have because you used LangChain"

### LangGraph

- Same team, but different mental model: **state machine / graph of nodes**
- Каждый node = function, edges = transitions, state — explicit
- Build-in checkpointing, time-travel, human-in-loop
- Visible reasoning через `.stream()` events
- Production-grade (используется в LangSmith, Cursor's research mode)

```python
from langgraph.graph import StateGraph, END

graph = StateGraph(MyState)
graph.add_node("plan", plan_node)
graph.add_node("execute", execute_node)
graph.add_node("reflect", reflect_node)
graph.add_edge("plan", "execute")
graph.add_conditional_edges("execute", should_continue, {True: "reflect", False: END})
graph.add_edge("reflect", "plan")
graph.set_entry_point("plan")
app = graph.compile(checkpointer=memory_saver)
```

### Vanilla (just SDK)

```ts
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();
// Твой собственный loop из ~30 строк
```

**Когда vanilla**:
- < 5 tools
- Линейный flow без branching
- Take-home / demo / прототип
- Хочешь полный контроль (кэширование, retry policy, custom telemetry)

**Когда LangGraph**:
- Multi-step с conditional branching
- Нужны checkpoints / time-travel debugging
- Human-in-loop на production
- Multi-agent

### Что говорить на interview

> "Я начинаю с vanilla SDK loop — ~30 строк, никаких abstractions. Если задача растёт до conditional branches и persistent state — мигрирую на LangGraph. LangChain в новых проектах не использую — слишком много magic, дольше дебажить чем писать руками."

Это — opinionated, honest, demonstrates judgment. Bonus: показывает что знаком с холиваром, не cargo-cult'ишь.

### Sources
- [LangGraph docs](https://langchain-ai.github.io/langgraph/)
- [HN discussion — LangChain criticism](https://news.ycombinator.com/) (поищи "LangChain")

---

## Q8 — Agent observability: Langfuse, Helicone, LangSmith

### Короткий ответ
**Без observability агенты — black box. Минимум: trace каждого LLM call (prompt, output, tokens, latency, cost) + tool calls + errors. Топовые tools: Langfuse (open source), LangSmith (LangChain ecosystem), Helicone (proxy-based).**

### Что трекать на каждом trace

| Поле | Зачем |
|------|-------|
| `trace_id` | Группировка всех LLM calls в одну user задачу |
| `user_id` | Per-user cost / debug |
| Input messages | Replay / debug "почему модель решила так" |
| Output content | Quality review |
| Model + version | Регрессия после обновления модели |
| Token usage (in/out) | Cost tracking |
| Latency | p50/p95/p99 SLA |
| Tool calls | Который tool вызывался, с какими args, что вернул |
| Errors / retries | MTTR |
| User feedback (👍/👎) | Quality signal |

### Tools comparison

**Langfuse** (open source, my pick для проекта 2)
- Self-hostable + cloud
- SDK для Python/TS, integrates с LangChain, LangGraph, vanilla SDK
- Bonus: prompt management, evals, datasets

```ts
import { Langfuse } from "langfuse";
const lf = new Langfuse({ publicKey, secretKey });
const trace = lf.trace({ userId, name: "research_agent_run" });
const generation = trace.generation({
  model: "claude-sonnet-4-6",
  input: messages,
});
const response = await client.messages.create({...});
generation.end({ output: response.content, usage: response.usage });
```

**LangSmith**
- Proprietary, LangChain ecosystem
- Best для LangGraph projects
- Pricey at scale

**Helicone**
- Proxy-based: меняешь base_url → proxies через Helicone
- Zero code changes
- Но: latency overhead, vendor lock на proxy

**Honeycomb / OTEL** — если у тебя уже observability stack
- OpenLLMetry / OTEL semantic conventions для LLM
- Native integration в Honeycomb / Datadog

### What good agent traces look like

```
trace: research_agent_run (user_123)
├── llm_call_1 (planning, 850ms, 1200 tokens, $0.012)
├── tool_call: web_search("AI startup hiring 2026") (1.2s)
├── llm_call_2 (digest results, 1100ms, 2500 tokens, $0.025)
├── tool_call: scrape_url(...) (3.4s)
├── llm_call_3 (final answer, 900ms, 800 tokens, $0.008)
└── total: 7.5s, 4500 tokens, $0.045
```

### Sources
- [Langfuse docs](https://langfuse.com/docs)
- [OpenLLMetry](https://github.com/traceloop/openllmetry)

---

## Q9 — Error handling: retry / surface / fallback

### Короткий ответ
**3 уровня: tool errors (модель решает retry/abandon), LLM errors (твой код retry с backoff), validation errors (re-prompt с error context). Главное — не "молча проглотить".**

### Tool errors — surface to model

```ts
try {
  const result = await executeTool(tool);
  return { type: "tool_result", tool_use_id: tool.id, content: JSON.stringify(result) };
} catch (err) {
  return {
    type: "tool_result",
    tool_use_id: tool.id,
    is_error: true,
    content: `Error: ${err.message}. Possible causes: ${suggestCauses(err)}.`,
  };
}
```

Модель решит: retry с другим args, попробовать другой tool, surface к user. **Не retry tool молча в твоём коде** — модель не узнает что error уже была.

### LLM API errors — твой retry

| Error | Strategy |
|-------|----------|
| 429 rate limit | Exponential backoff (1s, 2s, 4s, 8s) с jitter, max 5 retries |
| 500/502/503 | Retry 3x с backoff |
| 529 overloaded (Anthropic) | Backoff + fallback на другую модель / провайдера |
| 400 invalid_request | НЕ retry — это твой bug, fail loud |
| Timeout | Retry max 2x, total timeout cap |

```ts
async function callWithRetry(fn, opts = { maxRetries: 5, baseDelay: 1000 }) {
  for (let i = 0; i < opts.maxRetries; i++) {
    try { return await fn(); }
    catch (err) {
      if (!isRetryable(err) || i === opts.maxRetries - 1) throw err;
      const delay = opts.baseDelay * 2 ** i + Math.random() * 200;
      await sleep(delay);
    }
  }
}
```

### Validation errors — re-prompt loop

Если модель вернула broken JSON / missing required field:

```ts
const schema = z.object({ name: z.string(), score: z.number() });
let attempt = 0;
while (attempt < 3) {
  const raw = await llm.call({ messages });
  const parsed = schema.safeParse(JSON.parse(raw));
  if (parsed.success) return parsed.data;
  messages.push({ role: "assistant", content: raw });
  messages.push({
    role: "user",
    content: `Validation error: ${parsed.error.message}. Please fix and retry.`,
  });
  attempt += 1;
}
throw new Error("validation_failed_after_retries");
```

### Fallback policies

- **Model fallback**: если Sonnet 529 — fallback на Opus или OpenAI
- **Degraded UX**: если RAG retrieval failed — answer "I don't have docs for this"
- **Async retry**: если synchronous timeout — drop в queue, notify user later

### Don't do
- ❌ Catch-all `try { ... } catch { return null }` — теряешь data о причине fail
- ❌ Молчаливый retry без логирования — невозможно дебажить
- ❌ Hardcoded sleep without jitter — thundering herd

### Sources
- [Anthropic — Errors](https://docs.claude.com/en/api/errors)
- [Stripe Engineering — Idempotency keys](https://stripe.com/blog/idempotency)

---

## Q10 — Cost control: max iterations, timeouts, budget

### Короткий ответ
**3 hard limits на каждом запросе: max_iterations (10-20), wall-clock timeout (60-120s), token budget ($0.50-2.00 per run). Без этого один bug = $5000 cloud bill за ночь.**

### Реальные costs пример (mid-2025 цены)

```
Sonnet 4.6:  input $3 / 1M, output $15 / 1M
Opus 4.6:    input $15 / 1M, output $75 / 1M
Haiku 4.5:   input $1 / 1M, output $5 / 1M
```

Один research-agent run типично:
- 5-10 LLM calls × 5-10k tokens = 50-100k tokens
- ≈ $0.30-0.60 на Sonnet, $1.50-3.00 на Opus

100 users × 10 запросов/день = 1000 runs = **$300-600/day** на one feature.

### Defensive instrumentation

```ts
class CostTracker {
  totalTokens = 0;
  totalCost = 0;
  callCount = 0;

  add(usage, model) {
    const inCost = (usage.input_tokens / 1_000_000) * PRICES[model].input;
    const outCost = (usage.output_tokens / 1_000_000) * PRICES[model].output;
    this.totalTokens += usage.input_tokens + usage.output_tokens;
    this.totalCost += inCost + outCost;
    this.callCount += 1;
    if (this.totalCost > BUDGET) throw new BudgetExceededError();
  }
}
```

### Optimizations (по убывающей impact)

**1. Prompt caching** (Anthropic) — 90% скидка на cached input tokens
- System prompt + reusable context кэшируется на 5 min (или 1 hour beta)
- Critical for high-volume agents с stable context

**2. Model routing** — easy questions на Haiku, hard на Sonnet/Opus
- Classifier (Haiku) → router → правильная модель
- Often режет cost в 5-10x для long-tail queries

**3. Tool call batching** — параллельные independent tool calls в одном LLM round
- Anthropic / OpenAI поддерживают parallel tool use
- Меньше iterations → меньше LLM calls

**4. Output token cap** — output В РАЗЫ дороже input
- `max_tokens: 1024` вместо default 4096 для tool-using agents (они короткие)

**5. Context trimming** — не отправляй full history
- Sliding window + summary

**6. Semantic cache** — Redis / Postgres с embedding similarity match на user query
- Если cosine > 0.95 с прошлым запросом — return cached answer

### Per-user budgets (multi-tenancy)

```ts
const userBudget = await getUserBudget(userId); // e.g., $5/day на free tier
if (userBudget.used + estimated > userBudget.limit) {
  throw new TenantBudgetExceededError();
}
```

### Sources
- [Anthropic — Prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching)
- [Anthropic — Pricing](https://www.anthropic.com/pricing)

---

## Q11 — Human in the loop (HITL): когда и как

### Короткий ответ
**Human approval обязателен на high-stakes / irreversible actions: send email, payment, delete file, public publish. Pattern: agent готовит intent → user approves → agent executes.**

### Когда HITL обязателен

**Irreversible / costly actions**:
- Payments / financial transactions
- Sending emails / messages
- Publishing content (social media, CMS)
- Deleting files / records
- Changing access permissions

**High-stakes decisions**:
- Medical / legal / financial advice rendering
- Hiring decisions
- Customer-facing escalations

**Compliance / regulatory**:
- GDPR data exports
- Account closures
- Anything с audit trail requirement

### UX patterns

**1. Approval queue**
Agent kicks off → формирует intent → паркует в queue → user reviews → approves/rejects → agent resumes.

```
Agent: "I'll send this email to john@acme.com:
        Subject: Q3 review meeting
        Body: ...
        [Approve] [Edit] [Reject]"
```

**2. Diff preview**
Перед action агент показывает diff: что изменится. User approves diff, не "trust me".

**3. Dry-run mode**
По умолчанию — preview. User toggle "actually execute".

**4. Confirmation thresholds**
Routine action (low value) — auto. Above threshold (e.g. > $100, > 5 recipients) — HITL.

### Implementation в LangGraph

LangGraph natively поддерживает interrupt:
```python
graph.add_node("send_email", send_email_node)
graph.add_edge("draft", "send_email")
app = graph.compile(interrupt_before=["send_email"], checkpointer=memory_saver)

# Run until interrupt
state = app.invoke(input, config)
# User reviews state.draft, approves
# Resume from checkpoint
state = app.invoke(None, config)
```

### Anti-patterns

- ❌ "User clicks Allow" buttons автоматически "for them" — это подмена консента
- ❌ Approve queue без diff / preview — user just clicks через
- ❌ Slow approval UX (5+ click для approve каждое) — user заведёт привычку blanket-approve

### Why interviewer cares

Showcases **safety thinking**, not just "can I make it work". Многие agent products fail в production не из-за bugs, а из-за того что они автономно сделали что-то нежелательное.

### Sources
- [Anthropic — Computer use safety](https://docs.claude.com/en/docs/build-with-claude/computer-use)
- [LangGraph — Human in the loop](https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/)

---

## Q12 — Determinism vs autonomy trade-off

### Короткий ответ
**Workflow = predictable, debuggable, дёшево. Agent = flexible, handles long-tail, дороже + harder to test. Choose workflow когда steps known, agent когда steps depend on intermediate findings.**

### Spectrum

```
                     Determinism         Autonomy
                     ←─────────────────────────→

Hardcoded pipeline   Workflow           Agent (с tools)        Open-ended agent
- if/else logic      - LLM в каждом     - LLM выбирает        - LLM создаёт
- LLM = func call    шаге, ты chain     tool на каждом step    собственные plans
- Fully testable     - Predictable      - Branching            - Может сам spawn'ить
                       structure          dynamic                агентов
```

### Decision matrix

| Сценарий | Workflow | Agent |
|----------|----------|-------|
| "Перевести docs RU → EN, потом forward'нуть mailing list" | ✅ Steps known | ❌ Overkill |
| "Найти причину flaky test в этом repo" | ❌ Steps unknown | ✅ Investigation = exploration |
| "Каждое утро summarize вчерашних emails" | ✅ Same shape каждый раз | ❌ Cost/risk не нужен |
| "Research startup competitors и сделай deck" | ⚠️ Hybrid | ✅ Open-ended planning |
| "Process 10000 customer emails по category" | ✅ Cheap, parallel | ❌ Cost prohibitive |

### Real-world hybrids

Большинство production систем — **workflow с agent loops в hot spots**:

```
Workflow:
  step 1 (deterministic): parse input
  step 2 (deterministic): fetch context from DB
  step 3 (AGENT): research with web tools (open-ended)
  step 4 (deterministic): format response
  step 5 (deterministic): log + return
```

### Cost / debug tax

- **Workflow** дешевле в 5-20x (fewer LLM calls)
- **Agent** harder to test (non-deterministic outputs)
- **Workflow** легче дебажить (clear pipeline, structured logs)
- **Agent** легче масштабировать на новые use cases (расширяешь tools, не переписываешь pipeline)

### Tactical heuristic

> "Если ты можешь нарисовать flowchart этого процесса в течение 5 минут — это workflow. Если нет — agent."

### Senior signal на interview

Вместо "I'd build an agent for X" — скажи: "I'd start с workflow. Identify the step где variability nontrivial — заменю агентом только эту часть. Это keeps большинство predictable + cheap + testable, а autonomy появляется только где она реально needed."

### Sources
- [Anthropic — Building effective agents](https://www.anthropic.com/research/building-effective-agents)
- [a16z — The State of AI Agents](https://a16z.com/)

---

## Self-assessment checklist (Agents)

- [ ] Объясню разницу workflow / agent / single LLM
- [ ] Знаю ReAct и могу написать loop руками за 30 минут
- [ ] Напишу tool с грамотной description
- [ ] Назову 4 stopping criteria и реализую все 4
- [ ] Объясню 3 типа memory + когда какой
- [ ] Аргументирую multi-agent vs single (default = single)
- [ ] Сформулирую opinionated take LangGraph vs LangChain vs vanilla
- [ ] Назову что трекать в observability + назову Langfuse / альтернативы
- [ ] Опишу 3 уровня error handling
- [ ] Реализую budget tracker + назову 5 cost optimizations
- [ ] Объясню паттерны HITL + где обязателен
- [ ] Сформулирую правило когда workflow vs когда agent

---

## Связанные файлы
- [interview-question-bank.md](interview-question-bank.md) — секция 7 (Agents & Tool Use)
- [core-40-priority.md](core-40-priority.md) — #32-34 (Agents must-knows)
- [career-ai-pivot.md](career-ai-pivot.md) — project 2 = research-agent (apply this knowledge)
- [answers-llm.md](answers-llm.md) — tool use loop (#21) — base prerequisite
- [answers-rag.md](answers-rag.md) — RAG fundamentals
- answers-system-design.md — TODO (next)

Last updated: 2026-05-09
