import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { db } from '../db';
import { contentItems } from '../db/schema';
import { eq } from 'drizzle-orm';

export const contentRouter = router({
  /** Full content item including criticScores, cohortRank, and justification. */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const [item] = await db
        .select()
        .from(contentItems)
        .where(eq(contentItems.id, input.id))
        .limit(1);
      return item ?? null;
    }),
});
