import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { db } from '../db';
import { trends } from '../db/schema';
import { desc, eq, ne, and, sql } from 'drizzle-orm';

export const trendsRouter = router({
  /**
   * List trends. Without filters returns all non-fading trends ordered by momentum.
   */
  list: publicProcedure
    .input(z.object({
      status:   z.enum(['emerging', 'rising', 'peak', 'fading']).optional(),
      category: z.string().optional(),
      limit:    z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      let whereClause;

      if (input.status && input.category) {
        whereClause = and(eq(trends.status, input.status), eq(trends.category, input.category));
      } else if (input.status) {
        whereClause = eq(trends.status, input.status);
      } else if (input.category) {
        whereClause = and(ne(trends.status, 'fading'), eq(trends.category, input.category));
      } else {
        whereClause = ne(trends.status, 'fading');
      }

      return db.query.trends.findMany({
        where: whereClause,
        orderBy: [desc(trends.momentumScore)],
        limit: input.limit,
        columns: {
          id:            true,
          name:          true,
          slug:          true,
          category:      true,
          status:        true,
          momentumScore: true,
          zScore:        true,
          narrative:     true,
          evidenceIds:   true,
          detectedAt:    true,
          peakedAt:      true,
          updatedAt:     true,
        },
      });
    }),

  /** Single trend by slug, including all fields. */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }) => {
      const trend = await db.query.trends.findFirst({
        where: eq(trends.slug, input.slug),
      });
      return trend ?? null;
    }),

  /** Distinct category values for the category tab filter. */
  getCategories: publicProcedure.query(async () => {
    const result = await db.execute(
      sql`SELECT DISTINCT category FROM trends WHERE category IS NOT NULL ORDER BY category`
    );
    return (result as unknown as { rows: Array<{ category: string }> }).rows.map(r => r.category);
  }),
});
