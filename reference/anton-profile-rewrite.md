# Profile rewrite — website /about + LinkedIn

Source of truth: твоё резюме (PDF) + публичный нарратив 90-day pivot из X. Везде, где написано `// TODO`, проверь и поправь под себя — это места, где я не знаю фактической правды.

---

## 1) Website — новый блок /about

Ниже — текст в том же terminal-стиле, что уже на сайте. Структура повторяет текущую: вступление → "currently / looking for / not looking for / reach me" → timeline. Поменялось только содержимое.

### Intro

> I am Anton. I write frontend for a living and I am trying to change that.
>
> Nine years in. React since hooks were a proposal. Next.js across half a dozen apps — pages router, app router, the awkward in-between. I have shipped construction-tech, fintech onboarding, design tools, internal kanban boards, and a React Native MVP I am still oddly fond of. I lead more than I IC these days, but the IC reflex never went away.
>
> The pivot is not a panic move. The best frontend engineers I know are quietly learning LLMs on the side. I am doing it loudly, on a clock, in public, with daily build logs and three shippable products at the end of it.
>
> I live in Buenos Aires. I speak Russian, English, and enough Spanish to argue about coffee. I run in the morning, ship at night.

### Currently

```
shipped      /chat-with-docs → brocode.kovalevanton.xyz (project 1 of 3)
building     /research-agent — agentic loops with Claude (project 2 of 3)
side         llm-limits-tracker — open-source npm CLI for LLM quotas
day-job      Senior Frontend @ Dats.Team — i18n, Next.js App Router migration, UI-kit
```

### Looking for `// TODO`

```
AI startup, building real products with LLMs
remote-first, comfortable with Buenos Aires timezone overlap
senior / staff / founding eng level
problem worth eighty hours a week
```

> `// TODO`: поправь под реальность — TC, география, тип компании, на каком этапе. Сейчас я убрал конкретный TC (`$250k+`) и серии (A–C), потому что ты сам флагнул это как неправду. Если ты их реально знаешь и хочешь публично декларировать — впиши. Если нет — этот вариант звучит честнее.

### Not looking for

```
big-co ML research roles
"AI-enhanced" CRUD apps
agencies
```

### Reach me

```
email     kovalevantondev@gmail.com
twitter   @kovalevantondev
github    github.com/KovalevAnton
linkedin  linkedin.com/in/kovalevantondev
```

> На текущем сайте указан email `kooovaaal@gmail.com` — поправь на `kovalevantondev@gmail.com` (этот в резюме и в системе).

### Timeline (реальный, из резюме)

```
2026 — now      AI engineering pivot (90 days, public)
2024 — now      Senior frontend @ Dats.Team — Nicosia, remote from BA
2024            Lead software eng @ Etalon (Moscow) + React Native contract @ Intelligichain (Irvine, CA)
2022 — 2023     Senior frontend @ Formind — Moscow startup
2019 — 2022     Lead frontend @ Samolet — Moscow prop-tech, scaled web + mobile
2019            Team lead frontend @ The Best App — Nizhny Novgorod, ed-tech
2016 — 2018     Junior → middle frontend @ Olprime, Yaat — Nizhny Novgorod
```

Альтернатива — более короткий вариант (если не хочешь все компании светить):

```
2026 — now      AI engineering pivot (90 days, public)
2024 — now      Senior frontend @ Dats.Team (remote, Nicosia)
2019 — 2024     Lead / senior frontend in Moscow (Samolet, Formind, Etalon)
2016 — 2019     Frontend in Nizhny Novgorod (Olprime, Yaat, The Best App)
```

---

## 2) LinkedIn — headline + About

LinkedIn API закрыт, так что скопируй вручную в `Edit intro` и `About`.

### Headline (220 chars max — оба варианта влезают)

Вариант 1 — упор на pivot, агрессивнее:

> Senior Frontend Engineer → AI Engineer · 9 yrs React / Next.js / TypeScript · Building 3 AI products in 90 days, in public · ex-Samolet, Formind, Dats.Team

Вариант 2 — мягче, без "→":

> Senior Frontend Engineer, 9 yrs · React / Next.js / TypeScript · Currently learning to build LLM apps in public — RAG, agents, evals · Buenos Aires

### About section

```
I'm Anton — a senior frontend engineer with 9+ years shipping React,
Next.js, and TypeScript across construction-tech, fintech, design tools,
and ed-tech. Currently building frontend at Dats.Team (Nicosia, remote
from Buenos Aires) — migrated their app to Next.js App Router, set up
i18n for 50+ countries, cut server load by 35% with SWR caching, brought
build times from 85s to 26s.

On the side, I'm doing something more ambitious. Starting April 2026,
I'm running a 90-day public challenge: ship three production AI products
and document everything publicly. The arc is RAG → agents → evals. So
far: built a RAG pipeline from scratch (embeddings + cosine similarity,
no LangChain, no vector DB), wrote my first eval harness, compared
structured-output methods (XML tags vs prefill vs tool_use), and closed
the full retrieval-augmented loop on Claude. Daily logs on X at
@kovalevantondev.

Why publicly? Because the best frontend engineers I know are quietly
learning LLMs on the side. I'd rather do it loudly, on a clock, with
receipts. By July 2026 I want to be talking to teams building real AI
products — not "AI-enhanced" CRUD, not big-co research, but the
in-between where the work is.

Open to conversations now if your team is hiring AI engineers and
values shipping over credentials.

Stack: React, Next.js (App Router), TypeScript, React Native, SWR,
React Query, Zustand, Tailwind, design systems, Cypress, Claude API,
embeddings, RAG.

Talk to me: kovalevantondev@gmail.com
```

> `// TODO` для LinkedIn About:
>
> - "Open to conversations now" vs "Open to conversations in 60 days" — что предпочитаешь публично декларировать? Сейчас стоит "now", т.к. ты в финальной фазе pivot'а и follow-up разговоры лучше начинать раньше.
> - Если не хочешь упоминать Dats.Team в About (т.к. это и так в Experience), убери первый параграф — будет резче. Я оставил, потому что это сразу даёт картинку, что ты не безработный pivot'ер, а senior с работой.

---

## 3) Что я НЕ трогал, но имеет смысл обновить

1. **Day counter на сайте**: сейчас `live·day 15/90`. Реально работа доехала до Day 16 (29 апреля), потом пауза по болезни. План — скипнуть пропущенные дни и продолжить с Day 17. Счётчик надо либо захардкодить на 16 до возобновления, либо переделать так, чтобы он считал не календарные дни, а "shipped days" (увеличивать вручную после каждого ежедневного поста). Второй вариант устойчивее к жизни.
2. **`/projects`**: статусы реально такие — Project 1 (chat-with-docs) `[shipped]` (живёт на brocode.kovalevanton.xyz), Project 2 (research-agent / agents) `[in progress]`, Project 3 (ai-code-review) `[queued]`. Текущий сайт всё помечает `[queued]` — это не правда.
3. **LinkedIn Experience entries**: их я не переписывал — но если резюме (PDF) и LinkedIn расходятся, имеет смысл синхронизировать буллеты. Скинь текущий текст из Experience секций LinkedIn — я сверю с резюме и подсвечу расхождения.
