# Answers — Behavioral

> Полные ответы на 9 вопросов из interview-question-bank.md секция 10 + STAR stories + pivot story + reverse questions. Это **приходит на КАЖДОМ интервью**. Pivot story — твой главный актив. Все ответы должны быть отрепетированы вслух 5+ раз на английском.

## Sources (canonical)

- **Lessons from Lou Adler — STAR/SOAR method**: https://www.linkedin.com/in/louadler/
- **Hiring stories — Pamela Bumstead**: https://www.poppulo.com/
- **Levels.fyi — interview prep**: https://www.levels.fyi/blog/
- **Founder interview style — paulgraham.com/founders.html**: http://paulgraham.com/founders.html
- **YC application advice**: https://www.ycombinator.com/library/

---

## Universal framework — STAR

**S**ituation — context (15s): где, когда, кто, что было на kону
**T**ask — конкретная задача / responsibility (10s)
**A**ction — что ИМЕННО ТЫ сделал (40s, ⅔ времени)
**R**esult — measurable outcome + lesson (15s)

Total: 60-90 секунд устно. Если длиннее — interviewer теряет внимание.

> Anti-pattern: "we did X, then we did Y" — interviewer хочет понять ТВОЮ роль, не команду. Используй "I" 80% времени.

---

## Q1 — "Tell me about yourself" (60-90 секунд)

### Структура (3 части по ~20с)

**Part 1 — Who I am professionally** (15-20s)
> "I'm Anton Kovalev, a senior frontend engineer with 10 years of experience — mostly React, TypeScript, Next.js, design systems, and performance work. Currently at dats.team, based in Buenos Aires."

**Part 2 — What I'm doing now** (20-30s)
> "Six months ago I started a deliberate pivot into AI engineering. I'm running a 90-day public journey — three shipped projects, weekly writing, all on kovalevanton.xyz. Right now I'm 25 days in, working on a 'chat with docs' RAG project as proof one. The throughline: AI engineering = product engineering for a new substrate, and frontend skills (UX, streaming UI, state management) translate directly."

**Part 3 — Why this conversation** (15-20s)
> "I'm specifically looking at small AI startups where product engineers ship, not coordinate. [Company] caught my attention because [1 specific reason — see Q3]. That's why I'm here."

### Ready-to-deliver English version

> "I'm Anton, a senior frontend engineer — 10 years, mostly React, TypeScript, design systems and performance. Based in Buenos Aires, currently at dats.team. Six months ago I started a deliberate pivot into AI engineering — running a 90-day public build journey at kovalevanton.xyz. Three projects, weekly writeups, working in the open. Day 25 right now, building a chat-with-docs RAG demo as project one. Frontend skills — streaming UI, state, accessibility, performance — translate directly to AI products. I'm looking specifically at small teams where product engineers ship features end-to-end. [Company-specific hook]."

### Drilling tips

- **Practice timer**: 75s ± 10s. Если стабильно > 90s — режь
- **Записывай себя на phone** — слышишь filler words, hesitation
- **Не читай с листа** — звучит rehearsed. Должно flow
- **English specifically** — practice не русский → translate, а directly English
- **Energy** — improve на ~20% от твоего нормального tone (на video call energy эффективно теряется)

### Why interviewer asks this
- Open question to calibrate level/style
- Они слышат: structure thinking, communication clarity, energy
- НЕ слышат твою CV (они уже видели). Слышат NARRATIVE — почему ты тут

---

## Q2 — "Why pivot from frontend to AI?"

### Wrong answer
> "I think AI is the future and very exciting." → бессмысленно, любой может сказать

### Right structure: observation → action → conviction

**Observation (что увидел)**
> "After ~10 years of building React/TS frontends, I noticed I was solving the same UX problems on different products — auth flows, design systems, infinite scrolls, perf optimization. The interesting work was shifting."

