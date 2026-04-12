# Design Spec — Predictive Trend Model (Phase 6)

**Date:** 2026-04-12
**Status:** Approved
**Branch target:** `feat/phase-6-predictive-trend-model`

---

## Goal

Add a Predictive Trend Model that forecasts 6-month growth for each taxonomy area using multi-signal historical data (embedding cluster growth, citation velocity, engagement trends, harvest volume) and Gemini 2.5 Pro inference. Forecasts are stored per taxonomy area, surfaced on a dedicated `/forecast` page, and prepended as a "Rising Topics" section in the digest.

---

## Architecture

```
Admin clicks "Run Forecast"
    │
    ▼
forecast.run (tRPC admin mutation)
    │  enqueues BullMQ job 'run-area-forecasts'
    ▼
intelligence worker          ← src/workers/intelligence.ts (existing, add new case)
    │
    ▼
runAreaForecasts()           ← src/agents/intelligence/area-forecaster.ts
    │
    ├── aggregateSignals()   ← queries content_items last 56 days (8 weeks)
    │       groups by (taxonomyArea, week)
    │       { clusterGrowthRate, citationVelocity, engagementTrend, harvestVolume }
    │
    ├── Gemini 2.5 Pro call  ← one call per area, sequential with p-retry
    │       structured output: { growthPercent, confidence, narrative }
    │       Zod-validated before persist
    │
    └── persist to area_forecasts (one row per area, this forecast run)
    │
    ▼
/forecast page               ← server-rendered, reads latest area_forecasts
    (linked from /trending)

digest-composer.ts           ← reads latest area_forecasts, prepends "Rising Topics"
```

The pattern mirrors `trend-detector.ts` + `trend-narrator.ts`. The agent is pure data-in/data-out; the tRPC router is the trigger; the page is a thin read layer. No LLM calls on page load.

---

## Data Model

### New table: `area_forecasts`

```sql
CREATE TABLE area_forecasts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taxonomy_area TEXT NOT NULL,
  forecast_date TIMESTAMP NOT NULL,
  signals       JSONB NOT NULL,
  prediction    JSONB NOT NULL,
  narrative     TEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT now()
);
```

**`signals` JSONB shape:**
```typescript
interface AreaForecastSignals {
  clusterGrowthRate: number[];  // COUNT(*) per week, 8 weeks oldest→newest
  citationVelocity:  number[];  // AVG(citationCount) per week, 8 weeks
  engagementTrend:   number[];  // AVG(engagementScore) per week, 8 weeks
  harvestVolume:     number[];  // COUNT(*) per week, 8 weeks (total items)
}
```

**`prediction` JSONB shape:**
```typescript
interface AreaForecastPrediction {
  growthPercent: number;                    // can be negative (predicted decline)
  confidence:    'low' | 'medium' | 'high';
  horizon:       '6mo';
}
```

TypeScript types added to `src/types/trends.ts`. Drizzle migration: `drizzle/migrations/0004_area_forecasts.sql`. No changes to existing tables.

---

## Signal Aggregation

`aggregateSignals()` queries `content_items` for the last 56 days, grouped by `(taxonomy->>'primaryArea', week)`:

| Signal | Query |
|--------|-------|
| `clusterGrowthRate` | `COUNT(*)` per week for items where `taxonomy->>'primaryArea' = area` |
| `citationVelocity` | `AVG(citationCount)` per week |
| `engagementTrend` | `AVG(engagementScore)` per week |
| `harvestVolume` | `COUNT(*)` per week (all items in area) |

Each signal is an 8-element `number[]` (oldest → newest). Areas with fewer than 4 weeks of non-zero data are skipped (insufficient signal). Missing weeks are filled with `0`.

---

## Gemini Call

One Gemini 2.5 Pro call per taxonomy area. Sequential processing with `p-retry` (2 retries, exponential backoff).

**Prompt template:**
```
You are analyzing research trend data for the taxonomy area "{area}".

Historical data (8 weeks, oldest first):
- Weekly paper/content counts: {clusterGrowthRate}
- Weekly average citation counts: {citationVelocity}
- Weekly average engagement scores: {engagementTrend}
- Weekly total harvest volume: {harvestVolume}

Based on this data, predict the 6-month growth trajectory for this area.

Return a JSON object with exactly these fields:
{
  "growthPercent": <number, positive=growth, negative=decline>,
  "confidence": <"low" | "medium" | "high">,
  "narrative": <string, 2-3 sentences explaining why this area is trending or declining>
}
```

**Zod validation schema:**
```typescript
const ForecastResponseSchema = z.object({
  growthPercent: z.number(),
  confidence:    z.enum(['low', 'medium', 'high']),
  narrative:     z.string().min(10).max(500),
});
```

