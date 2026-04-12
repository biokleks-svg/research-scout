import { router, adminProcedure, publicProcedure } from '../trpc';
import { db } from '../db';
import { areaForecasts } from '../db/schema';
import { intelligenceQueue } from '@/lib/queue';
import { sql } from 'drizzle-orm';
import type { AreaForecastSignals, AreaForecastPrediction } from '@/types/trends';

export const forecastRouter = router({
  run: adminProcedure
    .mutation(async () => {
      await intelligenceQueue.add('run-area-forecasts', { jobType: 'run-area-forecasts' });
      return { queued: true };
    }),

  getLatest: publicProcedure
    .query(async () => {
      // Find the most recent forecastDate
      const latest = await db
        .select({ maxDate: sql<Date>`MAX(forecast_date)` })
        .from(areaForecasts);
      const latestDate = latest[0]?.maxDate;
      if (!latestDate) return [];

      const rows = await db
        .select()
        .from(areaForecasts)
        .where(sql`forecast_date = ${latestDate}`)
        .orderBy(sql`(prediction->>'growthPercent')::float DESC`);

      return rows.map(r => ({
        id:           r.id,
        taxonomyArea: r.taxonomyArea,
        forecastDate: r.forecastDate,
        signals:      r.signals as AreaForecastSignals,
        prediction:   r.prediction as AreaForecastPrediction,
        narrative:    r.narrative,
        createdAt:    r.createdAt,
      }));
    }),
});