**Action (что сделал в response)**
> "Last year I started building LLM apps as side projects. First a chat with bro-mode persona [Bro Code Chat], then a small RAG over my own notes. The technical surface was new — streaming UIs, agentic loops, eval harnesses, prompt engineering — but my frontend toolkit transferred almost 100%. Just applied to a substrate that didn't exist 18 months ago."

**Conviction (why now committed)**
> "AI products live or die on UX. The streaming chat, the citation interaction, the agentic flow — that's frontend depth + LLM plumbing. There aren't many engineers with both. So I'm doing 90 days in public — three shipped projects, all writeups on my site — to make that combination undeniable."

### Ready English version (60-70s)

> "After 10 years of frontend, I noticed I was solving the same UX problems on different products. Last year I started building LLM apps on the side — first a chat persona project, then a RAG demo. The technical surface was genuinely new — streaming, agents, evals — but my React + TypeScript skills transferred almost 100%. AI products live or die on UX, and there aren't many engineers who do both deep frontend and the LLM plumbing. That's why I'm doing 90 days in public — three shipped projects with writeups — to make that combination undeniable. Day 25 right now."

### Variants по компании

- **Resend** → "And Resend specifically — React Email is exactly that intersection. Email rendering = frontend craft. AI features in your editor = LLM plumbing."
- **Sourcegraph (Cody)** → "Cody is product engineering applied to AI codereview — that's the throughline I'm building toward."
- **Continue.dev** → "Open source AI coding tools = frontend craft + LLM = my exact lane."

### Senior signal
- Concrete (not vague "passion")
- Self-aware (recognizes overlap and gap)
- Forward-looking (you have a plan, not just curiosity)
- Receipts (kovalevanton.xyz, projects, writing)

---

## Q3 — "Why our company specifically?"

### Wrong answer
> "I love what you're doing in AI." → empty

### Right answer template

```
1. Specific product / technical observation (1-2 sentences)
2. Cultural / process observation (1 sentence)
3. Where you fit (1 sentence)
```

### Pre-writing exercise

For каждой target company, заранее напиши 3-sentence answer. Карточки в notion / dossier. Repeat вслух перед interview.

### Examples

**Resend**
> "Three things. One — React Email is the cleanest dev-tools API in the email space, and the AI editor coming up is exactly the intersection I'm pivoting into. Two — your team writes engineering posts that read like Stripe in 2014 — public craftsmanship is something I emulate. Three — Americas timezone + remote, which matches my Buenos Aires base. I want to ship product, fast, with people who care about the same details. That's Resend."

**Sourcegraph (Cody)**
> "Cody is the product engineering version of AI code review — exactly what I'm building toward in my project three. Sourcegraph as a company has been remote-first for years, with a transparent handbook I've been reading. And the team has the rare combo of deep code intelligence + LLM craft. I want to be in the loop where those two collide, not in a generic 'AI for X' company."

**Continue.dev**
> "Open source AI coding tools — that's where the most interesting code is being written right now. Your team is small enough that one engineer can ship a feature end-to-end, which is what I look for after years in larger codebases. And Continue running on Anthropic + open-source models = a thoughtful tech stack, not 'wrap GPT-4' VC bait."

**Pragmatike / Delfino / Browser Use** (smaller / less data)
> "I respect that you ship fast and stay small. After 10 years in larger orgs, I want to be 1 of 5 engineers who own product surface area, not 1 of 50. [+ один specific product observation]"

### How to research (1-2 hours per company)

- Read their last 5 blog posts → find 1 specific opinion you agree with
- Study their public job description → quote a specific responsibility
- Check founder Twitter / podcast appearances → 1 quote you can reference
- Test the product → 1 specific observation about UX / quirk / strength
- LinkedIn: who interviews you, что они shipped в past

### Senior signal
- Specific product/team observations, not "I love AI" hot takes
- Demonstrates you researched, не just clicked Apply
- Reciprocity hint — what YOU bring, not just what THEY offer

---

## Q4 — "Tell me about a hard project" (STAR — Technical Depth)

### Template (адаптируй под свою историю)

