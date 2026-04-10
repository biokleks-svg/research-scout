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
