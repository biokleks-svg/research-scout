import { router } from '../trpc';
import { feedRouter }     from './feed';
import { podcastRouter }  from './podcast';
import { userRouter }     from './user';
import { trendsRouter }   from './trends';
import { contentRouter }  from './content';
import { feedbackRouter } from './feedback';
import { settingsRouter } from './settings';
import { forecastRouter } from './forecast';

export const appRouter = router({
  feed:     feedRouter,
  podcast:  podcastRouter,
  user:     userRouter,
  trends:   trendsRouter,
  content:  contentRouter,
  feedback: feedbackRouter,
  settings: settingsRouter,
  forecast: forecastRouter,
});

export type AppRouter = typeof appRouter;
