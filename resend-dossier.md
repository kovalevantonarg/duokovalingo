# Resend — досье под outreach (top-1 target)

> Last verified: 2026-05-08. Resend регулярно меняется (Launch Week 6 был 13-17 Apr 2026), перед outreach освежить.

## Кто

- **Zeno Rocha** — CEO. Бразилец в SF. Ex-VP DevX WorkOS, ex-CPO Liferay Cloud. Top 20 GitHub в 22 года. Twitter: [@zenorocha](https://x.com/zenorocha) — постит почти ежедневно про process, quality, milestones, indie-hacker mindset.
- **Bu Kinoshita** — CTO. 1st engineer at WorkOS. Билдит react.email и new.email. Twitter: [@bukinoshita](https://x.com/bukinoshita).
- **~37 человек** на 2026, активно растут после Series A ($18M, a16z lead, Dec 2024).
- **Heavy Brazilian engineering presence** — это **+ для LATAM-кандидата из BA** (TZ + culture fit).

Engineers, упомянутые на Humans page: Gabriel Miranda, Lucas Motta, Alexandre Cisneiros, Vitor Capretz, Felipe Volpone, Felipe Freitag, Mateusz Wos, Alec Ventura, Derich Pacheco и др. + Zeh Fernandes (Product Designer).

## Что строят

**Stack** (из публичного handbook):
- TypeScript + Node.js + Next.js (App Router + RSC)
- Hono (мигрируют с Express)
- Postgres + Drizzle, Tinybird, Redis
- AWS CDK + Terraform, Lambda, ECS Fargate
- Vercel, GitHub Actions + Blacksmith
- Frontend: Tailwind, Radix Primitives, Radix Colors, SWR

**Launch Week 6 (Apr 13-17, 2026) — главные релизы:**
- **Automations** — event-triggered lifecycle emails
- **AI Email Editor** — extract brand/voice from URL, AI agent-as-teammate с real-time cursors
- **Resend CLI 2.0** — 50+ commands, AI agent skills, webhook listening
- **Custom Tracking Domains** (free)
- **React Email 6.0** — embeddable open-source editor, **EmailNode extensions API**, template collection
- Анонс **Resend Forward** конференции в SF (21 Oct 2026)

**AI angle (явный)**:
- "Invisible AI" фразеология
- MCP server (10 tool groups)
- Email Skills для агентов
- new.email — AI template generator
- Vision 2026: all-in-one email platform + "next era of email" с AI как infra

**Open source** (140+ contributors): react.email, new.email, Resend MCP server, Resend CLI, npm components.

## Культура (handbook)

- **Quality obsession**: "the sum of all the small details is what makes something special"
- **Speed**: "prioritize ruthlessly", "v0, not a v1", cut scope ruthlessly
- **Async + remote-first**: "kind, direct, transparent" communication
- **Indie hacker DNA** даже после $18M Series A
- **Hire by self-selection** — handbook публичный, чтобы кандидаты сами поняли fit

## Hiring process (5 этапов из handbook)

1. Recruiting logistics call (30 min)
2. **Take-Home Challenge** — async, 3-5 дней. Уникально: **dedicated Slack channel с командой во время выполнения** — это сигнал культуры (collaboration over gatekeeping)
3. Technical Interview — deep dive + collaboration (включая discuss take-home)
4. Cultural Interview — 30 min с COO + 45 min с 3 team peers, нестандартные вопросы
5. Meet the Founders + Reference Calls

Timeline (предположительно): 2-4 недели.

## Болевые точки и что МОЖЕТ предложить frontend pivoter

**Где у них сейчас приоритеты:**
- Latency reduction Batch API
- Enterprise readiness + InfoSec (нанимают первых sales)
- Конкуренция на рынке "email для AI agents" (AgentMail, Commune, Cloudflare Email)
- React Email 6.0 EmailNode extensions API — свежий, нужны builders

**Что senior frontend → AI engineer может предложить:**
- PR в `resend/react-email` extensions: AI-powered chart-rendering block, CDN image upload extension (Resend сами упоминали эти примеры в анонсе 6.0)
- Demo на new.email API + agentic flow (AI agent генерит lifecycle email через MCP server)
- AI-feature идеи в Email Editor: brand-voice persistence cross-emails, auto-test rendering across email clients

## 🎯 3 pitch angles для DM (все с конкретными зацепками)

### Angle 1 — React Email 6.0 extensions API (BEST)
> Zeno, увидел в React Email 6.0 что EmailNode composable API задумана под custom blocks вроде CDN image upload и inline charts. У меня 10 лет фронта + последние месяцы копаю AI eng — собрал прототип extension, который через [LLM] делает inline-chart rendering из табличных данных в email-safe HTML. Можно показать 5-минутным демо, если интересно.

**Что нужно сделать перед DM**: реально собрать прототип. 4-8 часов работы. Это и есть твой "killer feature" артефакт недели.

### Angle 2 — Email editor x agent collaboration
> Bu, поразила фича в AI Email Editor про "AI agent as teammate с real-time cursors". Это пересечение фронт-эксперт + AI которое я последние месяцы изучаю. 10y senior frontend (collaborative editors не первый раз делаю), сейчас в pivot в AI eng. Готов взять take-home по Full-Stack Engineer (Americas) — интересно ваш view, как FS-engineer может расти к глубокой AI-интеграции в editor.

### Angle 3 — LATAM async + indie-hacker fit
> Zeno, читал handbook (особенно "v0 not v1" и "the sum of all small details") — резонирует с тем как я работал последние 10 лет. Я в Buenos Aires (Americas TZ ✅), pivot из senior frontend в AI engineering, есть конкретный side-project на react.email + new.email API который шипанул на прошлой неделе — [ссылка]. Применился на Full-Stack Engineer Americas, хотел просто сказать что вы топ-1 в моём списке.

## Twitter follow list (warm-up phase)

Минимум на эту неделю — зафолловить и читать:

1. **@zenorocha** — daily, отвечать осмысленно 1-2 раза в неделю
2. **@bukinoshita** — tech-heavy posts о react.email/new.email
3. Найти и зафолловить остальных engineers через resend.com/humans → их personal links

## Action plan для Resend (3 недели)

**Week 1 (now → 2026-05-15)**:
- [ ] Зафолловить @zenorocha + @bukinoshita + 5 engineers через Humans page
- [ ] Прочитать `react-email` repo внимательно, найти где EmailNode extensions API
- [ ] Apply на Full-Stack Engineer (Americas) официально — сразу, не ждать pitch
- [ ] Написать 1 warm reply Zeno или Bu по конкретному техническому посту (не "great post 🔥")

**Week 2 (2026-05-15 → 2026-05-22)**:
- [ ] Собрать прототип extension для React Email 6.0 (Angle 1)
- [ ] Написать пост на kovalevanton.xyz/writing про процесс — "Building a React Email extension as my pivot project"
- [ ] Опубликовать GitHub репо с extension

**Week 3 (2026-05-22 → 2026-05-29)**:
- [ ] DM Zeno с Angle 1 (extension demo)
- [ ] Если ответ — двигаемся в hiring loop. Если нет — Angle 2/3 в порядке
- [ ] Параллельно начать применяться на остальные 4 must-apply

Last updated: 2026-05-08
