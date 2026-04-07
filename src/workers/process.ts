import { Worker } from 'bullmq';
import { getRedisConnection } from '@/lib/queue';
import { QUEUE_PROCESS } from '@/lib/constants';
import { classifyContentItem } from '@/agents/processors/dedup-classifier';
import { writeSummary } from '@/agents/processors/summary';
import { generateInfographic } from '@/agents/processors/infographic';
import type { ProcessJobData } from '@/lib/queue';
import { pino } from 'pino';

const logger = pino({ name: 'process-worker' });

/** Exported for unit testing */
export async function processStage(
  contentItemId: string,
  stage: ProcessJobData['stages'][number],
): Promise<boolean> {
  switch (stage) {
    case 'classify':    return classifyContentItem(contentItemId);
    case 'summary':     return writeSummary(contentItemId);
    case 'infographic': return generateInfographic(contentItemId);
    default:
      logger.warn({ stage }, 'Unknown stage, skipping');
      return false;
  }
}

const worker = new Worker<ProcessJobData>(
  QUEUE_PROCESS,
  async (job) => {
    logger.info({ jobId: job.id, contentItemId: job.data.contentItemId }, 'Processing job');
    const results: Record<string, boolean> = {};

    for (const stage of job.data.stages) {
      results[stage] = await processStage(job.data.contentItemId, stage);
    }

    logger.info({ jobId: job.id, results }, 'Process job complete');
    return results;
  },
  {
    connection: getRedisConnection(),
    concurrency: 3,
  },
);

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Process job failed');
});

logger.info('Process worker started');

process.on('SIGTERM', async () => {
  logger.info('Shutting down process worker...');
  await worker.close();
  process.exit(0);
});
