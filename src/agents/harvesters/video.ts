import { createHash } from 'crypto';
import pRetry from 'p-retry';
import { db } from '@/server/db';
import { contentItems, processingRegistry } from '@/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { YOUTUBE_API_BASE, YOUTUBE_AI_CHANNELS, YOUTUBE_RATE_LIMIT_MS } from '@/lib/constants';
import type { ContentSourceType, RegistryStages } from '@/types/content';
import { pino } from 'pino';

const logger = pino({ name: 'video-harvester' });

export interface RawYouTubeVideo {
  id:      { videoId: string };
  snippet: {
    title:        string;
    description:  string;
    channelId:    string;
    channelTitle: string;
    publishedAt:  string;
  };
}

export function buildVideoContentHash(videoId: string): string {
  return createHash('sha256').update(`youtube:${videoId}`).digest('hex');
}

export function normalizeYouTubeVideo(video: RawYouTubeVideo): {
  sourceType:  ContentSourceType;
  sourceId:    string;
  sourceUrl:   string;
  title:       string;
  authors:     string[];
  publishedAt: Date;
  rawText:     string;
  contentHash: string;
} {
  const videoId = video.id.videoId;
  return {
    sourceType:  'video',
    sourceId:    videoId,
    sourceUrl:   `https://www.youtube.com/watch?v=${videoId}`,
    title:       video.snippet.title,
    authors:     [video.snippet.channelTitle],
    publishedAt: new Date(video.snippet.publishedAt),
    rawText:     `${video.snippet.title}. ${video.snippet.description}`,
    contentHash: buildVideoContentHash(videoId),
  };
}

export async function harvestYouTube(maxResults = 10): Promise<number> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    logger.info('YOUTUBE_API_KEY not set, skipping video harvest');
    return 0;
  }

  logger.info({ channels: YOUTUBE_AI_CHANNELS.length }, 'Starting YouTube harvest');
  let harvested = 0;

  for (const channelId of YOUTUBE_AI_CHANNELS) {
    try {
      const videos = await pRetry(
        async () => {
          const params = new URLSearchParams({
            part:       'snippet',
            channelId,
            type:       'video',
            order:      'date',
            maxResults: String(maxResults),
            key:        apiKey,
          });
          const res = await fetch(`${YOUTUBE_API_BASE}/search?${params}`);
          if (!res.ok) throw new Error(`YouTube API returned ${res.status}`);
          const data = await res.json() as { items: RawYouTubeVideo[] };
          return data.items ?? [];
        },
        { retries: 2, minTimeout: YOUTUBE_RATE_LIMIT_MS },
      );

      for (const video of videos) {
        try {
          const normalized = normalizeYouTubeVideo(video);
          const existing = await db.query.processingRegistry.findFirst({
            where: and(
              eq(processingRegistry.sourceType, 'video'),
              eq(processingRegistry.sourceId, normalized.sourceId),
            ),
          });
          if (existing) continue;

          const [inserted] = await db
            .insert(contentItems)
            .values({ ...normalized, processingStatus: 'harvested' })
            .onConflictDoNothing()
            .returning();
          if (!inserted) continue;

          const emptyStage = { done: false, at: new Date().toISOString() };
          const stages: RegistryStages = {
            harvested:    { done: true, at: new Date().toISOString() },
            classified:   emptyStage,
            infographic:  emptyStage,
            summary:      emptyStage,
            podcast:      emptyStage,
            criticScored: emptyStage,
            justified:    emptyStage,
          };
          await db.insert(processingRegistry).values({
            sourceType:    'video',
            sourceId:      normalized.sourceId,
            contentHash:   normalized.contentHash,
            contentItemId: inserted.id,
            stages,
          }).onConflictDoNothing();

          harvested++;
        } catch (err) {
          logger.error({ videoId: video.id.videoId, err }, 'Failed to insert video');
        }
      }
      await new Promise((r) => setTimeout(r, YOUTUBE_RATE_LIMIT_MS));
    } catch (err) {
      logger.error({ channelId, err }, 'YouTube channel harvest failed, continuing');
    }
  }

  logger.info({ harvested }, 'YouTube harvest complete');
  return harvested;
}
