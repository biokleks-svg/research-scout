# Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 new content harvesters (Blog, HuggingFace, Social, Video), a recommendation engine with personalized feed, feedback loop, digest composer, settings panel, admin dashboard, and podcast RSS feed.

**Architecture:** All new harvesters follow the paper harvester pattern (fetch → normalize → dedup via processingRegistry → insert contentItem). The recommendation engine runs as a BullMQ intelligence job, uses pgvector ANN to find candidates from user interest embedding, scores by relevance/quality/freshness/trend, and serves results via an updated `feed.getPersonalized` tRPC procedure. UI additions (settings, admin, digest) are Next.js server components reading pre-computed data from PostgreSQL.

**Tech Stack:** TypeScript, Next.js 15 App Router, tRPC v11, Drizzle ORM, BullMQ, PostgreSQL + pgvector, xml2js (already installed), Gemini embeddings, Vitest.

---

## File Map

**New files — harvesters:**
- `src/agents/harvesters/blog.ts` — RSS/Atom blog watcher
- `src/agents/harvesters/huggingface.ts` — HuggingFace Hub trending models
- `src/agents/harvesters/social.ts` — Bluesky (AT Protocol) + Hacker News (Algolia)
- `src/agents/harvesters/video.ts` — YouTube Data API v3
- `src/agents/harvesters/__tests__/blog.test.ts`
- `src/agents/harvesters/__tests__/huggingface.test.ts`
- `src/agents/harvesters/__tests__/social.test.ts`
- `src/agents/harvesters/__tests__/video.test.ts`

**New files — intelligence:**
- `src/agents/intelligence/rec-engine.ts` — recommendation engine
- `src/agents/intelligence/digest-composer.ts` — weekly digest
- `src/agents/intelligence/__tests__/rec-engine.test.ts`
- `src/agents/intelligence/__tests__/digest-composer.test.ts`

**New files — API/UI:**
- `src/server/routers/feedback.ts` — feedback tRPC router
- `src/server/routers/settings.ts` — settings tRPC router
- `src/components/content/FeedbackBar.tsx` — thumbs up/down/save UI
- `src/app/digest/page.tsx` — in-app digest view
- `src/app/settings/page.tsx` — settings panel
- `src/app/admin/page.tsx` — admin dashboard
- `src/app/api/podcast/rss/route.ts` — podcast RSS feed

**Modified files:**
- `src/lib/constants.ts` — add HF, YouTube, Bluesky, rec engine constants
- `src/workers/harvest.ts` — add cases for blog/huggingface/social/video
- `src/workers/intelligence.ts` — wire rec engine + digest composer
- `src/workers/__tests__/harvest.test.ts` — extend with new harvest types
- `src/scheduler.ts` — add crons for new harvesters
- `src/server/routers/_app.ts` — register feedback + settings routers
- `src/server/routers/feed.ts` — use rec engine for authenticated users
- `src/app/paper/[id]/page.tsx` — add FeedbackBar

---

### Task 1: Constants for new harvesters + rec engine

**Files:**
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Write the failing test**

File: `src/lib/__tests__/constants.test.ts` — add to existing test file:

```typescript
it('has HF_API_BASE', () => {
  expect(HF_API_BASE).toBe('https://huggingface.co/api');
});
it('has BLUESKY_API_BASE', () => {
  expect(BLUESKY_API_BASE).toBe('https://public.api.bsky.app');
});
it('has HN_API_BASE', () => {
  expect(HN_API_BASE).toBe('https://hn.algolia.com/api/v1');
});
it('has REC_ENGINE_WINDOW_DAYS', () => {
  expect(REC_ENGINE_WINDOW_DAYS).toBe(21);
});
it('has REC_ENGINE_CANDIDATE_LIMIT', () => {
  expect(REC_ENGINE_CANDIDATE_LIMIT).toBe(200);
});
it('has REC_ENGINE_OUTPUT_LIMIT', () => {
  expect(REC_ENGINE_OUTPUT_LIMIT).toBe(20);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/__tests__/constants.test.ts`
Expected: FAIL with "HF_API_BASE is not defined"

- [ ] **Step 3: Add constants to `src/lib/constants.ts`**

Append to the end of the file:

```typescript
// New harvesters
export const HF_API_BASE        = 'https://huggingface.co/api';
export const YOUTUBE_API_BASE   = 'https://www.googleapis.com/youtube/v3';
export const BLUESKY_API_BASE   = 'https://public.api.bsky.app';
export const HN_API_BASE        = 'https://hn.algolia.com/api/v1';
export const HF_RATE_LIMIT_MS   = 1000;
export const SOCIAL_RATE_LIMIT_MS = 500;
export const YOUTUBE_RATE_LIMIT_MS = 100;

export const BLOG_FEED_URLS: string[] = [
  'https://openai.com/blog/rss.xml',
  'https://www.anthropic.com/blog/rss.xml',
  'https://deepmind.google/blog/rss/',
  'https://ai.meta.com/blog/rss/',
  'https://mistral.ai/news/rss.xml',
  'https://huggingface.co/blog/feed.xml',
  'https://www.deeplearning.ai/the-batch/rss/',
  'https://sebastianraschka.com/rss_feed.xml',
];

export const YOUTUBE_AI_CHANNELS: string[] = [
  'UCbmNph6atAoGfqLoCL_duAg', // Yannic Kilcher
  'UCbfYPyITQ-7l4upoX8nvctg', // Two Minute Papers
  'UCnUYZLuoy1rq1aVMwx4aTzw', // AI Explained
  'UCYO_jab_esuFRV4b17AJtAg', // 3Blue1Brown
];

// Recommendation engine
export const REC_ENGINE_WINDOW_DAYS    = 21;
export const REC_ENGINE_CANDIDATE_LIMIT = 200;
export const REC_ENGINE_OUTPUT_LIMIT   = 20;

// Scoring weights for recommendation engine
export const REC_WEIGHT_RELEVANCE  = 0.40;
export const REC_WEIGHT_QUALITY    = 0.30;
export const REC_WEIGHT_FRESHNESS  = 0.20;
export const REC_WEIGHT_TREND      = 0.10;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/__tests__/constants.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/constants.ts src/lib/__tests__/constants.test.ts
git commit -m "feat(phase-4): add constants for new harvesters and rec engine"
```

---

### Task 2: Blog Watcher harvester (RSS/Atom)

**Files:**
- Create: `src/agents/harvesters/blog.ts`
- Create: `src/agents/harvesters/__tests__/blog.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/agents/harvesters/__tests__/blog.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildBlogContentHash, normalizeBlogItem, type RawBlogItem } from '../blog';

describe('buildBlogContentHash', () => {
  it('produces stable sha256 hex from feedUrl + title', () => {
    const h1 = buildBlogContentHash('https://openai.com/blog/rss.xml', 'GPT-5 is here');
    const h2 = buildBlogContentHash('https://openai.com/blog/rss.xml', 'GPT-5 is here');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('differs for different titles', () => {
    const h1 = buildBlogContentHash('https://x.com', 'A');
    const h2 = buildBlogContentHash('https://x.com', 'B');
    expect(h1).not.toBe(h2);
  });
});

describe('normalizeBlogItem', () => {
  const item: RawBlogItem = {
    title: ['  Scaling Laws  '],
    link:  ['https://openai.com/blog/scaling'],
    description: ['Short description'],
    pubDate: ['Mon, 01 Jan 2024 00:00:00 GMT'],
    'content:encoded': [],
  };

  it('trims title', () => {
    const r = normalizeBlogItem(item, 'https://openai.com/blog/rss.xml');
    expect(r.title).toBe('Scaling Laws');
  });

  it('uses link as sourceUrl and sourceId', () => {
    const r = normalizeBlogItem(item, 'https://openai.com/blog/rss.xml');
    expect(r.sourceUrl).toBe('https://openai.com/blog/scaling');
    expect(r.sourceId).toBe('https://openai.com/blog/scaling');
  });

  it('returns sourceType blog', () => {
    const r = normalizeBlogItem(item, 'https://openai.com/blog/rss.xml');
    expect(r.sourceType).toBe('blog');
  });

  it('falls back to description when content:encoded is empty', () => {
    const r = normalizeBlogItem(item, 'https://openai.com/blog/rss.xml');
    expect(r.rawText).toBe('Short description');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/agents/harvesters/__tests__/blog.test.ts`
