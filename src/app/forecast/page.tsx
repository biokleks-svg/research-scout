import { db } from '@/server/db';
import { areaForecasts } from '@/server/db/schema';
import { sql } from 'drizzle-orm';
import { ForecastCard } from '@/components/forecast/ForecastCard';
import Link from 'next/link';
import type { AreaForecastPrediction } from '@/types/trends';

export const revalidate = 300;

export default async function ForecastPage() {
  const latest = await db
    .select({ maxDate: sql<Date>`MAX(forecast_date)` })
    .from(areaForecasts);
  const latestDate = latest[0]?.maxDate;

  const rows = latestDate
    ? await db
        .select()
        .from(areaForecasts)
        .where(sql`forecast_date = ${latestDate}`)
        .orderBy(sql`(prediction->>'growthPercent')::float DESC`)
    : [];

  return (
    <main className="max-w-5xl mx-auto py-10 px-4 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">6-Month Research Forecast</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Predicted growth per taxonomy area based on 8 weeks of signal data.
          </p>
        </div>
        <Link href="/trending" className="text-sm text-muted-foreground hover:underline">
          ← Back to Trends
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-20 border rounded-lg bg-muted/20">
          <p className="text-muted-foreground">
            No forecasts yet. Run one from the{' '}
            <Link href="/admin" className="underline">Admin Dashboard</Link>.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(row => (
            <ForecastCard
              key={row.id}
              taxonomyArea={row.taxonomyArea}
              forecastDate={row.forecastDate!}
              prediction={row.prediction as AreaForecastPrediction}
              narrative={row.narrative}
            />
          ))}
        </div>
      )}
    </main>
  );
}
