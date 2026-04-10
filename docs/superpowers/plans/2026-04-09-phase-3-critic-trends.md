# AI Pulse — Phase 3: Critic Layer + Trend Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 8-dimension Critic Layer (scorer, cohort ranker, justification dossier) and the Trend Detection Engine (z-score detector, Gemini Pro narrator, trend propagator), wire both as BullMQ workers, expose them via tRPC, and add the Trends Dashboard (`/trending`) plus Critic UI on the Paper Detail page.

**Architecture:** All Gemini calls stay in BullMQ workers (`critic.ts`, `intelligence.ts`) — never on page load. The critic worker scores items after `processingStatus = 'processed'`, ranks them within weekly cohorts keyed by taxonomy category, and generates a justification dossier via Gemini Flash. The intelligence worker detects trends by computing z-scores over 13 weeks of category-level paper counts, updates the `trends` table state machine, generates narratives with Gemini Pro, and propagates trend bonuses to item popularity scores. The schema already has all needed columns (`criticScores`, `cohortRank`, `justification`, `trendIds`, the `trends` table) — no migrations required.

**Tech Stack:** Next.js 15 App Router, tRPC v11, Drizzle ORM v0.45, PostgreSQL 16, BullMQ, `@google/generative-ai` v0.24, Recharts, Zod v4, Vitest, Tailwind CSS v4, shadcn/ui

---

## File Map

```
src/
  agents/
    critic/
      scorer.ts                        CREATE — Gemini Flash 6-dim scoring + computed webBuzz/popularity
      rank-synthesizer.ts              CREATE — ISO-week cohort percentile ranking
      justification.ts                 CREATE — Gemini Flash dossier generation
      __tests__/
        scorer.test.ts                 CREATE
        rank-synthesizer.test.ts       CREATE
        justification.test.ts          CREATE
    intelligence/
      trend-detector.ts                CREATE — SQL z-score detection + lifecycle state machine
      trend-narrator.ts                CREATE — Gemini Pro short + long-form narratives
      trend-propagator.ts              CREATE — popularity trendBonus propagation
      __tests__/
        trend-detector.test.ts         CREATE
        trend-narrator.test.ts         CREATE
        trend-propagator.test.ts       CREATE
  workers/
    critic.ts                          MODIFY — replace stub with BullMQ worker
    intelligence.ts                    MODIFY — replace stub with BullMQ worker
    __tests__/
      critic.test.ts                   CREATE
      intelligence.test.ts             CREATE
  server/
    routers/
      trends.ts                        CREATE — list, getBySlug, getCategories
      content.ts                       CREATE — getById (full detail)
      _app.ts                          MODIFY — add trends + content routers
  lib/
    constants.ts                       MODIFY — add TREND_* + CRITIC_DIMENSION_WEIGHTS
  scheduler.ts                         MODIFY — add critic + intelligence cron jobs
  components/
    trends/
      TrendCard.tsx                    CREATE — card with status badge + momentum bar
      CategoryTabs.tsx                 CREATE — client component: category filter tabs
    content/
      CriticRadarChart.tsx             CREATE — Recharts RadarChart for 8 dimensions
      JustificationPanel.tsx           CREATE — collapsible dossier panel
  app/
    trending/
      page.tsx                         CREATE — Trends Dashboard server component
    paper/
      [id]/
        page.tsx                       MODIFY — add CriticRadarChart + JustificationPanel
```

---

## Task 1: Install Recharts + Extend Constants

**Files:**
- Modify: `package.json` (via pnpm add)
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Install Recharts**

  ```bash
  cd /Users/tata/Desktop/fun_projects/research-scout
  pnpm add recharts
  ```

  Expected: `recharts` appears in `package.json` dependencies.

- [ ] **Step 2: Add critic and trend constants to `src/lib/constants.ts`**

  Open `src/lib/constants.ts` and append at the end:

  ```typescript
  // Critic layer
  export const TREND_INHERITANCE_FACTOR = 0.3;

  export const CRITIC_DIMENSION_WEIGHTS = {
    aiNovelty:           0.20,
    usefulness:          0.15,
    methodologicalRigor: 0.10,
    reproducibility:     0.10,
    webBuzz:             0.15,
    popularity:          0.15,
    industryRelevance:   0.10,
    longevityPotential:  0.05,
  } as const;

  // Trend detection
  export const TREND_Z_SCORE_EMERGING = 2.0;
  export const TREND_Z_SCORE_RISING   = 3.5;
  export const TREND_Z_SCORE_FADING   = 1.5;
  export const TREND_FADING_DAYS      = 14;
  export const TREND_LOOKBACK_WEEKS   = 12;
  ```

- [ ] **Step 3: Verify constants test still passes**

  ```bash
  pnpm test src/lib/__tests__/constants.test.ts
  ```

  Expected: all existing tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/constants.ts package.json pnpm-lock.yaml
  git commit -m "feat(phase-3): install recharts, add CRITIC_DIMENSION_WEIGHTS and TREND_* constants"
  ```

---

## Task 2: Critic Scorer Agent (TDD)

**Files:**
- Create: `src/agents/critic/scorer.ts`
- Create: `src/agents/critic/__tests__/scorer.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `src/agents/critic/__tests__/scorer.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from 'vitest';

  vi.mock('@/lib/gemini', () => ({
    getFlashModel: vi.fn(() => ({
      generateContent: vi.fn().mockResolvedValue({
        response: { text: () => '{}' },
      }),
    })),
  }));
  vi.mock('@/server/db', () => ({ db: { select: vi.fn(), update: vi.fn() } }));
  vi.mock('@/server/db/schema', () => ({ contentItems: {} }));
  vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => ({})) }));
  vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

  import {
    buildScorerPrompt,
    parseScorerResponse,
    computeWebBuzzScore,
    computeBasePopularity,
  } from '../scorer';

  describe('buildScorerPrompt', () => {
    it('includes title and text in the prompt', () => {
      const prompt = buildScorerPrompt('Test Paper', 'abstract here');
      expect(prompt).toContain('Test Paper');
      expect(prompt).toContain('abstract here');
    });

    it('asks for JSON output', () => {
      const prompt = buildScorerPrompt('P', 'T');
      expect(prompt.toLowerCase()).toContain('json');
    });

    it('truncates text to 6000 chars', () => {
      const longText = 'x'.repeat(10000);
      const prompt = buildScorerPrompt('P', longText);
      expect(prompt).toContain('x'.repeat(6000));
      expect(prompt).not.toContain('x'.repeat(6001));
    });
  });

  describe('parseScorerResponse', () => {
    const validRaw = JSON.stringify({
      aiNovelty:           { score: 72, reasoning: 'Novel approach.' },
      usefulness:          { score: 65, reasoning: 'Has code.' },
      methodologicalRigor: { score: 80, reasoning: 'Good ablations.' },
      reproducibility:     { score: 90, reasoning: 'Full code release.' },
      industryRelevance:   { score: 55, reasoning: 'Applied focus.' },
      longevityPotential:  { score: 60, reasoning: 'Opens new directions.' },
    });

    it('parses valid JSON into scorer output', () => {
      const result = parseScorerResponse(validRaw);
      expect(result.aiNovelty.score).toBe(72);
      expect(result.reproducibility.reasoning).toBe('Full code release.');
    });

    it('strips markdown code fences', () => {
      const raw = '```json\n' + validRaw + '\n```';
      const result = parseScorerResponse(raw);
      expect(result.aiNovelty.score).toBe(72);
    });

    it('throws when a required field is missing', () => {
      expect(() => parseScorerResponse('{"aiNovelty":{"score":50,"reasoning":"x"}}')).toThrow();
    });

    it('throws when score is out of range', () => {
      const bad = JSON.stringify({
        aiNovelty:           { score: 150, reasoning: 'x' },
        usefulness:          { score: 50, reasoning: 'x' },
        methodologicalRigor: { score: 50, reasoning: 'x' },
        reproducibility:     { score: 50, reasoning: 'x' },
        industryRelevance:   { score: 50, reasoning: 'x' },
        longevityPotential:  { score: 50, reasoning: 'x' },
      });
      expect(() => parseScorerResponse(bad)).toThrow();
    });
  });

  describe('computeWebBuzzScore', () => {
    it('normalizes engagement 0-1 to 0-100', () => {
      expect(computeWebBuzzScore(0.5)).toBe(50);
      expect(computeWebBuzzScore(0)).toBe(0);
      expect(computeWebBuzzScore(1)).toBe(100);
    });

    it('caps at 100', () => {
      expect(computeWebBuzzScore(2)).toBe(100);
    });
  });

  describe('computeBasePopularity', () => {
    it('maps 1000 citations to 100', () => {
      expect(computeBasePopularity(1000)).toBe(100);
    });

    it('maps 500 citations to 50', () => {
      expect(computeBasePopularity(500)).toBe(50);
    });

    it('caps at 100', () => {
      expect(computeBasePopularity(5000)).toBe(100);
    });

    it('returns 0 for 0 citations', () => {
      expect(computeBasePopularity(0)).toBe(0);
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  pnpm test src/agents/critic/__tests__/scorer.test.ts
  ```

  Expected: FAIL — `Cannot find module '../scorer'`.