Expected: FAIL with "Cannot find module '../blog'"

- [ ] **Step 3: Implement `src/agents/harvesters/blog.ts`**

```typescript
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
  title:              string[];
  link:               string[];
  description:        string[];
  pubDate:            string[];
  'content:encoded':  string[];
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
  // Strip HTML tags
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
      const res = await fetch(url, { headers: { 'User-Agent': 'AIPulse/1.0 (+https://aipulse.app)' } });
      if (!res.ok) throw new Error(`Blog feed ${url} returned ${res.status}`);
      return res.text();
    },
    { retries: 2, minTimeout: 1000 },
  );
}

export async function harvestBlogFeed(feedUrl: string): Promise<number> {
  logger.info({ feedUrl }, 'Starting blog feed harvest');
  let harvested = 0;

  const xml     = await fetchFeed(feedUrl);
  const parsed  = await parseStringPromise(xml);
  const channel = parsed?.rss?.channel?.[0] ?? parsed?.feed;
  if (!channel) { logger.warn({ feedUrl }, 'No channel found in feed'); return 0; }

  // RSS 2.0 items or Atom entries
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/agents/harvesters/__tests__/blog.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/agents/harvesters/blog.ts src/agents/harvesters/__tests__/blog.test.ts
git commit -m "feat(harvester): add Blog Watcher with RSS/Atom parsing"
```

---

### Task 3: HuggingFace Tracker harvester

**Files:**
- Create: `src/agents/harvesters/huggingface.ts`
- Create: `src/agents/harvesters/__tests__/huggingface.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/agents/harvesters/__tests__/huggingface.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildHFContentHash, normalizeHFModel, type RawHFModel } from '../huggingface';

describe('buildHFContentHash', () => {
  it('returns stable 64-char hex', () => {
    const h = buildHFContentHash('mistralai/Mistral-7B-v0.1');
    expect(h).toHaveLength(64);
    expect(buildHFContentHash('mistralai/Mistral-7B-v0.1')).toBe(h);
  });
});

describe('normalizeHFModel', () => {
  const model: RawHFModel = {
    id:        'mistralai/Mistral-7B-v0.1',
    modelId:   'mistralai/Mistral-7B-v0.1',
    downloads: 1_500_000,
    likes:     3400,
    createdAt: '2023-09-27T00:00:00.000Z',
    tags:      ['transformers', 'pytorch', 'text-generation'],
  };

  it('sets sourceType to model', () => {
    expect(normalizeHFModel(model).sourceType).toBe('model');
  });

  it('sets sourceId to model id', () => {
    expect(normalizeHFModel(model).sourceId).toBe('mistralai/Mistral-7B-v0.1');
  });

  it('includes download count in rawText', () => {
    expect(normalizeHFModel(model).rawText).toContain('1500000');
  });

  it('uses downloads as citationCount proxy', () => {
    expect(normalizeHFModel(model).citationCount).toBe(1_500_000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/agents/harvesters/__tests__/huggingface.test.ts`
Expected: FAIL with "Cannot find module '../huggingface'"

- [ ] **Step 3: Implement `src/agents/harvesters/huggingface.ts`**

```typescript
import { createHash } from 'crypto';
import pRetry from 'p-retry';
import { db } from '@/server/db';
import { contentItems, processingRegistry } from '@/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { HF_API_BASE, HF_RATE_LIMIT_MS } from '@/lib/constants';
import type { ContentSourceType, RegistryStages } from '@/types/content';
import { pino } from 'pino';

const logger = pino({ name: 'hf-harvester' });

export interface RawHFModel {
  id:        string;
  modelId:   string;
  downloads: number;
  likes:     number;
  createdAt: string;
  tags:      string[];
}

export function buildHFContentHash(modelId: string): string {
  return createHash('sha256').update(`hf:${modelId}`).digest('hex');
}

export function normalizeHFModel(model: RawHFModel): {
  sourceType:   ContentSourceType;
  sourceId:     string;
  sourceUrl:    string;
  title:        string;
  publishedAt:  Date;
  rawText:      string;
  contentHash:  string;
  citationCount: number;
} {
  const modelId = model.modelId ?? model.id;
  return {
    sourceType:   'model',
    sourceId:     modelId,
    sourceUrl:    `https://huggingface.co/${modelId}`,
    title:        modelId,
    publishedAt:  new Date(model.createdAt),
    rawText:      `HuggingFace model: ${modelId}. Downloads: ${model.downloads}. Likes: ${model.likes}. Tags: ${model.tags.join(', ')}.`,
    contentHash:  buildHFContentHash(modelId),
    citationCount: model.downloads,
  };
}

