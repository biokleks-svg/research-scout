import { router } from '../trpc';
import { feedRouter }    from './feed';
import { podcastRouter } from './podcast';
import { userRouter }    from './user';

export const appRouter = router({
  feed:    feedRouter,
  podcast: podcastRouter,
  user:    userRouter,
});

export type AppRouter = typeof appRouter;
