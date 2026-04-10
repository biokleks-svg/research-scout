import { router } from '../trpc';
import { feedRouter }    from './feed';
import { podcastRouter } from './podcast';
import { userRouter }    from './user';
import { trendsRouter }  from './trends';
import { contentRouter } from './content';

export const appRouter = router({
  feed:    feedRouter,
  podcast: podcastRouter,
  user:    userRouter,
  trends:  trendsRouter,
  content: contentRouter,
});

export type AppRouter = typeof appRouter;
