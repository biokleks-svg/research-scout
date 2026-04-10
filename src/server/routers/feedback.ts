import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { feedback } from '../db/schema';
import { and, eq } from 'drizzle-orm';

export const FEEDBACK_TYPES = ['like', 'dislike', 'save', 'dismiss'] as const;

export type FeedbackInput = {
  contentId:    string;
  feedbackType: typeof FEEDBACK_TYPES[number];
  value?:       number;
};

export const feedbackRouter = router({
  add: protectedProcedure
    .input(z.object({
      contentId:    z.string().uuid(),
      feedbackType: z.enum(FEEDBACK_TYPES),
      value:        z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db
        .insert(feedback)
        .values({
          userId:       ctx.user.id,
          contentId:    input.contentId,
          feedbackType: input.feedbackType,
          value:        input.value ?? null,
        })
        .onConflictDoNothing();
      return { ok: true };
    }),

  getForItem: protectedProcedure
    .input(z.object({ contentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(feedback)
        .where(
          and(eq(feedback.userId, ctx.user.id), eq(feedback.contentId, input.contentId))
        );
      return rows;
    }),
});
