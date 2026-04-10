import { Worker } from 'bullmq';
import { getRedisConnection } from '@/lib/queue';
import { QUEUE_CRITIC } from '@/lib/constants';
import { scoreContentItem }      from '@/agents/critic/scorer';
import { synthesizeCohortRank }  from '@/agents/critic/rank-synthesizer';
import { generateJustification } from '@/agents/critic/justification';
import type { CriticJobData } from '@/lib/queue';
import { pino } from 'pino';

const logger = pino({ name: 'critic-worker' });

/** Exported for unit testing */
export async function criticStage(
  contentItemId: string,
  stage: CriticJobData['stages'][number],
): Promise<boolean> {
  switch (stage) {
    case 'score':   return scoreContentItem(contentItemId);
    case 'rank':    return synthesizeCohortRank(contentItemId);
    case 'justify': return generateJustification(contentItemId);
    default:
      logger.warn({ stage }, 'Unknown stage, skipping');
      return false;
  }
}

const worker = new Worker<CriticJobData>(
  QUEUE_CRITIC,
  async (job) => {
    logger.info({ jobId: job.id, contentItemId: job.data.contentItemId }, 'Critic job started');
    const results: Record<string, boolean> = {};

    for (const stage of job.data.stages) {
      results[stage] = await criticStage(job.data.contentItemId, stage);
    }

    logger.info({ jobId: job.id, results }, 'Critic job complete');
    return results;
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  },
);

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Critic job failed');
});

logger.info('Critic worker started');

process.on('SIGTERM', async () => {
  logger.info('Shutting down critic worker...');
  await worker.close();
  process.exit(0);
});
