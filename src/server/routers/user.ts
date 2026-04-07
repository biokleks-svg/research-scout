import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { embedText } from '@/lib/gemini';

const InterestTagSchema = z.object({
  id:       z.string().min(1),
  label:    z.string().min(1),
  category: z.string(),
  weight:   z.number().min(0).max(1).default(1),
});

export const userRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await db
      .select({
        id:                  users.id,
        email:               users.email,
        name:                users.name,
        role:                users.role,
        freeTextInterests:   users.freeTextInterests,
        structuredInterests: users.structuredInterests,
        settings:            users.settings,
        createdAt:           users.createdAt,
      })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    if (!user) throw new Error('User not found');
    return user;
  }),

  getInterests: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await db
      .select({
        freeTextInterests:   users.freeTextInterests,
        structuredInterests: users.structuredInterests,
      })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    return {
      freeText:   user?.freeTextInterests   ?? [],
      structured: user?.structuredInterests ?? [],
    };
  }),

  addFreeTextInterest: protectedProcedure
    .input(z.object({ text: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await db
        .select({ freeTextInterests: users.freeTextInterests })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      const existing = user?.freeTextInterests ?? [];
      const trimmed  = input.text.trim();
      if (existing.includes(trimmed)) return { interests: existing };

      const updated = [...existing, trimmed];
      await db.update(users)
        .set({ freeTextInterests: updated })
        .where(eq(users.id, ctx.user.id));

      return { interests: updated };
    }),

  removeFreeTextInterest: protectedProcedure
    .input(z.object({ text: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await db
        .select({ freeTextInterests: users.freeTextInterests })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      const updated = (user?.freeTextInterests ?? []).filter((t) => t !== input.text);
      await db.update(users)
        .set({ freeTextInterests: updated })
        .where(eq(users.id, ctx.user.id));

      return { interests: updated };
    }),

  updateInterests: protectedProcedure
    .input(z.object({ structured: z.array(InterestTagSchema) }))
    .mutation(async ({ ctx, input }) => {
      const tagText  = input.structured.map((t) => t.label).join(', ');
      let embedding: number[] | null = null;
      try {
        embedding = tagText ? await embedText(tagText) : null;
      } catch {
        // Non-fatal: embedding recomputed in next offline cycle
      }

      await db.update(users)
        .set({
          structuredInterests: input.structured,
          ...(embedding ? { interestEmbedding: embedding } : {}),
        })
        .where(eq(users.id, ctx.user.id));

      return { ok: true };
    }),

  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(users)
        .set({ name: input.name ?? null })
        .where(eq(users.id, ctx.user.id));
      return { ok: true };
    }),
});