- [ ] **Step 3: Implement `src/agents/critic/scorer.ts`**

  ```typescript
  import { z } from 'zod';
  import { db } from '@/server/db';
  import { contentItems } from '@/server/db/schema';
  import { eq } from 'drizzle-orm';
  import { getFlashModel } from '@/lib/gemini';
  import type { CriticScores } from '@/types/critic';
  import { pino } from 'pino';

  const logger = pino({ name: 'critic-scorer' });

  const GeminiDimensionSchema = z.object({
    score:     z.number().int().min(0).max(100),
    reasoning: z.string().min(1),
  });

  const GeminiScorerOutputSchema = z.object({
    aiNovelty:           GeminiDimensionSchema,
    usefulness:          GeminiDimensionSchema,
    methodologicalRigor: GeminiDimensionSchema,
    reproducibility:     GeminiDimensionSchema,
    industryRelevance:   GeminiDimensionSchema,
    longevityPotential:  GeminiDimensionSchema,
  });

  export function buildScorerPrompt(title: string, text: string): string {
    return `You are an expert AI research evaluator. Score this paper on 6 dimensions.
  Return ONLY a JSON object — no markdown, no commentary:

  {
    "aiNovelty":           { "score": <0-100>, "reasoning": "<1-2 sentences>" },
    "usefulness":          { "score": <0-100>, "reasoning": "<1-2 sentences>" },
    "methodologicalRigor": { "score": <0-100>, "reasoning": "<1-2 sentences>" },
    "reproducibility":     { "score": <0-100>, "reasoning": "<1-2 sentences>" },
    "industryRelevance":   { "score": <0-100>, "reasoning": "<1-2 sentences>" },
    "longevityPotential":  { "score": <0-100>, "reasoning": "<1-2 sentences>" }
  }

  Scoring rubric:
  - aiNovelty: Is this a genuinely new technique/finding? 80+ = paradigm shift. 30-50 = incremental.
  - usefulness: Can practitioners use this Monday morning? 80+ = code + benchmarks + applications.
  - methodologicalRigor: Ablation studies? Statistical significance? Multiple baselines? Limitations discussed?
  - reproducibility: Code/models/datasets released? 80+ = Docker + hyperparams + pre-trained weights.
  - industryRelevance: Addresses deployment concerns (latency, cost, safety)? From industry lab?
  - longevityPotential: Opens new research directions? Generalizable? Introduces benchmark?

  Title: ${title}

  Text:
  ${text.slice(0, 6000)}`;
  }

  export function parseScorerResponse(raw: string): z.infer<typeof GeminiScorerOutputSchema> {
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(cleaned) as unknown;
    return GeminiScorerOutputSchema.parse(parsed);
  }

  export function computeWebBuzzScore(engagementScore: number): number {
    return Math.min(100, Math.round(engagementScore * 100));
  }

  export function computeBasePopularity(citationCount: number): number {
    return Math.min(100, Math.round((citationCount / 1000) * 100));
  }

  /**
   * Score a content item on all 8 critic dimensions.
   * Idempotent: skips if criticScores already set.
   * Returns true on success, false on failure.
   */
  export async function scoreContentItem(contentItemId: string): Promise<boolean> {
    try {
      const [item] = await db
        .select({
          id:              contentItems.id,
          title:           contentItems.title,
          rawText:         contentItems.rawText,
          criticScores:    contentItems.criticScores,
          citationCount:   contentItems.citationCount,
          engagementScore: contentItems.engagementScore,
        })
        .from(contentItems)
        .where(eq(contentItems.id, contentItemId))
        .limit(1);

      if (!item) {
        logger.warn({ contentItemId }, 'Item not found');
        return false;
      }

      if (item.criticScores) {
        logger.info({ contentItemId }, 'Already scored, skipping');
        return true;
      }

      const text   = item.rawText ?? item.title;
      const model  = getFlashModel();
      const result = await model.generateContent(buildScorerPrompt(item.title, text));
      const geminiScores = parseScorerResponse(result.response.text());

      const basePopularity = computeBasePopularity(item.citationCount ?? 0);
      const webBuzzScore   = computeWebBuzzScore(item.engagementScore ?? 0);

      const criticScores: CriticScores = {
        ...geminiScores,
        webBuzz:    { score: webBuzzScore, reasoning: 'Based on current engagement metrics.' },
        popularity: { base: basePopularity, trendBonus: 0, total: basePopularity },
      };

      await db.update(contentItems)
        .set({ criticScores, processingStatus: 'scored', updatedAt: new Date() })
        .where(eq(contentItems.id, contentItemId));

      logger.info({ contentItemId }, 'Scoring complete');
      return true;
    } catch (err) {
      logger.error({ contentItemId, err }, 'Failed to score content item');
      return false;
    }
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm test src/agents/critic/__tests__/scorer.test.ts
  ```

  Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/agents/critic/scorer.ts src/agents/critic/__tests__/scorer.test.ts
  git commit -m "feat(critic): add 8-dimension scorer agent with Gemini Flash"
  ```

---

## Task 3: Cohort Rank Synthesizer (TDD)

**Files:**
- Create: `src/agents/critic/rank-synthesizer.ts`
- Create: `src/agents/critic/__tests__/rank-synthesizer.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `src/agents/critic/__tests__/rank-synthesizer.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from 'vitest';

  vi.mock('@/server/db', () => ({ db: { select: vi.fn(), update: vi.fn() } }));
  vi.mock('@/server/db/schema', () => ({ contentItems: {} }));
  vi.mock('drizzle-orm', () => ({
    eq: vi.fn(() => ({})),
    and: vi.fn(() => ({})),
    isNotNull: vi.fn(() => ({})),
    sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
  }));
  vi.mock('@/lib/constants', () => ({
    CRITIC_DIMENSION_WEIGHTS: {
      aiNovelty: 0.20, usefulness: 0.15, methodologicalRigor: 0.10,
      reproducibility: 0.10, webBuzz: 0.15, popularity: 0.15,
      industryRelevance: 0.10, longevityPotential: 0.05,
    },
  }));
  vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

  import {
    getWeekId,
    getClusterId,
    computePercentile,
    computeCompositeScore,
  } from '../rank-synthesizer';
  import type { CriticScores } from '@/types/critic';

  const mockScores: CriticScores = {
    aiNovelty:           { score: 80, reasoning: 'r' },
    usefulness:          { score: 70, reasoning: 'r' },
    methodologicalRigor: { score: 60, reasoning: 'r' },
    reproducibility:     { score: 90, reasoning: 'r' },
    webBuzz:             { score: 40, reasoning: 'r' },
    industryRelevance:   { score: 50, reasoning: 'r' },
    longevityPotential:  { score: 55, reasoning: 'r' },
    popularity:          { base: 30, trendBonus: 10, total: 40 },
  };

  describe('getWeekId', () => {
    it('returns ISO week format YYYY-WXX', () => {
      const result = getWeekId(new Date('2026-04-09'));
      expect(result).toMatch(/^\d{4}-W\d{2}$/);
    });

    it('returns the same week for dates in the same ISO week', () => {
      // 2026-04-06 (Mon) and 2026-04-09 (Thu) are in the same ISO week
      const mon = getWeekId(new Date('2026-04-06'));
      const thu = getWeekId(new Date('2026-04-09'));
      expect(mon).toBe(thu);
    });

    it('returns different weeks for dates in adjacent ISO weeks', () => {
      const week14 = getWeekId(new Date('2026-04-02')); // Thu of W14
      const week15 = getWeekId(new Date('2026-04-09')); // Thu of W15
      expect(week14).not.toBe(week15);
    });
  });

  describe('getClusterId', () => {
    it('slugifies the primaryArea', () => {
      expect(getClusterId({ primaryArea: 'Natural Language Processing', subAreas: [], taskTypes: [], applicationDomains: [] }))
        .toBe('natural-language-processing');
    });

    it('strips non-alphanumeric characters', () => {
      expect(getClusterId({ primaryArea: 'CV & Robotics!', subAreas: [], taskTypes: [], applicationDomains: [] }))
        .toBe('cv--robotics');
    });

    it('defaults to "general" when taxonomy is null', () => {
      expect(getClusterId(null)).toBe('general');
    });
  });

  describe('computePercentile', () => {
    it('returns 100 when value equals max in set', () => {
      expect(computePercentile(100, [20, 50, 80, 100])).toBe(100);
    });

    it('returns 25 for the lowest quartile value', () => {
      expect(computePercentile(20, [20, 50, 80, 100])).toBe(25);
    });

    it('returns 50 when no values', () => {
      expect(computePercentile(50, [])).toBe(50);
    });
  });

  describe('computeCompositeScore', () => {
    it('returns a number between 0 and 100', () => {
      const result = computeCompositeScore(mockScores);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    });

    it('uses all 8 dimensions weighted correctly', () => {
      // All dimensions = 100 → composite = 100
      const allMax: CriticScores = {
        aiNovelty:           { score: 100, reasoning: 'r' },
        usefulness:          { score: 100, reasoning: 'r' },
        methodologicalRigor: { score: 100, reasoning: 'r' },
        reproducibility:     { score: 100, reasoning: 'r' },
        webBuzz:             { score: 100, reasoning: 'r' },
        industryRelevance:   { score: 100, reasoning: 'r' },
        longevityPotential:  { score: 100, reasoning: 'r' },
        popularity:          { base: 100, trendBonus: 0, total: 100 },
      };
      expect(computeCompositeScore(allMax)).toBe(100);
    });

    it('returns 0 when all scores are 0', () => {
      const allZero: CriticScores = {
        aiNovelty:           { score: 0, reasoning: 'r' },
        usefulness:          { score: 0, reasoning: 'r' },
        methodologicalRigor: { score: 0, reasoning: 'r' },
        reproducibility:     { score: 0, reasoning: 'r' },
        webBuzz:             { score: 0, reasoning: 'r' },
        industryRelevance:   { score: 0, reasoning: 'r' },
        longevityPotential:  { score: 0, reasoning: 'r' },
        popularity:          { base: 0, trendBonus: 0, total: 0 },
      };
      expect(computeCompositeScore(allZero)).toBe(0);
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  pnpm test src/agents/critic/__tests__/rank-synthesizer.test.ts
  ```

  Expected: FAIL — `Cannot find module '../rank-synthesizer'`.