If Gemini returns invalid JSON or fails validation after retries, the area is skipped with a `logger.warn`.

---

## tRPC Router

**File:** `src/server/routers/forecast.ts`

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `forecast.run` | mutation | admin | Enqueues `run-area-forecasts` job on intelligence queue, returns `{ queued: true }` |
| `forecast.getLatest` | query | public | Returns all `area_forecasts` rows from most recent `forecastDate`, ordered by `growthPercent DESC` |

`forecast.run` enqueues a BullMQ job rather than calling `runAreaForecasts()` directly — with 10-20 taxonomy areas × ~2s Gemini latency each, a direct call would time out the tRPC request. The intelligence worker picks up the job and calls `runAreaForecasts()` asynchronously. The admin UI shows "Forecast queued" and the `/forecast` page reflects results once the job completes.

`forecast.run` is protected by an admin role check (same pattern as existing admin router).

---

## UI

### `/forecast` page (`src/app/forecast/page.tsx`)

- Server-rendered (no LLM on page load — reads pre-computed DB rows)
- Calls `forecast.getLatest` at render time
- Grid of `ForecastCard` components
- Empty state: "No forecasts yet. Run one from the Admin Dashboard."
- Link back to `/trending`

### `ForecastCard` component (`src/components/forecast/ForecastCard.tsx`)

Each card shows:
- Taxonomy area name (heading)
- Growth % — large number, green if positive, red if negative
- Confidence badge: `low` / `medium` / `high` (shadcn Badge)
- Gemini narrative paragraph
- Forecast date (small, muted)

### Admin Dashboard (`/admin`)

Add a "Run Forecast" button that calls `forecast.run` mutation. Shows a loading spinner during execution, then a toast: "Forecast complete — N areas predicted."

### Trends Dashboard (`/trending`)

Add a small "View 6-month forecast →" link near the page heading, pointing to `/forecast`.

---

## Digest Integration

`composeDigest()` in `src/agents/intelligence/digest-composer.ts` is updated to:

1. Query latest `area_forecasts` (top 3 by `growthPercent`)
2. Prepend a "**Rising Topics (6-month forecast)**" section to the markdown digest:

```markdown
## Rising Topics (6-month forecast)

**Computer Vision** — +67% predicted growth (high confidence)
Vision-language models are accelerating rapidly, driven by...

**Reinforcement Learning** — +41% predicted growth (medium confidence)
...

**Graph Neural Networks** — +28% predicted growth (low confidence)
...
```

If no forecasts exist yet, the section is omitted (graceful degradation).

---

## Testing Strategy

TDD on pure functions only. No Gemini in unit tests.

| Test | Function |
|------|----------|
| signal aggregation shape | `aggregateSignals()` — mock DB, assert 8-element arrays per signal |
| area skipping | fewer than 4 non-zero weeks → area excluded from result |
| Zod schema validation | valid response passes, missing fields throw |
| digest rising topics section | `composeDigest()` with mocked forecasts includes "Rising Topics" section |
| digest omits section when empty | `composeDigest()` with empty forecasts omits section |

`runAreaForecasts()` is a coordinator — not unit-tested. `forecast.getLatest` tRPC procedure covered by existing router test pattern.

---

## Files

**New:**
- `src/agents/intelligence/area-forecaster.ts`
- `src/agents/intelligence/__tests__/area-forecaster.test.ts`
- `src/server/routers/forecast.ts`
- `src/app/forecast/page.tsx`
- `src/components/forecast/ForecastCard.tsx`
- `drizzle/migrations/0004_area_forecasts.sql`

**Modified:**
- `src/server/db/schema.ts` — add `areaForecasts` table definition
- `src/types/trends.ts` — add `AreaForecastSignals`, `AreaForecastPrediction`, `AreaForecast` types
- `src/server/routers/_app.ts` — register `forecastRouter`
- `src/workers/intelligence.ts` — add `'run-area-forecasts'` case calling `runAreaForecasts()`
- `src/workers/__tests__/intelligence.test.ts` — add mock + test for the new case
- `src/app/admin/page.tsx` — add "Run Forecast" button
- `src/agents/intelligence/digest-composer.ts` — add "Rising Topics" section
- `src/app/trending/page.tsx` — add link to `/forecast`

---

## Deferred

- **Scheduled forecasts** — on-demand only for now; daily/weekly cron is a future optimization
- **Forecast accuracy tracking** — comparing past predictions to actual outcomes (requires storing historical forecasts; current design overwrites per run per area)
- **Sub-area forecasting** — forecasting `subAreas` in addition to `primaryArea`
- **Conference calendar weighting** — factoring in known conference deadlines as external signal
