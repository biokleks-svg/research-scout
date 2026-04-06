import { Worker } from 'bullmq';
import { getRedisConnection } from '@/lib/queue';
import { QUEUE_HARVEST } from '@/lib/constants';
import { harvestArxiv, enrichRecentPapers } from '@/agents/harvesters/paper';
import type { HarvestJobData } from '@/lib/queue';
import { pino } from 'pino';

const logger = pino({ name: 'harvest-worker' });

const worker = new Worker<HarvestJobData>(
  QUEUE_HARVEST,
  async (job) => {
    logger.info({ jobId: job.id, agentType: job.data.agentType }, 'Processing harvest job');

    switch (job.data.agentType) {
      case 'paper': {
        const count = await harvestArxiv(50);
        await job.updateProgress(50);
        await enrichRecentPapers(20);
        await job.updateProgress(100);
        logger.info({ count }, 'Paper harvest job complete');
        return { harvested: count };
      }
      default:
        logger.warn({ agentType: job.data.agentType }, 'Unknown agent type, skipping');
        return { skipped: true };
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 1,
  },
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Harvest job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Harvest job failed');
});

logger.info('Harvest worker started');

process.on('SIGTERM', async () => {
  logger.info('Shutting down harvest worker...');
  await worker.close();
  process.exit(0);
});
