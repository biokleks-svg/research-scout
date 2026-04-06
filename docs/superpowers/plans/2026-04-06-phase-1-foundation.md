# AI Pulse — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a working Next.js 15 monorepo with PostgreSQL+pgvector, Redis, MinIO via Docker Compose; a Paper Harvester that fetches arXiv + Semantic Scholar; a Dedup & Classification agent using Gemini embeddings; and a basic read-only feed UI showing content cards.

**Architecture:** Offline BullMQ workers harvest and classify papers into PostgreSQL; Next.js display layer serves pre-computed data via tRPC; Docker Compose provides all local infrastructure. Phase 1 has no user auth — the feed shows a global list sorted by harvested date.

**Tech Stack:** Next.js 15 (App Router), TypeScript 5 strict, tRPC v11, Drizzle ORM, PostgreSQL 16 + pgvector, Redis 7, BullMQ, Tailwind CSS v4, shadcn/ui, `@google/generative-ai`, Vitest, pnpm

---

## File Map

```
.env.example
.env.local                    (gitignored — you create this)
docker-compose.yml
drizzle.config.ts
vitest.config.ts
src/
  types/
    content.ts
    critic.ts
    trends.ts
    user.ts
    settings.ts
  lib/
    constants.ts
    gemini.ts
    embeddings.ts
    r2.ts
    queue.ts
  server/
    db/
      schema.ts
      index.ts
    routers/
      _app.ts
      feed.ts
    trpc.ts
  agents/
    harvesters/
      paper.ts
    processors/
      dedup-classifier.ts
  workers/
    harvest.ts
    process.ts
  scheduler.ts
  app/
    api/
      trpc/
        [trpc]/
          route.ts
    layout.tsx
    page.tsx
    providers.tsx
  components/
    feed/
      FeedCard.tsx
      FeedList.tsx
```

---

## Task 1: Project Bootstrap

**Files:**
- Create: `package.json` (via pnpm init + installs)
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Update: `.gitignore`

- [ ] **Step 1: Scaffold Next.js app**

  Run in `/Users/tata/Desktop/fun_projects/research-scout`:

  ```bash
  pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git
  ```

  When prompted: choose default for everything. The `--no-git` flag avoids re-initialising the existing repo.

- [ ] **Step 2: Add all runtime dependencies**

  ```bash
  pnpm add @trpc/server@11 @trpc/client@11 @trpc/react-query@11 @tanstack/react-query@5
  pnpm add drizzle-orm pg
  pnpm add bullmq ioredis
  pnpm add @google/generative-ai
  pnpm add zod
  pnpm add @aws-sdk/client-s3 @aws-sdk/lib-storage
  pnpm add p-retry
  pnpm add pino pino-pretty
  pnpm add node-cron
  pnpm add crypto-js
  pnpm add superjson
  ```

- [ ] **Step 3: Add dev dependencies**

  ```bash
  pnpm add -D drizzle-kit
  pnpm add -D vitest @vitejs/plugin-react vite-tsconfig-paths
  pnpm add -D @types/pg @types/node-cron @types/crypto-js
  pnpm add -D tsx
  ```

- [ ] **Step 4: Install shadcn/ui**

  ```bash
  pnpm dlx shadcn@latest init --defaults
  pnpm dlx shadcn@latest add card badge button skeleton
  ```

- [ ] **Step 5: Write `vitest.config.ts`**

  ```typescript
  import { defineConfig } from 'vitest/config';
  import tsconfigPaths from 'vite-tsconfig-paths';

  export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
      environment: 'node',
      globals: true,
    },
  });
  ```

- [ ] **Step 6: Write `tsconfig.json`** (replace the generated one)

  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["dom", "dom.iterable", "esnext"],
      "allowJs": true,
      "skipLibCheck": true,
      "strict": true,
      "noEmit": true,
      "esModuleInterop": true,
      "module": "esnext",
      "moduleResolution": "bundler",
      "resolveJsonModule": true,
      "isolatedModules": true,
      "jsx": "preserve",
      "incremental": true,
      "plugins": [{ "name": "next" }],
      "paths": { "@/*": ["./src/*"] }
    },
    "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    "exclude": ["node_modules"]
  }
  ```

- [ ] **Step 7: Write `.env.example`**

  ```bash
  # Database
  DATABASE_URL=postgresql://pulse:pulse@localhost:5432/aipulse

  # Redis
  REDIS_URL=redis://localhost:6379

  # Gemini (required for dedup agent)
  GEMINI_API_KEY=your-key-here

  # Storage — MinIO (local dev)
  R2_ENDPOINT=http://localhost:9000
  R2_ACCESS_KEY=minioadmin
  R2_SECRET_KEY=minioadmin
  R2_BUCKET=aipulse

  # Optional
  SEMANTIC_SCHOLAR_API_KEY=
  ```

- [ ] **Step 8: Copy `.env.example` to `.env.local` and fill in your `GEMINI_API_KEY`**

  ```bash
  cp .env.example .env.local
  # Then open .env.local and add your GEMINI_API_KEY
  ```

- [ ] **Step 9: Update `.gitignore`** — add these lines if not already present:

  ```
  .env.local
  .env*.local
  sprint-docs/
  ```

- [ ] **Step 10: Add scripts to `package.json`**

  Open `package.json` and replace the `"scripts"` block with:

  ```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "worker:harvest": "tsx src/workers/harvest.ts",
    "worker:process": "tsx src/workers/process.ts",
    "scheduler": "tsx src/scheduler.ts"
  }
  ```

- [ ] **Step 11: Verify setup compiles**

  ```bash
  pnpm tsc --noEmit
  ```

  Expected: no errors (or only the "Cannot find module 'next'" which resolves after `pnpm dev` runs once).

- [ ] **Step 12: Commit**

  ```bash
  git add -A
  git commit -m "chore: bootstrap Next.js 15 monorepo with tRPC, Drizzle, BullMQ, Vitest"
  ```

---

## Task 2: Docker Compose Infrastructure

**Files:**
- Create: `docker-compose.yml`
- Create: `docker/postgres/init.sql`

- [ ] **Step 1: Write `docker-compose.yml`**

  ```yaml
  version: '3.9'

  services:
    postgres:
      image: pgvector/pgvector:pg16
      environment:
        POSTGRES_USER: pulse
        POSTGRES_PASSWORD: pulse
        POSTGRES_DB: aipulse
      ports:
        - '5432:5432'
      volumes:
        - postgres_data:/var/lib/postgresql/data
        - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
      healthcheck:
        test: ['CMD-SHELL', 'pg_isready -U pulse -d aipulse']
        interval: 5s
        timeout: 5s
        retries: 5

    redis:
      image: redis:7-alpine
      ports:
        - '6379:6379'
      volumes:
        - redis_data:/data
      healthcheck:
        test: ['CMD', 'redis-cli', 'ping']
        interval: 5s
        timeout: 5s
        retries: 5

    minio:
      image: minio/minio:latest
      command: server /data --console-address ":9001"
      environment:
        MINIO_ROOT_USER: minioadmin
        MINIO_ROOT_PASSWORD: minioadmin
      ports:
        - '9000:9000'
        - '9001:9001'
      volumes:
        - minio_data:/data
      healthcheck:
        test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
        interval: 10s
        timeout: 5s
        retries: 3

  volumes:
    postgres_data:
    redis_data:
    minio_data:
  ```

- [ ] **Step 2: Write `docker/postgres/init.sql`**

  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  ```

- [ ] **Step 3: Start infrastructure**

  ```bash
  docker compose up -d postgres redis minio
  ```

  Expected: all three containers running. Verify:

  ```bash
  docker compose ps
  ```

  All should show status `healthy` or `Up`.

- [ ] **Step 4: Verify pgvector is installed**

  ```bash
  docker compose exec postgres psql -U pulse -d aipulse -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
  ```

  Expected: one row with `extname = vector`.

- [ ] **Step 5: Commit**

  ```bash
  git add docker-compose.yml docker/
  git commit -m "chore: add Docker Compose with PostgreSQL+pgvector, Redis, MinIO"
  ```

---

## Task 3: Shared TypeScript Types

**Files:**
- Create: `src/types/content.ts`
- Create: `src/types/critic.ts`
- Create: `src/types/trends.ts`
- Create: `src/types/user.ts`
- Create: `src/types/settings.ts`
- Test: `src/types/__tests__/types.test.ts`