**S**ituation: "В dats.team у нас был [legacy code / scale problem / migration / perf disaster]"
**T**ask: "Я owned [конкретная responsibility]"
**A**ction: "Сделал X, попробовал Y, столкнулся с Z, решил через W"
**R**esult: "Меряемое: latency / bundle size / shipped / users / revenue"

### Возможные истории (выбери самую сильную, репетируй ОДНУ)

**Story option A: Performance migration**
> "На dats.team у нас был React app с p95 LCP > 4s на mobile. Я owned the perf rewrite. Sketch архитектуры: identified 3 culprits — non-code-split bundles (1.8MB), N+1 API waterfall, и blocking JS на critical path. Migration plan: code split per route, prefetch on hover, suspense boundaries для async data, preload critical fonts. Rolled out feature-flagged behind 10% / 50% / 100%. Result: p95 LCP с 4.1s до 1.3s, bounce rate -18% на mobile, conversions +6% measured. Lesson: perf — это product feature, не infrastructure chore. У interviewer'а возможны follow-ups про CWV, code splitting strategies, RUM."

**Story option B: Design system rollout**
> "Owned migration с custom CSS в design system based on Radix + Tailwind. 200+ components, 8 product teams, 18 months estimated. My approach: pilot one team first (3 weeks), measure actual savings, expand. Built migration tooling — codemod для standardized components, automated visual regression diff suite, lint rules для blocking new custom CSS. Result: full migration в 11 months (vs 18), bundle -30%, накопленный design debt zero. Lesson: tooling > advocacy — automate the right path, не убеждай."

**Story option C: Streaming chat for Bro Code Chat (AI side project)**
> "Building Bro Code Chat — AI chat persona — я hit performance wall на streaming UI. Markdown-rendered messages re-parsed весь buffer на каждый chunk → typing felt sluggish at 100+ tokens. Solution: incremental markdown — parse только delta, append к virtual DOM, batch updates на rAF. Switched от synchronous renderer на streaming-aware MDX-like AST that supports partial trees. Result: 60fps streaming за весь response, even на 4000-token outputs. Lesson: streaming UI requires re-thinking renderer assumptions — large mutations кладут React."

### Critical drilling tips

- **One story per session** — prepare 3, drill ONE deep
- **Quantify everything** — "improved performance" → "p95 LCP from 4.1s to 1.3s"
- **Show your judgment** — почему ты выбрал X, не Y. Senior signal
- **Include a hard moment** — что было stuck / wrong / surprising. Demonstrates honesty
- **End with lesson** — interviewer слышит "I learn from work"

---

## Q5 — "Tell me about a time something went wrong"

### Template structure

**S**ituation: что произошло (15s)
**T**ask: что ты owned (10s)
**A**ction: 1) immediate response 2) investigation 3) fix 4) prevention (40s)
**R**esult: outcome + lesson (15s)

### Anti-patterns

- ❌ "Nothing big has gone wrong" → false signal, lack of self-awareness
- ❌ Blaming others — "PM didn't tell me" / "team didn't review" → red flag
- ❌ "We rolled back, problem solved" → no lesson, no ownership

### Story template (build from real)

> "We shipped [feature] на [scope]. After deploy, [bad thing happened — measured by X / reported by Y users / spiked Z metric]. I noticed [how — alert / customer / your monitoring]. Immediate: rolled back / hotfix / disabled flag. Investigation: root cause was [specific technical thing], because [my decision / team decision / missing test]. Fixed by [specific change]. Prevention: [test added / lint rule / monitoring / process change]. The lesson I took: [something specific, not generic]."

### Example draft (adapt с реальной historией)

