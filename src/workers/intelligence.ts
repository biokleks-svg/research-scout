import { Worker } from 'bullmq';
import { getRedisConnection } from '@/lib/queue';
import { QUEUE_INTELLIGENCE } from '@/lib/constants';
import { detectTrends }            from '@/agents/intelligence/trend-detector';
import { narrateActiveTrends }      from '@/agents/intelligence/trend-narrator';
import { propagateAllActiveTrends } from '@/agents/intelligence/trend-propagator';
import { buildRecommendations }     from '@/agents/intelligence/rec-engine';
import { composeDigestForAllUsers } from '@/agents/intelligence/digest-composer';
import { users }                    from '@/server/db/schema';
import { isNotNull }                from 'drizzle-orm';
import { db }                       from '@/server/db';
import type { IntelligenceJobData } from '@/lib/queue';
import { pino } from 'pino';

const logger = pino({ name: 'intelligence-worker' });

/** Exported for unit testing */
export async function intelligenceJob(jobType: IntelligenceJobData['jobType']): Promise<boolean> {
  switch (jobType) {
    case 'detect-trends':
      await detectTrends();
      await propagateAllActiveTrends();
      return true;
    case 'narrate-trends':
      await narrateActiveTrends();
      return true;
    case 'build-recommendations': {
      // Pre-warm recommendations for all users with interest embeddings
      const usersWithEmbeddings = await db.query.users.findMany({
        where: isNotNull(users.interestEmbedding),
        columns: { id: true },
      });
      for (const user of usersWithEmbeddings) {
        try {
          await buildRecommendations(user.id);
          logger.info({ userId: user.id }, 'Recommendations built');
        } catch (err) {
          logger.error({ userId: user.id, err }, 'Failed to build recommendations');
        }
      }
      return true;
    }
    case 'compose-digest':
      await composeDigestForAllUsers();
      return true;
    default:
      logger.warn({ jobType }, 'Unknown job type');
      return false;
  }
}

const worker = new Worker<IntelligenceJobData>(
  QUEUE_INTELLIGENCE,
  async (job) => {
    logger.info({ jobId: job.id, jobType: job.data.jobType }, 'Intelligence job started');
    const success = await intelligenceJob(job.data.jobType);
    logger.info({ jobId: job.id, success }, 'Intelligence job complete');
    return { success };
  },
  {
    connection: getRedisConnection(),
    concurrency: 1,
  },
);

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Intelligence job failed');
});

logger.info('Intelligence worker started');

process.on('SIGTERM', async () => {
  logger.info('Shutting down intelligence worker...');
  await worker.close();
  process.exit(0);
});
