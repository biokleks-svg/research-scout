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
Return ONLY the narrative text — no markdown, no preamble.

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
        .where(
          sql`taxonomy->>'primaryArea' ILIKE ${trend.category ?? trend.name}
              AND processing_status != 'duplicate'`,
        )
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
