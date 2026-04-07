import { Worker } from 'bullmq';
import { getRedisConnection } from '@/lib/queue';
import { QUEUE_PODCAST } from '@/lib/constants';
import { generatePodcast } from '@/agents/processors/podcast';
import type { PodcastJobData } from '@/lib/queue';
import { pino } from 'pino';

const logger = pino({ name: 'podcast-worker' });

const worker = new Worker<PodcastJobData>(
  QUEUE_PODCAST,
  async (job) => {
    logger.info({ jobId: job.id, contentItemId: job.data.contentItemId }, 'Podcast job received');
    const ok = await generatePodcast(job.data.contentItemId);
    logger.info({ jobId: job.id, ok }, 'Podcast job complete');
    return { ok };
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  },
);

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Podcast job failed');
});

logger.info('Podcast worker started');

process.on('SIGTERM', async () => {
  logger.info('Shutting down podcast worker...');
  await worker.close();
  process.exit(0);
});
