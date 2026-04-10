import { createHash } from 'crypto';
import { parseStringPromise } from 'xml2js';
import pRetry from 'p-retry';
import { db } from '@/server/db';
import { contentItems, processingRegistry } from '@/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { BLOG_FEED_URLS, SOCIAL_RATE_LIMIT_MS } from '@/lib/constants';
import type { ContentSourceType, RegistryStages } from '@/types/content';
import { pino } from 'pino';

const logger = pino({ name: 'blog-harvester' });

export interface RawBlogItem {
  title:             string[];
  link:              string[];
  description:       string[];
  pubDate:           string[];
  'content:encoded': string[];
}

export function buildBlogContentHash(feedUrl: string, title: string): string {
  return createHash('sha256').update(`blog:${feedUrl}:${title}`).digest('hex');
}

export function normalizeBlogItem(
  item: RawBlogItem,
  feedUrl: string,
): {
  sourceType:  ContentSourceType;
  sourceId:    string;
  sourceUrl:   string;
  title:       string;
  publishedAt: Date;
  rawText:     string;
  contentHash: string;
} {
  const title      = (item.title[0] ?? '').replace(/\s+/g, ' ').trim();
  const sourceUrl  = item.link[0]?.trim() ?? feedUrl;
  const rawContent = item['content:encoded']?.[0] ?? item.description?.[0] ?? '';
  const rawText    = rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const pubDate    = item.pubDate?.[0] ? new Date(item.pubDate[0]) : new Date();
  const contentHash = buildBlogContentHash(feedUrl, title);

  return {
    sourceType:  'blog',
    sourceId:    sourceUrl,
    sourceUrl,
    title,
    publishedAt: isNaN(pubDate.getTime()) ? new Date() : pubDate,
    rawText,
    contentHash,
  };
}

async function fetchFeed(url: string): Promise<string> {
  return pRetry(
    async () => {
      const res = await fetch(url, { headers: { 'User-Agent': 'AIPulse/1.0' } });
      if (!res.ok) throw new Error(`Blog feed ${url} returned ${res.status}`);
      return res.text();
    },
    { retries: 2, minTimeout: 1000 },
  );
}

export async function harvestBlogFeed(feedUrl: string): Promise<number> {
  logger.info({ feedUrl }, 'Starting blog feed harvest');
  let harvested = 0;

  const xml    = await fetchFeed(feedUrl);
  const parsed = await parseStringPromise(xml);
  const channel = parsed?.rss?.channel?.[0] ?? parsed?.feed;
  if (!channel) { logger.warn({ feedUrl }, 'No channel found in feed'); return 0; }

  const items: RawBlogItem[] = (channel.item ?? channel.entry ?? []) as RawBlogItem[];
  logger.info({ feedUrl, count: items.length }, 'Parsed blog items');

  for (const item of items.slice(0, 20)) {
    try {
      const normalized = normalizeBlogItem(item, feedUrl);
      if (!normalized.title) continue;

      const existing = await db.query.processingRegistry.findFirst({
        where: and(
          eq(processingRegistry.sourceType, 'blog'),
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
        classified:   emptyStage, infographic: emptyStage, summary: emptyStage,
        podcast:      emptyStage, criticScored: emptyStage, justified: emptyStage,
      };
      await db.insert(processingRegistry).values({
        sourceType: 'blog', sourceId: normalized.sourceId,
        contentHash: normalized.contentHash, contentItemId: inserted.id, stages,
      }).onConflictDoNothing();

      harvested++;
      await new Promise((r) => setTimeout(r, SOCIAL_RATE_LIMIT_MS));
    } catch (err) {
      logger.error({ feedUrl, err }, 'Failed to insert blog item');
    }
  }

  logger.info({ feedUrl, harvested }, 'Blog feed harvest complete');
  return harvested;
}

export async function harvestAllBlogs(): Promise<number> {
  let total = 0;
  for (const url of BLOG_FEED_URLS) {
    try { total += await harvestBlogFeed(url); } catch (err) {
      logger.error({ url, err }, 'Blog feed failed, continuing');
    }
  }
  return total;
}