- [ ] **Step 3: Implement `src/agents/critic/rank-synthesizer.ts`**

  ```typescript
  import { db } from '@/server/db';
  import { contentItems } from '@/server/db/schema';
  import { eq, and, isNotNull, sql } from 'drizzle-orm';
  import { CRITIC_DIMENSION_WEIGHTS } from '@/lib/constants';
  import type { CriticScores, CohortRank } from '@/types/critic';
  import type { TaxonomyTags } from '@/types/content';
  import { pino } from 'pino';

  const logger = pino({ name: 'rank-synthesizer' });

  export function getWeekId(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7; // Monday=1 … Sunday=7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Nearest Thursday
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  export function getClusterId(taxonomy: TaxonomyTags | null): string {
    const primary = taxonomy?.primaryArea ?? 'general';
    return primary.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  export function computePercentile(value: number, allValues: number[]): number {
    if (allValues.length === 0) return 50;
    const belowOrEqual = allValues.filter(v => v <= value).length;
    return Math.round((belowOrEqual / allValues.length) * 100);
  }

  export function computeCompositeScore(scores: CriticScores): number {
    const w = CRITIC_DIMENSION_WEIGHTS;
    return Math.round(
      scores.aiNovelty.score           * w.aiNovelty +
      scores.usefulness.score          * w.usefulness +
      scores.methodologicalRigor.score * w.methodologicalRigor +
      scores.reproducibility.score     * w.reproducibility +
      scores.webBuzz.score             * w.webBuzz +
      scores.popularity.total          * w.popularity +
      scores.industryRelevance.score   * w.industryRelevance +
      scores.longevityPotential.score  * w.longevityPotential,
    );
  }

  /**
   * Compute and persist cohort rank for a content item.
   * Requires criticScores to already be set (run after scoreContentItem).
   * Returns true on success, false on failure.
   */
  export async function synthesizeCohortRank(contentItemId: string): Promise<boolean> {
    try {
      const [item] = await db
        .select({
          id:           contentItems.id,
          publishedAt:  contentItems.publishedAt,
          taxonomy:     contentItems.taxonomy,
          criticScores: contentItems.criticScores,
        })
        .from(contentItems)
        .where(eq(contentItems.id, contentItemId))
        .limit(1);

      if (!item) { logger.warn({ contentItemId }, 'Item not found'); return false; }
      if (!item.criticScores) { logger.warn({ contentItemId }, 'No criticScores yet — run scorer first'); return false; }

      const clusterId = getClusterId(item.taxonomy);
      const weekId    = getWeekId(item.publishedAt);

      // Load all items in the same cluster + week with scores
      const cohort = await db
        .select({
          id:           contentItems.id,
          criticScores: contentItems.criticScores,
        })
        .from(contentItems)
        .where(
          and(
            isNotNull(contentItems.criticScores),
            sql`taxonomy->>'primaryArea' = ${item.taxonomy?.primaryArea ?? ''}`,
            sql`to_char(published_at, 'IYYY-"W"IW') = ${weekId}`,
          ),
        );

      const totalInCohort = cohort.length;
      const cs = item.criticScores;

      const dimValues = {
        aiNovelty:           cohort.map(c => c.criticScores!.aiNovelty.score),
        usefulness:          cohort.map(c => c.criticScores!.usefulness.score),
        methodologicalRigor: cohort.map(c => c.criticScores!.methodologicalRigor.score),
        reproducibility:     cohort.map(c => c.criticScores!.reproducibility.score),
        webBuzz:             cohort.map(c => c.criticScores!.webBuzz.score),
        popularity:          cohort.map(c => c.criticScores!.popularity.total),
        industryRelevance:   cohort.map(c => c.criticScores!.industryRelevance.score),
        longevityPotential:  cohort.map(c => c.criticScores!.longevityPotential.score),
      };

      const compositeValues = cohort.map(c => computeCompositeScore(c.criticScores!));
      const compositeRank   = computePercentile(computeCompositeScore(cs), compositeValues);

      const cohortRank: CohortRank = {
        clusterId,
        weekId,
        compositeRank,
        totalInCohort,
        percentiles: {
          aiNovelty:           computePercentile(cs.aiNovelty.score,           dimValues.aiNovelty),
          usefulness:          computePercentile(cs.usefulness.score,          dimValues.usefulness),
          methodologicalRigor: computePercentile(cs.methodologicalRigor.score, dimValues.methodologicalRigor),
          reproducibility:     computePercentile(cs.reproducibility.score,     dimValues.reproducibility),
          webBuzz:             computePercentile(cs.webBuzz.score,             dimValues.webBuzz),
          popularity:          computePercentile(cs.popularity.total,          dimValues.popularity),
          industryRelevance:   computePercentile(cs.industryRelevance.score,   dimValues.industryRelevance),
          longevityPotential:  computePercentile(cs.longevityPotential.score,  dimValues.longevityPotential),
        },
      };

      const globalQuality = computeCompositeScore(cs);

      await db.update(contentItems)
        .set({ cohortRank, globalQuality, updatedAt: new Date() })
        .where(eq(contentItems.id, contentItemId));

      logger.info({ contentItemId, clusterId, weekId, compositeRank, totalInCohort }, 'Cohort rank saved');
      return true;
    } catch (err) {
      logger.error({ contentItemId, err }, 'Failed to synthesize cohort rank');
      return false;
    }
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm test src/agents/critic/__tests__/rank-synthesizer.test.ts
  ```

  Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/agents/critic/rank-synthesizer.ts src/agents/critic/__tests__/rank-synthesizer.test.ts
  git commit -m "feat(critic): add cohort rank synthesizer with ISO-week clustering"
  ```

---

## Task 4: Justification Composer (TDD)

**Files:**
- Create: `src/agents/critic/justification.ts`
- Create: `src/agents/critic/__tests__/justification.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `src/agents/critic/__tests__/justification.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from 'vitest';

  vi.mock('@/lib/gemini', () => ({
    getFlashModel: vi.fn(() => ({
      generateContent: vi.fn().mockResolvedValue({
        response: { text: () => 'This paper ranks highly due to its novel approach.' },
      }),
    })),
  }));
  vi.mock('@/server/db', () => ({ db: { select: vi.fn(), update: vi.fn() } }));
  vi.mock('@/server/db/schema', () => ({ contentItems: {}, processingRegistry: {} }));
  vi.mock('drizzle-orm', () => ({
    eq: vi.fn(() => ({})),
    and: vi.fn(() => ({})),
    isNotNull: vi.fn(() => ({})),
    desc: vi.fn(() => ({})),
    sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
  }));
  vi.mock('../rank-synthesizer', () => ({
    computeCompositeScore: vi.fn(() => 72),
  }));
  vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

  import { buildAuditTrail, buildJustificationPrompt } from '../justification';
  import type { RegistryStages } from '@/types/content';

  const completeStages: RegistryStages = {
    harvested:    { done: true,  at: '2026-04-01T10:00:00Z' },
    classified:   { done: true,  at: '2026-04-01T10:05:00Z' },
    infographic:  { done: true,  at: '2026-04-01T10:10:00Z' },
    summary:      { done: true,  at: '2026-04-01T10:15:00Z' },
    podcast:      { done: false, at: '' },
    criticScored: { done: true,  at: '2026-04-01T11:00:00Z' },
    justified:    { done: false, at: '' },
  };

  describe('buildAuditTrail', () => {
    it('returns an entry for each completed stage', () => {
      const trail = buildAuditTrail(completeStages);
      expect(trail).toHaveLength(5); // harvested, classified, infographic, summary, criticScored
    });

    it('does not include incomplete stages', () => {
      const trail = buildAuditTrail(completeStages);
      const agents = trail.map(e => e.agent);
      expect(agents).not.toContain('Podcast Generator');
    });

    it('returns empty array for null stages', () => {
      expect(buildAuditTrail(null)).toEqual([]);
    });

    it('includes correct timestamps', () => {
      const trail = buildAuditTrail(completeStages);
      const harvested = trail.find(e => e.agent === 'Paper Harvester');
      expect(harvested?.timestamp).toBe('2026-04-01T10:00:00Z');
    });
  });

  describe('buildJustificationPrompt', () => {
    it('includes the paper title', () => {
      const prompt = buildJustificationPrompt(
        'Attention Is All You Need',
        'nlp',
        '2026-W15',
        85,
        42,
        [{ title: 'BERT', composite: 90 }, { title: 'GPT-4', composite: 88 }],
      );
      expect(prompt).toContain('Attention Is All You Need');
    });

    it('includes cohort context', () => {
      const prompt = buildJustificationPrompt('P', 'nlp', '2026-W15', 85, 42, []);
      expect(prompt).toContain('42');
      expect(prompt).toContain('2026-W15');
    });

    it('includes top peer titles', () => {
      const prompt = buildJustificationPrompt('P', 'nlp', '2026-W15', 85, 10, [
        { title: 'Peer Paper A', composite: 90 },
      ]);
      expect(prompt).toContain('Peer Paper A');
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  pnpm test src/agents/critic/__tests__/justification.test.ts
  ```

  Expected: FAIL — `Cannot find module '../justification'`.

