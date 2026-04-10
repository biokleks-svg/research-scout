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

// ─── Internal helpers ────────────────────────────────────────────────────────

function toISOWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

interface WeeklyRow {
  category: string;
  week_id:   string;
  item_count: number;
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

// ─── Main entrypoint ─────────────────────────────────────────────────────────

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
