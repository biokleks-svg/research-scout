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