- [ ] **Step 3: Implement `src/agents/critic/justification.ts`**

  ```typescript
  import { db } from '@/server/db';
  import { contentItems, processingRegistry } from '@/server/db/schema';
  import { eq, and, isNotNull, desc, sql } from 'drizzle-orm';
  import { getFlashModel } from '@/lib/gemini';
  import type { JustificationDossier, AuditEntry, PeerComparison } from '@/types/critic';
  import type { RegistryStages } from '@/types/content';
  import { computeCompositeScore } from './rank-synthesizer';
  import { pino } from 'pino';

  const logger = pino({ name: 'justification-composer' });

  export function buildAuditTrail(stages: RegistryStages | null): AuditEntry[] {
    if (!stages) return [];
    const entries: AuditEntry[] = [];

    const add = (stageRecord: RegistryStages[keyof RegistryStages], agent: string, action: string) => {
      if (stageRecord?.done) {
        entries.push({ agent, timestamp: stageRecord.at, action, details: '' });
      }
    };

    add(stages.harvested,    'Paper Harvester',    'Content discovered and harvested');
    add(stages.classified,   'Dedup & Classifier', 'Classified and deduplicated');
    add(stages.infographic,  'Infographic Agent',  'Visual infographic generated');
    add(stages.summary,      'Summary Writer',     'Structured summary generated');
    add(stages.criticScored, 'Critic Layer',       'Scored on 8 dimensions');

    return entries;
  }

  export function buildJustificationPrompt(
    title: string,
    clusterId: string,
    weekId: string,
    compositeRank: number,
    totalInCohort: number,
    topPeers: Array<{ title: string; composite: number }>,
  ): string {
    const peersText = topPeers.length > 0
      ? topPeers.map((p, i) => `${i + 1}. "${p.title}" (composite score: ${p.composite})`).join('\n')
      : 'No peers available yet.';

    return `You are an expert AI research analyst. Explain in 2-3 sentences why this paper is ranked where it is.
  Be specific about its strengths and weaknesses relative to its cohort. Focus on what distinguishes it.
  Return ONLY the explanation text — no JSON, no markdown, no preamble.

  Paper: "${title}"
  Topic cluster: ${clusterId}
  Week: ${weekId}
  Composite rank: top ${100 - compositeRank}% of ${totalInCohort} papers in its cohort

  Top peers in this cohort:
  ${peersText}`;
  }

  /**
   * Generate and persist a justification dossier for a content item.
   * Requires criticScores and cohortRank to already be set.
   * Returns true on success, false on failure.
   */
  export async function generateJustification(contentItemId: string): Promise<boolean> {
    try {
      const [item] = await db
        .select({
          id:            contentItems.id,
          title:         contentItems.title,
          criticScores:  contentItems.criticScores,
          cohortRank:    contentItems.cohortRank,
          justification: contentItems.justification,
          taxonomy:      contentItems.taxonomy,
        })
        .from(contentItems)
        .where(eq(contentItems.id, contentItemId))
        .limit(1);

      if (!item) { logger.warn({ contentItemId }, 'Item not found'); return false; }
      if (item.justification) { logger.info({ contentItemId }, 'Already justified, skipping'); return true; }
      if (!item.criticScores || !item.cohortRank) {
        logger.warn({ contentItemId }, 'Missing criticScores or cohortRank — run scorer and ranker first');
        return false;
      }

      const [registry] = await db
        .select({ stages: processingRegistry.stages })
        .from(processingRegistry)
        .where(eq(processingRegistry.contentItemId, contentItemId))
        .limit(1);

      const { clusterId, weekId, compositeRank, totalInCohort } = item.cohortRank;

      // Top 3 peers in cohort by globalQuality (excludes current item)
      const peerRows = await db
        .select({
          id:           contentItems.id,
          title:        contentItems.title,
          criticScores: contentItems.criticScores,
        })
        .from(contentItems)
        .where(
          and(
            isNotNull(contentItems.criticScores),
            sql`taxonomy->>'primaryArea' = ${item.taxonomy?.primaryArea ?? ''}`,
            sql`to_char(published_at, 'IYYY-"W"IW') = ${weekId}`,
          ),
        )
        .orderBy(desc(contentItems.globalQuality))
        .limit(4);

      const topPeers = peerRows
        .filter(p => p.id !== contentItemId)
        .slice(0, 3)
        .map((p, i) => ({
          title:     p.title,
          rank:      i + 1,
          composite: computeCompositeScore(p.criticScores!),
          scores:    {
            aiNovelty:   p.criticScores!.aiNovelty.score,
            usefulness:  p.criticScores!.usefulness.score,
            popularity:  p.criticScores!.popularity.total,
          } as Record<string, number>,
        }));

      const model = getFlashModel();
      const result = await model.generateContent(
        buildJustificationPrompt(
          item.title, clusterId, weekId, compositeRank, totalInCohort,
          topPeers.map(p => ({ title: p.title, composite: p.composite })),
        ),
      );

      const positionExplanation = result.response.text().trim();

      const comparisonToTopPeers: PeerComparison[] = topPeers.map(p => ({
        title:  p.title,
        rank:   p.rank,
        scores: p.scores,
      }));

      const justification: JustificationDossier = {
        contentId:            contentItemId,
        generatedAt:          new Date().toISOString(),
        agentAuditTrail:      buildAuditTrail(registry?.stages ?? null),
        positionExplanation,
        comparisonToTopPeers,
      };

      await db.update(contentItems)
        .set({ justification, processingStatus: 'complete', updatedAt: new Date() })
        .where(eq(contentItems.id, contentItemId));

      logger.info({ contentItemId }, 'Justification generated');
      return true;
    } catch (err) {
      logger.error({ contentItemId, err }, 'Failed to generate justification');
      return false;
    }
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm test src/agents/critic/__tests__/justification.test.ts
  ```

  Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/agents/critic/justification.ts src/agents/critic/__tests__/justification.test.ts
  git commit -m "feat(critic): add justification dossier composer"
  ```

---

## Task 5: Critic Worker + Scheduler

**Files:**
- Modify: `src/workers/critic.ts`
- Create: `src/workers/__tests__/critic.test.ts`
- Modify: `src/scheduler.ts`

- [ ] **Step 1: Write the failing test**

  Create `src/workers/__tests__/critic.test.ts`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';

  vi.mock('@/agents/critic/scorer',         () => ({ scoreContentItem:    vi.fn().mockResolvedValue(true) }));
  vi.mock('@/agents/critic/rank-synthesizer', () => ({ synthesizeCohortRank: vi.fn().mockResolvedValue(true) }));
  vi.mock('@/agents/critic/justification',  () => ({ generateJustification: vi.fn().mockResolvedValue(true) }));
  vi.mock('@/lib/queue',     () => ({ getRedisConnection: vi.fn(() => ({})) }));
  vi.mock('@/lib/constants', () => ({ QUEUE_CRITIC: 'critic' }));
  vi.mock('bullmq', () => ({ Worker: vi.fn() }));
  vi.mock('pino',   () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

  import { criticStage } from '../critic';

  describe('criticStage', () => {
    it('calls scoreContentItem for stage "score"', async () => {
      const { scoreContentItem } = await import('@/agents/critic/scorer');
      const result = await criticStage('item-1', 'score');
      expect(scoreContentItem).toHaveBeenCalledWith('item-1');
      expect(result).toBe(true);
    });

    it('calls synthesizeCohortRank for stage "rank"', async () => {
      const { synthesizeCohortRank } = await import('@/agents/critic/rank-synthesizer');
      const result = await criticStage('item-1', 'rank');
      expect(synthesizeCohortRank).toHaveBeenCalledWith('item-1');
      expect(result).toBe(true);
    });

    it('calls generateJustification for stage "justify"', async () => {
      const { generateJustification } = await import('@/agents/critic/justification');
      const result = await criticStage('item-1', 'justify');
      expect(generateJustification).toHaveBeenCalledWith('item-1');
      expect(result).toBe(true);
    });

    it('returns false for unknown stage', async () => {
      const result = await criticStage('item-1', 'unknown' as 'score');
      expect(result).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  pnpm test src/workers/__tests__/critic.test.ts
  ```

  Expected: FAIL — `criticStage is not exported` (the stub only logs).

- [ ] **Step 3: Replace the stub in `src/workers/critic.ts`**

  ```typescript
  import { Worker } from 'bullmq';
  import { getRedisConnection } from '@/lib/queue';
  import { QUEUE_CRITIC } from '@/lib/constants';
  import { scoreContentItem }    from '@/agents/critic/scorer';
  import { synthesizeCohortRank } from '@/agents/critic/rank-synthesizer';
  import { generateJustification } from '@/agents/critic/justification';
  import type { CriticJobData } from '@/lib/queue';
  import { pino } from 'pino';

  const logger = pino({ name: 'critic-worker' });

  /** Exported for unit testing */
  export async function criticStage(
    contentItemId: string,
    stage: CriticJobData['stages'][number],
  ): Promise<boolean> {
    switch (stage) {
      case 'score':   return scoreContentItem(contentItemId);
      case 'rank':    return synthesizeCohortRank(contentItemId);
      case 'justify': return generateJustification(contentItemId);
      default:
        logger.warn({ stage }, 'Unknown stage, skipping');
        return false;
    }
  }

  const worker = new Worker<CriticJobData>(
    QUEUE_CRITIC,
    async (job) => {
      logger.info({ jobId: job.id, contentItemId: job.data.contentItemId }, 'Critic job started');
      const results: Record<string, boolean> = {};

      for (const stage of job.data.stages) {
        results[stage] = await criticStage(job.data.contentItemId, stage);
      }

      logger.info({ jobId: job.id, results }, 'Critic job complete');
      return results;
    },
    {
      connection: getRedisConnection(),
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Critic job failed');
  });

  logger.info('Critic worker started');

  process.on('SIGTERM', async () => {
    logger.info('Shutting down critic worker...');
    await worker.close();
    process.exit(0);
  });
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm test src/workers/__tests__/critic.test.ts
  ```

  Expected: all 4 tests pass.

- [ ] **Step 5: Add critic cron to `src/scheduler.ts`**

  Add these imports to the top of `src/scheduler.ts`:

  ```typescript
  import { criticQueue, intelligenceQueue } from '@/lib/queue';
  ```

  Then append these two cron jobs at the bottom (before `logger.info('Scheduler started...')`):

  ```typescript
  // Every 30 minutes: enqueue critic jobs for 'scored' items that haven't been ranked yet
  cron.schedule('*/30 * * * *', async () => {
    const pending = await db.query.contentItems.findMany({
      where: eq(contentItems.processingStatus, 'processed'),
      limit: 20,
    });

    if (pending.length === 0) return;

    logger.info({ count: pending.length }, 'Enqueueing critic jobs');
    for (const item of pending) {
      await criticQueue.add(
        `critic-${item.id}`,
        { contentItemId: item.id, stages: ['score', 'rank', 'justify'] },
        { jobId: `critic-${item.id}` },
      );
    }
  });
  ```

  Update the existing `logger.info` line at the bottom to:

  ```typescript
  logger.info('Scheduler started. Paper harvest: every 2h. Classify sweep: every 15min. Critic sweep: every 30min.');
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/workers/critic.ts src/workers/__tests__/critic.test.ts src/scheduler.ts
  git commit -m "feat(critic): implement critic BullMQ worker and scheduler cron"
  ```

