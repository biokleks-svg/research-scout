import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { db } from '../db';
import { contentItems } from '../db/schema';
import { eq } from 'drizzle-orm';
import { podcastQueue } from '@/lib/queue';
import { buildPodcastStatus } from '@/agents/processors/podcast';
import type { PodcastJobData } from '@/lib/queue';

export const podcastRouter = router({
  /** Enqueue podcast generation. Returns immediately with current status. */
  requestGeneration: protectedProcedure
    .input(z.object({ contentId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const [item] = await db
        .select({
          id:           contentItems.id,
          podcastUrl:   contentItems.podcastUrl,
          podcastStatus: contentItems.podcastStatus,
        })
        .from(contentItems)
        .where(eq(contentItems.id, input.contentId))
        .limit(1);

      if (!item) throw new Error('Content item not found');

      if (item.podcastUrl) {
        return { status: 'available' as const, podcastUrl: item.podcastUrl };
      }

      const currentStatus = buildPodcastStatus(item.podcastUrl, item.podcastStatus);
      if (currentStatus === 'queued' || currentStatus === 'generating') {
        return { status: currentStatus };
      }

      await db.update(contentItems)
        .set({ podcastStatus: 'queued' })
        .where(eq(contentItems.id, input.contentId));

      const jobData: PodcastJobData = { contentItemId: input.contentId };
      await podcastQueue.add('generate-podcast', jobData, {
        jobId: `podcast-${input.contentId}`,
      });

      return { status: 'queued' as const };
    }),

  /** Poll podcast status. */
  getStatus: publicProcedure
    .input(z.object({ contentId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [item] = await db
        .select({
          podcastUrl:      contentItems.podcastUrl,
          podcastStatus:   contentItems.podcastStatus,
          podcastDuration: contentItems.podcastDuration,
        })
        .from(contentItems)
        .where(eq(contentItems.id, input.contentId))
        .limit(1);

      if (!item) throw new Error('Content item not found');

      const status = buildPodcastStatus(item.podcastUrl, item.podcastStatus);
      return {
        status,
        podcastUrl:      item.podcastUrl ?? null,
        podcastDuration: item.podcastDuration ?? null,
      };
    }),
});
