# Settings Panel

## Overview

The Settings Panel (`/settings`) gives the user full control over the offline pipeline behavior, especially settings that directly affect cost. Every setting is stored in the `system_settings` table and read by workers at the start of each pipeline cycle.

## Settings Specification

### Pass 1: Infographic

| Setting | Type | Default | Cost Impact |
|---------|------|---------|-------------|
| Enable infographic generation | Toggle | ON | ~$0.07/paper when ON |
| Generate for top N% of papers only | Slider (10-100%) | 100% | Setting to 20% cuts infographic cost by 80% |
| Image model | Dropdown | Nano Banana 2 | Nano Banana Pro is 2x cost but higher quality |

### Pass 2: Summary

| Setting | Type | Default | Cost Impact |
|---------|------|---------|-------------|
| Enable summary generation | Toggle | ON | ~$0.02/paper when ON |
| Summary model | Dropdown | Gemini 2.5 Flash | Gemini 2.5 Pro costs ~3x more but better prose |

### Pass 3: Podcast

| Setting | Type | Default | Cost Impact |
|---------|------|---------|-------------|
| Enable on-demand podcast generation | Toggle | ON | $0 until user requests; ~$0.15/episode |
| Auto-generate for top N papers/week | Number (0-50) | 0 (off) | Setting to 10 = ~$1.50/week extra |
| Podcast engine | Dropdown | NotebookLM API | local-notebooklm = compute-only cost |

### Critic Layer

| Setting | Type | Default | Cost Impact |
|---------|------|---------|-------------|
| Enable critic scoring | Toggle | ON | ~$0.03/paper (2 Gemini calls) |
| Critic model | Dropdown | Gemini 2.5 Flash | Pro gives deeper analysis at ~3x cost |

### Trend Engine

| Setting | Type | Default | Cost Impact |
|---------|------|---------|-------------|
| Trend detection model | Dropdown | Gemini 2.5 Flash | Used for concept extraction |
| Trend narrative model | Dropdown | Gemini 2.5 Pro | Pro recommended for quality writing |

### Harvest Schedules

| Setting | Type | Default | Cost Impact |
|---------|------|---------|-------------|
| Paper harvest frequency | Dropdown | Every 2 hours | Lower frequency = fewer API calls |
| Social harvest frequency | Dropdown | Every 2 hours | Lower frequency = fewer API calls |
| Video/Blog harvest frequency | Dropdown | Every 6 hours | Lower = fewer YouTube quota units |
| Conference scrape frequency | Dropdown | Weekly | Minimal cost impact |

### Recommendation

| Setting | Type | Default | Cost Impact |
|---------|------|---------|-------------|
| Candidate window (days) | Slider (7-90) | 21 days | Larger window = more items to score |
| Critic dimension weights | 8 sliders (sum to 100%) | See defaults in CRITIC-LAYER.md | No cost impact; affects ranking only |

### Data Retention

| Setting | Type | Default | Cost Impact |
|---------|------|---------|-------------|
| Keep content older than (days) | Slider (30-365) | 90 days | More storage, but minimal cost with R2 |

## system_settings Table

```typescript
export const systemSettings = pgTable('system_settings', {
  id:        uuid('id').defaultRandom().primaryKey(),
  key:       text('key').notNull().unique(),
  value:     jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id),
});
```

Settings keys follow dot notation: `pass1.infographic.enabled`, `pass1.infographic.topNPercent`, `pass1.infographic.model`, `pass3.podcast.autoGenerateTopN`, `harvest.paper.frequency`, `critic.dimensionWeights`, etc.

## Cost Estimator Widget

The Settings Panel includes a live cost estimator that calculates estimated monthly cost based on current settings:

- Gemini API cost (broken down by model)
- Storage cost (R2)
- Hosting cost
- Total

Updates in real-time as user toggles settings. Example: "With current settings: ~$85/mo. Disable infographics for bottom 80%: ~$52/mo."

## Worker Integration

Workers read settings at the start of each pipeline cycle:

```typescript
async function getSettings(): Promise<PipelineSettings> {
  const rows = await db.select().from(systemSettings);
  return parseSettings(rows);
}

// In worker:
const settings = await getSettings();
if (!settings.pass1.infographic.enabled) {
  logger.info('Infographic generation disabled, skipping');
  return;
}
```