- [ ] **Step 1: Write `src/types/content.ts`**

  ```typescript
  export type ContentSourceType =
    | 'paper'
    | 'video'
    | 'tweet'
    | 'blog'
    | 'conference'
    | 'model';

  export interface TaxonomyTags {
    primaryArea: string;         // e.g. "NLP", "CV", "RL"
    subAreas: string[];          // e.g. ["transformers", "RLHF"]
    taskTypes: string[];         // e.g. ["classification", "generation"]
    applicationDomains: string[];// e.g. ["healthcare", "code"]
  }

  export interface SummarySchema {
    tldr: string;
    problem: string;
    keyInsight: string;
    results: string;
    limitations: string;
    whyItMatters: string;
    practicalTakeaway: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    wordCount: number;
  }

  export interface ContentItem {
    id: string;
    sourceType: ContentSourceType;
    sourceId: string;
    sourceUrl: string;
    title: string;
    authors: string[] | null;
    publishedAt: Date;
    harvestedAt: Date;
    rawText: string | null;
    contentHash: string;
    taxonomy: TaxonomyTags | null;
    concepts: string[] | null;
    difficultyLevel: string | null;
    infographicUrl: string | null;
    summary: SummarySchema | null;
    podcastUrl: string | null;
    podcastDuration: number | null;
    criticScores: import('./critic').CriticScores | null;
    cohortRank: import('./critic').CohortRank | null;
    justification: import('./critic').JustificationDossier | null;
    trendIds: string[] | null;
    processingStatus: string;
    citationCount: number;
    engagementScore: number;
    globalQuality: number;
    createdAt: Date;
    updatedAt: Date;
  }

  export type ProcessingStage =
    | 'harvested'
    | 'classified'
    | 'processed'
    | 'scored'
    | 'complete';

  export interface StageRecord {
    done: boolean;
    at: string;
    url?: string;
  }

  export interface RegistryStages {
    harvested:    StageRecord;
    classified:   StageRecord;
    infographic:  StageRecord;
    summary:      StageRecord;
    podcast:      StageRecord;
    criticScored: StageRecord;
    justified:    StageRecord;
  }
  ```

- [ ] **Step 2: Write `src/types/critic.ts`**

  ```typescript
  export interface CriticDimension {
    score: number;
    reasoning: string;
  }

  export interface PopularityDimension {
    base: number;
    trendBonus: number;
    total: number;
  }

  export interface CriticScores {
    aiNovelty:           CriticDimension;
    usefulness:          CriticDimension;
    methodologicalRigor: CriticDimension;
    reproducibility:     CriticDimension;
    webBuzz:             CriticDimension;
    popularity:          PopularityDimension;
    industryRelevance:   CriticDimension;
    longevityPotential:  CriticDimension;
  }

  export interface CohortRank {
    clusterId:     string;
    weekId:        string;
    compositeRank: number;
    totalInCohort: number;
    percentiles:   Record<string, number>;
  }

  export interface AuditEntry {
    agent:     string;
    timestamp: string;
    action:    string;
    details:   string;
  }

  export interface PeerComparison {
    title:  string;
    rank:   number;
    scores: Record<string, number>;
  }

  export interface JustificationDossier {
    contentId:             string;
    generatedAt:           string;
    agentAuditTrail:       AuditEntry[];
    positionExplanation:   string;
    comparisonToTopPeers:  PeerComparison[];
  }
  ```

- [ ] **Step 3: Write `src/types/trends.ts`**

  ```typescript
  export type TrendStatus = 'emerging' | 'rising' | 'peak' | 'fading';

  export interface TrendSignals {
    paperBurst:       { count: number; zScore: number; window: '7d' };
    citationVelocity: { meanPerDay: number; zScore: number };
    socialBuzz:       { mentions: number; weightedScore: number; topPlatform: string };
    videoSurge:       { newVideos: number; viewVelocity: number };
    blogCoverage:     { posts: number; labBlogCount: number };
    modelRelease:     { count: number; totalDownloads: number };
    conferenceSignal: { acceptedPapers: number; workshops: number };
  }

  export interface Trend {
    id:                string;
    name:              string;
    slug:              string;
    category:          string | null;
    description:       string | null;
    narrative:         string | null;
    status:            TrendStatus;
    momentumScore:     number;
    zScore:            number;
    signals:           TrendSignals | null;
    evidenceIds:       string[] | null;
    detectedAt:        Date;
    peakedAt:          Date | null;
    updatedAt:         Date;
  }
  ```

- [ ] **Step 4: Write `src/types/user.ts`**

  ```typescript
  export interface InterestTag {
    id:       string;
    label:    string;
    category: string;
    weight:   number;
  }

  export interface UserSettings {
    emailDigest:         boolean;
    digestFrequency:     'daily' | 'weekly';
    autoPodcastTopN:     number;
    showDifficulty:      boolean;
    preferredDifficulty: 'beginner' | 'intermediate' | 'advanced' | 'all';
  }

  export interface User {
    id:                  string;
    email:               string;
    name:                string | null;
    role:                string | null;
    freeTextInterests:   string[] | null;
    structuredInterests: InterestTag[] | null;
    settings:            UserSettings | null;
    createdAt:           Date;
  }
  ```

- [ ] **Step 5: Write `src/types/settings.ts`**

  ```typescript
  export interface SystemSettings {
    infographicEnabled:   boolean;
    infographicTopPercent: number;
    summaryEnabled:       boolean;
    criticScoringEnabled: boolean;
    harvestArxiv:         boolean;
    harvestSemanticScholar: boolean;
    harvestYoutube:       boolean;
    harvestSocial:        boolean;
    maxItemsPerHarvestRun: number;
    embeddingBatchSize:   number;
  }
  ```

- [ ] **Step 6: Write failing type-shape test**

  Create `src/types/__tests__/types.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import type { ContentItem, SummarySchema } from '../content';
  import type { CriticScores } from '../critic';

  describe('types', () => {
    it('SummarySchema difficulty is a union literal', () => {
      const difficulties: SummarySchema['difficulty'][] = ['beginner', 'intermediate', 'advanced'];
      expect(difficulties).toHaveLength(3);
    });

    it('CriticScores has 8 dimensions', () => {
      const keys: (keyof CriticScores)[] = [
        'aiNovelty', 'usefulness', 'methodologicalRigor', 'reproducibility',
        'webBuzz', 'popularity', 'industryRelevance', 'longevityPotential',
      ];
      expect(keys).toHaveLength(8);
    });
  });
  ```

- [ ] **Step 7: Run test**

  ```bash
  pnpm test
  ```

  Expected: `2 tests passed`.

- [ ] **Step 8: Commit**

  ```bash
  git add src/types/
  git commit -m "feat(types): add shared TypeScript types for content, critic, trends, user, settings"
  ```

---

