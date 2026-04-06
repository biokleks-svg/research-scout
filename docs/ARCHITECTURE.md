# Architecture

## System Overview

AI Pulse is a two-tier system: an **offline pipeline** that harvests, processes, and scores content on a schedule, and an **online display layer** that serves pre-computed data as a personalized web experience.

```
┌─────────────────────────────────────────────────────────────────┐
│                     EXTERNAL DATA SOURCES                       │
│  arXiv · Semantic Scholar · YouTube · Bluesky · X · Mastodon    │
│  Reddit · LinkedIn · HN · Discord · Conferences · Blogs · HF   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────▼──────────────────┐
        │     OFFLINE PIPELINE (cron-based)    │
        │                                      │
        │  Tier 1: Harvest Agents (6)          │
        │     ↓                                │
        │  Processing Registry (dedup guard)   │
        │     ↓                                │
        │  Message Queue (BullMQ / Redis)      │
        │     ↓                                │
        │  Tier 2: Processing Agents (4)       │
        │   - Dedup & Classifier               │
        │   - Infographic Gen (Nano Banana 2)  │
        │   - Summary Writer (Gemini Flash)    │
        │   - Podcast Gen (on-demand only)     │
        │     ↓                                │
        │  Tier 3: Intelligence Agents (4)     │
        │   - Trend Detector                   │
        │   - Trend Narrator                   │
        │   - Recommendation Engine            │
        │   - Digest Composer                  │
        │     ↓                                │
        │  Tier 4: Critic Layer (3)            │
        │   - 8-Dimension Scorer               │
        │   - Cohort Rank Synthesizer          │
        │   - Justification Composer           │
        │                                      │
        └──────────────┬───────────────────────┘
                       │ writes to
        ┌──────────────▼───────────────────────┐
        │         PERSISTENT STORAGE            │
        │                                       │
        │  PostgreSQL 16 + pgvector             │
        │   - content_items (+ embeddings)      │
        │   - trends (+ centroid embeddings)    │
        │   - users, feedback, engagements      │
        │   - processing_registry               │
        │   - system_settings                   │
        │                                       │
        │  Redis 7                              │
        │   - BullMQ job queues                 │
        │   - Personalized feed cache           │
        │                                       │
        │  Cloudflare R2 / MinIO                │
        │   - Infographic PNGs                  │
        │   - Podcast MP3s                      │
        │   - Other assets                      │
        └──────────────┬───────────────────────┘
                       │ reads from
        ┌──────────────▼───────────────────────┐
        │     ONLINE DISPLAY LAYER              │
        │                                       │
        │  Next.js 15 (App Router)              │
        │   - tRPC API (reads pre-computed)     │
        │   - Personalized feed                 │
        │   - Trends dashboard (per-category)   │
        │   - Content detail + dossier          │
        │   - Interest manager panel            │
        │   - Settings panel (cost controls)    │
        │   - Admin dashboard                   │
        │                                       │
        │  ZERO LLM CALLS ON PAGE LOAD          │
        └──────────────┬───────────────────────┘
                       │
        ┌──────────────▼───────────────────────┐
        │         USER INTERACTION              │
        │                                       │
        │  - Interest input (free-text, tags)   │
        │  - Feedback (area + quality)          │
        │  - Engagement signals (implicit)      │
        │  - On-demand podcast requests         │
        │  - Settings adjustments               │
        └──────────────────────────────────────┘
```

## Offline Pipeline

### Scheduling

Workers are triggered by cron jobs via `node-cron` or BullMQ repeatable jobs:

| Schedule | Agents |
|----------|--------|
| Every 2 hours | Paper Harvester (arXiv new submissions), Social Harvester (Bluesky/X/Reddit hot signals) |
| Every 6 hours | Video Harvester, Blog Watcher, Trend Detector recalculation |
| Daily | Full processing pipeline (three-pass, critic scoring, recommendation recompute), HF Model Tracker |
| Weekly | Conference Scraper, deep trend analysis, digest generation, stale content cleanup |

### Pipeline Flow

1. **Harvest** → normalize to `ContentItem`, check Processing Registry
2. **Dedup & Classify** → compute embedding (Gemini `text-embedding-004`), check pgvector similarity > 0.92, classify taxonomy
3. **Two-Pass Processing** (parallel) → infographic (Nano Banana 2) + summary (Gemini 2.5 Flash)
4. **Critic Scoring** → 8-dimension evaluation, cohort ranking
5. **Justification Dossier** → audit trail + relative position explanation
6. **Trend + Recommendation Update** → recalculate trends, re-score user feeds

Pass 3 (podcast) runs **on-demand only** when a user requests it.

### Idempotency

Every pipeline run is idempotent. The Processing Registry tracks each stage independently. If the infographic stage failed on a previous run, only that stage is retried. Content hashes (SHA-256) prevent cross-source duplicates.

## Online Display Layer

The Next.js app is a thin read layer:

- Queries PostgreSQL via Drizzle ORM through tRPC procedures
- Serves infographic/podcast URLs pointing to R2
- Renders pre-computed summaries from JSONB columns
- Displays pre-computed critic scores and justifications
- Collects user feedback and writes it to the DB for the next offline cycle
- Personalized feed ordering comes from Redis cache (pre-computed by Rec Engine)

The **only write operation** from the display layer that triggers an async job is the "Generate Podcast" button, which enqueues a BullMQ job for the Podcast Generator agent.

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM provider | Gemini only | Unified billing, consistent API, Nano Banana 2 for images |
| Embedding model | Gemini text-embedding-004 (768-dim) | Free tier available, good quality, native pgvector support |
| Image generation | Nano Banana 2 | $0.065/image, fastest in Gemini family |
| Podcast | NotebookLM API + local-notebooklm fallback | Best conversational audio; open-source fallback for cost |
| Database | PostgreSQL + pgvector | Single DB for relational + vector; battle-tested |
| Queue | BullMQ on Redis | Reliable, TypeScript-native, good dashboard (Bull Board) |
| Storage | R2/MinIO | S3-compatible, zero egress (R2), local-friendly (MinIO) |
| Framework | Next.js 15 | SSR + API in one, self-hostable, great ecosystem |
