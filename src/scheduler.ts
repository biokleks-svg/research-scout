import cron from 'node-cron';
import { harvestQueue, processQueue, criticQueue, intelligenceQueue } from '@/lib/queue';
import { db } from '@/server/db';
import { contentItems } from '@/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
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

// Every 30 minutes: enqueue critic jobs for 'processed' and 'scored' items
cron.schedule('*/30 * * * *', async () => {
  const [toScore, toRankJustify] = await Promise.all([
    db.query.contentItems.findMany({
      where: eq(contentItems.processingStatus, 'processed'),
      limit: 20,
    }),
    db.query.contentItems.findMany({
      where: inArray(contentItems.processingStatus, ['scored']),
      limit: 20,
    }),
  ]);

  const total = toScore.length + toRankJustify.length;
  if (total === 0) return;

  logger.info({ toScore: toScore.length, toRankJustify: toRankJustify.length }, 'Enqueueing critic jobs');
  for (const item of toScore) {
    await criticQueue.add(
      `critic-${item.id}`,
      { contentItemId: item.id, stages: ['score', 'rank', 'justify'] },
      { jobId: `critic-${item.id}` },
    );
  }
  for (const item of toRankJustify) {
    await criticQueue.add(
      `critic-rank-${item.id}`,
      { contentItemId: item.id, stages: ['rank', 'justify'] },
      { jobId: `critic-rank-${item.id}` },
    );
  }
});

// Every 6 hours: harvest blogs + HuggingFace trending models
cron.schedule('0 */6 * * *', async () => {
  logger.info('Scheduling blog harvest job');
  await harvestQueue.add('harvest-blogs', { agentType: 'blog' });
  await harvestQueue.add('harvest-huggingface', { agentType: 'huggingface' });
});

// Every 2 hours: harvest social (Bluesky + HN)
cron.schedule('0 */2 * * *', async () => {
  logger.info('Scheduling social harvest job');
  await harvestQueue.add('harvest-social', { agentType: 'social' });
});

// Every 6 hours: harvest YouTube videos (only runs if YOUTUBE_API_KEY is set)
cron.schedule('0 */6 * * *', async () => {
  if (!process.env.YOUTUBE_API_KEY) return;
  logger.info('Scheduling video harvest job');
  await harvestQueue.add('harvest-video', { agentType: 'video' });
});

// Weekly: Monday 06:00 UTC — conference proceedings harvest + Playwright enrichment
cron.schedule('0 6 * * 1', async () => {
  logger.info('Queuing weekly conference harvest');
  await harvestQueue.add('harvest-conference', { agentType: 'conference' });
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

logger.info('Scheduler started. Paper: 2h. Classify: 15min. Critic: 30min. Blog/HF: 6h. Social: 2h. Video: 6h. Conference: Mon 06:00 UTC. Trend detection: 02:00 UTC. Narration: 03:00 UTC.');