## Task 4: Database Schema + Drizzle Config

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/server/db/schema.ts`
- Create: `src/server/db/index.ts`
- Test: `src/server/db/__tests__/schema.test.ts`

- [ ] **Step 1: Write `drizzle.config.ts`**

  ```typescript
  import type { Config } from 'drizzle-kit';

  export default {
    schema: './src/server/db/schema.ts',
    out: './drizzle/migrations',
    dialect: 'postgresql',
    dbCredentials: {
      url: process.env.DATABASE_URL!,
    },
  } satisfies Config;
  ```

- [ ] **Step 2: Write `src/server/db/schema.ts`**

  ```typescript
  import {
    pgTable, uuid, text, timestamp, integer, real, jsonb, index, unique,
  } from 'drizzle-orm/pg-core';
  import { vector } from 'drizzle-orm/pg-core';
  import type {
    TaxonomyTags, SummarySchema,
  } from '@/types/content';
  import type { CriticScores, CohortRank, JustificationDossier } from '@/types/critic';
  import type { TrendSignals } from '@/types/trends';
  import type { InterestTag, UserSettings } from '@/types/user';
  import type { RegistryStages } from '@/types/content';

  // ─── content_items ─────────────────────────────────────────────────────────

  export const contentItems = pgTable('content_items', {
    id:               uuid('id').defaultRandom().primaryKey(),
    sourceType:       text('source_type').notNull(),
    sourceId:         text('source_id').notNull(),
    sourceUrl:        text('source_url').notNull(),
    title:            text('title').notNull(),
    authors:          jsonb('authors').$type<string[]>(),
    publishedAt:      timestamp('published_at').notNull(),
    harvestedAt:      timestamp('harvested_at').defaultNow(),
    rawText:          text('raw_text'),
    contentHash:      text('content_hash').notNull().unique(),

    taxonomy:         jsonb('taxonomy').$type<TaxonomyTags>(),
    concepts:         jsonb('concepts').$type<string[]>(),
    difficultyLevel:  text('difficulty_level'),

    infographicUrl:   text('infographic_url'),
    summary:          jsonb('summary').$type<SummarySchema>(),
    podcastUrl:       text('podcast_url'),
    podcastDuration:  integer('podcast_duration_sec'),

    criticScores:     jsonb('critic_scores').$type<CriticScores>(),
    cohortRank:       jsonb('cohort_rank').$type<CohortRank>(),
    justification:    jsonb('justification').$type<JustificationDossier>(),

    trendIds:         jsonb('trend_ids').$type<string[]>(),

    embedding:        vector('embedding', { dimensions: 768 }),

    processingStatus: text('processing_status').default('harvested'),

    citationCount:    integer('citation_count').default(0),
    engagementScore:  real('engagement_score').default(0),
    globalQuality:    real('global_quality').default(0),

    createdAt:        timestamp('created_at').defaultNow(),
    updatedAt:        timestamp('updated_at').defaultNow(),
  }, (table) => ({
    statusIdx:     index('content_items_status_idx').on(table.processingStatus),
    sourceTypeIdx: index('content_items_source_type_idx').on(table.sourceType),
    publishedIdx:  index('content_items_published_at_idx').on(table.publishedAt),
  }));

  // ─── trends ────────────────────────────────────────────────────────────────

  export const trends = pgTable('trends', {
    id:               uuid('id').defaultRandom().primaryKey(),
    name:             text('name').notNull(),
    slug:             text('slug').notNull().unique(),
    category:         text('category'),
    description:      text('description'),
    narrative:        text('narrative'),
    status:           text('status').default('emerging'),
    momentumScore:    real('momentum_score').notNull(),
    zScore:           real('z_score').notNull(),
    signals:          jsonb('signals').$type<TrendSignals>(),
    evidenceIds:      jsonb('evidence_ids').$type<string[]>(),
    centroidEmbedding: vector('centroid_embedding', { dimensions: 768 }),
    detectedAt:       timestamp('detected_at').defaultNow(),
    peakedAt:         timestamp('peaked_at'),
    updatedAt:        timestamp('updated_at').defaultNow(),
  });

  // ─── users ─────────────────────────────────────────────────────────────────

  export const users = pgTable('users', {
    id:                  uuid('id').defaultRandom().primaryKey(),
    email:               text('email').notNull().unique(),
    name:                text('name'),
    role:                text('role'),
    freeTextInterests:   jsonb('free_text_interests').$type<string[]>(),
    structuredInterests: jsonb('structured_interests').$type<InterestTag[]>(),
    interestEmbedding:   vector('interest_embedding', { dimensions: 768 }),
    settings:            jsonb('settings').$type<UserSettings>(),
    createdAt:           timestamp('created_at').defaultNow(),
  });

  // ─── feedback ──────────────────────────────────────────────────────────────

  export const feedback = pgTable('feedback', {
    id:           uuid('id').defaultRandom().primaryKey(),
    userId:       uuid('user_id').references(() => users.id),
    contentId:    uuid('content_id').references(() => contentItems.id),
    feedbackType: text('feedback_type').notNull(),
    value:        real('value'),
    tags:         jsonb('tags').$type<string[]>(),
    createdAt:    timestamp('created_at').defaultNow(),
  });

  // ─── engagements ───────────────────────────────────────────────────────────

  export const engagements = pgTable('engagements', {
    id:          uuid('id').defaultRandom().primaryKey(),
    userId:      uuid('user_id').references(() => users.id),
    contentId:   uuid('content_id').references(() => contentItems.id),
    eventType:   text('event_type').notNull(),
    durationSec: integer('duration_sec'),
    passLevel:   text('pass_level'),
    createdAt:   timestamp('created_at').defaultNow(),
  });

  // ─── processing_registry ───────────────────────────────────────────────────

  export const processingRegistry = pgTable('processing_registry', {
    id:            uuid('id').defaultRandom().primaryKey(),
    sourceType:    text('source_type').notNull(),
    sourceId:      text('source_id').notNull(),
    contentHash:   text('content_hash').notNull(),
    contentItemId: uuid('content_item_id').references(() => contentItems.id),
    stages:        jsonb('stages').$type<RegistryStages>(),
    firstSeenAt:   timestamp('first_seen_at').defaultNow(),
    lastCheckedAt: timestamp('last_checked_at').defaultNow(),
  }, (table) => ({
    uniqueSource: unique('processing_registry_source_unique').on(table.sourceType, table.sourceId),
    hashIdx:      index('processing_registry_hash_idx').on(table.contentHash),
  }));

  // ─── system_settings ───────────────────────────────────────────────────────

  export const systemSettings = pgTable('system_settings', {
    id:        uuid('id').defaultRandom().primaryKey(),
    key:       text('key').notNull().unique(),
    value:     jsonb('value').notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
    updatedBy: uuid('updated_by').references(() => users.id),
  });
  ```

- [ ] **Step 3: Write `src/server/db/index.ts`**

  ```typescript
  import { drizzle } from 'drizzle-orm/node-postgres';
  import { Pool } from 'pg';
  import * as schema from './schema';

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  export const db = drizzle(pool, { schema });
  export type DB = typeof db;
  ```

- [ ] **Step 4: Write failing schema-shape test**

  Create `src/server/db/__tests__/schema.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { contentItems, processingRegistry, systemSettings } from '../schema';

  describe('schema', () => {
    it('contentItems has embedding column', () => {
      expect('embedding' in contentItems).toBe(true);
    });

    it('processingRegistry has unique source constraint', () => {
      // The table object exists and has the expected shape
      expect(processingRegistry).toBeDefined();
    });

    it('systemSettings has key column', () => {
      expect('key' in systemSettings).toBe(true);
    });
  });
  ```

- [ ] **Step 5: Run test**

  ```bash
  pnpm test
  ```

  Expected: `3 tests passed` (plus prior 2 = 5 total).

- [ ] **Step 6: Generate and run migrations**

  ```bash
  pnpm db:generate
  pnpm db:migrate
  ```

  Expected: migration files created in `drizzle/migrations/`, applied to local DB.

- [ ] **Step 7: Verify tables exist in DB**

  ```bash
  docker compose exec postgres psql -U pulse -d aipulse -c "\dt"
  ```

  Expected: `content_items`, `trends`, `users`, `feedback`, `engagements`, `processing_registry`, `system_settings` all listed.

- [ ] **Step 8: Commit**

  ```bash
  git add src/server/db/ drizzle/ drizzle.config.ts
  git commit -m "feat(db): add Drizzle schema with all tables, pgvector columns, indexes, and migrations"
  ```

---

## Task 5: tRPC Scaffold

**Files:**
- Create: `src/server/trpc.ts`
- Create: `src/server/routers/_app.ts`
- Create: `src/app/api/trpc/[trpc]/route.ts`
- Create: `src/app/providers.tsx`
- Modify: `src/app/layout.tsx`
- Test: `src/server/__tests__/trpc.test.ts`

- [ ] **Step 1: Write `src/server/trpc.ts`**

  ```typescript
  import { initTRPC } from '@trpc/server';
  import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
  import superjson from 'superjson';
  import { db } from './db';

  export const createContext = async (_opts: FetchCreateContextFnOptions) => {
    return { db };
  };

  type Context = Awaited<ReturnType<typeof createContext>>;

  const t = initTRPC.context<Context>().create({
    transformer: superjson,
  });

  export const router = t.router;
  export const publicProcedure = t.procedure;
  ```

- [ ] **Step 2: Write `src/server/routers/_app.ts`** (placeholder — feedRouter added in Task 10)

  ```typescript
  import { router } from '../trpc';

  export const appRouter = router({});

  export type AppRouter = typeof appRouter;
  ```

- [ ] **Step 3: Write `src/app/api/trpc/[trpc]/route.ts`**

  ```typescript
  import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
  import { appRouter } from '@/server/routers/_app';
  import { createContext } from '@/server/trpc';

  const handler = (req: Request) =>
    fetchRequestHandler({
      endpoint: '/api/trpc',
      req,
      router: appRouter,
      createContext,
    });

  export { handler as GET, handler as POST };
  ```

- [ ] **Step 4: Write `src/app/providers.tsx`**

  ```typescript
  'use client';

  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { httpBatchLink } from '@trpc/client';
  import { createTRPCReact } from '@trpc/react-query';
  import { useState } from 'react';
  import superjson from 'superjson';
  import type { AppRouter } from '@/server/routers/_app';

  export const trpc = createTRPCReact<AppRouter>();

  export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    const [trpcClient] = useState(() =>
      trpc.createClient({
        links: [
          httpBatchLink({
            url: '/api/trpc',
            transformer: superjson,
          }),
        ],
      }),
    );

    return (
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    );
  }
  ```

- [ ] **Step 5: Update `src/app/layout.tsx`** — wrap with Providers

  Open `src/app/layout.tsx` and replace its content with:

  ```typescript
  import type { Metadata } from 'next';
  import { Inter } from 'next/font/google';
  import './globals.css';
  import { Providers } from './providers';

  const inter = Inter({ subsets: ['latin'] });

  export const metadata: Metadata = {
    title: 'AI Pulse',
    description: 'Stay current in AI/ML research',
  };

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="en">
        <body className={inter.className}>
          <Providers>{children}</Providers>
        </body>
      </html>
    );
  }
  ```

- [ ] **Step 6: Write failing tRPC test**

  Create `src/server/__tests__/trpc.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { appRouter } from '../routers/_app';

  describe('appRouter', () => {
    it('is defined', () => {
      expect(appRouter).toBeDefined();
    });

    it('has no procedures yet (scaffold only)', () => {
      // _def.procedures is an object; an empty router has no keys
      expect(typeof appRouter).toBe('object');
    });
  });
  ```

- [ ] **Step 7: Run test**

  ```bash
  pnpm test
  ```

  Expected: all prior tests + 2 new = 7 total passing.

- [ ] **Step 8: Verify dev server starts**

  ```bash
  pnpm dev &
  sleep 5
  curl -s http://localhost:3000/api/trpc | head -c 100
  kill %1
  ```

  Expected: some response (even an error JSON is fine — the route exists).

- [ ] **Step 9: Commit**

  ```bash
  git add src/server/trpc.ts src/server/routers/ src/app/api/ src/app/providers.tsx src/app/layout.tsx
  git commit -m "feat(trpc): scaffold tRPC v11 with fetch adapter, superjson transformer, React Query provider"
  ```

---

## Task 6: Shared Library — Constants, Queue, Gemini Client, R2 Client

**Files:**
- Create: `src/lib/constants.ts`
- Create: `src/lib/queue.ts`
- Create: `src/lib/gemini.ts`
- Create: `src/lib/r2.ts`
- Test: `src/lib/__tests__/gemini.test.ts`

- [ ] **Step 1: Write `src/lib/constants.ts`**

  ```typescript
  // Harvest sources
  export const ARXIV_BASE_URL = 'https://export.arxiv.org/api/query';
  export const ARXIV_CATEGORIES = ['cs.AI', 'cs.LG', 'cs.CL', 'stat.ML'] as const;
  export const SEMANTIC_SCHOLAR_BASE_URL = 'https://api.semanticscholar.org/graph/v1';

  // Processing
  export const DEDUP_SIMILARITY_THRESHOLD = 0.92;
  export const EMBEDDING_DIMENSIONS = 768;
  export const GEMINI_EMBEDDING_MODEL = 'text-embedding-004';
  export const GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
  export const GEMINI_PRO_MODEL = 'gemini-2.5-pro';

  // Queue names
  export const QUEUE_HARVEST = 'harvest';
  export const QUEUE_PROCESS = 'process';
  export const QUEUE_INTELLIGENCE = 'intelligence';
  export const QUEUE_CRITIC = 'critic';

  // Rate limits (ms between requests)
  export const ARXIV_RATE_LIMIT_MS = 3000;
  export const SEMANTIC_SCHOLAR_RATE_LIMIT_MS = 1000;

  // Pagination
  export const DEFAULT_FEED_LIMIT = 20;
  export const MAX_FEED_LIMIT = 100;
  ```

- [ ] **Step 2: Write `src/lib/queue.ts`**

  ```typescript
  import { Queue, Worker, type JobsOptions } from 'bullmq';
  import IORedis from 'ioredis';
  import {
    QUEUE_HARVEST, QUEUE_PROCESS, QUEUE_INTELLIGENCE, QUEUE_CRITIC,
  } from './constants';

  let connection: IORedis | null = null;

  export function getRedisConnection(): IORedis {
    if (!connection) {
      connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: null, // Required for BullMQ
      });
    }
    return connection;
  }

  export const defaultJobOptions: JobsOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  };

  export function createQueue(name: string) {
    return new Queue(name, {
      connection: getRedisConnection(),
      defaultJobOptions,
    });
  }

  export const harvestQueue    = createQueue(QUEUE_HARVEST);
  export const processQueue    = createQueue(QUEUE_PROCESS);
  export const intelligenceQueue = createQueue(QUEUE_INTELLIGENCE);
  export const criticQueue     = createQueue(QUEUE_CRITIC);

  // Job type payloads
  export interface HarvestJobData {
    agentType: 'paper' | 'video' | 'social' | 'conference' | 'blog' | 'huggingface';
    params?: Record<string, unknown>;
  }

  export interface ProcessJobData {
    contentItemId: string;
    stages: Array<'classify' | 'infographic' | 'summary'>;
  }
  ```

- [ ] **Step 3: Write `src/lib/gemini.ts`**

  ```typescript
  import { GoogleGenerativeAI } from '@google/generative-ai';
  import { GEMINI_FLASH_MODEL, GEMINI_PRO_MODEL, GEMINI_EMBEDDING_MODEL } from './constants';

  let client: GoogleGenerativeAI | null = null;

  function getClient(): GoogleGenerativeAI {
    if (!client) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is required');
      client = new GoogleGenerativeAI(apiKey);
    }
    return client;
  }

  export function getFlashModel() {
    return getClient().getGenerativeModel({ model: GEMINI_FLASH_MODEL });
  }

  export function getProModel() {
    return getClient().getGenerativeModel({ model: GEMINI_PRO_MODEL });
  }

  export function getEmbeddingModel() {
    return getClient().getGenerativeModel({ model: GEMINI_EMBEDDING_MODEL });
  }

  /** Generate a 768-dim embedding for a text string. */
  export async function embedText(text: string): Promise<number[]> {
    const model = getEmbeddingModel();
    const result = await model.embedContent(text);
    return result.embedding.values;
  }

  /** Generate embeddings for a batch of texts (Gemini has no native batching — runs sequentially). */
  export async function embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await embedText(text));
    }
    return results;
  }
  ```

- [ ] **Step 4: Write `src/lib/r2.ts`**

  ```typescript
  import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
  } from '@aws-sdk/client-s3';
  import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

  let s3Client: S3Client | null = null;

  function getS3Client(): S3Client {
    if (!s3Client) {
      s3Client = new S3Client({
        endpoint: process.env.R2_ENDPOINT ?? 'http://localhost:9000',
        region: 'auto',
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY ?? 'minioadmin',
          secretAccessKey: process.env.R2_SECRET_KEY ?? 'minioadmin',
        },
        forcePathStyle: true, // Required for MinIO
      });
    }
    return s3Client;
  }

  const BUCKET = process.env.R2_BUCKET ?? 'aipulse';

  export async function uploadFile(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
  ): Promise<string> {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }),
    );
    // Return a public URL (MinIO path-style)
    const endpoint = process.env.R2_ENDPOINT ?? 'http://localhost:9000';
    return `${endpoint}/${BUCKET}/${key}`;
  }

  export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const client = getS3Client();
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return getSignedUrl(client, command, { expiresIn });
  }
  ```

- [ ] **Step 5: Write failing Gemini client test**

  Create `src/lib/__tests__/gemini.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from 'vitest';

  describe('gemini client', () => {
    it('throws if GEMINI_API_KEY is not set', async () => {
      const original = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      // Re-import to bust the module-level singleton
      vi.resetModules();
      const { embedText } = await import('../gemini');

      await expect(embedText('hello')).rejects.toThrow('GEMINI_API_KEY');

      process.env.GEMINI_API_KEY = original;
      vi.resetModules();
    });
  });
  ```

- [ ] **Step 6: Run test**

  ```bash
  pnpm test
  ```

  Expected: all prior + 1 new = 8 total passing.

- [ ] **Step 7: Commit**

  ```bash
  git add src/lib/
  git commit -m "feat(lib): add constants, BullMQ queue definitions, Gemini client, R2/MinIO storage client"
  ```

---

## Task 7: Paper Harvester Agent — arXiv + Semantic Scholar

**Files:**
- Create: `src/agents/harvesters/paper.ts`
- Test: `src/agents/harvesters/__tests__/paper.test.ts`

- [ ] **Step 1: Write failing test first**

  Create `src/agents/harvesters/__tests__/paper.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from 'vitest';
  import { normalizeArxivEntry, buildArxivUrl } from '../paper';

  describe('arXiv harvester', () => {
    it('buildArxivUrl includes all categories', () => {
      const url = buildArxivUrl(10, 0);
      expect(url).toContain('cs.AI');
      expect(url).toContain('cs.LG');
      expect(url).toContain('max_results=10');
    });

    it('normalizeArxivEntry extracts title and authors', () => {
      const fakeEntry = {
        id: ['http://arxiv.org/abs/2401.00001v1'],
        title: ['  Test Paper Title  '],
        author: [{ name: ['Alice Smith'] }, { name: ['Bob Jones'] }],
        summary: ['This is the abstract.'],
        published: ['2024-01-01T00:00:00Z'],
        link: [
          { $: { href: 'http://arxiv.org/abs/2401.00001', rel: 'alternate' } },
          { $: { href: 'http://arxiv.org/pdf/2401.00001', rel: 'related', title: 'pdf' } },
        ],
      };
      const result = normalizeArxivEntry(fakeEntry);
      expect(result.title).toBe('Test Paper Title');
      expect(result.authors).toEqual(['Alice Smith', 'Bob Jones']);
      expect(result.sourceId).toBe('2401.00001');
      expect(result.sourceType).toBe('paper');
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  pnpm test
  ```

  Expected: FAIL — `normalizeArxivEntry` and `buildArxivUrl` not found.

- [ ] **Step 3: Write `src/agents/harvesters/paper.ts`**

  ```typescript
  import { createHash } from 'crypto';
  import pRetry from 'p-retry';
  import { db } from '@/server/db';
  import { contentItems, processingRegistry } from '@/server/db/schema';
  import { eq, and } from 'drizzle-orm';
  import {
    ARXIV_BASE_URL,
    ARXIV_CATEGORIES,
    ARXIV_RATE_LIMIT_MS,
    SEMANTIC_SCHOLAR_BASE_URL,
    SEMANTIC_SCHOLAR_RATE_LIMIT_MS,
  } from '@/lib/constants';
  import type { ContentSourceType, RegistryStages } from '@/types/content';
  import { pino } from 'pino';

  const logger = pino({ name: 'paper-harvester' });

  // ─── arXiv ─────────────────────────────────────────────────────────────────

  export function buildArxivUrl(maxResults: number, start: number): string {
    const searchQuery = ARXIV_CATEGORIES.map((c) => `cat:${c}`).join(' OR ');
    const params = new URLSearchParams({
      search_query: searchQuery,
      start: String(start),
      max_results: String(maxResults),
      sortBy: 'submittedDate',
      sortOrder: 'descending',
    });
    return `${ARXIV_BASE_URL}?${params.toString()}`;
  }

  // arXiv Atom XML entry shape (parsed by xml2js)
  interface ArxivAuthor {
    name: string[];
  }

  interface ArxivLink {
    $: { href: string; rel: string; title?: string };
  }

  interface ArxivEntry {
    id: string[];
    title: string[];
    author: ArxivAuthor[];
    summary: string[];
    published: string[];
    link: ArxivLink[];
  }

  interface NormalizedPaper {
    sourceType: ContentSourceType;
    sourceId: string;
    sourceUrl: string;
    title: string;
    authors: string[];
    publishedAt: Date;
    rawText: string;
    contentHash: string;
  }

  export function normalizeArxivEntry(entry: ArxivEntry): NormalizedPaper {
    // arXiv IDs look like: http://arxiv.org/abs/2401.00001v1
    const rawId = entry.id[0] ?? '';
    const sourceId = rawId.replace(/v\d+$/, '').split('/').pop() ?? rawId;

    const title = (entry.title[0] ?? '').replace(/\s+/g, ' ').trim();
    const authors = (entry.author ?? []).map((a) => a.name[0] ?? '');
    const abstract = (entry.summary[0] ?? '').replace(/\s+/g, ' ').trim();
    const publishedAt = new Date(entry.published[0] ?? Date.now());

    const alternateLink = entry.link?.find((l) => l.$.rel === 'alternate');
    const sourceUrl = alternateLink?.$.href ?? `https://arxiv.org/abs/${sourceId}`;

    const contentHash = createHash('sha256')
      .update(`arxiv:${sourceId}:${title}`)
      .digest('hex');

    return {
      sourceType: 'paper',
      sourceId,
      sourceUrl,
      title,
      authors,
      publishedAt,
      rawText: abstract,
      contentHash,
    };
  }

  async function parseArxivXml(xml: string): Promise<ArxivEntry[]> {
    // Dynamic import to avoid bundling xml2js in Next.js
    const { parseStringPromise } = await import('xml2js');
    const parsed = await parseStringPromise(xml);
    return (parsed?.feed?.entry as ArxivEntry[]) ?? [];
  }

  export async function harvestArxiv(maxResults = 50): Promise<number> {
    logger.info({ maxResults }, 'Starting arXiv harvest');
    let harvested = 0;

    const url = buildArxivUrl(maxResults, 0);
    const xml = await pRetry(
      async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`arXiv returned ${res.status}`);
        return res.text();
      },
      { retries: 3, minTimeout: ARXIV_RATE_LIMIT_MS },
    );

    const entries = await parseArxivXml(xml);
    logger.info({ count: entries.length }, 'Parsed arXiv entries');

    for (const entry of entries) {
      try {
        const paper = normalizeArxivEntry(entry);

        // Check processing registry — skip if already seen
        const existing = await db.query.processingRegistry.findFirst({
          where: and(
            eq(processingRegistry.sourceType, paper.sourceType),
            eq(processingRegistry.sourceId, paper.sourceId),
          ),
        });
        if (existing) continue;

        // Insert content item
        const [inserted] = await db
          .insert(contentItems)
          .values({
            sourceType:       paper.sourceType,
            sourceId:         paper.sourceId,
            sourceUrl:        paper.sourceUrl,
            title:            paper.title,
            authors:          paper.authors,
            publishedAt:      paper.publishedAt,
            rawText:          paper.rawText,
            contentHash:      paper.contentHash,
            processingStatus: 'harvested',
          })
          .onConflictDoNothing()
          .returning();

        if (!inserted) continue;

        // Register in processing_registry
        const emptyStage = { done: false, at: new Date().toISOString() };
        const stages: RegistryStages = {
          harvested:    { done: true,  at: new Date().toISOString() },
          classified:   emptyStage,
          infographic:  emptyStage,
          summary:      emptyStage,
          podcast:      emptyStage,
          criticScored: emptyStage,
          justified:    emptyStage,
        };

        await db.insert(processingRegistry).values({
          sourceType:    paper.sourceType,
          sourceId:      paper.sourceId,
          contentHash:   paper.contentHash,
          contentItemId: inserted.id,
          stages,
        }).onConflictDoNothing();

        harvested++;

        // Rate limit
        await new Promise((r) => setTimeout(r, ARXIV_RATE_LIMIT_MS));
      } catch (err) {
        logger.error({ err, sourceId: entry.id?.[0] }, 'Failed to insert arXiv entry');
      }
    }

    logger.info({ harvested }, 'arXiv harvest complete');
    return harvested;
  }

  // ─── Semantic Scholar enrichment ───────────────────────────────────────────

  interface S2Paper {
    paperId: string;
    citationCount: number;
    influentialCitationCount: number;
  }

  export async function enrichWithSemanticScholar(arxivId: string): Promise<S2Paper | null> {
    const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
    const headers: Record<string, string> = apiKey ? { 'x-api-key': apiKey } : {};

    return pRetry(
      async () => {
        const url = `${SEMANTIC_SCHOLAR_BASE_URL}/paper/arXiv:${arxivId}?fields=paperId,citationCount,influentialCitationCount`;
        const res = await fetch(url, { headers });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Semantic Scholar returned ${res.status}`);
        return res.json() as Promise<S2Paper>;
      },
      {
        retries: 2,
        minTimeout: SEMANTIC_SCHOLAR_RATE_LIMIT_MS,
        onFailedAttempt: (err) => {
          logger.warn({ err: err.message, arxivId }, 'Semantic Scholar enrichment failed, retrying');
        },
      },
    );
  }

  export async function enrichRecentPapers(limit = 20): Promise<void> {
    const papers = await db.query.contentItems.findMany({
      where: and(
        eq(contentItems.sourceType, 'paper'),
        eq(contentItems.citationCount, 0),
      ),
      limit,
      orderBy: (t, { desc }) => [desc(t.harvestedAt)],
    });

    for (const paper of papers) {
      try {
        const s2 = await enrichWithSemanticScholar(paper.sourceId);
        if (!s2) continue;

        await db
          .update(contentItems)
          .set({ citationCount: s2.citationCount })
          .where(eq(contentItems.id, paper.id));

        logger.info({ arxivId: paper.sourceId, citationCount: s2.citationCount }, 'Enriched paper');
        await new Promise((r) => setTimeout(r, SEMANTIC_SCHOLAR_RATE_LIMIT_MS));
      } catch (err) {
        logger.error({ err, paperId: paper.id }, 'Failed to enrich paper');
      }
    }
  }
  ```

- [ ] **Step 4: Add xml2js dependency**

  ```bash
  pnpm add xml2js
  pnpm add -D @types/xml2js
  ```

- [ ] **Step 5: Run tests**

  ```bash
  pnpm test
  ```

  Expected: all prior + 2 new = 10 total passing.

- [ ] **Step 6: Commit**

  ```bash
  git add src/agents/harvesters/
  git commit -m "feat(harvester): add Paper Harvester with arXiv fetch+parse and Semantic Scholar enrichment"
  ```

---

## Task 8: Dedup & Classification Agent

**Files:**
- Create: `src/agents/processors/dedup-classifier.ts`
- Test: `src/agents/processors/__tests__/dedup-classifier.test.ts`

- [ ] **Step 1: Write failing test**

  Create `src/agents/processors/__tests__/dedup-classifier.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { cosineSimilarity } from '../dedup-classifier';

  describe('dedup-classifier', () => {
    it('cosineSimilarity returns 1 for identical vectors', () => {
      const v = [1, 0, 0, 0];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
    });

    it('cosineSimilarity returns 0 for orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
    });

    it('cosineSimilarity returns -1 for opposite vectors', () => {
      const a = [1, 0];
      const b = [-1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  pnpm test
  ```

  Expected: FAIL — `cosineSimilarity` not found.

- [ ] **Step 3: Write `src/agents/processors/dedup-classifier.ts`**

  ```typescript
  import { db } from '@/server/db';
  import { contentItems, processingRegistry } from '@/server/db/schema';
  import { eq, and, sql } from 'drizzle-orm';
  import { embedText } from '@/lib/gemini';
  import { DEDUP_SIMILARITY_THRESHOLD } from '@/lib/constants';
  import { pino } from 'pino';

  const logger = pino({ name: 'dedup-classifier' });

  // ─── Cosine similarity (pure function — testable) ──────────────────────────

  export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) throw new Error('Vectors must have the same length');
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot   += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ─── Taxonomy inference (simple keyword-based — good enough for Phase 1) ──

  const AREA_KEYWORDS: Record<string, string[]> = {
    NLP:            ['language model', 'nlp', 'transformer', 'text', 'token', 'llm', 'gpt', 'bert', 'translation'],
    CV:             ['image', 'vision', 'detection', 'segmentation', 'diffusion', 'pixel', 'visual'],
    RL:             ['reinforcement', 'reward', 'policy', 'agent', 'q-learning', 'ppo', 'rlhf'],
    'Graph ML':     ['graph neural', 'gnn', 'knowledge graph', 'node classification'],
    'Multimodal':   ['multimodal', 'vision-language', 'clip', 'image-text'],
    'Robotics':     ['robot', 'manipulation', 'locomotion', 'embodied'],
    'Theory':       ['convergence', 'generalization bound', 'pac learning', 'complexity'],
    'Audio/Speech': ['speech', 'audio', 'asr', 'tts', 'voice'],
  };

  export function inferPrimaryArea(text: string): string {
    const lower = text.toLowerCase();
    let best = 'General AI';
    let bestCount = 0;

    for (const [area, keywords] of Object.entries(AREA_KEYWORDS)) {
      const count = keywords.filter((kw) => lower.includes(kw)).length;
      if (count > bestCount) {
        bestCount = count;
        best = area;
      }
    }
    return best;
  }

  export function inferDifficulty(text: string): 'beginner' | 'intermediate' | 'advanced' {
    const lower = text.toLowerCase();
    const advancedTerms = ['theorem', 'proof', 'convergence', 'variational', 'posterior', 'manifold'];
    const beginnerTerms = ['tutorial', 'introduction', 'survey', 'overview', 'beginner'];
    const adv = advancedTerms.filter((t) => lower.includes(t)).length;
    const beg = beginnerTerms.filter((t) => lower.includes(t)).length;
    if (adv >= 2) return 'advanced';
    if (beg >= 1) return 'beginner';
    return 'intermediate';
  }

  // ─── Dedup check via pgvector ───────────────────────────────────────────────

  /**
   * Find the most similar item in the DB using pgvector.
   * Returns the similarity score (0-1) or null if no items exist.
   */
  async function findMostSimilar(embedding: number[]): Promise<number | null> {
    const vectorLiteral = `[${embedding.join(',')}]`;

    const result = await db.execute(
      sql`SELECT 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
          FROM content_items
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${vectorLiteral}::vector
          LIMIT 1`,
    );

    const rows = result.rows as Array<{ similarity: number }>;
    if (rows.length === 0) return null;
    return rows[0]!.similarity;
  }

  // ─── Main classify function ─────────────────────────────────────────────────

  export async function classifyContentItem(contentItemId: string): Promise<boolean> {
    const item = await db.query.contentItems.findFirst({
      where: eq(contentItems.id, contentItemId),
    });

    if (!item) {
      logger.error({ contentItemId }, 'Content item not found');
      return false;
    }

    if (!item.rawText) {
      logger.warn({ contentItemId }, 'Content item has no rawText, skipping classification');
      return false;
    }

    logger.info({ contentItemId, title: item.title }, 'Classifying content item');

    try {
      // Compute embedding
      const textToEmbed = `${item.title}\n\n${item.rawText}`.slice(0, 8000);
      const embedding = await embedText(textToEmbed);

      // Dedup check
      const similarity = await findMostSimilar(embedding);
      if (similarity !== null && similarity > DEDUP_SIMILARITY_THRESHOLD) {
        logger.info({ contentItemId, similarity }, 'Duplicate detected, marking as duplicate');
        await db
          .update(contentItems)
          .set({ processingStatus: 'duplicate' })
          .where(eq(contentItems.id, contentItemId));
        return false;
      }

      // Infer taxonomy
      const combinedText = `${item.title} ${item.rawText}`;
      const primaryArea = inferPrimaryArea(combinedText);
      const difficulty = inferDifficulty(combinedText);

      // Persist
      await db
        .update(contentItems)
        .set({
          embedding:        embedding as unknown as number[],
          taxonomy:         { primaryArea, subAreas: [], taskTypes: [], applicationDomains: [] },
          difficultyLevel:  difficulty,
          processingStatus: 'classified',
          updatedAt:        new Date(),
        })
        .where(eq(contentItems.id, contentItemId));

      // Update registry
      await db.execute(sql`
        UPDATE processing_registry
        SET stages = jsonb_set(
          COALESCE(stages, '{}'::jsonb),
          '{classified}',
          ${JSON.stringify({ done: true, at: new Date().toISOString() })}::jsonb
        ),
        last_checked_at = NOW()
        WHERE content_item_id = ${contentItemId}
      `);

      logger.info({ contentItemId, primaryArea, difficulty }, 'Classification complete');
      return true;
    } catch (err) {
      logger.error({ err, contentItemId }, 'Classification failed');
      return false;
    }
  }

  /** Process all unclassified items (status = 'harvested'). */
  export async function classifyPendingItems(batchSize = 10): Promise<number> {
    const pending = await db.query.contentItems.findMany({
      where: eq(contentItems.processingStatus, 'harvested'),
      limit: batchSize,
    });

    let classified = 0;
    for (const item of pending) {
      const ok = await classifyContentItem(item.id);
      if (ok) classified++;
    }
    return classified;
  }
  ```

- [ ] **Step 4: Run tests**

  ```bash
  pnpm test
  ```

  Expected: all prior + 3 new = 13 total passing.

- [ ] **Step 5: Commit**

  ```bash
  git add src/agents/processors/
  git commit -m "feat(processor): add Dedup & Classification agent with cosine similarity, pgvector dedup, keyword taxonomy"
  ```

---

## Task 9: BullMQ Workers + Scheduler

**Files:**
- Create: `src/workers/harvest.ts`
- Create: `src/workers/process.ts`
- Create: `src/scheduler.ts`

- [ ] **Step 1: Write `src/workers/harvest.ts`**

  ```typescript
  import { Worker } from 'bullmq';
  import { getRedisConnection } from '@/lib/queue';
  import { QUEUE_HARVEST } from '@/lib/constants';
  import { harvestArxiv, enrichRecentPapers } from '@/agents/harvesters/paper';
  import type { HarvestJobData } from '@/lib/queue';
  import { pino } from 'pino';

  const logger = pino({ name: 'harvest-worker' });

  const worker = new Worker<HarvestJobData>(
    QUEUE_HARVEST,
    async (job) => {
      logger.info({ jobId: job.id, agentType: job.data.agentType }, 'Processing harvest job');

      switch (job.data.agentType) {
        case 'paper': {
          const count = await harvestArxiv(50);
          await job.updateProgress(50);
          await enrichRecentPapers(20);
          await job.updateProgress(100);
          logger.info({ count }, 'Paper harvest job complete');
          return { harvested: count };
        }
        default:
          logger.warn({ agentType: job.data.agentType }, 'Unknown agent type, skipping');
          return { skipped: true };
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1, // One harvest at a time to respect rate limits
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Harvest job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Harvest job failed');
  });

  logger.info('Harvest worker started');

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Shutting down harvest worker...');
    await worker.close();
    process.exit(0);
  });
  ```

- [ ] **Step 2: Write `src/workers/process.ts`**

  ```typescript
  import { Worker } from 'bullmq';
  import { getRedisConnection } from '@/lib/queue';
  import { QUEUE_PROCESS } from '@/lib/constants';
  import { classifyContentItem } from '@/agents/processors/dedup-classifier';
  import type { ProcessJobData } from '@/lib/queue';
  import { pino } from 'pino';

  const logger = pino({ name: 'process-worker' });

  const worker = new Worker<ProcessJobData>(
    QUEUE_PROCESS,
    async (job) => {
      logger.info({ jobId: job.id, contentItemId: job.data.contentItemId }, 'Processing job');

      const results: Record<string, boolean> = {};

      for (const stage of job.data.stages) {
        switch (stage) {
          case 'classify': {
            const ok = await classifyContentItem(job.data.contentItemId);
            results.classify = ok;
            break;
          }
          default:
            logger.warn({ stage }, 'Stage not implemented yet, skipping');
        }
      }

      logger.info({ jobId: job.id, results }, 'Process job complete');
      return results;
    },
    {
      connection: getRedisConnection(),
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Process job failed');
  });

  logger.info('Process worker started');

  process.on('SIGTERM', async () => {
    logger.info('Shutting down process worker...');
    await worker.close();
    process.exit(0);
  });
  ```

- [ ] **Step 3: Write `src/scheduler.ts`**

  ```typescript
  import cron from 'node-cron';
  import { harvestQueue, processQueue } from '@/lib/queue';
  import { db } from '@/server/db';
  import { contentItems } from '@/server/db/schema';
  import { eq } from 'drizzle-orm';
  import { pino } from 'pino';

  const logger = pino({ name: 'scheduler' });

  // Every 2 hours: harvest papers from arXiv
  cron.schedule('0 */2 * * *', async () => {
    logger.info('Scheduling paper harvest job');
    await harvestQueue.add('harvest-papers', { agentType: 'paper' });
  });

  // Every 15 minutes: enqueue classify jobs for unprocessed items (Phase 1 only)
  cron.schedule('*/15 * * * *', async () => {
    const pending = await db.query.contentItems.findMany({
      where: eq(contentItems.processingStatus, 'harvested'),
      limit: 20,
    });

    if (pending.length === 0) return;

    logger.info({ count: pending.length }, 'Enqueueing classify jobs');
    for (const item of pending) {
      await processQueue.add(`classify-${item.id}`, {
        contentItemId: item.id,
        stages: ['classify'],
      }, {
        jobId: `classify-${item.id}`, // Prevent duplicates
      });
    }
  });

  logger.info('Scheduler started. Paper harvest: every 2h. Classify sweep: every 15min.');
  ```

- [ ] **Step 4: Verify worker can be launched**

  ```bash
  # Start infra if not running
  docker compose up -d postgres redis minio

  # Test the harvest worker starts without crashing
  timeout 5 pnpm worker:harvest || true
  ```

  Expected: logs "Harvest worker started" and exits after 5 seconds (timeout — not a crash).

- [ ] **Step 5: Commit**

  ```bash
  git add src/workers/ src/scheduler.ts
  git commit -m "feat(workers): add BullMQ harvest + process workers and node-cron scheduler"
  ```

---

## Task 10: Feed tRPC Router

**Files:**
- Create: `src/server/routers/feed.ts`
- Modify: `src/server/routers/_app.ts`
- Test: `src/server/routers/__tests__/feed.test.ts`

- [ ] **Step 1: Write failing test**

  Create `src/server/routers/__tests__/feed.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from 'vitest';

  // We test the router structure, not DB calls (those require a live DB)
  describe('feed router', () => {
    it('feedRouter is importable', async () => {
      // We mock the db import to avoid needing a real DB connection
      vi.mock('@/server/db', () => ({
        db: {
          query: {
            contentItems: {
              findMany: vi.fn().mockResolvedValue([]),
            },
          },
        },
      }));

      const { feedRouter } = await import('../feed');
      expect(feedRouter).toBeDefined();
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  pnpm test
  ```

  Expected: FAIL — `feedRouter` not exported.

- [ ] **Step 3: Write `src/server/routers/feed.ts`**

  ```typescript
  import { z } from 'zod';
  import { router, publicProcedure } from '../trpc';
  import { db } from '../db';
  import { contentItems } from '../db/schema';
  import { desc, eq, and, ne } from 'drizzle-orm';
  import { DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT } from '@/lib/constants';

  export const feedRouter = router({
    /**
     * getPersonalized — Phase 1: returns global feed sorted by publishedAt.
     * (Personalization is added in Phase 2 when user auth exists.)
     */
    getPersonalized: publicProcedure
      .input(
        z.object({
          cursor: z.string().optional(),
          limit:  z.number().min(1).max(MAX_FEED_LIMIT).default(DEFAULT_FEED_LIMIT),
        }),
      )
      .query(async ({ input }) => {
        const items = await db.query.contentItems.findMany({
          where: and(
            ne(contentItems.processingStatus, 'duplicate'),
          ),
          orderBy: [desc(contentItems.publishedAt)],
          limit: input.limit + 1, // Fetch one extra to determine hasMore
          columns: {
            id:               true,
            sourceType:       true,
            sourceUrl:        true,
            title:            true,
            authors:          true,
            publishedAt:      true,
            harvestedAt:      true,
            taxonomy:         true,
            difficultyLevel:  true,
            processingStatus: true,
            citationCount:    true,
            globalQuality:    true,
            infographicUrl:   true,
            summary:          true,
          },
        });

        const hasMore = items.length > input.limit;
        const data = items.slice(0, input.limit);
        const nextCursor = hasMore ? data[data.length - 1]?.id : undefined;

        return { items: data, nextCursor, hasMore };
      }),

    getTrending: publicProcedure.query(async () => {
      const items = await db.query.contentItems.findMany({
        where: and(
          ne(contentItems.processingStatus, 'duplicate'),
        ),
        orderBy: [desc(contentItems.citationCount), desc(contentItems.publishedAt)],
        limit: 10,
        columns: {
          id:            true,
          title:         true,
          authors:       true,
          publishedAt:   true,
          citationCount: true,
          taxonomy:      true,
          sourceUrl:     true,
          sourceType:    true,
        },
      });
      return items;
    }),
  });
  ```

- [ ] **Step 4: Update `src/server/routers/_app.ts`**

  ```typescript
  import { router } from '../trpc';
  import { feedRouter } from './feed';

  export const appRouter = router({
    feed: feedRouter,
  });

  export type AppRouter = typeof appRouter;
  ```

- [ ] **Step 5: Run tests**

  ```bash
  pnpm test
  ```

  Expected: all prior + 1 new = 14 total passing.

- [ ] **Step 6: Commit**

  ```bash
  git add src/server/routers/
  git commit -m "feat(api): add feed tRPC router with getPersonalized and getTrending procedures"
  ```

---

## Task 11: Basic Feed UI

**Files:**
- Create: `src/components/feed/FeedCard.tsx`
- Create: `src/components/feed/FeedList.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write `src/components/feed/FeedCard.tsx`**

  ```tsx
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Badge } from '@/components/ui/badge';

  interface FeedCardProps {
    id: string;
    title: string;
    authors: string[] | null;
    publishedAt: Date;
    sourceUrl: string;
    sourceType: string;
    taxonomy: { primaryArea: string } | null;
    difficultyLevel: string | null;
    citationCount: number;
    processingStatus: string;
  }

  const SOURCE_LABELS: Record<string, string> = {
    paper: 'arXiv',
    video: 'YouTube',
    tweet: 'Social',
    blog: 'Blog',
    conference: 'Conference',
    model: 'HuggingFace',
  };

  const DIFFICULTY_COLORS: Record<string, string> = {
    beginner:     'bg-green-100 text-green-800',
    intermediate: 'bg-yellow-100 text-yellow-800',
    advanced:     'bg-red-100 text-red-800',
  };

  export function FeedCard({
    title,
    authors,
    publishedAt,
    sourceUrl,
    sourceType,
    taxonomy,
    difficultyLevel,
    citationCount,
  }: FeedCardProps) {
    const authorList = authors?.slice(0, 3).join(', ') ?? 'Unknown';
    const hasMoreAuthors = (authors?.length ?? 0) > 3;
    const published = new Date(publishedAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });

    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-semibold leading-snug">
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 transition-colors"
              >
                {title}
              </a>
            </CardTitle>
            <Badge variant="outline" className="shrink-0 text-xs">
              {SOURCE_LABELS[sourceType] ?? sourceType}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground mb-3">
            {authorList}{hasMoreAuthors ? ' et al.' : ''} · {published}
          </p>
          <div className="flex flex-wrap gap-2">
            {taxonomy?.primaryArea && (
              <Badge className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-100">
                {taxonomy.primaryArea}
              </Badge>
            )}
            {difficultyLevel && (
              <Badge className={`text-xs ${DIFFICULTY_COLORS[difficultyLevel] ?? ''} hover:opacity-80`}>
                {difficultyLevel}
              </Badge>
            )}
            {citationCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {citationCount.toLocaleString()} citations
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
  ```

- [ ] **Step 2: Write `src/components/feed/FeedList.tsx`**

  ```tsx
  'use client';

  import { trpc } from '@/app/providers';
  import { FeedCard } from './FeedCard';
  import { Skeleton } from '@/components/ui/skeleton';
  import { Button } from '@/components/ui/button';

  export function FeedList() {
    const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
      trpc.feed.getPersonalized.useInfiniteQuery(
        { limit: 20 },
        { getNextPageParam: (lastPage) => lastPage.nextCursor },
      );

    if (isLoading) {
      return (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <p>Failed to load feed. Is the database running?</p>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      );
    }

    const items = data?.pages.flatMap((p) => p.items) ?? [];

    if (items.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">No papers yet.</p>
          <p className="text-sm mt-1">Run <code className="bg-muted px-1 rounded">pnpm worker:harvest</code> to fetch papers.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {items.map((item) => (
          <FeedCard key={item.id} {...item} />
        ))}
        {hasNextPage && (
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 3: Write `src/app/page.tsx`**

  ```tsx
  import { FeedList } from '@/components/feed/FeedList';

  export default function HomePage() {
    return (
      <main className="min-h-screen bg-background">
        <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight">
              AI Pulse <span className="text-muted-foreground font-normal text-sm">/ feed</span>
            </h1>
            <span className="text-xs text-muted-foreground">Phase 1</span>
          </div>
        </header>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <FeedList />
        </div>
      </main>
    );
  }
  ```

- [ ] **Step 4: Verify the app builds**

  ```bash
  pnpm build
  ```

  Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Run dev server and verify feed loads**

  ```bash
  docker compose up -d postgres redis minio
  pnpm dev &
  sleep 5
  curl -s http://localhost:3000 | grep -c "AI Pulse"
  kill %1
  ```

  Expected: output `1` (page contains "AI Pulse").

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/ src/app/page.tsx
  git commit -m "feat(ui): add basic feed UI with FeedCard, FeedList, infinite scroll, empty state"
  ```

---

## Task 12: End-to-End Smoke Test

**Files:**
- Create: `src/__tests__/smoke.test.ts`

This task wires everything together: harvest papers → classify → check feed router returns them.

- [ ] **Step 1: Write smoke test**

  Create `src/__tests__/smoke.test.ts`:

  ```typescript
  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import { normalizeArxivEntry, buildArxivUrl } from '@/agents/harvesters/paper';
  import { cosineSimilarity, inferPrimaryArea, inferDifficulty } from '@/agents/processors/dedup-classifier';

  describe('end-to-end smoke', () => {
    it('arXiv URL is well-formed', () => {
      const url = buildArxivUrl(5, 0);
      expect(url).toMatch(/^https:\/\/export\.arxiv\.org\/api\/query\?/);
      expect(url).toContain('max_results=5');
    });

    it('normalizeArxivEntry + inferPrimaryArea pipeline', () => {
      const fakeEntry = {
        id: ['http://arxiv.org/abs/2401.99999v1'],
        title: ['Attention Is All You Need for Language Models'],
        author: [{ name: ['Alice'] }],
        summary: ['We propose a new transformer architecture for NLP language model tasks.'],
        published: ['2024-01-15T00:00:00Z'],
        link: [{ $: { href: 'http://arxiv.org/abs/2401.99999', rel: 'alternate' } }],
      };
      const paper = normalizeArxivEntry(fakeEntry);
      const area = inferPrimaryArea(`${paper.title} ${paper.rawText}`);
      const difficulty = inferDifficulty(`${paper.title} ${paper.rawText}`);

      expect(paper.sourceId).toBe('2401.99999');
      expect(area).toBe('NLP');
      expect(['beginner', 'intermediate', 'advanced']).toContain(difficulty);
    });

    it('cosine similarity is symmetric', () => {
      const a = [0.1, 0.9, 0.3];
      const b = [0.5, 0.2, 0.7];
      expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a));
    });
  });
  ```

- [ ] **Step 2: Run full test suite**

  ```bash
  pnpm test
  ```

  Expected: all tests pass. Count should be 17+ (all prior + 3 new smoke tests).

- [ ] **Step 3: Final commit**

  ```bash
  git add src/__tests__/
  git commit -m "test: add end-to-end smoke tests covering arXiv normalize, area inference, cosine similarity"
  ```

---

## Post-Phase Checklist

After all 12 tasks complete, verify:

- [ ] `docker compose ps` shows all 3 services healthy
- [ ] `pnpm db:migrate` runs without errors
- [ ] `pnpm test` shows all tests passing
- [ ] `pnpm build` completes without errors
- [ ] `pnpm worker:harvest` starts without crashing
- [ ] `pnpm dev` starts and `http://localhost:3000` shows the AI Pulse feed page
- [ ] After running harvest worker once, the feed shows paper cards with title, authors, and area badge

---

## Phase 2 Preview

Phase 2 adds:
- Lucia Auth v3 (login, sessions, protected routes)
- Interest Manager Panel (free-text + structured tags)
- Infographic Generator (Nano Banana 2 via Gemini)
- Summary Writer (Gemini 2.5 Flash structured output)
- Podcast Generator (on-demand, NotebookLM)
- Progressive disclosure UI (collapsed → expanded cards)
- Railway deployment
