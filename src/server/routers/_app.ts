import { router } from '../trpc';
import { feedRouter } from './feed';
import { podcastRouter } from './podcast';

export const appRouter = router({
  feed:    feedRouter,
  podcast: podcastRouter,
});

export type AppRouter = typeof appRouter;
