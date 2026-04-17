# GGFuneralOS — Claude Rules

> Global Claude rules (identity, intent detection, phase gates, fail-closed, Dregwise, security baseline, priority hierarchy) live in `~/CLAUDE.md` and load automatically. This file covers only project-specific rules, stack, and architecture.

GGFuneralOS is the operating system for **KC Golden Gate Funeral Home** — brother DiMond's business. It runs case management, auto-generates obituaries/programs/social posts, tracks compliance deadlines, and communicates with grieving families via SMS. This is **production software serving real families in crisis**. Treat every change like it will be read by someone who just lost a parent.

## Architecture

```
5 Agents → Orchestrator → Neon Postgres → Dashboard (Next.js)
                                           ↕
                                      Max / Telegram (via GravityClaw bridge)
```

| Agent | Role |
|---|---|
| **Intake Agent** | Twilio SMS-driven family info collection — sympathetic, professional, never rushed |
| **Design Agent** | Gemini-generated obituaries, bifold programs, social posts, contracts |
| **Compliance Agent** | Missouri death certificate deadlines, burial permits, FTC General Price List compliance |
| **Webmaster Agent** | Publishes obituaries to the KC Golden Gate website + social channels |
| **Orchestrator** | 8-phase state machine driving 60+ auto-generated tasks per case |

## Tech Stack

- **Runtime**: TypeScript, Node 22, `tsx` for dev, `tsc` for prod build
- **API**: Express 4.21 (port 4000 local)
- **DB**: Neon Postgres via `@neondatabase/serverless` (HTTP driver, edge-safe)
- **Frontend**: Next.js dashboard in `dashboard/` (separate package, separate deploy)
- **SMS**: Twilio (Intake Agent inbound + outbound)
- **Email**: SendGrid
- **Payments**: Stripe (payment links for family arrangements)
- **LLM**: Google Gemini (`@google/generative-ai`)
- **Scraping/publishing**: Playwright (Webmaster Agent)
- **Auth**: JWT + bcryptjs, 15-min access / 7-day refresh
- **PDF**: `pdfkit` for obituary/program/contract generation
- **Deploy**: Vercel (see `vercel.json`) — single Node build at `dist/index.js`

## Key Directories

```
src/
  agents/         # 5-agent implementations — intake, design, compliance, webmaster, orchestrator
  api/            # Express routes — cases, families, compliance, payments, webhooks
  db/             # Neon schema, migrations, seed, push-schema.ts
  services/       # Gemini client, Twilio client, SendGrid client, Stripe client, PDF renderers
  index.ts        # Entry point — loads env, starts Express, boots cron jobs
dashboard/        # Next.js app (separate build/deploy)
templates/        # Obituary, program, contract, social post templates (markdown + PDF layouts)
public/           # Static assets served by Express in dev
```

## Run

```bash
# Dev
npm install
cp .env.example .env  # fill in secrets
npm run db:push       # create / update tables
npm run dev           # tsx watch src/index.ts, port 4000

# Dashboard (separate)
cd dashboard && npm install && npm run dev

# Production
npm run build && npm start
```

## Environment / Secrets

All via `.env` locally, Vercel env vars in production. **Never commit `.env`. Never echo secrets.**

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon Postgres connection string |
| `JWT_SECRET` | yes | rotate if ever exposed — invalidates all sessions |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | yes | Intake Agent SMS |
| `SENDGRID_API_KEY` | yes | Email notifications |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | yes | Payment links + webhook verification |
| `GOOGLE_AI_API_KEY` | yes | Gemini for Design Agent |

## Sensitive Data Handling

This app processes:
- **Deceased PII**: full name, SSN (for death certs), date of birth/death, cause of death
- **Family PII**: contact info, relationships, emergency contacts
- **Financial**: Stripe payment intents, invoice amounts
- **Medical**: cause of death, medical examiner info

Rules:
- Never log full SSN — mask to last 4
- Never echo family phone numbers in logs — hash or truncate
- Grief-state context: obituary/program drafts must never be auto-sent without human review by a funeral director
- Death cert data flows through the Compliance Agent which has a strict MO-law template — do not bypass

## Work Rules

- **Families are in crisis.** Error messages, SMS responses, and email copy must be written accordingly. No jokes, no casual tone, no exclamation marks.
- The Intake Agent's SMS tone is load-bearing. Changes to Intake prompts require reading `src/agents/intake/prompts/` end-to-end and testing on the sandbox Twilio number (never a real family number).
- The 8-phase Orchestrator state machine is sequential — phases cannot be skipped. Adding a phase requires updating the task generator and all dependent compliance deadlines.
- Auto-publishing (obituary to website, social post) is gated behind human approval by default. Never remove that gate.

## Related Projects

- **GravityClaw / Max** (`~/Desktop/GravityClaw/`): Max is the mobile interface — families or staff can reach this system by texting Max. The two projects are developed together.
- **MyProof / AgeVerify**: separate product, but shares the same owner infrastructure (Neon org, Vercel account).
