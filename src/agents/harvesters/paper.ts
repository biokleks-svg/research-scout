import { createHash } from 'crypto';
import pRetry from 'p-retry';
import { db } from '@/server/db';
import { contentItems, processingRegistry } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  ARXIV_BASE_URL,
  ARXIV_CATEGORIES,
  ARXIV_RATE_LIMIT_MS,
  SEMANTIC_SCHOLAR_BASE_URL,
  SEMANTIC_SCHOLAR_RATE_LIMIT_MS,
} from '@/lib/constants';
import type { ContentSourceType, RegistryStages } from '@/types/content';
import { pino } from 'pino';

const logger = pino({ name: 'paper-harvester' });

// ─── arXiv ─────────────────────────────────────────────────────────────────

export function buildArxivUrl(maxResults: number, start: number): string {
  const searchQuery = ARXIV_CATEGORIES.map((c) => `cat:${c}`).join(' OR ');
  const params = new URLSearchParams({
    search_query: searchQuery,
    start: String(start),
    max_results: String(maxResults),
    sortBy: 'submittedDate',
    sortOrder: 'descending',
  });
  return `${ARXIV_BASE_URL}?${params.toString()}`;
}

interface ArxivAuthor {
  name: string[];
}

interface ArxivLink {
  $: { href: string; rel: string; title?: string };
}

export interface ArxivEntry {
  id: string[];
  title: string[];
  author: ArxivAuthor[];
  summary: string[];
  published: string[];
  link: ArxivLink[];
}

interface NormalizedPaper {
  sourceType: ContentSourceType;
  sourceId: string;
  sourceUrl: string;
  title: string;
  authors: string[];
  publishedAt: Date;
  rawText: string;
  contentHash: string;
}

export function normalizeArxivEntry(entry: ArxivEntry): NormalizedPaper {
  const rawId = entry.id[0] ?? '';
  const sourceId = rawId.replace(/v\d+$/, '').split('/').pop() ?? rawId;

  const title = (entry.title[0] ?? '').replace(/\s+/g, ' ').trim();
  const authors = (entry.author ?? []).map((a) => a.name[0] ?? '');
  const abstract = (entry.summary[0] ?? '').replace(/\s+/g, ' ').trim();
  const publishedAt = new Date(entry.published[0] ?? Date.now());

  const alternateLink = entry.link?.find((l) => l.$.rel === 'alternate');
  const sourceUrl = alternateLink?.$.href ?? `https://arxiv.org/abs/${sourceId}`;

  const contentHash = createHash('sha256')
    .update(`arxiv:${sourceId}:${title}`)
    .digest('hex');

  return {
    sourceType: 'paper',
    sourceId,
    sourceUrl,
    title,
    authors,
    publishedAt,
    rawText: abstract,
    contentHash,
  };
}

async function parseArxivXml(xml: string): Promise<ArxivEntry[]> {
  const { parseStringPromise } = await import('xml2js');
  const parsed = await parseStringPromise(xml);
  return (parsed?.feed?.entry as ArxivEntry[]) ?? [];
}

export async function harvestArxiv(maxResults = 50): Promise<number> {
  logger.info({ maxResults }, 'Starting arXiv harvest');
  let harvested = 0;

  const url = buildArxivUrl(maxResults, 0);
  const xml = await pRetry(
    async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`arXiv returned ${res.status}`);
      return res.text();
    },
    { retries: 3, minTimeout: ARXIV_RATE_LIMIT_MS },
  );

  const entries = await parseArxivXml(xml);
  logger.info({ count: entries.length }, 'Parsed arXiv entries');

  for (const entry of entries) {
    try {
      const paper = normalizeArxivEntry(entry);

      const existing = await db.query.processingRegistry.findFirst({
        where: and(
          eq(processingRegistry.sourceType, paper.sourceType),
          eq(processingRegistry.sourceId, paper.sourceId),
        ),
      });
      if (existing) continue;

      const [inserted] = await db
        .insert(contentItems)
        .values({
          sourceType:       paper.sourceType,
          sourceId:         paper.sourceId,
          sourceUrl:        paper.sourceUrl,
          title:            paper.title,
          authors:          paper.authors,
          publishedAt:      paper.publishedAt,
          rawText:          paper.rawText,
          contentHash:      paper.contentHash,
          processingStatus: 'harvested',
        })
        .onConflictDoNothing()
        .returning();

      if (!inserted) continue;

      const emptyStage = { done: false, at: new Date().toISOString() };
      const stages: RegistryStages = {
        harvested:    { done: true,  at: new Date().toISOString() },
        classified:   emptyStage,
        infographic:  emptyStage,
        summary:      emptyStage,
        podcast:      emptyStage,
        criticScored: emptyStage,
        justified:    emptyStage,
      };

      await db.insert(processingRegistry).values({
        sourceType:    paper.sourceType,
        sourceId:      paper.sourceId,
        contentHash:   paper.contentHash,
        contentItemId: inserted.id,
        stages,
      }).onConflictDoNothing();

      harvested++;
      await new Promise((r) => setTimeout(r, ARXIV_RATE_LIMIT_MS));
    } catch (err) {
      logger.error({ err, sourceId: entry.id?.[0] }, 'Failed to insert arXiv entry');
    }
  }

  logger.info({ harvested }, 'arXiv harvest complete');
  return harvested;
}

// ─── Semantic Scholar enrichment ───────────────────────────────────────────

interface S2Paper {
  paperId: string;
  citationCount: number;
  influentialCitationCount: number;
}

export async function enrichWithSemanticScholar(arxivId: string): Promise<S2Paper | null> {
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const headers: Record<string, string> = apiKey ? { 'x-api-key': apiKey } : {};

  return pRetry(
    async () => {
      const url = `${SEMANTIC_SCHOLAR_BASE_URL}/paper/arXiv:${arxivId}?fields=paperId,citationCount,influentialCitationCount`;
      const res = await fetch(url, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Semantic Scholar returned ${res.status}`);
      return res.json() as Promise<S2Paper>;
    },
    {
      retries: 2,
      minTimeout: SEMANTIC_SCHOLAR_RATE_LIMIT_MS,
      onFailedAttempt: (err) => {
        logger.warn({ err: err.message, arxivId }, 'S2 enrichment failed, retrying');
      },
    },
  );
}

export async function enrichRecentPapers(limit = 20): Promise<void> {
  const papers = await db.query.contentItems.findMany({
    where: and(
      eq(contentItems.sourceType, 'paper'),
      eq(contentItems.citationCount, 0),
    ),
    limit,
    orderBy: (t, { desc }) => [desc(t.harvestedAt)],
  });

  for (const paper of papers) {
    try {
      const s2 = await enrichWithSemanticScholar(paper.sourceId);
      if (!s2) continue;

      await db
        .update(contentItems)
        .set({ citationCount: s2.citationCount })
        .where(eq(contentItems.id, paper.id));

      logger.info({ arxivId: paper.sourceId, citationCount: s2.citationCount }, 'Enriched');
      await new Promise((r) => setTimeout(r, SEMANTIC_SCHOLAR_RATE_LIMIT_MS));
    } catch (err) {
      logger.error({ err, paperId: paper.id }, 'Failed to enrich paper');
    }
  }
}
