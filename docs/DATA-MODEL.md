# Data Model

## Overview

Single PostgreSQL 16 database with pgvector extension. Drizzle ORM is the single source of truth. All schema definitions live in `src/server/db/schema.ts`.

## Tables

### content_items

The core table. Every harvested resource becomes a ContentItem.

```typescript
export const contentItems = pgTable('content_items', {
  id:               uuid('id').defaultRandom().primaryKey(),
  sourceType:       text('source_type').notNull(),       // paper|video|tweet|blog|conference|model
  sourceId:         text('source_id').notNull(),
  sourceUrl:        text('source_url').notNull(),
  title:            text('title').notNull(),
  authors:          jsonb('authors').$type<string[]>(),
  publishedAt:      timestamp('published_at').notNull(),
  harvestedAt:      timestamp('harvested_at').defaultNow(),
  rawText:          text('raw_text'),
  contentHash:      text('content_hash').notNull().unique(),

  // Classification (persisted)
  taxonomy:         jsonb('taxonomy').$type<TaxonomyTags>(),
  concepts:         jsonb('concepts').$type<string[]>(),   // extracted by Gemini
  difficultyLevel:  text('difficulty_level'),

  // Three-pass outputs (ALL persisted — never regenerated)
  infographicUrl:   text('infographic_url'),                // R2 URL
  summary:          jsonb('summary').$type<SummarySchema>(),// Full JSON
  podcastUrl:       text('podcast_url'),                    // R2 URL
  podcastDuration:  integer('podcast_duration_sec'),

  // Critic scores (persisted)
  criticScores:     jsonb('critic_scores').$type<CriticScores>(),
  cohortRank:       jsonb('cohort_rank').$type<CohortRank>(),

  // Justification dossier (persisted)
  justification:    jsonb('justification').$type<JustificationDossier>(),

  // Trend linkage
  trendIds:         jsonb('trend_ids').$type<string[]>(),

  // Embeddings (persisted)
  embedding:        vector('embedding', { dimensions: 768 }),

  // Processing state
  processingStatus: text('processing_status').default('harvested'),
  // harvested → classified → processed → scored → complete

  // Metrics
  citationCount:    integer('citation_count').default(0),
  engagementScore:  real('engagement_score').default(0),
  globalQuality:    real('global_quality').default(0),

  createdAt:        timestamp('created_at').defaultNow(),
  updatedAt:        timestamp('updated_at').defaultNow(),
});
```

### trends

```typescript
export const trends = pgTable('trends', {
  id:               uuid('id').defaultRandom().primaryKey(),
  name:             text('name').notNull(),
  slug:             text('slug').notNull().unique(),
  category:         text('category'),                       // NLP, CV, RL, etc.
  description:      text('description'),
  narrative:        text('narrative'),                       // persisted long-form
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
```

### users

```typescript
export const users = pgTable('users', {
  id:               uuid('id').defaultRandom().primaryKey(),
  email:            text('email').notNull().unique(),
  name:             text('name'),
  role:             text('role'),
  freeTextInterests: jsonb('free_text_interests').$type<string[]>(),
  structuredInterests: jsonb('structured_interests').$type<InterestTag[]>(),
  interestEmbedding: vector('interest_embedding', { dimensions: 768 }),
  settings:         jsonb('settings').$type<UserSettings>(),
  createdAt:        timestamp('created_at').defaultNow(),
});
```

### feedback

```typescript
export const feedback = pgTable('feedback', {
  id:               uuid('id').defaultRandom().primaryKey(),
  userId:           uuid('user_id').references(() => users.id),
  contentId:        uuid('content_id').references(() => contentItems.id),
  feedbackType:     text('feedback_type').notNull(),
  value:            real('value'),
  tags:             jsonb('tags').$type<string[]>(),
  createdAt:        timestamp('created_at').defaultNow(),
});
```

### engagements

```typescript
export const engagements = pgTable('engagements', {
  id:               uuid('id').defaultRandom().primaryKey(),
  userId:           uuid('user_id').references(() => users.id),
  contentId:        uuid('content_id').references(() => contentItems.id),
  eventType:        text('event_type').notNull(),
  durationSec:      integer('duration_sec'),
  passLevel:        text('pass_level'),
  createdAt:        timestamp('created_at').defaultNow(),
});
```

### processing_registry

The dedup guard. Tracks every resource the system has ever seen, with per-stage tracking.

