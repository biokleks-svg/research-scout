import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { db } from '../db';
import { contentItems } from '../db/schema';
import { desc, ne, and, lt } from 'drizzle-orm';
import { DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT } from '@/lib/constants';
import { buildRecommendations } from '@/agents/intelligence/rec-engine';

export const feedRouter = router({
  getPersonalized: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit:  z.number().min(1).max(MAX_FEED_LIMIT).default(DEFAULT_FEED_LIMIT),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Authenticated users with interest embeddings get personalized recommendations
      if (ctx.user) {
        try {
          const recs = await buildRecommendations(ctx.user.id, input.limit);
          if (recs.length > 0) {
            return { items: recs, nextCursor: undefined, hasMore: false, personalized: true };
          }
        } catch {
          // Fall through to global feed on rec engine failure
        }
      }

      // Global feed fallback (unauthenticated or no embedding yet)
      const baseWhere = ne(contentItems.processingStatus, 'duplicate');
      const cursorWhere = input.cursor
        ? and(baseWhere, lt(contentItems.publishedAt, new Date(input.cursor)))
        : baseWhere;

      const items = await db.query.contentItems.findMany({
        where: cursorWhere,
        orderBy: [desc(contentItems.publishedAt)],
        limit: input.limit + 1,
        columns: {
          id: true, sourceType: true, sourceUrl: true, title: true, authors: true,
          publishedAt: true, harvestedAt: true, taxonomy: true, difficultyLevel: true,
          processingStatus: true, citationCount: true, globalQuality: true,
          infographicUrl: true, summary: true, podcastUrl: true, podcastStatus: true,
        },
      });

      const hasMore    = items.length > input.limit;
      const data       = items.slice(0, input.limit);
      const nextCursor = hasMore ? data[data.length - 1]?.publishedAt.toISOString() : undefined;
      return { items: data, nextCursor, hasMore, personalized: false };
    }),

  getTrending: publicProcedure.query(async () => {
    const items = await db.query.contentItems.findMany({
      where: ne(contentItems.processingStatus, 'duplicate'),
      orderBy: [desc(contentItems.citationCount), desc(contentItems.publishedAt)],
      limit: 10,
      columns: {
        id: true, title: true, authors: true, publishedAt: true,
        citationCount: true, taxonomy: true, sourceUrl: true, sourceType: true,
      },
    });
    return items;
  }),
});
