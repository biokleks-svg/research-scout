import { db } from '@/server/db';
import { sql } from 'drizzle-orm';
import type { AreaForecastSignals, AreaForecastPrediction } from '@/types/trends';
import { pino } from 'pino';
import { z } from 'zod';
import { areaForecasts } from '@/server/db/schema';
import { getProModel } from '@/lib/gemini';
import pRetry from 'p-retry';

const logger = pino({ name: 'area-forecaster' });

// ─── Signal aggregation ──────────────────────────────────────────────────────

/** Returns distinct taxonomy primaryArea values seen in the last 56 days. */
export async function getDistinctAreas(): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT taxonomy->>'primaryArea' AS primary_area
    FROM content_items
    WHERE
      published_at > NOW() - INTERVAL '56 days'
      AND taxonomy->>'primaryArea' IS NOT NULL
    ORDER BY primary_area
  `);
  return (result as unknown as { rows: Array<{ primary_area: string }> })
    .rows.map(r => r.primary_area);
}

/** Returns the Monday of the ISO week containing the given date (UTC). */
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // adjust to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Aggregates 4 signals for a taxonomy area over the last 8 weeks.
 * Returns null if fewer than 4 weeks have non-zero counts (insufficient signal).
 * Missing weeks are filled with 0.
 */
export async function aggregateSignals(area: string): Promise<AreaForecastSignals | null> {
  const result = await db.execute(sql`
    SELECT
      week,
      count,
      avg_citations,
      avg_engagement,
      (
        SELECT COUNT(*)::int
        FROM content_items ci2
        WHERE
          DATE_TRUNC('week', ci2.published_at) = week
          AND ci2.published_at > NOW() - INTERVAL '56 days'
      ) AS harvest_volume
    FROM (
      SELECT
        DATE_TRUNC('week', published_at)   AS week,
        COUNT(*)::int                       AS count,
        AVG(citation_count)::float          AS avg_citations,
        AVG(engagement_score)::float        AS avg_engagement
      FROM content_items
      WHERE
        published_at > NOW() - INTERVAL '56 days'
        AND taxonomy->>'primaryArea' = ${area}
      GROUP BY week
      ORDER BY week ASC
    ) sub
  `);

  type WeekRow = {
    week:           string;
    count:          string;
    avg_citations:  string;
    avg_engagement: string;
    harvest_volume: string;
  };
  const rows = (result as unknown as { rows: WeekRow[] }).rows;

  // Build a map from week-start ISO date string → row
  const rowMap = new Map<string, WeekRow>();
  for (const row of rows) {
    const key = new Date(row.week).toISOString().slice(0, 10);
    rowMap.set(key, row);
  }

  // Generate the 8 expected week-start dates (Monday-aligned, oldest first).
  // DATE_TRUNC('week') in PostgreSQL returns the Monday of each ISO week;
  // we snap to the same Monday so JS keys match DB keys on every day of the week.
  const now = new Date();
  const thisMonday = getMondayOfWeek(now);
  const weekKeys: string[] = [];
  for (let i = 7; i >= 0; i--) {
    const monday = new Date(thisMonday);
    monday.setUTCDate(monday.getUTCDate() - i * 7);
    weekKeys.push(monday.toISOString().slice(0, 10));
  }

  const clusterGrowthRate: number[] = [];
  const citationVelocity:  number[] = [];
  const engagementTrend:   number[] = [];
  const harvestVolume:     number[] = [];

  for (const key of weekKeys) {
    const row = rowMap.get(key);
    clusterGrowthRate.push(row ? parseInt(row.count, 10)        : 0);
    citationVelocity.push(row  ? parseFloat(row.avg_citations)  : 0);
    engagementTrend.push(row   ? parseFloat(row.avg_engagement) : 0);
    harvestVolume.push(row     ? parseInt(row.harvest_volume, 10) : 0);
  }

  // Skip areas with fewer than 4 non-zero weeks
  const nonZeroWeeks = clusterGrowthRate.filter(v => v > 0).length;
  if (nonZeroWeeks < 4) return null;

  return { clusterGrowthRate, citationVelocity, engagementTrend, harvestVolume };
}

// ─── Gemini forecast call ────────────────────────────────────────────────────

export const ForecastResponseSchema = z.object({
  growthPercent: z.number(),
  confidence:    z.enum(['low', 'medium', 'high']),
  narrative:     z.string().min(10).max(500),
});

export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;

function buildForecastPrompt(area: string, signals: AreaForecastSignals): string {
  return `You are analyzing research trend data for the taxonomy area "${area}".

Historical data (8 weeks, oldest first):
- Weekly paper/content counts: ${JSON.stringify(signals.clusterGrowthRate)}
- Weekly average citation counts: ${JSON.stringify(signals.citationVelocity)}
- Weekly average engagement scores: ${JSON.stringify(signals.engagementTrend)}
- Weekly total harvest volume: ${JSON.stringify(signals.harvestVolume)}

Based on this data, predict the 6-month growth trajectory for this area.

Return a JSON object with EXACTLY these fields (no extra text, no markdown):
{
  "growthPercent": <number, positive=growth, negative=decline>,
  "confidence": <"low" | "medium" | "high">,
  "narrative": <string, 2-3 sentences explaining why this area is trending or declining>
}`;
}

async function callGeminiForForecast(
  area: string,
  signals: AreaForecastSignals,
): Promise<ForecastResponse> {
  const model = getProModel();
  return pRetry(
    async () => {
      const result = await model.generateContent(buildForecastPrompt(area, signals));
      const text   = result.response.text().trim();
      // Strip markdown code fences if present
      const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(json) as unknown;
      return ForecastResponseSchema.parse(parsed);
    },
    { retries: 2, minTimeout: 2000 },
  );
}

// ─── Coordinator ─────────────────────────────────────────────────────────────

export async function runAreaForecasts(): Promise<number> {
  logger.info('Starting area forecast run');

  const areas = await getDistinctAreas();
  if (areas.length === 0) {
    logger.info('No taxonomy areas found — skipping forecast');
    return 0;
  }

  const forecastDate = new Date();
  let count = 0;

  for (const area of areas) {
    try {
      const signals = await aggregateSignals(area);
      if (!signals) {
        logger.info({ area }, 'Insufficient signal data — skipping area');
        continue;
      }

      const response = await callGeminiForForecast(area, signals);

      const prediction: AreaForecastPrediction = {
        growthPercent: response.growthPercent,
        confidence:    response.confidence,
        horizon:       '6mo',
      };

      await db.insert(areaForecasts).values({
        taxonomyArea: area,
        forecastDate,
        signals,
        prediction,
        narrative: response.narrative,
      }).onConflictDoNothing();

      count++;
      logger.info({ area, growthPercent: response.growthPercent }, 'Area forecast persisted');
    } catch (err) {
      logger.error({ area, err }, 'Failed to forecast area — continuing');
    }
  }

  logger.info({ count }, 'Area forecast run complete');
  return count;
}
