import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { db } from '../db';
import { contentItems } from '../db/schema';
import { desc, ne } from 'drizzle-orm';
import { DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT } from '@/lib/constants';

export const feedRouter = router({
  /**
   * getPersonalized — Phase 1: global feed sorted by publishedAt.
   * Personalization added in Phase 2 when auth is available.
   */
  getPersonalized: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit:  z.number().min(1).max(MAX_FEED_LIMIT).default(DEFAULT_FEED_LIMIT),
      }),
    )
    .query(async ({ input }) => {
      const items = await db.query.contentItems.findMany({
        where: ne(contentItems.processingStatus, 'duplicate'),
        orderBy: [desc(contentItems.publishedAt)],
        limit: input.limit + 1,
        columns: {
          id:               true,
          sourceType:       true,
          sourceUrl:        true,
          title:            true,
          authors:          true,
          publishedAt:      true,
          harvestedAt:      true,
          taxonomy:         true,
          difficultyLevel:  true,
          processingStatus: true,
          citationCount:    true,
          globalQuality:    true,
          infographicUrl:   true,
          summary:          true,
        },
      });

      const hasMore = items.length > input.limit;
      const data = items.slice(0, input.limit);
      const nextCursor = hasMore ? data[data.length - 1]?.id : undefined;

      return { items: data, nextCursor, hasMore };
    }),

  getTrending: publicProcedure.query(async () => {
    const items = await db.query.contentItems.findMany({
      where: ne(contentItems.processingStatus, 'duplicate'),
      orderBy: [desc(contentItems.citationCount), desc(contentItems.publishedAt)],
      limit: 10,
      columns: {
        id:            true,
        title:         true,
        authors:       true,
        publishedAt:   true,
        citationCount: true,
        taxonomy:      true,
        sourceUrl:     true,
        sourceType:    true,
      },
    });
    return items;
  }),
});