```typescript
export const processingRegistry = pgTable('processing_registry', {
  id:           uuid('id').defaultRandom().primaryKey(),
  sourceType:   text('source_type').notNull(),
  sourceId:     text('source_id').notNull(),
  contentHash:  text('content_hash').notNull(),
  contentItemId: uuid('content_item_id').references(() => contentItems.id),
  stages: jsonb('stages').$type<{
    harvested:    { done: boolean, at: string },
    classified:   { done: boolean, at: string },
    infographic:  { done: boolean, at: string, url?: string },
    summary:      { done: boolean, at: string },
    podcast:      { done: boolean, at: string, url?: string },
    criticScored: { done: boolean, at: string },
    justified:    { done: boolean, at: string },
  }>(),
  firstSeenAt:  timestamp('first_seen_at').defaultNow(),
  lastCheckedAt: timestamp('last_checked_at').defaultNow(),
}, (table) => ({
  uniqueSource: unique().on(table.sourceType, table.sourceId),
  hashIndex: index().on(table.contentHash),
}));
```

### system_settings

Stores pipeline configuration from the Settings Panel. Read by workers at the start of each pipeline cycle.

```typescript
export const systemSettings = pgTable('system_settings', {
  id:        uuid('id').defaultRandom().primaryKey(),
  key:       text('key').notNull().unique(),
  value:     jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id),
});
```

## TypeScript Types

### SummarySchema

```typescript
interface SummarySchema {
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
```

### CriticScores

```typescript
interface CriticScores {
  aiNovelty:          { score: number; reasoning: string };
  usefulness:         { score: number; reasoning: string };
  methodologicalRigor:{ score: number; reasoning: string };
  reproducibility:    { score: number; reasoning: string };
  webBuzz:            { score: number; reasoning: string };
  popularity:         { base: number; trendBonus: number; total: number };
  industryRelevance:  { score: number; reasoning: string };
  longevityPotential: { score: number; reasoning: string };
}
```

### CohortRank

```typescript
interface CohortRank {
  clusterId: string;
  weekId: string;
  compositeRank: number;
  totalInCohort: number;
  percentiles: Record<string, number>;  // per dimension
}
```

### JustificationDossier

```typescript
interface JustificationDossier {
  contentId: string;
  generatedAt: string;
  agentAuditTrail: Array<{
    agent: string;
    timestamp: string;
    action: string;
    details: string;
  }>;
  positionExplanation: string;
  comparisonToTopPeers: Array<{
    title: string;
    rank: number;
    scores: Record<string, number>;
  }>;
}
```

### TrendSignals

```typescript
interface TrendSignals {
  paperBurst:      { count: number; zScore: number; window: '7d' };
  citationVelocity:{ meanPerDay: number; zScore: number };
  socialBuzz:      { mentions: number; weightedScore: number; topPlatform: string };
  videoSurge:      { newVideos: number; viewVelocity: number };
  blogCoverage:    { posts: number; labBlogCount: number };
  modelRelease:    { count: number; totalDownloads: number };
  conferenceSignal:{ acceptedPapers: number; workshops: number };
}
```

### InterestTag

```typescript
interface InterestTag {
  id: string;
  label: string;
  category: string;
  weight: number;  // 0-1, user-adjustable
}
```

### UserSettings

```typescript
interface UserSettings {
  // User-specific configuration stored as JSON
}
```

### TaxonomyTags

```typescript
interface TaxonomyTags {
  // Classification tags extracted during content processing
}
```

## Indexes

### Vector Indexes (HNSW)
- `content_items.embedding` — 768-dimensional vector index for semantic search
- `trends.centroid_embedding` — 768-dimensional vector index for trend clustering
- `users.interest_embedding` — 768-dimensional vector index for user preference matching

### B-tree Indexes
- `content_items.processing_status` — Fast filtering by pipeline stage
- `content_items.source_type` — Source type lookups
- `content_items.published_at` — Time-range queries
- `trends.slug` — Unique constraint on trend identifiers
- `users.email` — Unique constraint on user identifiers

### GIN Indexes
- `content_items.taxonomy` — JSONB taxonomy tag searches
- `content_items.concepts` — JSONB concept lookups
- `content_items.trend_ids` — JSONB trend linkage queries

### Composite Indexes
- `processing_registry (source_type, source_id)` — Unique constraint for dedup guard
- `processing_registry.contentHash` — B-tree index for content hash lookups

## Processing Status Flow

Content items flow through the following pipeline stages:

```
harvested → classified → processed → scored → complete
```

Each stage in `processing_registry.stages` tracks completion status and timestamp, enabling resumption on failure and prevention of duplicate processing.