---

## Task 6: Trend Detector (TDD)

**Files:**
- Create: `src/agents/intelligence/trend-detector.ts`
- Create: `src/agents/intelligence/__tests__/trend-detector.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `src/agents/intelligence/__tests__/trend-detector.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from 'vitest';

  vi.mock('@/server/db', () => ({ db: { execute: vi.fn(), update: vi.fn(), insert: vi.fn(), query: { trends: { findFirst: vi.fn() } } } }));
  vi.mock('@/server/db/schema', () => ({ trends: {}, contentItems: {} }));
  vi.mock('drizzle-orm', () => ({
    eq: vi.fn(() => ({})),
    sql: Object.assign(vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })), { raw: vi.fn() }),
  }));
  vi.mock('@/lib/constants', () => ({
    TREND_Z_SCORE_EMERGING: 2.0,
    TREND_Z_SCORE_RISING:   3.5,
    TREND_Z_SCORE_FADING:   1.5,
    TREND_FADING_DAYS:      14,
    TREND_LOOKBACK_WEEKS:   12,
  }));
  vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

  import { computeZScore, nextTrendStatus, categoryToSlug } from '../trend-detector';
  import type { TrendStatus } from '@/types/trends';

  describe('computeZScore', () => {
    it('returns 0 when fewer than 2 historical values', () => {
      expect(computeZScore(10, [5])).toBe(0);
      expect(computeZScore(10, [])).toBe(0);
    });

    it('returns 0 when stddev is 0 (all historical values identical)', () => {
      expect(computeZScore(5, [5, 5, 5, 5])).toBe(0);
    });

    it('returns positive z-score when current > mean', () => {
      // historical mean = 5, stddev = 0: test with variation
      const historical = [3, 4, 5, 6, 7]; // mean=5, stddev≈1.41
      const zScore = computeZScore(10, historical);
      expect(zScore).toBeGreaterThan(3);
    });

    it('returns negative z-score when current < mean', () => {
      const historical = [3, 4, 5, 6, 7]; // mean=5
      const zScore = computeZScore(1, historical);
      expect(zScore).toBeLessThan(0);
    });
  });

  describe('nextTrendStatus', () => {
    it('returns "rising" when z-score >= TREND_Z_SCORE_RISING (3.5)', () => {
      expect(nextTrendStatus(null, 4.0, null)).toBe('rising');
      expect(nextTrendStatus('emerging', 3.5, null)).toBe('rising');
    });

    it('returns "emerging" when z-score >= TREND_Z_SCORE_EMERGING and no prior status', () => {
      expect(nextTrendStatus(null, 2.5, null)).toBe('emerging');
    });

    it('returns "peak" when z-score in emerging range but previously "rising"', () => {
      expect(nextTrendStatus('rising', 2.5, 0)).toBe('peak');
    });

    it('returns "fading" when z-score below TREND_Z_SCORE_FADING and past TREND_FADING_DAYS at peak', () => {
      expect(nextTrendStatus('peak', 1.0, 15)).toBe('fading');
    });

    it('does not fade before TREND_FADING_DAYS have passed', () => {
      expect(nextTrendStatus('peak', 1.0, 5)).toBe('peak');
    });

    it('returns current status unchanged when no transition condition met', () => {
      expect(nextTrendStatus('emerging', 2.2, null)).toBe('emerging');
    });
  });

  describe('categoryToSlug', () => {
    it('lowercases and replaces spaces with hyphens', () => {
      expect(categoryToSlug('Natural Language Processing')).toBe('natural-language-processing');
    });

    it('strips non-alphanumeric characters', () => {
      expect(categoryToSlug('CV & Robotics!')).toBe('cv--robotics');
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  pnpm test src/agents/intelligence/__tests__/trend-detector.test.ts
  ```

  Expected: FAIL — `Cannot find module '../trend-detector'`.

- [ ] **Step 3: Implement `src/agents/intelligence/trend-detector.ts`**

  ```typescript
  import { db } from '@/server/db';
  import { trends } from '@/server/db/schema';
  import { eq, sql } from 'drizzle-orm';
  import {
    TREND_Z_SCORE_EMERGING,
    TREND_Z_SCORE_RISING,
    TREND_Z_SCORE_FADING,
    TREND_FADING_DAYS,
    TREND_LOOKBACK_WEEKS,
  } from '@/lib/constants';
  import type { TrendStatus } from '@/types/trends';
  import { pino } from 'pino';

  const logger = pino({ name: 'trend-detector' });

  // ─── Pure helpers ────────────────────────────────────────────────────────────

  export function computeZScore(currentCount: number, historicalCounts: number[]): number {
    if (historicalCounts.length < 2) return 0;
    const mean = historicalCounts.reduce((a, b) => a + b, 0) / historicalCounts.length;
    const variance = historicalCounts.reduce((s, v) => s + (v - mean) ** 2, 0) / historicalCounts.length;
    const stddev = Math.sqrt(variance);
    if (stddev === 0) return 0;
    return (currentCount - mean) / stddev;
  }

  export function nextTrendStatus(
    current: TrendStatus | null,
    zScore: number,
    daysSincePeak: number | null,
  ): TrendStatus {
    if (zScore >= TREND_Z_SCORE_RISING) return 'rising';
    if (zScore >= TREND_Z_SCORE_EMERGING) {
      if (current === 'rising') return 'peak';
      return current ?? 'emerging';
    }
    if (
      zScore < TREND_Z_SCORE_FADING &&
      (current === 'peak' || current === 'fading') &&
      (daysSincePeak ?? 0) >= TREND_FADING_DAYS
    ) {
      return 'fading';
    }
    return current ?? 'emerging';
  }

  export function categoryToSlug(category: string): string {
    return category.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  function toISOWeekId(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  // ─── Main entrypoint ─────────────────────────────────────────────────────────

  interface WeeklyRow {
    category: string;
    week_id:   string;
    item_count: number;
  }

  export async function detectTrends(): Promise<void> {
    logger.info('Starting trend detection');

    const queryResult = await db.execute(sql`
      SELECT
        taxonomy->>'primaryArea'             AS category,
        to_char(published_at, 'IYYY-"W"IW') AS week_id,
        COUNT(*)::int                        AS item_count
      FROM content_items
      WHERE published_at >= NOW() - INTERVAL '13 weeks'
        AND taxonomy IS NOT NULL
        AND processing_status != 'duplicate'
      GROUP BY category, week_id
      ORDER BY category, week_id
    `);

    const rows = (queryResult as unknown as { rows: WeeklyRow[] }).rows;
    const currentWeekId = toISOWeekId(new Date());

    // Group by category
    const byCategory = new Map<string, Map<string, number>>();
    for (const row of rows) {
      if (!row.category) continue;
      if (!byCategory.has(row.category)) byCategory.set(row.category, new Map());
      byCategory.get(row.category)!.set(row.week_id, Number(row.item_count));
    }

    for (const [category, weekMap] of byCategory) {
      const currentCount = weekMap.get(currentWeekId) ?? 0;
      const historical   = [...weekMap.entries()]
        .filter(([wk]) => wk !== currentWeekId)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-TREND_LOOKBACK_WEEKS)
        .map(([, count]) => count);

      const zScore = computeZScore(currentCount, historical);
      const slug   = categoryToSlug(category);

      if (zScore >= TREND_Z_SCORE_EMERGING) {
        await upsertTrend(category, slug, zScore);
      } else {
        await maybeFadeTrend(slug, zScore);
      }
    }

    logger.info('Trend detection complete');
  }

  async function upsertTrend(category: string, slug: string, zScore: number): Promise<void> {
    const existing = await db.query.trends.findFirst({ where: eq(trends.slug, slug) });
    const daysSincePeak = existing?.peakedAt
      ? Math.floor((Date.now() - existing.peakedAt.getTime()) / 86400000)
      : null;

    const newStatus = nextTrendStatus(
      (existing?.status ?? null) as TrendStatus | null,
      zScore,
      daysSincePeak,
    );
    const momentumScore = Math.min(100, Math.round((zScore / 5) * 100));

    if (existing) {
      await db.update(trends).set({
        status:        newStatus,
        momentumScore,
        zScore,
        peakedAt:      newStatus === 'peak' && existing.status !== 'peak' ? new Date() : existing.peakedAt,
        updatedAt:     new Date(),
      }).where(eq(trends.slug, slug));
      logger.info({ slug, newStatus, zScore }, 'Trend updated');
    } else {
      await db.insert(trends).values({
        name:          category,
        slug,
        category,
        status:        'emerging',
        momentumScore,
        zScore,
        detectedAt:    new Date(),
        updatedAt:     new Date(),
      });
      logger.info({ slug, zScore }, 'New trend detected');
    }
  }

  async function maybeFadeTrend(slug: string, zScore: number): Promise<void> {
    const existing = await db.query.trends.findFirst({ where: eq(trends.slug, slug) });
    if (!existing) return;

    const daysSincePeak = existing.peakedAt
      ? Math.floor((Date.now() - existing.peakedAt.getTime()) / 86400000)
      : 0;

    const newStatus = nextTrendStatus(existing.status as TrendStatus, zScore, daysSincePeak);
    if (newStatus !== existing.status) {
      await db.update(trends)
        .set({ status: newStatus, zScore, updatedAt: new Date() })
        .where(eq(trends.slug, slug));
      logger.info({ slug, newStatus }, 'Trend status updated');
    }
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm test src/agents/intelligence/__tests__/trend-detector.test.ts
  ```

  Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/agents/intelligence/trend-detector.ts src/agents/intelligence/__tests__/trend-detector.test.ts
  git commit -m "feat(intelligence): add trend detector with z-score detection and lifecycle state machine"
  ```

---

## Task 7: Trend Narrator (TDD)

**Files:**
- Create: `src/agents/intelligence/trend-narrator.ts`
- Create: `src/agents/intelligence/__tests__/trend-narrator.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `src/agents/intelligence/__tests__/trend-narrator.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from 'vitest';

  vi.mock('@/lib/gemini', () => ({
    getProModel: vi.fn(() => ({
      generateContent: vi.fn().mockResolvedValue({
        response: { text: () => 'LLM tokenizer research is surging with three major papers this week.' },
      }),
    })),
  }));
  vi.mock('@/server/db', () => ({
    db: {
      query: {
        trends: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
      },
      select: vi.fn(),
      update: vi.fn(),
    },
  }));
  vi.mock('@/server/db/schema', () => ({ trends: {}, contentItems: {} }));
  vi.mock('drizzle-orm', () => ({
    eq: vi.fn(() => ({})),
    ne: vi.fn(() => ({})),
    desc: vi.fn(() => ({})),
    sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
  }));
  vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

  import { buildNarrativePrompt } from '../trend-narrator';
  import type { TrendStatus } from '@/types/trends';

  describe('buildNarrativePrompt', () => {
    it('includes the trend name', () => {
      const prompt = buildNarrativePrompt(
        'LLM Tokenizer Design', 'rising', 72,
        [{ title: 'BPE Alternatives', tldr: 'New tokenizer approach.' }],
      );
      expect(prompt).toContain('LLM Tokenizer Design');
    });

    it('includes the status description', () => {
      const prompt = buildNarrativePrompt('T', 'rising', 50, []);
      expect(prompt.toLowerCase()).toContain('rising');
    });

    it('includes paper titles', () => {
      const prompt = buildNarrativePrompt('T', 'emerging', 30, [
        { title: 'FlashAttention-3', tldr: 'Faster attention.' },
        { title: 'GQA for LLMs',    tldr: 'Grouped query attention.' },
      ]);
      expect(prompt).toContain('FlashAttention-3');
      expect(prompt).toContain('GQA for LLMs');
    });

    it('includes the momentum score', () => {
      const prompt = buildNarrativePrompt('T', 'peak', 88, []);
      expect(prompt).toContain('88');
    });

    it('requests plain text output (no JSON)', () => {
      const prompt = buildNarrativePrompt('T', 'emerging', 50, []);
      expect(prompt.toLowerCase()).not.toContain('json');
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  pnpm test src/agents/intelligence/__tests__/trend-narrator.test.ts
  ```

  Expected: FAIL — `Cannot find module '../trend-narrator'`.

- [ ] **Step 3: Implement `src/agents/intelligence/trend-narrator.ts`**

  ```typescript
  import { db } from '@/server/db';
  import { trends, contentItems } from '@/server/db/schema';
  import { eq, ne, desc, sql } from 'drizzle-orm';
  import { getProModel } from '@/lib/gemini';
  import type { TrendStatus } from '@/types/trends';
  import { pino } from 'pino';

  const logger = pino({ name: 'trend-narrator' });

  const STATUS_DESCRIPTIONS: Record<TrendStatus, string> = {
    emerging: 'newly emerging (just started gaining traction)',
    rising:   'actively rising (gaining significant momentum)',
    peak:     'at its peak (highest current activity)',
    fading:   'starting to fade (passing its peak)',
  };

  export function buildNarrativePrompt(
    trendName: string,
    status: TrendStatus,
    momentumScore: number,
    topPapers: Array<{ title: string; tldr: string }>,
  ): string {
    const papersText = topPapers.length > 0
      ? topPapers.map((p, i) => `${i + 1}. "${p.title}": ${p.tldr}`).join('\n')
      : 'No papers indexed yet.';

    return `You are an AI research trend analyst. Write a 2-sentence narrative about this trend.
  Be informative and specific. Explain what is happening and why it matters to the field.
  Return ONLY the narrative text — no JSON, no markdown, no preamble.

  Trend: "${trendName}"
  Status: ${STATUS_DESCRIPTIONS[status]} (momentum: ${momentumScore}/100)

  Top papers driving this trend:
  ${papersText}`;
  }

  export async function narrateActiveTrends(): Promise<void> {
    logger.info('Generating narratives for active trends');

    const activeTrends = await db.query.trends.findMany({
      where: ne(trends.status, 'fading'),
    });

    for (const trend of activeTrends) {
      try {
        const topPapers = await db
          .select({ title: contentItems.title, summary: contentItems.summary })
          .from(contentItems)
          .where(sql`taxonomy->>'primaryArea' ILIKE ${trend.category ?? trend.name} AND processing_status != 'duplicate'`)
          .orderBy(desc(contentItems.globalQuality))
          .limit(3);

        if (topPapers.length === 0) continue;

        const papers = topPapers.map(p => ({
          title: p.title,
          tldr:  p.summary?.tldr ?? 'Summary not available.',
        }));

        const model  = getProModel();
        const result = await model.generateContent(
          buildNarrativePrompt(trend.name, trend.status as TrendStatus, trend.momentumScore, papers),
        );

        const narrative = result.response.text().trim();

        await db.update(trends)
          .set({ narrative, updatedAt: new Date() })
          .where(eq(trends.id, trend.id));

        logger.info({ trendId: trend.id, name: trend.name }, 'Narrative generated');
      } catch (err) {
        logger.error({ trendId: trend.id, err }, 'Failed to narrate trend');
      }
    }

    logger.info({ count: activeTrends.length }, 'Trend narration complete');
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm test src/agents/intelligence/__tests__/trend-narrator.test.ts
  ```

  Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/agents/intelligence/trend-narrator.ts src/agents/intelligence/__tests__/trend-narrator.test.ts
  git commit -m "feat(intelligence): add trend narrator with Gemini Pro narrative generation"
  ```

---

## Task 8: Trend Propagator (TDD)

**Files:**
- Create: `src/agents/intelligence/trend-propagator.ts`
- Create: `src/agents/intelligence/__tests__/trend-propagator.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `src/agents/intelligence/__tests__/trend-propagator.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from 'vitest';

  vi.mock('@/server/db', () => ({
    db: {
      query: {
        trends: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      select: vi.fn(),
      update: vi.fn(),
    },
  }));
  vi.mock('@/server/db/schema', () => ({ contentItems: {}, trends: {} }));
  vi.mock('drizzle-orm', () => ({
    eq: vi.fn(() => ({})),
    sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
  }));
  vi.mock('@/lib/constants', () => ({ TREND_INHERITANCE_FACTOR: 0.3 }));
  vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

  import { computeTrendBonus } from '../trend-propagator';

  describe('computeTrendBonus', () => {
    it('multiplies momentumScore by TREND_INHERITANCE_FACTOR', () => {
      expect(computeTrendBonus(100)).toBe(30);
      expect(computeTrendBonus(50)).toBe(15);
    });

    it('rounds to integer', () => {
      expect(computeTrendBonus(33)).toBe(10); // 33 * 0.3 = 9.9 → rounds to 10
    });

    it('handles zero', () => {
      expect(computeTrendBonus(0)).toBe(0);
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  pnpm test src/agents/intelligence/__tests__/trend-propagator.test.ts
  ```

  Expected: FAIL — `Cannot find module '../trend-propagator'`.

- [ ] **Step 3: Implement `src/agents/intelligence/trend-propagator.ts`**

  ```typescript
  import { db } from '@/server/db';
  import { contentItems, trends } from '@/server/db/schema';
  import { eq, sql } from 'drizzle-orm';
  import { TREND_INHERITANCE_FACTOR } from '@/lib/constants';
  import { pino } from 'pino';

  const logger = pino({ name: 'trend-propagator' });

  export function computeTrendBonus(momentumScore: number): number {
    return Math.round(momentumScore * TREND_INHERITANCE_FACTOR);
  }

  /**
   * Update popularity.trendBonus for all items in a trend's category published in the last 90 days.
   * Returns the number of items updated.
   */
  export async function propagateTrendToContent(trendId: string): Promise<number> {
    const trend = await db.query.trends.findFirst({ where: eq(trends.id, trendId) });
    if (!trend) return 0;

    const items = await db
      .select({
        id:           contentItems.id,
        criticScores: contentItems.criticScores,
        trendIds:     contentItems.trendIds,
      })
      .from(contentItems)
      .where(
        sql`taxonomy->>'primaryArea' ILIKE ${trend.category ?? trend.name}
            AND critic_scores IS NOT NULL
            AND published_at >= NOW() - INTERVAL '90 days'`,
      );

    if (items.length === 0) return 0;

    const trendBonus = computeTrendBonus(trend.momentumScore);
    let updated = 0;

    for (const item of items) {
      const cs = item.criticScores!;
      const newTotal = Math.min(100, cs.popularity.base + trendBonus);
      const trendIds = (item.trendIds ?? []).includes(trendId)
        ? item.trendIds!
        : [...(item.trendIds ?? []), trendId];

      await db.update(contentItems).set({
        criticScores: { ...cs, popularity: { base: cs.popularity.base, trendBonus, total: newTotal } },
        trendIds,
        updatedAt:    new Date(),
      }).where(eq(contentItems.id, item.id));

      updated++;
    }

    logger.info({ trendId, category: trend.category, updated }, 'Trend propagation complete');
    return updated;
  }

  /** Propagate all active (non-fading) trends. */
  export async function propagateAllActiveTrends(): Promise<void> {
    const activeTrends = await db
      .select({ id: trends.id })
      .from(trends)
      .where(sql`status IN ('emerging', 'rising', 'peak')`);

    for (const trend of activeTrends) {
      try {
        await propagateTrendToContent(trend.id);
      } catch (err) {
        logger.error({ trendId: trend.id, err }, 'Propagation failed for trend');
      }
    }
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm test src/agents/intelligence/__tests__/trend-propagator.test.ts
  ```

  Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/agents/intelligence/trend-propagator.ts src/agents/intelligence/__tests__/trend-propagator.test.ts
  git commit -m "feat(intelligence): add trend propagator for popularity bonus inheritance"
  ```

---

## Task 9: Intelligence Worker + Scheduler

**Files:**
- Modify: `src/workers/intelligence.ts`
- Create: `src/workers/__tests__/intelligence.test.ts`
- Modify: `src/scheduler.ts`

- [ ] **Step 1: Write the failing test**

  Create `src/workers/__tests__/intelligence.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from 'vitest';

  vi.mock('@/agents/intelligence/trend-detector',  () => ({ detectTrends:              vi.fn().mockResolvedValue(undefined) }));
  vi.mock('@/agents/intelligence/trend-narrator',  () => ({ narrateActiveTrends:        vi.fn().mockResolvedValue(undefined) }));
  vi.mock('@/agents/intelligence/trend-propagator',() => ({ propagateAllActiveTrends:   vi.fn().mockResolvedValue(undefined) }));
  vi.mock('@/lib/queue',     () => ({ getRedisConnection: vi.fn(() => ({})) }));
  vi.mock('@/lib/constants', () => ({ QUEUE_INTELLIGENCE: 'intelligence' }));
  vi.mock('bullmq', () => ({ Worker: vi.fn() }));
  vi.mock('pino',   () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

  import { intelligenceJob } from '../intelligence';

  describe('intelligenceJob', () => {
    it('calls detectTrends + propagateAllActiveTrends for "detect-trends"', async () => {
      const { detectTrends }            = await import('@/agents/intelligence/trend-detector');
      const { propagateAllActiveTrends } = await import('@/agents/intelligence/trend-propagator');
      const result = await intelligenceJob('detect-trends');
      expect(detectTrends).toHaveBeenCalled();
      expect(propagateAllActiveTrends).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('calls narrateActiveTrends for "narrate-trends"', async () => {
      const { narrateActiveTrends } = await import('@/agents/intelligence/trend-narrator');
      const result = await intelligenceJob('narrate-trends');
      expect(narrateActiveTrends).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('returns true (stub) for "build-recommendations"', async () => {
      expect(await intelligenceJob('build-recommendations')).toBe(true);
    });

    it('returns true (stub) for "compose-digest"', async () => {
      expect(await intelligenceJob('compose-digest')).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  pnpm test src/workers/__tests__/intelligence.test.ts
  ```

  Expected: FAIL — `intelligenceJob is not exported` (the stub only logs).

- [ ] **Step 3: Replace the stub in `src/workers/intelligence.ts`**

  ```typescript
  import { Worker } from 'bullmq';
  import { getRedisConnection } from '@/lib/queue';
  import { QUEUE_INTELLIGENCE } from '@/lib/constants';
  import { detectTrends }             from '@/agents/intelligence/trend-detector';
  import { narrateActiveTrends }       from '@/agents/intelligence/trend-narrator';
  import { propagateAllActiveTrends }  from '@/agents/intelligence/trend-propagator';
  import type { IntelligenceJobData }  from '@/lib/queue';
  import { pino } from 'pino';

  const logger = pino({ name: 'intelligence-worker' });

  /** Exported for unit testing */
  export async function intelligenceJob(jobType: IntelligenceJobData['jobType']): Promise<boolean> {
    switch (jobType) {
      case 'detect-trends':
        await detectTrends();
        await propagateAllActiveTrends();
        return true;
      case 'narrate-trends':
        await narrateActiveTrends();
        return true;
      case 'build-recommendations':
        logger.info('build-recommendations not yet implemented (Phase 4)');
        return true;
      case 'compose-digest':
        logger.info('compose-digest not yet implemented (Phase 4)');
        return true;
      default:
        logger.warn({ jobType }, 'Unknown job type');
        return false;
    }
  }

  const worker = new Worker<IntelligenceJobData>(
    QUEUE_INTELLIGENCE,
    async (job) => {
      logger.info({ jobId: job.id, jobType: job.data.jobType }, 'Intelligence job started');
      const success = await intelligenceJob(job.data.jobType);
      logger.info({ jobId: job.id, success }, 'Intelligence job complete');
      return { success };
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Intelligence job failed');
  });

  logger.info('Intelligence worker started');

  process.on('SIGTERM', async () => {
    logger.info('Shutting down intelligence worker...');
    await worker.close();
    process.exit(0);
  });
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm test src/workers/__tests__/intelligence.test.ts
  ```

  Expected: all 4 tests pass.

- [ ] **Step 5: Add intelligence cron jobs to `src/scheduler.ts`**

  Add these two cron schedules after the critic cron added in Task 5, before the final `logger.info`:

  ```typescript
  // Daily at 02:00 UTC: detect trends + propagate bonuses
  cron.schedule('0 2 * * *', async () => {
    logger.info('Scheduling trend detection job');
    await intelligenceQueue.add('detect-trends', { jobType: 'detect-trends' });
  });

  // Daily at 03:00 UTC: generate narratives for active trends
  cron.schedule('0 3 * * *', async () => {
    logger.info('Scheduling trend narration job');
    await intelligenceQueue.add('narrate-trends', { jobType: 'narrate-trends' });
  });
  ```

  Update the final `logger.info` line to:

  ```typescript
  logger.info('Scheduler started. Paper harvest: every 2h. Classify: every 15min. Critic: every 30min. Trend detection: daily 02:00 UTC. Narration: daily 03:00 UTC.');
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/workers/intelligence.ts src/workers/__tests__/intelligence.test.ts src/scheduler.ts
  git commit -m "feat(intelligence): implement intelligence BullMQ worker and daily trend cron jobs"
  ```

---

## Task 10: tRPC Routers (trends + content) + update _app.ts

**Files:**
- Create: `src/server/routers/trends.ts`
- Create: `src/server/routers/content.ts`
- Modify: `src/server/routers/_app.ts`

- [ ] **Step 1: Create `src/server/routers/trends.ts`**

  ```typescript
  import { z } from 'zod';
  import { router, publicProcedure } from '../trpc';
  import { db } from '../db';
  import { trends } from '../db/schema';
  import { desc, eq, ne, and, sql } from 'drizzle-orm';

  export const trendsRouter = router({
    /**
     * List trends. Without filters, returns all non-fading trends ordered by momentum.
     */
    list: publicProcedure
      .input(z.object({
        status:   z.enum(['emerging', 'rising', 'peak', 'fading']).optional(),
        category: z.string().optional(),
        limit:    z.number().min(1).max(50).default(20),
      }))
      .query(async ({ input }) => {
        let whereClause;

        if (input.status && input.category) {
          whereClause = and(eq(trends.status, input.status), eq(trends.category, input.category));
        } else if (input.status) {
          whereClause = eq(trends.status, input.status);
        } else if (input.category) {
          whereClause = and(ne(trends.status, 'fading'), eq(trends.category, input.category));
        } else {
          whereClause = ne(trends.status, 'fading');
        }

        return db.query.trends.findMany({
          where: whereClause,
          orderBy: [desc(trends.momentumScore)],
          limit: input.limit,
          columns: {
            id:            true,
            name:          true,
            slug:          true,
            category:      true,
            status:        true,
            momentumScore: true,
            zScore:        true,
            narrative:     true,
            evidenceIds:   true,
            detectedAt:    true,
            peakedAt:      true,
            updatedAt:     true,
          },
        });
      }),

    /** Single trend by slug, including all fields. */
    getBySlug: publicProcedure
      .input(z.object({ slug: z.string().min(1) }))
      .query(async ({ input }) => {
        const trend = await db.query.trends.findFirst({
          where: eq(trends.slug, input.slug),
        });
        return trend ?? null;
      }),

    /** Distinct category values for the category tab filter. */
    getCategories: publicProcedure.query(async () => {
      const result = await db.execute(
        sql`SELECT DISTINCT category FROM trends WHERE category IS NOT NULL ORDER BY category`
      );
      return (result as unknown as { rows: Array<{ category: string }> }).rows.map(r => r.category);
    }),
  });
  ```

- [ ] **Step 2: Create `src/server/routers/content.ts`**

  ```typescript
  import { z } from 'zod';
  import { router, publicProcedure } from '../trpc';
  import { db } from '../db';
  import { contentItems } from '../db/schema';
  import { eq } from 'drizzle-orm';

  export const contentRouter = router({
    /** Full content item including criticScores, cohortRank, and justification. */
    getById: publicProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input }) => {
        const [item] = await db
          .select()
          .from(contentItems)
          .where(eq(contentItems.id, input.id))
          .limit(1);
        return item ?? null;
      }),
  });
  ```

- [ ] **Step 3: Update `src/server/routers/_app.ts`**

  Replace the entire file with:

  ```typescript
  import { router } from '../trpc';
  import { feedRouter }    from './feed';
  import { podcastRouter } from './podcast';
  import { userRouter }    from './user';
  import { trendsRouter }  from './trends';
  import { contentRouter } from './content';

  export const appRouter = router({
    feed:    feedRouter,
    podcast: podcastRouter,
    user:    userRouter,
    trends:  trendsRouter,
    content: contentRouter,
  });

  export type AppRouter = typeof appRouter;
  ```

- [ ] **Step 4: Run full test suite to confirm nothing broke**

  ```bash
  pnpm test
  ```

  Expected: all existing tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/server/routers/trends.ts src/server/routers/content.ts src/server/routers/_app.ts
  git commit -m "feat(api): add trends and content tRPC routers"
  ```

---

## Task 11: Trends Dashboard UI

**Files:**
- Create: `src/components/trends/TrendCard.tsx`
- Create: `src/components/trends/CategoryTabs.tsx`
- Create: `src/app/trending/page.tsx`

- [ ] **Step 1: Create `src/components/trends/TrendCard.tsx`**

  This is a server component — no `'use client'` needed.

  ```tsx
  import type { TrendStatus } from '@/types/trends';

  interface TrendViewModel {
    id:            string;
    name:          string;
    slug:          string;
    category:      string | null;
    status:        TrendStatus;
    momentumScore: number;
    narrative:     string | null;
    detectedAt:    string; // ISO string — safe to pass from server to client
  }

  interface Props {
    trend: TrendViewModel;
  }

  const STATUS_STYLES: Record<TrendStatus, string> = {
    emerging: 'bg-green-100 text-green-800',
    rising:   'bg-blue-100 text-blue-800',
    peak:     'bg-purple-100 text-purple-800',
    fading:   'bg-gray-100 text-gray-600',
  };

  export function TrendCard({ trend }: Props) {
    return (
      <div className="border rounded-lg p-4 space-y-3 hover:shadow-sm transition-shadow">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight">{trend.name}</h3>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLES[trend.status]}`}
          >
            {trend.status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${trend.momentumScore}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-8 text-right">{trend.momentumScore}</span>
        </div>

        {trend.narrative && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {trend.narrative}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Detected {new Date(trend.detectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      </div>
    );
  }

  export type { TrendViewModel };
  ```

- [ ] **Step 2: Create `src/components/trends/CategoryTabs.tsx`**

  This is a client component (needs state for selected tab).

  ```tsx
  'use client';

  import { useState } from 'react';
  import { TrendCard, type TrendViewModel } from './TrendCard';

  const FIXED_CATEGORIES = [
    'All',
    'NLP',
    'Computer Vision',
    'Reinforcement Learning',
    'Safety',
    'Efficiency',
  ];

  interface Props {
    trends:     TrendViewModel[];
    categories: string[]; // from DB, merged with fixed list
  }

  export function CategoryTabs({ trends, categories }: Props) {
    const [selected, setSelected] = useState('All');

    // Merge DB categories with fixed display categories, deduplicated
    const allCats = ['All', ...new Set([...FIXED_CATEGORIES.slice(1), ...categories])];

    const filtered = selected === 'All'
      ? trends
      : trends.filter(t =>
          t.category?.toLowerCase().includes(selected.toLowerCase()) ||
          t.name.toLowerCase().includes(selected.toLowerCase()),
        );

    return (
      <div className="space-y-6">
        {/* Category filter tabs */}
        <div className="flex flex-wrap gap-2">
          {allCats.map(cat => (
            <button
              key={cat}
              onClick={() => setSelected(cat)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                selected === cat
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'hover:bg-muted border-border text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Trend grid */}
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No active trends in this category yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(t => (
              <TrendCard key={t.id} trend={t} />
            ))}
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 3: Create `src/app/trending/page.tsx`**

  ```tsx
  import { db } from '@/server/db';
  import { trends } from '@/server/db/schema';
  import { ne, desc, sql } from 'drizzle-orm';
  import { CategoryTabs } from '@/components/trends/CategoryTabs';
  import type { TrendViewModel } from '@/components/trends/TrendCard';

  export const revalidate = 300; // ISR: revalidate every 5 minutes

  export default async function TrendingPage() {
    const [rows, categoryResult] = await Promise.all([
      db.query.trends.findMany({
        where:    ne(trends.status, 'fading'),
        orderBy:  [desc(trends.momentumScore)],
        limit:    60,
        columns:  {
          id: true, name: true, slug: true, category: true, status: true,
          momentumScore: true, narrative: true, detectedAt: true,
        },
      }),
      db.execute(
        sql`SELECT DISTINCT category FROM trends WHERE category IS NOT NULL ORDER BY category`
      ),
    ]);

    const categories = (categoryResult as unknown as { rows: Array<{ category: string }> })
      .rows.map(r => r.category);

    const trendData: TrendViewModel[] = rows.map(r => ({
      id:            r.id,
      name:          r.name,
      slug:          r.slug,
      category:      r.category,
      status:        r.status as TrendViewModel['status'],
      momentumScore: r.momentumScore,
      narrative:     r.narrative,
      detectedAt:    r.detectedAt?.toISOString() ?? new Date().toISOString(),
    }));

    return (
      <main className="max-w-6xl mx-auto py-10 px-4 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Trending in AI/ML</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Topics gaining momentum across papers, social media, and code releases. Updated daily.
          </p>
        </div>

        {trendData.length === 0 ? (
          <div className="text-center py-20 border rounded-lg bg-muted/20">
            <p className="text-muted-foreground font-medium">No active trends yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Trend detection runs daily at 02:00 UTC. Check back soon.
            </p>
          </div>
        ) : (
          <CategoryTabs trends={trendData} categories={categories} />
        )}
      </main>
    );
  }
  ```

- [ ] **Step 4: Verify the app builds without errors**

  ```bash
  pnpm build 2>&1 | tail -20
  ```

  Expected: build succeeds (no TypeScript errors in the new files).

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/trends/ src/app/trending/
  git commit -m "feat(ui): add Trends Dashboard at /trending with CategoryTabs and TrendCard"
  ```

---

## Task 12: Update Paper Detail Page with Critic UI

**Files:**
- Create: `src/components/content/CriticRadarChart.tsx`
- Create: `src/components/content/JustificationPanel.tsx`
- Modify: `src/app/paper/[id]/page.tsx`

- [ ] **Step 1: Create `src/components/content/CriticRadarChart.tsx`**

  This is a client component — Recharts requires it.

  ```tsx
  'use client';

  import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    ResponsiveContainer,
    Tooltip,
  } from 'recharts';
  import type { CriticScores } from '@/types/critic';

  interface Props {
    scores: CriticScores;
  }

  export function CriticRadarChart({ scores }: Props) {
    const data = [
      { dimension: 'Novelty',         value: scores.aiNovelty.score },
      { dimension: 'Usefulness',      value: scores.usefulness.score },
      { dimension: 'Rigor',           value: scores.methodologicalRigor.score },
      { dimension: 'Reproducibility', value: scores.reproducibility.score },
      { dimension: 'Buzz',            value: scores.webBuzz.score },
      { dimension: 'Popularity',      value: scores.popularity.total },
      { dimension: 'Industry',        value: scores.industryRelevance.score },
      { dimension: 'Longevity',       value: scores.longevityPotential.score },
    ];

    return (
      <div className="w-full">
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
            <PolarGrid />
            <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
            <Radar
              name="Score"
              dataKey="value"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.25}
            />
            <Tooltip formatter={(value: number) => [`${value}/100`, 'Score']} />
          </RadarChart>
        </ResponsiveContainer>

        {/* Score list below chart */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 mt-4 text-sm">
          {data.map(({ dimension, value }) => (
            <div key={dimension} className="flex justify-between">
              <dt className="text-muted-foreground">{dimension}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  ```

- [ ] **Step 2: Create `src/components/content/JustificationPanel.tsx`**

  ```tsx
  'use client';

  import { useState } from 'react';
  import type { JustificationDossier } from '@/types/critic';

  interface Props {
    justification: JustificationDossier;
  }

  export function JustificationPanel({ justification }: Props) {
    const [open, setOpen] = useState(false);

    return (
      <div className="border rounded-lg overflow-hidden">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex justify-between items-center px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors text-left"
        >
          <span>Why is this here?</span>
          <span className="text-muted-foreground">{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div className="px-4 pb-4 space-y-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {justification.positionExplanation}
            </p>

            {justification.comparisonToTopPeers.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide mb-2 text-muted-foreground">
                  Top Peers in Cohort
                </h4>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 text-muted-foreground font-medium">Rank</th>
                      <th className="text-left py-1 text-muted-foreground font-medium">Paper</th>
                    </tr>
                  </thead>
                  <tbody>
                    {justification.comparisonToTopPeers.map(peer => (
                      <tr key={peer.rank} className="border-b last:border-0">
                        <td className="py-1.5 pr-3 text-muted-foreground">#{peer.rank}</td>
                        <td className="py-1.5 text-muted-foreground">{peer.title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {justification.agentAuditTrail.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide mb-2 text-muted-foreground">
                  Agent Audit Trail
                </h4>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  {justification.agentAuditTrail.map((entry, i) => (
                    <li key={i} className="flex gap-2 items-baseline">
                      <span className="font-medium shrink-0">{entry.agent}:</span>
                      <span>{entry.action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 3: Modify `src/app/paper/[id]/page.tsx`**

  Add these two imports after the existing imports (after the `PodcastButton` import line):

  ```typescript
  import { CriticRadarChart } from '@/components/content/CriticRadarChart';
  import { JustificationPanel } from '@/components/content/JustificationPanel';
  ```

  Then, inside the returned JSX, after the `{!item.summary && !item.rawText && ...}` block and before the closing `</main>`, add:

  ```tsx
        {item.criticScores && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Critic Scores</h2>
            <CriticRadarChart scores={item.criticScores} />
          </div>
        )}

        {item.justification && (
          <JustificationPanel justification={item.justification} />
        )}
  ```

- [ ] **Step 4: Verify the app builds without errors**

  ```bash
  pnpm build 2>&1 | tail -20
  ```

  Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Run full test suite**

  ```bash
  pnpm test
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/content/CriticRadarChart.tsx src/components/content/JustificationPanel.tsx src/app/paper/\[id\]/page.tsx
  git commit -m "feat(ui): add CriticRadarChart and JustificationPanel to paper detail page"
  ```

---

## Spec Coverage Check

| Phase 3 requirement | Task |
|---------------------|------|
| Multi-Dimensional Scorer (all 8 dimensions) | Task 2 |
| Cohort Rank Synthesizer + materialized views | Task 3 (in-DB percentile computation) |
| Justification Composer (Paper Dossier) | Task 4 |
| Trend Detector Agent | Task 6 |
| Trend Narrative agents | Task 7 |
| Trend-inherited popularity propagation | Task 8 |
| Trends Dashboard with per-category views | Task 11 |
| Workers wired + scheduled | Tasks 5, 9 |
| tRPC API surface for UI | Task 10 |
| Paper detail page critic UI | Task 12 |
