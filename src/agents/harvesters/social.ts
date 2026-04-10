import { createHash } from 'crypto';
import pRetry from 'p-retry';
import { db } from '@/server/db';
import { contentItems, processingRegistry } from '@/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { BLUESKY_API_BASE, HN_API_BASE, SOCIAL_RATE_LIMIT_MS } from '@/lib/constants';
import type { ContentSourceType, RegistryStages } from '@/types/content';
import { pino } from 'pino';

const logger = pino({ name: 'social-harvester' });

export interface RawBlueskyPost {
  uri:         string;
  cid:         string;
  author:      { handle: string; displayName?: string };
  record:      { text: string; createdAt: string };
  likeCount:   number;
  repostCount: number;
}

export interface RawHNItem {
  objectID:     string;
  title:        string;
  url:          string | null;
  author:       string;
  created_at:   string;
  points:       number;
  num_comments: number;
}

export function buildSocialContentHash(platform: string, id: string): string {
  return createHash('sha256').update(`social:${platform}:${id}`).digest('hex');
}

export function normalizeBlueskyPost(post: RawBlueskyPost): {
  sourceType: ContentSourceType; sourceId: string; sourceUrl: string;
  title: string; authors: string[]; publishedAt: Date; rawText: string; contentHash: string;
} {
  const handle = post.author.handle;
  const postId = post.uri.split('/').pop() ?? post.cid;
  return {
    sourceType:  'tweet',
    sourceId:    post.uri,
    sourceUrl:   `https://bsky.app/profile/${handle}/post/${postId}`,
    title:       post.record.text.slice(0, 140),
    authors:     [post.author.displayName ?? handle],
    publishedAt: new Date(post.record.createdAt),
    rawText:     post.record.text,
    contentHash: buildSocialContentHash('bluesky', post.uri),
  };
}

export function normalizeHNItem(item: RawHNItem): {
  sourceType: ContentSourceType; sourceId: string; sourceUrl: string;
  title: string; authors: string[]; publishedAt: Date; rawText: string; contentHash: string;
} {
  return {
    sourceType:  'tweet',
    sourceId:    `hn:${item.objectID}`,
    sourceUrl:   item.url ?? `https://news.ycombinator.com/item?id=${item.objectID}`,
    title:       item.title,
    authors:     [item.author],
    publishedAt: new Date(item.created_at),
    rawText:     `${item.title}. Points: ${item.points}. Comments: ${item.num_comments}.`,
    contentHash: buildSocialContentHash('hn', item.objectID),
  };
}

async function persistItem(
  normalized: ReturnType<typeof normalizeBlueskyPost>,
): Promise<boolean> {
  const existing = await db.query.processingRegistry.findFirst({
    where: and(
      eq(processingRegistry.sourceType, normalized.sourceType),
      eq(processingRegistry.sourceId, normalized.sourceId),
    ),
  });
  if (existing) return false;

  const [inserted] = await db
    .insert(contentItems)
    .values({ ...normalized, processingStatus: 'harvested' })
    .onConflictDoNothing()
    .returning();
  if (!inserted) return false;

  const emptyStage = { done: false, at: new Date().toISOString() };
  const stages: RegistryStages = {
    harvested:    { done: true, at: new Date().toISOString() },
    classified:   emptyStage, infographic: emptyStage, summary: emptyStage,
    podcast:      emptyStage, criticScored: emptyStage, justified: emptyStage,
  };
  await db.insert(processingRegistry).values({
    sourceType:    normalized.sourceType,
    sourceId:      normalized.sourceId,
    contentHash:   normalized.contentHash,
    contentItemId: inserted.id,
    stages,
  }).onConflictDoNothing();
  return true;
}

const BLUESKY_AI_QUERIES = ['large language model', 'machine learning', 'AI research', 'neural network'];

export async function harvestBluesky(): Promise<number> {
  logger.info('Starting Bluesky harvest');
  let harvested = 0;

  for (const query of BLUESKY_AI_QUERIES) {
    try {
      const posts = await pRetry(
        async () => {
          const url = `${BLUESKY_API_BASE}/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=25`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Bluesky API returned ${res.status}`);
          const data = await res.json() as { posts: RawBlueskyPost[] };
          return data.posts ?? [];
        },
        { retries: 2, minTimeout: SOCIAL_RATE_LIMIT_MS },
      );

      for (const post of posts) {
        try {
          const ok = await persistItem(normalizeBlueskyPost(post));
          if (ok) harvested++;
        } catch (err) {
          logger.error({ uri: post.uri, err }, 'Failed to insert Bluesky post');
        }
      }
      await new Promise((r) => setTimeout(r, SOCIAL_RATE_LIMIT_MS));
    } catch (err) {
      logger.error({ query, err }, 'Bluesky search failed, continuing');
    }
  }

  logger.info({ harvested }, 'Bluesky harvest complete');
  return harvested;
}

export async function harvestHackerNews(): Promise<number> {
  logger.info('Starting HN harvest');
  let harvested = 0;

  const queries = ['machine+learning', 'large+language+model', 'AI+research'];
  for (const query of queries) {
    try {
      const items = await pRetry(
        async () => {
          const url = `${HN_API_BASE}/search?query=${query}&tags=story&hitsPerPage=20`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HN API returned ${res.status}`);
          const data = await res.json() as { hits: RawHNItem[] };
          return data.hits ?? [];
        },
        { retries: 2, minTimeout: SOCIAL_RATE_LIMIT_MS },
      );

      for (const item of items) {
        try {
          const ok = await persistItem(normalizeHNItem(item));
          if (ok) harvested++;
        } catch (err) {
          logger.error({ id: item.objectID, err }, 'Failed to insert HN item');
        }
      }
    } catch (err) {
      logger.error({ query, err }, 'HN search failed, continuing');
    }
  }

  logger.info({ harvested }, 'HN harvest complete');
  return harvested;
}

export async function harvestSocial(): Promise<number> {
  const [bluesky, hn] = await Promise.allSettled([harvestBluesky(), harvestHackerNews()]);
  const total =
    (bluesky.status === 'fulfilled' ? bluesky.value : 0) +
    (hn.status === 'fulfilled' ? hn.value : 0);
  logger.info({ total }, 'Social harvest complete');
  return total;
}
