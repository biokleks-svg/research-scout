import cron from 'node-cron';
import { harvestQueue, processQueue } from '@/lib/queue';
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

logger.info('Scheduler started. Paper harvest: every 2h. Classify sweep: every 15min.');