> "Mid-2024 я shipped a re-architecture of our checkout flow at dats.team. Within 2 hours, error rate spiked 5x on iOS Safari — turned out a Safari-specific quirk with `URLSearchParams` mutation broke the redirect on 15% of users. I caught it via Sentry alert. Hotfix shipped in 40 minutes, full rollback wasn't needed. Root cause: I'd tested across Chrome / Firefox but skipped Safari because tests passed in CI. Lesson: 'tests pass in CI' ≠ 'tested across critical user agents' — added BrowserStack runs for any flow touching navigation, и habit'но check Safari-specific behavior on URL APIs. We didn't lose data, but for ~2 hours users had to refresh. Worth it as a calibration moment."

### Senior signal

- Took ownership ("I owned", "I missed")
- Specific technical detail
- Both immediate response AND systemic prevention
- Honest about what was YOUR mistake, не coincidence

---

## Q6 — "Tell me about a time you disagreed with someone"

### What they're actually asking

- Can you push back с уважением?
- Do you escalate or absorb?
- Do you change your mind on evidence?
- Are you a "yes-man" or a "I'll quit if not my way" extremist?

### Template

**S**ituation: who, what was the disagreement
**T**ask: my role / stake
**A**ction: 1) understood their view 2) presented mine с evidence 3) sought outside input / data / experiment 4) agreed на decision (mine / theirs / hybrid)
**R**esult: outcome + retrospective

### Two flavors

**Flavor 1: I was right (надо carefully — show humility)**
> "Tech lead wanted X, I argued for Y based on [data/principle]. We disagreed for a week. Eventually I proposed a small POC я built over weekend showing [evidence]. He agreed Y was better. We shipped Y, [outcome]. Looking back — я could've started с POC instead of arguing first. Lesson: build evidence faster than arguing."

**Flavor 2: I was wrong (often more impressive)**
> "Я pushed for X для new feature. Senior engineer disagreed, argued Y. I had strong opinion based on prior experience, но didn't have direct evidence. We agreed на small spike — он built Y prototype, я built X. After 2 days было clear Y handled edge cases I hadn't seen — auth state during background refresh. We went с Y. Lesson: 'I've done this before' ≠ 'I'm right here'. Now я default к prototype-first when disagreement is technical."

### Anti-patterns

- "I just deferred to seniority" → no spine, weak signal
- "I told them they were wrong" → no diplomacy
- "We never resolved, project failed" → no closure

### Story options для adapt

- Library / framework choice (React Query vs SWR, Zustand vs Redux)
- Architectural disagreement (monorepo vs polyrepo, BFF vs direct)
- Process (releases, on-call, PR size)
- Product decision (feature scope, priority)

---

## Q7 — "What's a feature in our product you'd improve?"

### Why they ask
- Did you actually USE the product?
- Can you give product-thinking, not just engineering critique?
- Do you ship in your head?

### Preparation (1 hour per target company)

1. Sign up / use product 30+ minutes
2. Open DevTools → notice perf, requests, error states
3. Check competitive landscape — что they're missing vs Y
4. Find ONE specific friction. Не "the dashboard is ugly" — "loading state for the X panel takes 1.4s with no skeleton, perceived as broken"

### Answer structure

