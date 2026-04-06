import { router } from '../trpc';
import { feedRouter } from './feed';

export const appRouter = router({
  feed: feedRouter,
});

export type AppRouter = typeof appRouter;
