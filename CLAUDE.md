# CLAUDE.md — AI Pulse (research-scout)

## Project Overview

AI Pulse is an agentic web platform that helps users stay current in AI/ML research. It deploys 17+ specialized AI agents to harvest content from arXiv, YouTube, social platforms, conferences, and blogs, then processes everything through a three-pass pipeline (infographic, summary, on-demand podcast), scores it via an 8-dimension critic layer, and presents personalized feeds with trend detection.

**All LLM operations use the Google Gemini model family exclusively.** No OpenAI, no Anthropic APIs.

## Tech Stack (Non-Negotiable)

- **Language:** TypeScript 5.x everywhere (frontend, backend, workers)
- **Framework:** Next.js 15 (App Router)
- **API:** tRPC v11
- **Database:** PostgreSQL 16 + pgvector extension
- **ORM:** Drizzle ORM
- **Queue:** Redis 7 + BullMQ
- **Auth:** Lucia Auth v3
- **Storage:** Cloudflare R2 (production) / MinIO (local dev)
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Email:** Resend + React Email
- **Charts:** Recharts
- **Monitoring:** Bull Board + Pino logger
- **LLM:** Gemini text-embedding-004, Gemini 2.5 Flash, Gemini 2.5 Pro, Nano Banana 2
- **Podcast:** NotebookLM Podcast API (fallback: local-notebooklm)

## Architecture Rules

### Offline / Online Split

The system has two independent processes sharing a PostgreSQL database and R2 storage:

1. **Offline Pipeline** — runs on cron schedules (BullMQ workers). Does ALL external API calls, ALL Gemini inference, ALL content processing. Writes results to DB and R2.
2. **Online Display Layer** — standard Next.js web app. Reads pre-computed data. **ZERO LLM calls on page load.** Everything is served from DB/cache.

Never add Gemini API calls to the Next.js request path. All AI processing happens in workers.

### Processing Registry

Every resource has a unique `(source_type, source_id)` key in the `processing_registry` table. Before processing anything, check this registry. Each pipeline stage (infographic, summary, podcast, critic) is tracked independently. Failed stages can be retried without reprocessing the whole pipeline. Nothing gets processed twice.

### Persistence First

All generated artifacts are persisted on first computation and never regenerated:
- Infographics → PNG in R2
- Summaries → JSON in PostgreSQL `summary` JSONB column
- Podcasts → MP3 in R2 (on-demand only, persisted once created)
- Critic scores → JSONB in PostgreSQL
- Justification dossiers → JSONB in PostgreSQL
- Embeddings → pgvector column
- Trend narratives → text in PostgreSQL

### On-Demand Podcast (Pass 3)

Podcasts are NOT auto-generated. They are created only when a user clicks "Generate Podcast." Once generated, they are permanently persisted and accessible to all users. The Settings Panel allows optionally enabling auto-podcast for top-N papers per week.

## Code Conventions

### File Structure

```
src/
  app/                    # Next.js App Router pages
    (auth)/               # Auth-gated routes
    api/                  # API routes (tRPC)
    page.tsx              # Feed (personalized)
    trending/page.tsx     # Trends dashboard
    explore/page.tsx      # Search + browse
    digest/page.tsx       # Daily/weekly digest
    paper/[id]/page.tsx   # Content detail + dossier
    profile/
      page.tsx            # User profile
      interests/page.tsx  # Interest manager panel
    settings/page.tsx     # Pipeline settings panel
    admin/page.tsx        # Admin dashboard
  server/
    db/
      schema.ts           # Drizzle schema (single source of truth)
      index.ts            # DB connection
    routers/              # tRPC routers
      _app.ts             # Root router
      feed.ts
      content.ts
      feedback.ts
      trends.ts
      user.ts
      admin.ts
    trpc.ts               # tRPC setup
  workers/
    harvest.ts            # Harvest agent worker
    process.ts            # Processing agent worker
    intelligence.ts       # Trend + Rec agent worker
    critic.ts             # Critic layer worker
  agents/
    harvesters/
      paper.ts            # arXiv + Semantic Scholar + OpenReview
      video.ts            # YouTube Data API + transcripts
      social.ts           # Bluesky, X, Mastodon, Reddit, LinkedIn, HN, Discord
      conference.ts       # Playwright + DBLP
      blog.ts             # RSS/Atom + Readability
      huggingface.ts      # HuggingFace Hub API
    processors/
      dedup-classifier.ts # Embedding + classification
      infographic.ts      # Nano Banana 2 generation
      summary.ts          # Gemini 2.5 Flash structured output
      podcast.ts          # NotebookLM / local-notebooklm
    intelligence/
      trend-detector.ts   # Signal aggregation + z-score
      trend-narrator.ts   # Gemini 2.5 Pro narrative generation
      rec-engine.ts       # Recommendation pipeline
      digest-composer.ts  # Email + in-app digest
    critic/
      scorer.ts           # 8-dimension scoring
      rank-synthesizer.ts # Cohort ranking
      justification.ts    # Dossier generation
  lib/
    gemini.ts             # Gemini API client wrapper
    r2.ts                 # R2/MinIO storage client
    embeddings.ts         # Embedding utilities
    queue.ts              # BullMQ queue definitions
    constants.ts          # Shared constants
  types/
    content.ts            # ContentItem, SummarySchema, etc.
    trends.ts             # Trend types
    critic.ts             # CriticScores, CohortRank, JustificationDossier
    user.ts               # User, Feedback, Engagement types
    settings.ts           # SystemSettings type
  components/
    feed/                 # Feed cards, progressive disclosure
    trends/               # Trend dashboard components
    content/              # Content detail view
    settings/             # Settings panel components
    ui/                   # shadcn/ui components
  scheduler.ts            # Cron-based job scheduler
```

