# API Design (tRPC)

## Overview

All API communication uses tRPC v11 with full-stack type inference. The display layer is a thin read layer — it reads pre-computed data from PostgreSQL and Redis. The only write operation that triggers an async job is the "Generate Podcast" button.

## Router Structure

```
src/server/routers/
  _app.ts          # Root router (merges all sub-routers)
  feed.ts          # Personalized feed, trending, digest
  content.ts       # Content detail, search, critic data
  feedback.ts      # User feedback submission
  trends.ts        # Trend listing, detail, timeline
  user.ts          # Profile, interests, data export
  admin.ts         # Agent status, manual triggers
  settings.ts      # Pipeline settings CRUD
  podcast.ts       # On-demand podcast generation
```

## Root Router

```typescript
export const appRouter = router({
  feed: feedRouter,
  content: contentRouter,
  feedback: feedbackRouter,
  trends: trendsRouter,
  user: userRouter,
  admin: adminRouter,
  settings: settingsRouter,
  podcast: podcastRouter,
});
```

## Feed Router (`feed.ts`)

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `getPersonalized` | query | `{ cursor?: string, limit: number (default 20) }` | Paginated ContentItem list with summaries and infographic URLs | Main feed. Reads from Redis cache (pre-computed by Rec Engine). Falls back to global popularity if no user profile. |
| `getTrending` | query | none | Top trending ContentItems | Items with highest current trend momentum. Read from materialized view. |
| `getDigest` | query | `{ period: 'daily' \| 'weekly' }` | Digest HTML + metadata | Pre-rendered digest from Digest Composer agent. |

## Content Router (`content.ts`)

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `getById` | query | `{ id: uuid }` | Full ContentItem with all fields | Content detail page data. Includes summary JSON, infographic URL, podcast URL. |
| `search` | query | `{ query: string, filters?: ContentFilters }` | Paginated results | Full-text search + filter by source type, taxonomy, difficulty, date range, critic score range. |
| `getSimilar` | query | `{ id: uuid }` | ContentItem[] | pgvector ANN search using item's embedding. Top 10 similar items. |
| `getJustification` | query | `{ id: uuid }` | JustificationDossier | Full audit trail + position explanation. |
| `getCriticScores` | query | `{ id: uuid }` | CriticScores | 8-dimension scores with reasoning strings. |
| `getCohortComparison` | query | `{ id: uuid }` | CohortRank + peer list | Item's position within weekly cohort + top peers with their scores. |

## Feedback Router (`feedback.ts`)

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `submit` | mutation | `{ contentId: uuid, feedbackType: string, value?: number, tags?: string[] }` | Feedback record | Writes feedback to DB. Used in next offline cycle for rec engine tuning. |
| `getForContent` | query | `{ contentId: uuid }` | Feedback[] | All feedback for a content item (admin use). |

## Trends Router (`trends.ts`)

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `list` | query | `{ status?: 'emerging' \| 'rising' \| 'peak' \| 'fading', category?: string }` | Trend[] | Filtered trend list. Supports per-category filtering (NLP, CV, RL, etc.). |
| `getById` | query | `{ id: uuid }` | Full Trend with narrative and signals | Trend detail with narrative blurb and signal breakdown. |
| `getTimeline` | query | `{ id: uuid }` | TimelinePoint[] | Historical momentum scores for Recharts visualization. |
| `getByCategory` | query | `{ category: string }` | Trend[] | All trends in a specific AI sub-field. |

## User Router (`user.ts`)

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `getProfile` | query | none | User profile | Current user profile with settings. |
| `updateProfile` | mutation | ProfileUpdateSchema | Updated user | Name, email, preferences. |
| `getInterests` | query | none | Interest data | Free-text interests + structured tags + embedding visualization data. |
| `updateInterests` | mutation | InterestUpdateSchema | Updated interests | Bulk update structured interest tags with weights. Triggers interest embedding recomputation. |
| `addFreeTextInterest` | mutation | `{ text: string }` | Updated interests | Add a free-text interest. Gemini extracts structured tags in next offline cycle. |
| `importSeeds` | mutation | `{ paperUrls: string[] }` | Import result | Import seed papers to bootstrap interest profile. |
| `exportData` | query | none | Full user data export | GDPR-compliant data export. |
| `deleteAccount` | mutation | none | Confirmation | Soft delete with 30-day grace period. |

## Admin Router (`admin.ts`)

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `getAgentStatus` | query | none | Agent health status | BullMQ queue depths, last run times, error counts. |
| `getSystemMetrics` | query | none | System metrics | Total content items, processing backlog, API usage, storage. |
| `triggerHarvest` | mutation | `{ agentType: string }` | Job ID | Manually trigger a specific harvest agent. |
| `triggerFullPipeline` | mutation | none | Job ID | Run full offline pipeline cycle. |

## Settings Router (`settings.ts`)

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `getAll` | query | none | All system settings | Current pipeline configuration. |
| `update` | mutation | `{ key: string, value: JsonValue }` | Updated setting | Update a single pipeline setting. Admin-only. |
| `getCostEstimate` | query | none | Cost breakdown | Estimated monthly cost based on current settings. |

## Podcast Router (`podcast.ts`)

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `requestGeneration` | mutation | `{ contentId: uuid }` | Job status | Enqueues BullMQ job for Podcast Generator agent. Returns queued status. |
| `getStatus` | query | `{ contentId: uuid }` | Podcast status | `not_requested \| queued \| generating \| available` |

## Authentication

All routes except `feed.getTrending` and `content.search` require authentication via Lucia Auth v3. Admin routes require `role: 'admin'`. Auth context is injected via tRPC middleware.

## Error Handling

Standard tRPC error codes: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST, INTERNAL_SERVER_ERROR. All errors include a human-readable message. Rate limiting via Redis (per-user, per-endpoint).
