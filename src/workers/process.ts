import { Worker } from 'bullmq';
import { getRedisConnection } from '@/lib/queue';
import { QUEUE_PROCESS } from '@/lib/constants';
import { classifyContentItem } from '@/agents/processors/dedup-classifier';
import type { ProcessJobData } from '@/lib/queue';
import { pino } from 'pino';

const logger = pino({ name: 'process-worker' });

const worker = new Worker<ProcessJobData>(
  QUEUE_PROCESS,
  async (job) => {
    logger.info({ jobId: job.id, contentItemId: job.data.contentItemId }, 'Processing job');

    const results: Record<string, boolean> = {};

    for (const stage of job.data.stages) {
      switch (stage) {
        case 'classify': {
          const ok = await classifyContentItem(job.data.contentItemId);
          results.classify = ok;
          break;
        }
        default:
          logger.warn({ stage }, 'Stage not implemented yet, skipping');
      }
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
