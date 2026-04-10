import { db } from '@/server/db';
import { contentItems, users } from '@/server/db/schema';
import { eq, sql, and, gt, isNotNull } from 'drizzle-orm';
import {
  REC_ENGINE_WINDOW_DAYS, REC_ENGINE_CANDIDATE_LIMIT, REC_ENGINE_OUTPUT_LIMIT,
  REC_WEIGHT_RELEVANCE, REC_WEIGHT_QUALITY, REC_WEIGHT_FRESHNESS, REC_WEIGHT_TREND,
} from '@/lib/constants';
import { pino } from 'pino';

const logger = pino({ name: 'rec-engine' });

export function computeFreshnessScore(publishedAt: Date): number {
  const daysSince = (Date.now() - publishedAt.getTime()) / 86400000;
  return Math.exp(-daysSince / 7); // half-life ≈ 7 days
}

export function scoreCandidate(candidate: {
  similarity:    number; // cosine similarity 0-1
  globalQuality: number; // 0-100 scale
  publishedAt:   Date;
  trendIdsCount: number;
}): number {
  const relevance      = Math.max(0, Math.min(1, candidate.similarity));
  const quality        = Math.max(0, Math.min(100, candidate.globalQuality)) / 100;
  const freshness      = computeFreshnessScore(candidate.publishedAt);
  const trendAlignment = Math.min(1, candidate.trendIdsCount / 3);

  return (
    relevance      * REC_WEIGHT_RELEVANCE  +
    quality        * REC_WEIGHT_QUALITY    +
    freshness      * REC_WEIGHT_FRESHNESS  +
    trendAlignment * REC_WEIGHT_TREND
  );
}

interface RecommendedItem {
  id:              string;
  title:           string;
  sourceType:      string;
  sourceUrl:       string;
  publishedAt:     Date;
  globalQuality:   number;
  summary:         unknown;
  infographicUrl:  string | null;
  taxonomy:        unknown;
  difficultyLevel: string | null;
  citationCount:   number;
  podcastUrl:      string | null;
  podcastStatus:   string | null;
  score:           number;
}

/**
 * Build a ranked list of recommendations for a user.
 * Falls back to quality-sorted global feed if user has no interest embedding.
 */
export async function buildRecommendations(userId: string, limit = REC_ENGINE_OUTPUT_LIMIT): Promise<RecommendedItem[]> {
  logger.info({ userId }, 'Building recommendations');

  const [user] = await db
    .select({ interestEmbedding: users.interestEmbedding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - REC_ENGINE_WINDOW_DAYS);

  // No embedding → return top quality items in window
  if (!user?.interestEmbedding) {
    logger.info({ userId }, 'No interest embedding — returning quality-sorted fallback');
    return db.query.contentItems.findMany({
      where: and(
        gt(contentItems.publishedAt, windowStart),
        isNotNull(contentItems.criticScores),
      ),
      orderBy: (t, { desc }) => [desc(t.globalQuality)],
      limit,
      columns: {
        id: true, title: true, sourceType: true, sourceUrl: true, publishedAt: true,
        globalQuality: true, summary: true, infographicUrl: true, taxonomy: true,
        difficultyLevel: true, citationCount: true, podcastUrl: true, podcastStatus: true,
      },
    }).then(rows => rows.map(r => ({ ...r, score: (r.globalQuality ?? 0) / 100 })));
  }

  // Validate the embedding before using it in a raw SQL literal (prevents SQL injection)
  const rawEmbedding = user.interestEmbedding;
  if (!Array.isArray(rawEmbedding) || rawEmbedding.some(v => typeof v !== 'number' || !isFinite(v))) {
    logger.warn({ userId }, 'Invalid interest embedding format — returning fallback');
    return db.query.contentItems.findMany({
      where: and(
        gt(contentItems.publishedAt, windowStart),
        isNotNull(contentItems.criticScores),
      ),
      orderBy: (t, { desc }) => [desc(t.globalQuality)],
      limit,
      columns: {
        id: true, title: true, sourceType: true, sourceUrl: true, publishedAt: true,
        globalQuality: true, summary: true, infographicUrl: true, taxonomy: true,
        difficultyLevel: true, citationCount: true, podcastUrl: true, podcastStatus: true,
      },
    }).then(rows => rows.map(r => ({ ...r, score: (r.globalQuality ?? 0) / 100 })));
  }

  // pgvector ANN: find most similar items to user's interest embedding
  const embeddingLiteral = `[${(rawEmbedding as number[]).join(',')}]`;
  const rows = await db.execute(sql`
    SELECT
      id, title, source_type AS "sourceType", source_url AS "sourceUrl",
      published_at AS "publishedAt", global_quality AS "globalQuality",
      summary, infographic_url AS "infographicUrl", taxonomy, difficulty_level AS "difficultyLevel",
      citation_count AS "citationCount", podcast_url AS "podcastUrl", podcast_status AS "podcastStatus",
      trend_ids AS "trendIds",
      1 - (embedding <=> ${sql.raw(`'${embeddingLiteral}'::vector`)}::vector) AS similarity
    FROM content_items
    WHERE published_at > ${windowStart}
      AND embedding IS NOT NULL
      AND processing_status != 'duplicate'
    ORDER BY embedding <=> ${sql.raw(`'${embeddingLiteral}'::vector`)}::vector
    LIMIT ${REC_ENGINE_CANDIDATE_LIMIT}
  `);

  type Row = {
    id:              string;
    title:           string;
    sourceType:      string;
    sourceUrl:       string;
    publishedAt:     Date;
    globalQuality:   number;
    summary:         unknown;
    infographicUrl:  string | null;
    taxonomy:        unknown;
    difficultyLevel: string | null;
    citationCount:   number;
    podcastUrl:      string | null;
    podcastStatus:   string | null;
    trendIds:        string[] | null;
    similarity:      number;
  };

  const candidates = (rows as unknown as { rows: Row[] }).rows;

  const scored = candidates.map(r => ({
    ...r,
    score: scoreCandidate({
      similarity:    r.similarity,
      globalQuality: r.globalQuality,
      publishedAt:   new Date(r.publishedAt),
      trendIdsCount: r.trendIds?.length ?? 0,
    }),
  }));

  scored.sort((a, b) => b.score - a.score);
  logger.info({ userId, candidates: candidates.length, returning: limit }, 'Recommendations built');
  return scored.slice(0, limit);
}