export async function harvestHuggingFace(limit = 20): Promise<number> {
  logger.info({ limit }, 'Starting HuggingFace harvest');
  let harvested = 0;

  const hfToken = process.env.HUGGINGFACE_TOKEN;
  const headers: Record<string, string> = hfToken
    ? { Authorization: `Bearer ${hfToken}` }
    : {};

  const models = await pRetry(
    async () => {
      const url = `${HF_API_BASE}/models?sort=trending&limit=${limit}&full=true`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HF API returned ${res.status}`);
      return (await res.json()) as RawHFModel[];
    },
    { retries: 2, minTimeout: HF_RATE_LIMIT_MS },
  );

  for (const model of models) {
    try {
      const normalized = normalizeHFModel(model);
      const existing = await db.query.processingRegistry.findFirst({
        where: and(
          eq(processingRegistry.sourceType, 'model'),
          eq(processingRegistry.sourceId, normalized.sourceId),
        ),
      });
      if (existing) continue;

      const [inserted] = await db
        .insert(contentItems)
        .values({
          sourceType:    normalized.sourceType,
          sourceId:      normalized.sourceId,
          sourceUrl:     normalized.sourceUrl,
          title:         normalized.title,
          publishedAt:   normalized.publishedAt,
          rawText:       normalized.rawText,
          contentHash:   normalized.contentHash,
          citationCount: normalized.citationCount,
          processingStatus: 'harvested',
        })
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
        sourceType: 'model', sourceId: normalized.sourceId,
        contentHash: normalized.contentHash, contentItemId: inserted.id, stages,
      }).onConflictDoNothing();

      harvested++;
      await new Promise((r) => setTimeout(r, HF_RATE_LIMIT_MS));
    } catch (err) {
      logger.error({ modelId: model.modelId, err }, 'Failed to insert HF model');
    }
  }

  logger.info({ harvested }, 'HuggingFace harvest complete');
  return harvested;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/agents/harvesters/__tests__/huggingface.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/agents/harvesters/huggingface.ts src/agents/harvesters/__tests__/huggingface.test.ts
git commit -m "feat(harvester): add HuggingFace Tracker using HF Hub API"
```

---

### Task 4: Social Harvester (Bluesky + Hacker News)

**Files:**
- Create: `src/agents/harvesters/social.ts`
- Create: `src/agents/harvesters/__tests__/social.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/agents/harvesters/__tests__/social.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildSocialContentHash, normalizeBlueskyPost, normalizeHNItem } from '../social';
import type { RawBlueskyPost, RawHNItem } from '../social';

describe('buildSocialContentHash', () => {
  it('produces a stable hash', () => {
    const h = buildSocialContentHash('bluesky', 'at://abc/123');
    expect(h).toHaveLength(64);
    expect(buildSocialContentHash('bluesky', 'at://abc/123')).toBe(h);
  });
});

describe('normalizeBlueskyPost', () => {
  const post: RawBlueskyPost = {
    uri:    'at://did:plc:abc123/app.bsky.feed.post/xyz',
    cid:    'bafyabc',
    author: { handle: 'karpathy.bsky.social', displayName: 'Andrej Karpathy' },
    record: { text: 'Excited about this new LLM paper!', createdAt: '2024-01-15T12:00:00.000Z' },
    likeCount:   200,
    repostCount: 50,
  };

  it('sets sourceType to tweet', () => {
    expect(normalizeBlueskyPost(post).sourceType).toBe('tweet');
  });

  it('uses uri as sourceId', () => {
    expect(normalizeBlueskyPost(post).sourceId).toBe(post.uri);
  });

  it('puts post text in rawText', () => {
    expect(normalizeBlueskyPost(post).rawText).toContain('Excited about this new LLM paper!');
  });
});

describe('normalizeHNItem', () => {
  const item: RawHNItem = {
    objectID: '39264' ,
    title:    'Show HN: Open-source LLM fine-tuning',
    url:      'https://github.com/example/llm-tuning',
    author:   'pg',
    created_at: '2024-01-15T10:00:00.000Z',
    points:   300,
    num_comments: 45,
  };

  it('sets sourceType to tweet', () => {
    expect(normalizeHNItem(item).sourceType).toBe('tweet');
  });

  it('uses objectID as sourceId', () => {
    expect(normalizeHNItem(item).sourceId).toBe('hn:39264');
  });

  it('includes title in rawText', () => {
    expect(normalizeHNItem(item).rawText).toContain('Show HN: Open-source LLM fine-tuning');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/agents/harvesters/__tests__/social.test.ts`
Expected: FAIL with "Cannot find module '../social'"

- [ ] **Step 3: Implement `src/agents/harvesters/social.ts`**

```typescript
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
  const handle  = post.author.handle;
  const postId  = post.uri.split('/').pop() ?? post.cid;
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
    sourceType: normalized.sourceType, sourceId: normalized.sourceId,
    contentHash: normalized.contentHash, contentItemId: inserted.id, stages,
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/agents/harvesters/__tests__/social.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/agents/harvesters/social.ts src/agents/harvesters/__tests__/social.test.ts
git commit -m "feat(harvester): add Social Harvester for Bluesky and Hacker News"
```

---

### Task 5: Video Harvester (YouTube Data API)

**Files:**
- Create: `src/agents/harvesters/video.ts`
- Create: `src/agents/harvesters/__tests__/video.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/agents/harvesters/__tests__/video.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildVideoContentHash, normalizeYouTubeVideo } from '../video';
import type { RawYouTubeVideo } from '../video';

describe('buildVideoContentHash', () => {
  it('returns stable 64-char hex', () => {
    const h = buildVideoContentHash('dQw4w9WgXcQ');
    expect(h).toHaveLength(64);
    expect(buildVideoContentHash('dQw4w9WgXcQ')).toBe(h);
  });
});

describe('normalizeYouTubeVideo', () => {
  const video: RawYouTubeVideo = {
    id:      { videoId: 'dQw4w9WgXcQ' },
    snippet: {
      title:       'Attention Is All You Need — Explained',
      description: 'Deep dive into the transformer architecture.',
      channelId:   'UCbmNph6atAoGfqLoCL_duAg',
      channelTitle: 'Yannic Kilcher',
      publishedAt: '2024-03-01T10:00:00Z',
    },
  };

  it('sets sourceType to video', () => {
    expect(normalizeYouTubeVideo(video).sourceType).toBe('video');
  });

  it('uses videoId as sourceId', () => {
    expect(normalizeYouTubeVideo(video).sourceId).toBe('dQw4w9WgXcQ');
  });

  it('sets YouTube watch URL', () => {
    expect(normalizeYouTubeVideo(video).sourceUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('includes description in rawText', () => {
    expect(normalizeYouTubeVideo(video).rawText).toContain('transformer architecture');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/agents/harvesters/__tests__/video.test.ts`
Expected: FAIL with "Cannot find module '../video'"

- [ ] **Step 3: Implement `src/agents/harvesters/video.ts`**

```typescript
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
  sourceType: ContentSourceType; sourceId: string; sourceUrl: string;
  title: string; authors: string[]; publishedAt: Date; rawText: string; contentHash: string;
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
            part: 'snippet', channelId, type: 'video',
            order: 'date', maxResults: String(maxResults),
            key: apiKey,
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
            harvested: { done: true, at: new Date().toISOString() },
            classified: emptyStage, infographic: emptyStage, summary: emptyStage,
            podcast: emptyStage, criticScored: emptyStage, justified: emptyStage,
          };
          await db.insert(processingRegistry).values({
            sourceType: 'video', sourceId: normalized.sourceId,
            contentHash: normalized.contentHash, contentItemId: inserted.id, stages,
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/agents/harvesters/__tests__/video.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/agents/harvesters/video.ts src/agents/harvesters/__tests__/video.test.ts
git commit -m "feat(harvester): add Video Harvester for YouTube Data API"
```

---

### Task 6: Wire new harvesters into worker + scheduler

**Files:**
- Modify: `src/workers/harvest.ts`
- Modify: `src/scheduler.ts`
- Create: `src/workers/__tests__/harvest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/workers/__tests__/harvest.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/agents/harvesters/paper', () => ({
  harvestArxiv: vi.fn().mockResolvedValue(5),
  enrichRecentPapers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/agents/harvesters/blog',        () => ({ harvestAllBlogs:    vi.fn().mockResolvedValue(3) }));
vi.mock('@/agents/harvesters/huggingface', () => ({ harvestHuggingFace: vi.fn().mockResolvedValue(2) }));
vi.mock('@/agents/harvesters/social',      () => ({ harvestSocial:      vi.fn().mockResolvedValue(4) }));
vi.mock('@/agents/harvesters/video',       () => ({ harvestYouTube:     vi.fn().mockResolvedValue(1) }));
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn() })),
}));
vi.mock('@/lib/queue', () => ({ getRedisConnection: vi.fn().mockReturnValue({}) }));

import { harvestJob } from '../harvest';
import { harvestAllBlogs } from '@/agents/harvesters/blog';
import { harvestHuggingFace } from '@/agents/harvesters/huggingface';
import { harvestSocial } from '@/agents/harvesters/social';
import { harvestYouTube } from '@/agents/harvesters/video';

describe('harvestJob', () => {
  it('calls harvestAllBlogs for blog type', async () => {
    await harvestJob('blog');
    expect(harvestAllBlogs).toHaveBeenCalled();
  });
  it('calls harvestHuggingFace for huggingface type', async () => {
    await harvestJob('huggingface');
    expect(harvestHuggingFace).toHaveBeenCalled();
  });
  it('calls harvestSocial for social type', async () => {
    await harvestJob('social');
    expect(harvestSocial).toHaveBeenCalled();
  });
  it('calls harvestYouTube for video type', async () => {
    await harvestJob('video');
    expect(harvestYouTube).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/workers/__tests__/harvest.test.ts`
Expected: FAIL with "harvestJob is not exported"

- [ ] **Step 3: Update `src/workers/harvest.ts`**

Replace the entire file:

```typescript
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
```

- [ ] **Step 4: Update `src/scheduler.ts`** — add crons for new harvesters

After the existing `*/30 * * * *` critic cron and before the trend crons, add:

```typescript
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
```

Also update the logger.info at the bottom to include the new crons:

```typescript
logger.info('Scheduler started. Paper: 2h. Classify: 15min. Critic: 30min. Blog/HF: 6h. Social: 2h. Video: 6h. Trend detection: 02:00 UTC. Narration: 03:00 UTC.');
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/workers/__tests__/harvest.test.ts`
Expected: PASS (4 tests)

Run: `pnpm test`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/workers/harvest.ts src/workers/__tests__/harvest.test.ts src/scheduler.ts
git commit -m "feat(worker): wire Blog/HF/Social/Video harvesters into harvest worker and scheduler"
```

---

### Task 7: Feedback tRPC router + FeedbackBar UI

**Files:**
- Create: `src/server/routers/feedback.ts`
- Create: `src/components/content/FeedbackBar.tsx`
- Modify: `src/server/routers/_app.ts`
- Modify: `src/app/paper/[id]/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/server/routers/__tests__/feedback.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
vi.mock('@/server/db', () => ({ db: { insert: mockInsert, query: { feedback: { findFirst: vi.fn().mockResolvedValue(null) } } } }));
vi.mock('@/server/db/schema', () => ({ feedback: 'feedback_table' }));

import { addFeedback, type FeedbackInput } from '../feedback';

describe('addFeedback', () => {
  it('validates feedbackType is one of the allowed values', () => {
    const valid: FeedbackInput = { contentId: 'abc', feedbackType: 'like', value: 1 };
    expect(() => { /* Zod parse happens inside — test via type */ }).not.toThrow();
  });
});
```

Actually, since the feedback router is straightforward tRPC + DB, write a simpler unit test for the pure `feedbackTypeValues` export instead:

```typescript
import { describe, it, expect } from 'vitest';
import { FEEDBACK_TYPES } from '../feedback';

describe('FEEDBACK_TYPES', () => {
  it('includes like, dislike, save, dismiss', () => {
    expect(FEEDBACK_TYPES).toContain('like');
    expect(FEEDBACK_TYPES).toContain('dislike');
    expect(FEEDBACK_TYPES).toContain('save');
    expect(FEEDBACK_TYPES).toContain('dismiss');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/routers/__tests__/feedback.test.ts`
Expected: FAIL with "Cannot find module '../feedback'"

- [ ] **Step 3: Create `src/server/routers/feedback.ts`**

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { feedback } from '../db/schema';
import { and, eq } from 'drizzle-orm';

export const FEEDBACK_TYPES = ['like', 'dislike', 'save', 'dismiss'] as const;

export type FeedbackInput = {
  contentId:    string;
  feedbackType: typeof FEEDBACK_TYPES[number];
  value?:       number;
};

export const feedbackRouter = router({
  add: protectedProcedure
    .input(z.object({
      contentId:    z.string().uuid(),
      feedbackType: z.enum(FEEDBACK_TYPES),
      value:        z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.insert(feedback).values({
        userId:       ctx.user.id,
        contentId:    input.contentId,
        feedbackType: input.feedbackType,
        value:        input.value ?? null,
      });
      return { ok: true };
    }),

  getForItem: protectedProcedure
    .input(z.object({ contentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await db.query.feedback.findMany
        ? (await db.select().from(feedback).where(
            and(eq(feedback.userId, ctx.user.id), eq(feedback.contentId, input.contentId))
          ))
        : [];
      return rows;
    }),
});
```

- [ ] **Step 4: Register in `src/server/routers/_app.ts`**

```typescript
import { router } from '../trpc';
import { feedRouter }     from './feed';
import { podcastRouter }  from './podcast';
import { userRouter }     from './user';
import { trendsRouter }   from './trends';
import { contentRouter }  from './content';
import { feedbackRouter } from './feedback';
import { settingsRouter } from './settings';

export const appRouter = router({
  feed:     feedRouter,
  podcast:  podcastRouter,
  user:     userRouter,
  trends:   trendsRouter,
  content:  contentRouter,
  feedback: feedbackRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
```

Note: `settingsRouter` will be created in Task 11. For now, create a stub at `src/server/routers/settings.ts`:

```typescript
import { router } from '../trpc';
export const settingsRouter = router({});
```

- [ ] **Step 5: Create `src/components/content/FeedbackBar.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';

interface Props {
  contentId: string;
}

export function FeedbackBar({ contentId }: Props) {
  const [given, setGiven] = useState<string | null>(null);
  const { mutate: addFeedback } = trpc.feedback.add.useMutation();

  function handleFeedback(type: 'like' | 'dislike' | 'save' | 'dismiss') {
    if (given === type) return;
    addFeedback({ contentId, feedbackType: type });
    setGiven(type);
  }

  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-xs text-muted-foreground">Was this useful?</span>
      {([
        { type: 'like',    label: '👍' },
        { type: 'dislike', label: '👎' },
        { type: 'save',    label: '🔖 Save' },
        { type: 'dismiss', label: '✕' },
      ] as const).map(({ type, label }) => (
        <button
          key={type}
          onClick={() => handleFeedback(type)}
          className={`text-sm px-2 py-1 rounded transition-colors ${
            given === type
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Add FeedbackBar to `src/app/paper/[id]/page.tsx`**

Add import at the top:
```typescript
import { FeedbackBar } from '@/components/content/FeedbackBar';
```

Add inside the `<main>` after the source link section (around line 73), but only when user context is available. Since the paper page is a server component and FeedbackBar is a client component requiring auth, render it conditionally. The simplest approach — just render it always (it will silently fail for unauthenticated users since the mutation requires a session):

After the `<div className="flex gap-3 items-center">` block (around line 73):
```tsx
<FeedbackBar contentId={item.id} />
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test src/server/routers/__tests__/feedback.test.ts`
Expected: PASS (1 test)

Run: `pnpm test`
Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/server/routers/feedback.ts src/server/routers/settings.ts src/server/routers/_app.ts src/components/content/FeedbackBar.tsx src/app/paper/[id]/page.tsx src/server/routers/__tests__/feedback.test.ts
git commit -m "feat(feedback): add feedback tRPC router, FeedbackBar UI, and settings stub"
```

---

### Task 8: Recommendation Engine

**Files:**
- Create: `src/agents/intelligence/rec-engine.ts`
- Create: `src/agents/intelligence/__tests__/rec-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/agents/intelligence/__tests__/rec-engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeFreshnessScore, scoreCandidate } from '../rec-engine';

describe('computeFreshnessScore', () => {
  it('returns 1.0 for a just-published item', () => {
    const score = computeFreshnessScore(new Date());
    expect(score).toBeCloseTo(1.0, 1);
  });

  it('returns ~0.37 for an item published 7 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const score = computeFreshnessScore(d);
    expect(score).toBeCloseTo(0.368, 1); // e^(-1) ≈ 0.368
  });

  it('returns lower score for older items', () => {
    const recent = new Date();
    const old    = new Date();
    old.setDate(old.getDate() - 30);
    expect(computeFreshnessScore(recent)).toBeGreaterThan(computeFreshnessScore(old));
  });
});

describe('scoreCandidate', () => {
  it('returns a number between 0 and 1', () => {
    const score = scoreCandidate({
      similarity:    0.85,
      globalQuality: 75,
      publishedAt:   new Date(),
      trendIdsCount: 2,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('scores higher-relevance items above lower ones', () => {
    const base = { globalQuality: 50, publishedAt: new Date(), trendIdsCount: 0 };
    const highRel = scoreCandidate({ ...base, similarity: 0.9 });
    const lowRel  = scoreCandidate({ ...base, similarity: 0.3 });
    expect(highRel).toBeGreaterThan(lowRel);
  });

  it('scores higher-quality items above lower ones at same relevance', () => {
    const base = { similarity: 0.7, publishedAt: new Date(), trendIdsCount: 0 };
    const highQ = scoreCandidate({ ...base, globalQuality: 90 });
    const lowQ  = scoreCandidate({ ...base, globalQuality: 10 });
    expect(highQ).toBeGreaterThan(lowQ);
  });

  it('scores trending items above non-trending at same relevance + quality', () => {
    const base = { similarity: 0.7, globalQuality: 60, publishedAt: new Date() };
    const trending    = scoreCandidate({ ...base, trendIdsCount: 3 });
    const nonTrending = scoreCandidate({ ...base, trendIdsCount: 0 });
    expect(trending).toBeGreaterThan(nonTrending);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/agents/intelligence/__tests__/rec-engine.test.ts`
Expected: FAIL with "Cannot find module '../rec-engine'"

- [ ] **Step 3: Implement `src/agents/intelligence/rec-engine.ts`**

```typescript
import { db } from '@/server/db';
import { contentItems, users } from '@/server/db/schema';
import { eq, sql, and, gt, isNotNull } from 'drizzle-orm';
import {
  REC_ENGINE_WINDOW_DAYS, REC_ENGINE_CANDIDATE_LIMIT, REC_ENGINE_OUTPUT_LIMIT,
  REC_WEIGHT_RELEVANCE, REC_WEIGHT_QUALITY, REC_WEIGHT_FRESHNESS, REC_WEIGHT_TREND,
} from '@/lib/constants';
import { pino } from 'pino';

const logger = pino({ name: 'rec-engine' });

export function computeFreshnessScore(publishedAt: Date): number {
  const daysSince = (Date.now() - publishedAt.getTime()) / 86400000;
  return Math.exp(-daysSince / 7); // half-life ≈ 7 days
}

export function scoreCandidate(candidate: {
  similarity:    number; // cosine similarity 0-1
  globalQuality: number; // 0-100 scale
  publishedAt:   Date;
  trendIdsCount: number;
}): number {
  const relevance      = Math.max(0, Math.min(1, candidate.similarity));
  const quality        = Math.max(0, Math.min(100, candidate.globalQuality)) / 100;
  const freshness      = computeFreshnessScore(candidate.publishedAt);
  const trendAlignment = Math.min(1, candidate.trendIdsCount / 3);

  return (
    relevance      * REC_WEIGHT_RELEVANCE  +
    quality        * REC_WEIGHT_QUALITY    +
    freshness      * REC_WEIGHT_FRESHNESS  +
    trendAlignment * REC_WEIGHT_TREND
  );
}

interface RecommendedItem {
  id:            string;
  title:         string;
  sourceType:    string;
  sourceUrl:     string;
  publishedAt:   Date;
  globalQuality: number;
  summary:       unknown;
  infographicUrl: string | null;
  taxonomy:      unknown;
  difficultyLevel: string | null;
  citationCount:  number;
  podcastUrl:    string | null;
  podcastStatus: string | null;
  score:         number;
}

/**
 * Build a ranked list of recommendations for a user.
 * Falls back to quality-sorted global feed if user has no interest embedding.
 */
export async function buildRecommendations(userId: string, limit = REC_ENGINE_OUTPUT_LIMIT): Promise<RecommendedItem[]> {
  logger.info({ userId }, 'Building recommendations');

  const [user] = await db
    .select({ interestEmbedding: users.interestEmbedding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - REC_ENGINE_WINDOW_DAYS);

  // No embedding → return top quality items in window
  if (!user?.interestEmbedding) {
    logger.info({ userId }, 'No interest embedding — returning quality-sorted fallback');
    return db.query.contentItems.findMany({
      where: and(
        gt(contentItems.publishedAt, windowStart),
        isNotNull(contentItems.criticScores),
      ),
      orderBy: (t, { desc }) => [desc(t.globalQuality)],
      limit,
      columns: {
        id: true, title: true, sourceType: true, sourceUrl: true, publishedAt: true,
        globalQuality: true, summary: true, infographicUrl: true, taxonomy: true,
        difficultyLevel: true, citationCount: true, podcastUrl: true, podcastStatus: true,
      },
    }).then(rows => rows.map(r => ({ ...r, score: r.globalQuality / 100 })));
  }

  // pgvector ANN: find most similar items to user's interest embedding
  const embeddingLiteral = `[${(user.interestEmbedding as number[]).join(',')}]`;
  const rows = await db.execute(sql`
    SELECT
      id, title, source_type AS "sourceType", source_url AS "sourceUrl",
      published_at AS "publishedAt", global_quality AS "globalQuality",
      summary, infographic_url AS "infographicUrl", taxonomy, difficulty_level AS "difficultyLevel",
      citation_count AS "citationCount", podcast_url AS "podcastUrl", podcast_status AS "podcastStatus",
      trend_ids AS "trendIds",
      1 - (embedding <=> ${sql.raw(`'${embeddingLiteral}'::vector`)}::vector) AS similarity
    FROM content_items
    WHERE published_at > ${windowStart}
      AND embedding IS NOT NULL
      AND processing_status != 'duplicate'
    ORDER BY embedding <=> ${sql.raw(`'${embeddingLiteral}'::vector`)}::vector
    LIMIT ${REC_ENGINE_CANDIDATE_LIMIT}
  `);

  type Row = {
    id: string; title: string; sourceType: string; sourceUrl: string;
    publishedAt: Date; globalQuality: number; summary: unknown;
    infographicUrl: string | null; taxonomy: unknown; difficultyLevel: string | null;
    citationCount: number; podcastUrl: string | null; podcastStatus: string | null;
    trendIds: string[] | null; similarity: number;
  };

  const candidates = (rows as unknown as { rows: Row[] }).rows;

  const scored = candidates.map(r => ({
    ...r,
    score: scoreCandidate({
      similarity:    r.similarity,
      globalQuality: r.globalQuality,
      publishedAt:   new Date(r.publishedAt),
      trendIdsCount: r.trendIds?.length ?? 0,
    }),
  }));

  scored.sort((a, b) => b.score - a.score);
  logger.info({ userId, candidates: candidates.length, returning: limit }, 'Recommendations built');
  return scored.slice(0, limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/agents/intelligence/__tests__/rec-engine.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/agents/intelligence/rec-engine.ts src/agents/intelligence/__tests__/rec-engine.test.ts
git commit -m "feat(intelligence): add Recommendation Engine with pgvector ANN + 4-factor scoring"
```

---

### Task 9: Personalized feed via rec engine

**Files:**
- Modify: `src/server/routers/feed.ts`
- Modify: `src/workers/intelligence.ts`

- [ ] **Step 1: Write the failing test**

In `src/server/routers/__tests__/feed.test.ts` (read the existing file first, then add):

Add to the existing test file:
```typescript
// If there's a test for getPersonalized, check that it accepts an optional userId
it('getPersonalized returns items array', async () => {
  // existing test is sufficient — no new assertions needed here
  // The rec engine integration is tested via rec-engine.test.ts
  expect(true).toBe(true);
});
```

Actually, since the feed router is a tRPC procedure, the meaningful test is in rec-engine.test.ts. Just run all tests after modifying feed.ts.

- [ ] **Step 2: Update `src/server/routers/feed.ts`**

Replace the `getPersonalized` procedure with a version that uses the rec engine for authenticated users:

```typescript
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { db } from '../db';
import { contentItems } from '../db/schema';
import { desc, ne, and, lt } from 'drizzle-orm';
import { DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT } from '@/lib/constants';
import { buildRecommendations } from '@/agents/intelligence/rec-engine';

export const feedRouter = router({
  getPersonalized: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit:  z.number().min(1).max(MAX_FEED_LIMIT).default(DEFAULT_FEED_LIMIT),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Authenticated users with interest embeddings get personalized recommendations
      if (ctx.user) {
        try {
          const recs = await buildRecommendations(ctx.user.id, input.limit);
          if (recs.length > 0) {
            return { items: recs, nextCursor: undefined, hasMore: false, personalized: true };
          }
        } catch {
          // Fall through to global feed on rec engine failure
        }
      }

      // Global feed fallback (unauthenticated or no embedding yet)
      const baseWhere = ne(contentItems.processingStatus, 'duplicate');
      const cursorWhere = input.cursor
        ? and(baseWhere, lt(contentItems.publishedAt, new Date(input.cursor)))
        : baseWhere;

      const items = await db.query.contentItems.findMany({
        where: cursorWhere,
        orderBy: [desc(contentItems.publishedAt)],
        limit: input.limit + 1,
        columns: {
          id: true, sourceType: true, sourceUrl: true, title: true, authors: true,
          publishedAt: true, harvestedAt: true, taxonomy: true, difficultyLevel: true,
          processingStatus: true, citationCount: true, globalQuality: true,
          infographicUrl: true, summary: true, podcastUrl: true, podcastStatus: true,
        },
      });

      const hasMore   = items.length > input.limit;
      const data      = items.slice(0, input.limit);
      const nextCursor = hasMore ? data[data.length - 1]?.publishedAt.toISOString() : undefined;
      return { items: data, nextCursor, hasMore, personalized: false };
    }),

  getTrending: publicProcedure.query(async () => {
    const items = await db.query.contentItems.findMany({
      where: ne(contentItems.processingStatus, 'duplicate'),
      orderBy: [desc(contentItems.citationCount), desc(contentItems.publishedAt)],
      limit: 10,
      columns: {
        id: true, title: true, authors: true, publishedAt: true,
        citationCount: true, taxonomy: true, sourceUrl: true, sourceType: true,
      },
    });
    return items;
  }),
});
```

- [ ] **Step 3: Wire rec engine into intelligence worker**

In `src/workers/intelligence.ts`, replace the `build-recommendations` stub:

```typescript
import { buildRecommendations } from '@/agents/intelligence/rec-engine';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { isNotNull } from 'drizzle-orm';
```

Replace the `build-recommendations` case:
```typescript
case 'build-recommendations': {
  // Pre-warm recommendations for all users with interest embeddings
  const usersWithEmbeddings = await db.query.users.findMany({
    where: isNotNull(users.interestEmbedding),
    columns: { id: true },
  });
  for (const user of usersWithEmbeddings) {
    try {
      await buildRecommendations(user.id);
      logger.info({ userId: user.id }, 'Recommendations built');
    } catch (err) {
      logger.error({ userId: user.id, err }, 'Failed to build recommendations');
    }
  }
  return true;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/feed.ts src/workers/intelligence.ts
git commit -m "feat(feed): wire recommendation engine into personalized feed for authenticated users"
```

---

### Task 10: Digest Composer + /digest page

**Files:**
- Create: `src/agents/intelligence/digest-composer.ts`
- Create: `src/agents/intelligence/__tests__/digest-composer.test.ts`
- Create: `src/app/digest/page.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/agents/intelligence/__tests__/digest-composer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { groupByTopic, formatDigestItem, type DigestItem } from '../digest-composer';

describe('groupByTopic', () => {
  const items: DigestItem[] = [
    { id: '1', title: 'Paper A', sourceUrl: 'https://a.com', taxonomy: { primaryArea: 'NLP', subAreas: [], taskTypes: [], applicationDomains: [] }, score: 0.9, summary: null },
    { id: '2', title: 'Paper B', sourceUrl: 'https://b.com', taxonomy: { primaryArea: 'NLP', subAreas: [], taskTypes: [], applicationDomains: [] }, score: 0.8, summary: null },
    { id: '3', title: 'Model C', sourceUrl: 'https://c.com', taxonomy: { primaryArea: 'Computer Vision', subAreas: [], taskTypes: [], applicationDomains: [] }, score: 0.7, summary: null },
  ];

  it('groups by primaryArea', () => {
    const grouped = groupByTopic(items);
    expect(grouped.get('NLP')?.length).toBe(2);
    expect(grouped.get('Computer Vision')?.length).toBe(1);
  });

  it('falls back to General for items with no taxonomy', () => {
    const noTax: DigestItem = { id: '4', title: 'X', sourceUrl: 'x', taxonomy: null, score: 0.5, summary: null };
    const grouped = groupByTopic([noTax]);
    expect(grouped.has('General')).toBe(true);
  });
});

describe('formatDigestItem', () => {
  it('returns a string with the title', () => {
    const item: DigestItem = { id: '1', title: 'New Paper', sourceUrl: 'https://x.com', taxonomy: null, score: 0.8, summary: null };
    const formatted = formatDigestItem(item);
    expect(formatted).toContain('New Paper');
    expect(formatted).toContain('https://x.com');
  });

  it('includes tldr when summary is present', () => {
    const item: DigestItem = {
      id: '1', title: 'Paper', sourceUrl: 'https://x.com', taxonomy: null, score: 0.8,
      summary: { tldr: 'Short summary', problem: '', keyInsight: '', results: '', limitations: '', whyItMatters: '', practicalTakeaway: '', difficulty: 'intermediate', wordCount: 10 },
    };
    expect(formatDigestItem(item)).toContain('Short summary');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/agents/intelligence/__tests__/digest-composer.test.ts`
Expected: FAIL with "Cannot find module '../digest-composer'"

- [ ] **Step 3: Implement `src/agents/intelligence/digest-composer.ts`**

```typescript
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { isNotNull } from 'drizzle-orm';
import { buildRecommendations } from './rec-engine';
import type { TaxonomyTags, SummarySchema } from '@/types/content';
import { pino } from 'pino';

const logger = pino({ name: 'digest-composer' });

export interface DigestItem {
  id:       string;
  title:    string;
  sourceUrl: string;
  taxonomy: TaxonomyTags | null;
  score:    number;
  summary:  SummarySchema | null;
}

export function groupByTopic(items: DigestItem[]): Map<string, DigestItem[]> {
  const groups = new Map<string, DigestItem[]>();
  for (const item of items) {
    const topic = item.taxonomy?.primaryArea ?? 'General';
    if (!groups.has(topic)) groups.set(topic, []);
    groups.get(topic)!.push(item);
  }
  return groups;
}

export function formatDigestItem(item: DigestItem): string {
  const lines = [`• **${item.title}**`, `  ${item.sourceUrl}`];
  if (item.summary?.tldr) lines.push(`  > ${item.summary.tldr}`);
  return lines.join('\n');
}

export async function composeDigest(userId: string, limit = 10): Promise<string> {
  const recs = await buildRecommendations(userId, limit);
  const items: DigestItem[] = recs.map(r => ({
    id:       r.id,
    title:    r.title,
    sourceUrl: r.sourceUrl,
    taxonomy: r.taxonomy as TaxonomyTags | null,
    score:    r.score,
    summary:  r.summary as SummarySchema | null,
  }));

  if (items.length === 0) return 'No new content to digest. Check back tomorrow.';

  const grouped = groupByTopic(items);
  const sections: string[] = [`# Your AI Research Digest\n*${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}*\n`];

  for (const [topic, topicItems] of grouped) {
    sections.push(`## ${topic}\n`);
    for (const item of topicItems) sections.push(formatDigestItem(item));
    sections.push('');
  }

  return sections.join('\n');
}

export async function composeDigestForAllUsers(): Promise<void> {
  logger.info('Composing digests for all users');
  const usersWithEmbeddings = await db.query.users.findMany({
    where: isNotNull(users.interestEmbedding),
    columns: { id: true },
  });

  for (const user of usersWithEmbeddings) {
    try {
      await composeDigest(user.id);
      logger.info({ userId: user.id }, 'Digest composed');
    } catch (err) {
      logger.error({ userId: user.id, err }, 'Failed to compose digest');
    }
  }
}
```

- [ ] **Step 4: Wire into intelligence worker**

In `src/workers/intelligence.ts`, add the import and replace the stub:

Add import:
```typescript
import { composeDigestForAllUsers } from '@/agents/intelligence/digest-composer';
```

Replace `compose-digest` case:
```typescript
case 'compose-digest':
  await composeDigestForAllUsers();
  return true;
```

- [ ] **Step 5: Create `src/app/digest/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { lucia } from '@/lib/auth';
import { cookies } from 'next/headers';
import { composeDigest } from '@/agents/intelligence/digest-composer';

export const revalidate = 3600; // 1 hour

export default async function DigestPage() {
  const cookieStore = await cookies();
  const sessionId   = lucia.readSessionCookie(cookieStore.toString());
  if (!sessionId) redirect('/login');

  const { user } = await lucia.validateSession(sessionId);
  if (!user) redirect('/login');

  const digestMarkdown = await composeDigest(user.id, 10);

  return (
    <main className="max-w-3xl mx-auto py-10 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Your Daily Digest</h1>
      <div className="prose prose-sm max-w-none">
        {digestMarkdown.split('\n').map((line, i) => {
          if (line.startsWith('## '))   return <h2 key={i} className="text-lg font-semibold mt-6 mb-2">{line.slice(3)}</h2>;
          if (line.startsWith('# '))    return <h1 key={i} className="text-2xl font-bold mb-1">{line.slice(2)}</h1>;
          if (line.startsWith('*') && line.endsWith('*')) return <p key={i} className="text-sm text-muted-foreground mb-4">{line.slice(1, -1)}</p>;
          if (line.startsWith('• **'))  return <p key={i} className="font-medium text-sm mt-3">{line.slice(2)}</p>;
          if (line.startsWith('  > '))  return <p key={i} className="text-sm text-muted-foreground italic ml-4">{line.slice(4)}</p>;
          if (line.startsWith('  '))    return <a key={i} href={line.trim()} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline ml-4 block">{line.trim()}</a>;
          return line ? <p key={i} className="text-sm">{line}</p> : <br key={i} />;
        })}
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm test src/agents/intelligence/__tests__/digest-composer.test.ts`
Expected: PASS (4 tests)

Run: `pnpm test`
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/agents/intelligence/digest-composer.ts src/agents/intelligence/__tests__/digest-composer.test.ts src/app/digest/page.tsx src/workers/intelligence.ts
git commit -m "feat(intelligence): add Digest Composer and /digest page"
```

---

### Task 11: Settings Panel (tRPC router + UI)

**Files:**
- Modify: `src/server/routers/settings.ts` (replace the stub)
- Create: `src/app/settings/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/server/routers/__tests__/settings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSettingValue, serializeSettingValue } from '../settings';

describe('parseSettingValue', () => {
  it('returns the value as-is for primitives stored in JSONB', () => {
    expect(parseSettingValue(true)).toBe(true);
    expect(parseSettingValue(42)).toBe(42);
    expect(parseSettingValue('flash')).toBe('flash');
  });
});

describe('serializeSettingValue', () => {
  it('wraps value for JSONB storage (returns as-is, JSONB handles it)', () => {
    expect(serializeSettingValue(true)).toBe(true);
    expect(serializeSettingValue(100)).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/routers/__tests__/settings.test.ts`
Expected: FAIL

- [ ] **Step 3: Replace `src/server/routers/settings.ts` with full implementation**

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { systemSettings } from '../db/schema';
import { eq } from 'drizzle-orm';

export function parseSettingValue(value: unknown): unknown {
  return value;
}
export function serializeSettingValue(value: unknown): unknown {
  return value;
}

const ALLOWED_KEYS = [
  'pass1.infographic.enabled',
  'pass1.infographic.topNPercent',
  'pass1.infographic.model',
  'pass2.summary.enabled',
  'pass2.summary.model',
  'pass3.podcast.enabled',
  'pass3.podcast.autoGenerateTopN',
  'critic.enabled',
  'critic.model',
  'harvest.paper.frequency',
  'harvest.social.frequency',
  'harvest.blog.frequency',
  'rec.candidateWindowDays',
] as const;

type SettingKey = typeof ALLOWED_KEYS[number];

export const settingsRouter = router({
  getAll: protectedProcedure.query(async () => {
    const rows = await db.select().from(systemSettings);
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }),

  set: protectedProcedure
    .input(z.object({
      key:   z.enum(ALLOWED_KEYS),
      value: z.union([z.boolean(), z.number(), z.string()]),
    }))
    .mutation(async ({ ctx, input }) => {
      await db
        .insert(systemSettings)
        .values({ key: input.key, value: input.value, updatedBy: ctx.user.id })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: input.value, updatedAt: new Date(), updatedBy: ctx.user.id },
        });
      return { ok: true };
    }),
});
```

- [ ] **Step 4: Create `src/app/settings/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { lucia } from '@/lib/auth';
import { cookies } from 'next/headers';
import { db } from '@/server/db';
import { systemSettings } from '@/server/db/schema';
import { SettingsForm } from '@/components/settings/SettingsForm';

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const sessionId   = lucia.readSessionCookie(cookieStore.toString());
  if (!sessionId) redirect('/login');
  const { user } = await lucia.validateSession(sessionId);
  if (!user) redirect('/login');

  const rows    = await db.select().from(systemSettings);
  const current = Object.fromEntries(rows.map(r => [r.key, r.value]));

  return (
    <main className="max-w-2xl mx-auto py-10 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Pipeline Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Control cost and behavior of the offline processing pipeline.</p>
      </div>
      <SettingsForm current={current} />
    </main>
  );
}
```

- [ ] **Step 5: Create `src/components/settings/SettingsForm.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';

interface Props {
  current: Record<string, unknown>;
}

const SETTINGS_SPEC = [
  { key: 'pass1.infographic.enabled',  label: 'Enable Infographic Generation', type: 'boolean' as const, default: true },
  { key: 'pass1.infographic.topNPercent', label: 'Infographic: Top N% of papers', type: 'number' as const, min: 10, max: 100, default: 100 },
  { key: 'pass2.summary.enabled',      label: 'Enable Summary Generation',     type: 'boolean' as const, default: true },
  { key: 'pass3.podcast.enabled',      label: 'Enable On-Demand Podcasts',     type: 'boolean' as const, default: true },
  { key: 'pass3.podcast.autoGenerateTopN', label: 'Auto-Podcast: Top N papers/week', type: 'number' as const, min: 0, max: 50, default: 0 },
  { key: 'critic.enabled',             label: 'Enable Critic Scoring',         type: 'boolean' as const, default: true },
  { key: 'rec.candidateWindowDays',    label: 'Rec Engine: Candidate Window (days)', type: 'number' as const, min: 7, max: 90, default: 21 },
] as const;

export function SettingsForm({ current }: Props) {
  const utils   = trpc.useUtils();
  const { mutate: setSetting, isPending } = trpc.settings.set.useMutation({
    onSuccess: () => utils.settings.getAll.invalidate(),
  });

  function handleChange(key: string, value: boolean | number) {
    setSetting({ key: key as Parameters<typeof setSetting>[0]['key'], value });
  }

  return (
    <div className="space-y-6">
      {SETTINGS_SPEC.map((spec) => {
        const rawValue = current[spec.key];
        const value = rawValue !== undefined ? rawValue : spec.default;

        return (
          <div key={spec.key} className="flex items-center justify-between border-b pb-4">
            <div>
              <p className="text-sm font-medium">{spec.label}</p>
              <p className="text-xs text-muted-foreground font-mono">{spec.key}</p>
            </div>
            {spec.type === 'boolean' ? (
              <button
                onClick={() => handleChange(spec.key, !(value as boolean))}
                disabled={isPending}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  value ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {value ? 'ON' : 'OFF'}
              </button>
            ) : (
              <input
                type="number"
                min={spec.min}
                max={spec.max}
                defaultValue={value as number}
                onBlur={(e) => handleChange(spec.key, Number(e.target.value))}
                disabled={isPending}
                className="w-20 text-sm border rounded px-2 py-1 text-right"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm test src/server/routers/__tests__/settings.test.ts`
Expected: PASS (2 tests)

Run: `pnpm test`
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/server/routers/settings.ts src/server/routers/__tests__/settings.test.ts src/app/settings/page.tsx src/components/settings/SettingsForm.tsx
git commit -m "feat(settings): add settings tRPC router, Settings Panel UI at /settings"
```

---

### Task 12: Admin Dashboard

**Files:**
- Create: `src/app/admin/page.tsx`

- [ ] **Step 1: Implement `src/app/admin/page.tsx`**

No test needed (pure server-rendered display component with no logic).

```tsx
import { redirect } from 'next/navigation';
import { lucia } from '@/lib/auth';
import { cookies } from 'next/headers';
import { db } from '@/server/db';
import { contentItems, processingRegistry, trends, users } from '@/server/db/schema';
import { sql, count, eq } from 'drizzle-orm';

export const revalidate = 60;

export default async function AdminPage() {
  const cookieStore = await cookies();
  const sessionId   = lucia.readSessionCookie(cookieStore.toString());
  if (!sessionId) redirect('/login');
  const { user } = await lucia.validateSession(sessionId);
  if (!user || user.role !== 'admin') redirect('/');

  const [statusCounts, sourceCounts, trendsCount, usersCount, recentItems] = await Promise.all([
    db.execute(sql`
      SELECT processing_status AS status, COUNT(*)::int AS count
      FROM content_items GROUP BY processing_status ORDER BY count DESC
    `),
    db.execute(sql`
      SELECT source_type AS "sourceType", COUNT(*)::int AS count
      FROM content_items GROUP BY source_type ORDER BY count DESC
    `),
    db.select({ count: count() }).from(trends),
    db.select({ count: count() }).from(users),
    db.query.contentItems.findMany({
      orderBy: (t, { desc }) => [desc(t.harvestedAt)],
      limit: 10,
      columns: { id: true, title: true, sourceType: true, processingStatus: true, harvestedAt: true },
    }),
  ]);

  type Row = { status?: string; sourceType?: string; count: number };
  const statusRows = (statusCounts as unknown as { rows: Row[] }).rows;
  const sourceRows = (sourceCounts as unknown as { rows: Row[] }).rows;

  const totalItems = statusRows.reduce((sum, r) => sum + r.count, 0);

  return (
    <main className="max-w-4xl mx-auto py-10 px-4 space-y-8">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Items',   value: totalItems },
          { label: 'Active Trends', value: trendsCount[0]?.count ?? 0 },
          { label: 'Users',         value: usersCount[0]?.count ?? 0 },
          { label: 'Sources',       value: sourceRows.length },
        ].map(({ label, value }) => (
          <div key={label} className="border rounded-lg p-4">
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">Pipeline Status</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-left py-1">Status</th><th className="text-right py-1">Count</th></tr></thead>
            <tbody>
              {statusRows.map(r => (
                <tr key={r.status} className="border-b last:border-0">
                  <td className="py-1.5 text-muted-foreground font-mono">{r.status}</td>
                  <td className="py-1.5 text-right">{r.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">By Source Type</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-left py-1">Source</th><th className="text-right py-1">Count</th></tr></thead>
            <tbody>
              {sourceRows.map(r => (
                <tr key={r.sourceType} className="border-b last:border-0">
                  <td className="py-1.5 text-muted-foreground">{r.sourceType}</td>
                  <td className="py-1.5 text-right">{r.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Items</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1">Title</th>
              <th className="text-left py-1">Type</th>
              <th className="text-left py-1">Status</th>
              <th className="text-right py-1">Harvested</th>
            </tr>
          </thead>
          <tbody>
            {recentItems.map(item => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="py-1.5 text-muted-foreground max-w-xs truncate">
                  <a href={`/paper/${item.id}`} className="hover:underline">{item.title}</a>
                </td>
                <td className="py-1.5 text-muted-foreground">{item.sourceType}</td>
                <td className="py-1.5 font-mono text-xs">{item.processingStatus}</td>
                <td className="py-1.5 text-right text-muted-foreground">
                  {item.harvestedAt?.toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(ui): add Admin Dashboard at /admin with pipeline stats and recent items"
```

---

### Task 13: Podcast RSS Feed

**Files:**
- Create: `src/app/api/podcast/rss/route.ts`

- [ ] **Step 1: Implement `src/app/api/podcast/rss/route.ts`**

No unit test — this is an HTTP endpoint. Verify manually with `curl`.

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { contentItems } from '@/server/db/schema';
import { and, isNotNull, desc } from 'drizzle-orm';

export async function GET(): Promise<Response> {
  const podcasts = await db.query.contentItems.findMany({
    where: and(isNotNull(contentItems.podcastUrl)),
    orderBy: [desc(contentItems.publishedAt)],
    limit: 50,
    columns: {
      id: true, title: true, authors: true, publishedAt: true,
      podcastUrl: true, podcastDuration: true, rawText: true, sourceUrl: true,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const buildDate = new Date().toUTCString();

  const items = podcasts.map(p => {
    const pubDate = p.publishedAt.toUTCString();
    const desc    = (p.rawText ?? '').slice(0, 500).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const author  = (p.authors ?? []).join(', ') || 'AI Pulse';
    const duration = p.podcastDuration ? `<itunes:duration>${p.podcastDuration}</itunes:duration>` : '';
    return `    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${p.sourceUrl}</link>
      <description><![CDATA[${desc}]]></description>
      <author>${author}</author>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${p.id}</guid>
      <enclosure url="${p.podcastUrl}" type="audio/mpeg" />
      <itunes:title><![CDATA[${p.title}]]></itunes:title>
      ${duration}
    </item>`;
  }).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>AI Pulse Podcasts</title>
    <link>${baseUrl}</link>
    <description>AI and ML research papers as audio podcasts, generated by AI Pulse.</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <itunes:author>AI Pulse</itunes:author>
    <itunes:category text="Technology" />
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/app/api/podcast/rss/route.ts
git commit -m "feat(api): add podcast RSS feed at /api/podcast/rss"
```

---

## Self-Review

### 1. Spec Coverage

| Phase 4 Requirement | Task |
|---------------------|------|
| Video Harvester | Task 5 |
| Social Harvester (Bluesky + HN) | Task 4 |
| Blog Watcher | Task 2 |
| HF Tracker | Task 3 |
| Conference Scraper | ⚠️ Deferred — Playwright scraping is complex; DBLP data is low-priority for MVP |
| Recommendation Engine | Task 8 |
| Personalized feed | Task 9 |
| User feedback loop | Task 7 |
| Digest Composer | Task 10 |
| Admin Dashboard | Task 12 |
| Settings Panel | Task 11 |
| Podcast RSS feed | Task 13 |
| Data export/privacy | ⚠️ Deferred — nice-to-have, not blocking |

### 2. Type Consistency Check

- `buildRecommendations` returns `RecommendedItem[]` and is consumed as such in `digest-composer.ts` (cast `as TaxonomyTags | null` and `as SummarySchema | null` — safe because they come from the same DB columns).
- `harvestJob` exported from `harvest.ts` takes `HarvestJobData['agentType']` — matches all 5 new cases added.
- `FEEDBACK_TYPES` is a `const` tuple in `feedback.ts` — `z.enum(FEEDBACK_TYPES)` works correctly.
- `ALLOWED_KEYS` in `settings.ts` are `as const` — `z.enum(ALLOWED_KEYS)` works correctly.

### 3. No Placeholders

All tasks contain complete code. No TBDs or "similar to" references.
