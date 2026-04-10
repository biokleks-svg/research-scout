import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { systemSettings } from '../db/schema';
import { eq } from 'drizzle-orm';

export function parseSettingValue(value: unknown): unknown {
  return value;
}
export function serializeSettingValue(value: unknown): unknown {
  return value;
}

const ALLOWED_KEYS = [
  'pass1.infographic.enabled',
  'pass1.infographic.topNPercent',
  'pass1.infographic.model',
  'pass2.summary.enabled',
  'pass2.summary.model',
  'pass3.podcast.enabled',
  'pass3.podcast.autoGenerateTopN',
  'critic.enabled',
  'critic.model',
  'harvest.paper.frequency',
  'harvest.social.frequency',
  'harvest.blog.frequency',
  'rec.candidateWindowDays',
] as const;

export const settingsRouter = router({
  getAll: protectedProcedure.query(async () => {
    const rows = await db.select().from(systemSettings);
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }),

  set: protectedProcedure
    .input(z.object({
      key:   z.enum(ALLOWED_KEYS),
      value: z.union([z.boolean(), z.number(), z.string()]),
    }))
    .mutation(async ({ ctx, input }) => {
      await db
        .insert(systemSettings)
        .values({ key: input.key, value: input.value, updatedBy: ctx.user.id })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: input.value, updatedAt: new Date(), updatedBy: ctx.user.id },
        });
      return { ok: true };
    }),
});