**1. Specific observation** (concrete UX/perf/feature gap)
**2. Why it matters** (user impact)
**3. How you'd approach** (technical + product)
**4. Caveat** (what you don't know — humility)

### Example template (adapt for Resend)

> "Используя Resend на pet project, я noticed что email preview в editor doesn't show how рендерится в actual Gmail / Outlook. Result: я ship'нул email что выглядел perfect в preview, но broke на Outlook 2019 (table-based fallback). I'd add a 'cross-client preview' tab — render через Litmus-like preview API, или generate screenshots для top 5 clients. Engineering: integration с rendering service, или self-host email render farm with headless Outlook for accuracy. Caveat: я не знаю whether it's been considered or if there's existing work, but as a user this would've saved me 2 hours."

### Anti-patterns

- ❌ "Make it AI-powered" — empty buzz
- ❌ Pure aesthetic critique without user impact
- ❌ "Migrate to React Server Components" — implementation detail, не feature
- ❌ Copying competitor's feature 1-to-1

### Senior signal
- Specific observation grounded в actual usage
- Product reasoning, не engineering masturbation
- Awareness of limits ("I don't know if you've considered this")

---

## Q8 — "Where do you see yourself in 2 years?"

### Wrong answer
> "Founding my own company" → red flag, signals you'll leave fast
> "VP of engineering" → mismatch с IC role
> "I don't know" → lack of direction

### Right structure
**Honest narrative аligned с this role + this company**

### Template

> "Two years out, I want to be a deeply effective AI product engineer — owning meaty surface areas of an AI product end-to-end. That probably looks like: senior or staff IC at a small-to-mid AI startup, leading 1-2 features that real users depend on, mentoring 1-2 newer engineers, and continuing to write publicly. I'm not trying to climb a management ladder — I'm trying to deepen craft в AI product engineering specifically. If [company] is the right fit, that 2-year arc happens here."

### Variants

**If company is small startup**
> "Hopefully grown с [company] from where you are now to where 4-5x of you are. Owning a major product surface, mentoring, occasional founder-time involvement on big decisions."

**If company is bigger / established**
> "Senior IC owning [specific area aligned with role] product surface. Maybe contributing to internal tools or conference talks externally. Definitely shipping."

### Senior signal
- Aligned with IC craft (most AI-startup hires for next 2 years are IC)
- Realistic — не "I'll be CTO"
- Mentions company explicitly (you've thought about THIS specific role, not generic future)
- No exit hint ("I want to start a company") unless honestly true

---

## Q9 — "What questions do you have for us?"

> See interview-question-bank.md секция 11 для full list.

### Top 3 для каждый interview

**For founder / hiring manager**:
1. "What's the hardest engineering problem the team is wrestling with right now?"
2. "How does the team think about AI feature reliability vs shipping speed?"
3. "What does a product engineer ship in their first month?"

**For engineering peer**:
1. "How do you measure quality of LLM features in production?"
2. "How do you decide between using a framework like LangChain vs building from scratch?"
3. "What's a recent decision the team made that you disagreed with, but went along with?"

**For recruiter (less technical)**:
1. "What's the typical hiring timeline / number of rounds?"
2. "What does success look like in this role at 30 / 90 / 180 days?"
3. "Is the team currently shipping feature X — and if so, would I work на it?"

### Bad questions (avoid)
- "What's the company culture?" — generic
- "Salary / benefits" — ask recruiter, not interviewer
- "How fast can I be promoted?" — ego signal
- "Do you have free snacks?" — irrelevant в startup remote context

### Senior signal
- Forward-looking, технически precise, specific to THIS company
- Probes psychological safety subtly
- Shows you think как contributor, не candidate

---

## STAR Stories — your portfolio of 3

> Prepare exactly 3, drill them deep. Don't try to memorize 10 — stuck under pressure.

### Story 1 — Technical depth
**Pick from**: perf rewrite, design system migration, streaming UI for Bro Code Chat, day-counter implementation
**Goal**: demonstrate engineering judgment + scope ownership

### Story 2 — Pivot proof (AI-specific)
**Pick from**: Bro Code Chat building, RAG prototype, day-counter с real backend, kovalevanton.xyz infrastructure
**Goal**: prove AI work is real, not theoretical

### Story 3 — Failure / learning
**Pick from**: a real fuck-up (см. Q5 template)
**Goal**: demonstrate self-awareness + growth

### Drilling protocol

For each story:
1. Write out STAR breakdown в text
2. Speak it aloud × 5 (timer 60-90s)
3. Record yourself once на phone
4. Listen back — cut filler, tighten Action section
5. Mock with friend / Claude voice mode

**Key**: same story должна быть adaptable — interviewer asks "tell me about a hard project" → use Story 1. Asks "tell me about something that failed" → use Story 3. Same raw material, different frame.

---

## Pivot Story — твой главный актив

### Why this story matters MOST

Каждый AI-startup interviewer задаст вариацию "почему ты pivot'ишь?" Это твой signature question. Если answer слабый — отказ. Если strong — automatic credibility.

### The full version (90s)

> "I've been a frontend engineer for 10 years — React, TypeScript, design systems, performance, the usual modern stack. About 18 months ago I started building LLM apps as side projects — a chat persona project I called Bro Code Chat, then a RAG demo over my notes, then experiments with agents.

> Two things became obvious. One: the technical surface of AI engineering — streaming UIs, tool use loops, eval harnesses, prompt engineering — was new and interesting to me in a way frontend hadn't been for years. Two: my frontend toolkit transferred almost entirely. UX state machines, perf-aware streaming renders, accessibility for chat, design systems for AI components — all the same skills, applied to a substrate that didn't exist 18 months ago.

> So six months ago I committed publicly. 90-day journey, three shipped projects, weekly writing. I'm at day 25 right now, working on chat-with-docs. The throughline is: AI products live or die on UX, and there aren't many engineers who do both deep frontend AND the LLM plumbing. I want to be one of them, somewhere where I can ship that combo daily."

### Trim to 30s (recruiter screens)

> "10 years frontend, started building LLM apps 18 months ago, hit on the fact that frontend skills + LLM plumbing is a rare combo. So I'm doing 90 days in public — 3 projects, weekly writing on kovalevanton.xyz. Day 25. Looking for AI startup where product engineers ship that combo end-to-end."

### Personalize hooks (per company)

- Add: "Что мне резonates особенно с [Resend / Sourcegraph / etc] — это [specific thing]"

---

## Reverse story — как НЕ позиционировать pivot

❌ "I'm tired of frontend" → bitterness
❌ "AI is the future of everything" → empty hype
❌ "Frontend is dying" → false + insulting
❌ "I want to learn AI" → student stance, не contributor stance
❌ "All my friends are doing AI" → herd signal

---

## Self-assessment checklist (Behavioral)

- [ ] "Tell me about yourself" — отрепетировано вслух 5+ раз на английском, под таймер 75s
- [ ] Pivot story — 90s версия + 30s версия
- [ ] 3 STAR stories prepared (technical / pivot / failure) — каждая 60-90s
- [ ] Per-company answer "Why us?" — для топ-5 target companies (Resend, Sourcegraph, Firecrawl, Continue, StackBlitz)
- [ ] Per-company "feature I'd improve" observation — для тех же топ-5
- [ ] Top 3 reverse questions — both technical + cultural variants
- [ ] Recorded self минимум once → listened back → tightened
- [ ] Mock interviewed с другом / Claude voice — minimum 2 reps

---

## Practical drilling plan (this week)

| День | Цель | Time |
|------|------|------|
| Mon | Write out 3 STAR stories в text | 60 min |
| Tue | Speak each STAR vслух × 3, time it | 30 min |
| Wed | Pivot story 90s + 30s, vслух × 5 | 30 min |
| Thu | Per-company answers — Resend + Sourcegraph | 60 min |
| Fri | Per-company answers — Continue, Firecrawl, StackBlitz | 45 min |
| Sat | Record full mock — Tell me about yourself + pivot + 1 STAR + 3 reverse | 45 min |
| Sun | Listen back, refine, repeat weak parts × 3 | 30 min |

Total: ~5 hours. Repeat next week. To week 4 (interview reps starting) — you should be able to deliver всё ниже без notes.

---

## Связанные файлы
- [interview-question-bank.md](interview-question-bank.md) — секция 10 (Behavioral) + 11 (Reverse)
- [core-40-priority.md](core-40-priority.md) — #38-40 (TMaY / Pivot / STAR)
- [profile.md](profile.md) — твои факты, dates, links
- [career-ai-pivot.md](career-ai-pivot.md) — projects, target companies, plan
- [resend-dossier.md](resend-dossier.md) — top-1 target deep dive
- [interview-prep.md](interview-prep.md) — three-tier strategy, sequencing
- [interview-log.md](interview-log.md) — записи каждого реального раунда

Last updated: 2026-05-09