### Naming Conventions

- Files: `kebab-case.ts`
- React components: `PascalCase.tsx`
- Types/interfaces: `PascalCase`
- Variables/functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Database tables: `snake_case` (Drizzle convention)
- API routes: `camelCase` (tRPC convention)
- Environment variables: `UPPER_SNAKE_CASE`

### TypeScript Rules

- Strict mode enabled
- No `any` types — use `unknown` and narrow
- All Gemini API responses must be validated with Zod schemas
- All database queries go through Drizzle ORM — no raw SQL unless explicitly needed for pgvector operations
- Shared types live in `src/types/` — import from there, don't redeclare
- Use `satisfies` operator for type-safe object literals

### Error Handling

- Workers: catch errors per job, log with Pino, mark stage as failed in processing_registry, continue to next job
- API routes: tRPC error handling with proper error codes
- External APIs: exponential backoff with circuit breaker pattern. Use `p-retry` package
- Gemini API: always validate structured output against Zod schema before persisting

### Environment Variables

```
# Required
DATABASE_URL=postgresql://pulse:pulse@localhost:5432/aipulse
REDIS_URL=redis://localhost:6379
GEMINI_API_KEY=your-key

# Storage (MinIO for local, R2 for prod)
R2_ENDPOINT=http://localhost:9000
R2_ACCESS_KEY=minioadmin
R2_SECRET_KEY=minioadmin
R2_BUCKET=aipulse

# Optional
SEMANTIC_SCHOLAR_API_KEY=
YOUTUBE_API_KEY=
BLUESKY_HANDLE=
BLUESKY_APP_PASSWORD=
RESEND_API_KEY=
NOTEBOOKLM_PROJECT_ID=
```

### Git Conventions

- Branch naming: `feat/agent-paper-harvester`, `fix/trend-scoring-bug`, `docs/update-api`
- Commit messages: imperative mood, reference the component: `feat(harvester): add arXiv OAI-PMH bulk download`
- PR template: summary + test plan
- No secrets in commits — use `.env.local`

## Design Documents

All design specs live in `docs/`:

- `docs/ARCHITECTURE.md` — system architecture, offline/online split
- `docs/AGENTS.md` — all 17 agent specifications with APIs and schedules
- `docs/DATA-MODEL.md` — Drizzle schema, types, processing registry
- `docs/API.md` — tRPC router structure
- `docs/TREND-ENGINE.md` — trend detection deep dive
- `docs/CRITIC-LAYER.md` — 8-dimension scoring, cohort ranking, justification
- `docs/SETTINGS.md` — pipeline cost controls, Settings Panel spec
- `docs/HOSTING.md` — Docker Compose, cloud deployment comparison
- `docs/ROADMAP.md` — phased implementation plan

## Development Workflow

### Local Development

```bash
docker compose up -d postgres redis minio   # Infrastructure
pnpm dev                                      # Next.js dev server
pnpm worker:harvest                           # Run harvest workers
pnpm worker:process                           # Run processing workers
pnpm worker:intelligence                      # Run trend/rec workers
pnpm worker:critic                            # Run critic workers
```

### Testing

- Unit tests: Vitest
- Integration tests: Vitest + testcontainers (Postgres, Redis)
- E2E tests: Playwright
- Run `pnpm test` before committing

### Key Principles

1. **Gemini only** — never add OpenAI/Anthropic SDK dependencies
2. **Persist everything** — if an agent computes it, save it to DB/R2
3. **No LLM on page load** — the display layer is a thin read layer
4. **Idempotent pipeline** — reprocessing produces the same result
5. **Check the registry** — before processing, verify it hasn't been done
6. **Settings control cost** — every expensive operation should be togglable
7. **Graceful degradation** — if an API is down, skip it and continue
