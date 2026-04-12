import { db } from '@/server/db';
import { trends } from '@/server/db/schema';
import { ne, desc, sql } from 'drizzle-orm';
import { TrendsClientShell } from '@/components/trends/TrendsClientShell';
import type { TrendViewModel } from '@/components/trends/TrendCard';
import Link from 'next/link';

export const revalidate = 300;

export default async function TrendingPage() {
  const [rows, categoryResult] = await Promise.all([
    db.query.trends.findMany({
      where:   ne(trends.status, 'fading'),
      orderBy: [desc(trends.momentumScore)],
      limit:   60,
      columns: {
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
    detectedAt:    r.detectedAt.toISOString(),
  }));

  return (
    <main className="max-w-6xl mx-auto py-10 px-4 space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trending in AI Research</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Topics gaining momentum across papers, social media, and code releases. Updated daily.
          </p>
        </div>
        <Link href="/forecast" className="text-sm text-muted-foreground hover:underline whitespace-nowrap">
          View 6-month forecast →
        </Link>
      </div>

      {trendData.length === 0 ? (
        <div className="text-center py-20 border rounded-lg bg-muted/20">
          <p className="text-muted-foreground font-medium">No active trends yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Trend detection runs daily at 02:00 UTC. Check back soon.
          </p>
        </div>
      ) : (
        <TrendsClientShell trends={trendData} categories={categories} />
      )}
    </main>
  );
}
