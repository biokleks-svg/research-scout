import cron from 'node-cron';
import { harvestQueue, processQueue, criticQueue, intelligenceQueue } from '@/lib/queue';
import { db } from '@/server/db';
import { contentItems } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';

const logger = pino({ name: 'scheduler' });

// Every 2 hours: harvest papers from arXiv
cron.schedule('0 */2 * * *', async () => {
  logger.info('Scheduling paper harvest job');
  await harvestQueue.add('harvest-papers', { agentType: 'paper' });
});

// Every 15 minutes: enqueue classify jobs for unprocessed items
cron.schedule('*/15 * * * *', async () => {
  const pending = await db.query.contentItems.findMany({
    where: eq(contentItems.processingStatus, 'harvested'),
    limit: 20,
  });

  if (pending.length === 0) return;

  logger.info({ count: pending.length }, 'Enqueueing classify jobs');
  for (const item of pending) {
    await processQueue.add(
      `classify-${item.id}`,
      { contentItemId: item.id, stages: ['classify'] },
      { jobId: `classify-${item.id}` }, // Prevent duplicate jobs
    );
  }
});

// Every 30 minutes: enqueue critic jobs for 'processed' items
cron.schedule('*/30 * * * *', async () => {
  const pending = await db.query.contentItems.findMany({
    where: eq(contentItems.processingStatus, 'processed'),
    limit: 20,
  });

  if (pending.length === 0) return;

  logger.info({ count: pending.length }, 'Enqueueing critic jobs');
  for (const item of pending) {
    await criticQueue.add(
      `critic-${item.id}`,
      { contentItemId: item.id, stages: ['score', 'rank', 'justify'] },
      { jobId: `critic-${item.id}` },
    );
  }
});

// Daily at 02:00 UTC: detect trends + propagate bonuses
cron.schedule('0 2 * * *', async () => {
  logger.info('Scheduling trend detection job');
  await intelligenceQueue.add('detect-trends', { jobType: 'detect-trends' });
});

// Daily at 03:00 UTC: generate narratives for active trends
cron.schedule('0 3 * * *', async () => {
  logger.info('Scheduling trend narration job');
  await intelligenceQueue.add('narrate-trends', { jobType: 'narrate-trends' });
});

logger.info('Scheduler started. Paper harvest: every 2h. Classify: every 15min. Critic: every 30min. Trend detection: daily 02:00 UTC. Narration: daily 03:00 UTC.');
