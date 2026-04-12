import { initTRPC, TRPCError } from '@trpc/server';
import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import superjson from 'superjson';
import { db } from './db';
import { lucia } from '@/lib/auth';

export const createContext = async (opts: FetchCreateContextFnOptions) => {
  const cookieHeader = opts.req.headers.get('cookie') ?? '';
  const sessionId = lucia.readSessionCookie(cookieHeader);

  let user: Awaited<ReturnType<typeof lucia.validateSession>>['user'] = null;
  let session: Awaited<ReturnType<typeof lucia.validateSession>>['session'] = null;

  if (sessionId) {
    const validated = await lucia.validateSession(sessionId);
    user    = validated.user;
    session = validated.session;
  }

  return { db, user, session };
};

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router          = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, user: ctx.user, session: ctx.session } });
});

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx: { ...ctx, user: ctx.user, session: ctx.session } });
});
