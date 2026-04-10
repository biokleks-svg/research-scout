import { Worker } from 'bullmq';
import { getRedisConnection } from '@/lib/queue';
import { QUEUE_HARVEST } from '@/lib/constants';
import { harvestArxiv, enrichRecentPapers } from '@/agents/harvesters/paper';
import { harvestAllBlogs }    from '@/agents/harvesters/blog';
import { harvestHuggingFace } from '@/agents/harvesters/huggingface';
import { harvestSocial }      from '@/agents/harvesters/social';
import { harvestYouTube }     from '@/agents/harvesters/video';
import type { HarvestJobData } from '@/lib/queue';
import { pino } from 'pino';

const logger = pino({ name: 'harvest-worker' });

/** Exported for unit testing */
export async function harvestJob(agentType: HarvestJobData['agentType']): Promise<{ harvested?: number; skipped?: boolean }> {
  switch (agentType) {
    case 'paper': {
      const count = await harvestArxiv(50);
      await enrichRecentPapers(20);
      return { harvested: count };
    }
    case 'blog': {
      const count = await harvestAllBlogs();
      return { harvested: count };
    }
    case 'huggingface': {
      const count = await harvestHuggingFace(20);
      return { harvested: count };
    }
    case 'social': {
      const count = await harvestSocial();
      return { harvested: count };
    }
    case 'video': {
      const count = await harvestYouTube(10);
      return { harvested: count };
    }
    default:
      logger.warn({ agentType }, 'Unknown agent type, skipping');
      return { skipped: true };
  }
}

const worker = new Worker<HarvestJobData>(
  QUEUE_HARVEST,
  async (job) => {
    logger.info({ jobId: job.id, agentType: job.data.agentType }, 'Processing harvest job');
    const result = await harvestJob(job.data.agentType);
    logger.info({ jobId: job.id, result }, 'Harvest job complete');
    return result;
  },
  { connection: getRedisConnection(), concurrency: 1 },
);

worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Harvest job completed'));
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Harvest job failed'));

logger.info('Harvest worker started');

process.on('SIGTERM', async () => {
  logger.info('Shutting down harvest worker...');
  await worker.close();
  process.exit(0);
});
