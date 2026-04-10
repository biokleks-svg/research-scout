import { createHash } from 'crypto';
import pRetry from 'p-retry';
import { db } from '@/server/db';
import { contentItems, processingRegistry } from '@/server/db/schema';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { DBLP_API_BASE, DBLP_RATE_LIMIT_MS, CONFERENCE_ENRICH_WINDOW_DAYS } from '@/lib/constants';
import type { ContentSourceType, RegistryStages, ConferenceMetadata } from '@/types/content';
import { pino } from 'pino';

const logger = pino({ name: 'conference-harvester' });

// ─── Venue configuration ────────────────────────────────────────────────────

/** DBLP venue keys for search queries */
export const VENUE_DBLP_KEYS: Record<string, string> = {
  NeurIPS: 'NeurIPS',
  ICML:    'ICML',
  ICLR:    'ICLR',
  ACL:     'ACL',
  EMNLP:   'EMNLP',
  CVPR:    'CVPR',
  AAAI:    'AAAI',
  MLSys:   'MLSys',
};

/** Returns the proceedings page URL for a venue and year */
export function getConferenceUrl(venue: string, year: number): string {
  const urls: Record<string, string> = {
    NeurIPS: `https://proceedings.neurips.cc/paper_files/paper/${year}`,
    ICML:    `https://proceedings.mlr.press/`, // TODO(task-5): volume number varies by year; use index page and scrape for current volume
    ICLR:    `https://openreview.net/group?id=ICLR.cc/${year}/Conference`,
    ACL:     `https://aclanthology.org/events/acl-${year}/`,
    EMNLP:   `https://aclanthology.org/events/emnlp-${year}/`,
    CVPR:    `https://openaccess.thecvf.com/CVPR${year}`,
    AAAI:    `https://ojs.aaai.org/index.php/AAAI/issue/archive`, // TODO(task-5): archive page; year filtering needed during scrape
    MLSys:   `https://proceedings.mlsys.org/paper_files/paper/${year}`,
  };
  return urls[venue] ?? '';
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RawDblpAuthor {
  text: string;
  '@pid'?: string;
}

export interface RawDblpHit {
  info: {
    title:   string;
    authors: { author: RawDblpAuthor | RawDblpAuthor[] };
    year:    string;
    venue:   string;
    url:     string;
    doi?:    string;
    key:     string;
  };
}

export interface ConferencePageEntry {
  title:            string;
  recordingUrl?:    string;
  sessionTrack?:    string;
  acceptanceStatus?: string;
  abstract?:        string;
}

// ─── Pure functions ─────────────────────────────────────────────────────────

export function buildConferenceContentHash(venue: string, title: string): string {
  return createHash('sha256').update(`conference:${venue}:${title}`).digest('hex');
}

export function normalizeDblpHit(
  hit: RawDblpHit,
  venue: string,
): {
  sourceType:  ContentSourceType;
  sourceId:    string;
  sourceUrl:   string;
  title:       string;
  authors:     string[];
  publishedAt: Date;
  rawText:     string;
  contentHash: string;
} {
  const { info } = hit;
  const title   = info.title.replace(/\.$/, '').trim();
  const year    = parseInt(info.year, 10);

  // DBLP authors can be a single object or an array
  const authorRaw = info.authors.author;
  const authors = Array.isArray(authorRaw)
    ? authorRaw.map((a) => a.text)
    : [authorRaw.text];

  const sourceId = info.doi
    ? info.doi
    : `dblp:${info.key}`;

  return {
    sourceType:  'conference',
    sourceId,
    sourceUrl:   info.url,
    title,
    authors,
    publishedAt: new Date(Date.UTC(year, 0, 1)),
    rawText:     `${title}. ${authors.join(', ')}. ${venue} ${year}.`,
    contentHash: buildConferenceContentHash(venue, title),
  };
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function titleWordOverlap(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(' ').filter((w) => w.length > 3));
  const wordsB = new Set(normalizeTitle(b).split(' ').filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let matches = 0;
  for (const w of wordsA) { if (wordsB.has(w)) matches++; }
  return matches / Math.max(wordsA.size, wordsB.size);
}

export function matchPaperToPage(
  title: string,
  entries: ConferencePageEntry[],
): ConferencePageEntry | null {
  const THRESHOLD = 0.7;
  let best: ConferencePageEntry | null = null;
  let bestScore = 0;
  for (const entry of entries) {
    const score = titleWordOverlap(title, entry.title);
    if (score > bestScore && score >= THRESHOLD) {
      bestScore = score;
      best = entry;
    }
  }
  return best;
}

// ─── DBLP harvester ─────────────────────────────────────────────────────────

interface DblpSearchResponse {
  result: {
    hits: {
      hit?: RawDblpHit[];
      '@total': string;
    };
  };
}

async function fetchDblpVenue(venueKey: string, maxResults = 250): Promise<RawDblpHit[]> {
  return pRetry(
    async () => {
      const params = new URLSearchParams({
        q:      `venue:${venueKey}`,
        format: 'json',
        h:      String(maxResults),
      });
      const res = await fetch(`${DBLP_API_BASE}?${params}`, {
        headers: { 'User-Agent': 'AIPulse/1.0 (+https://aipulse.app)' },
      });
      if (!res.ok) throw new Error(`DBLP returned ${res.status} for venue ${venueKey}`);
      const data = await res.json() as DblpSearchResponse;
      return data.result.hits.hit ?? [];
    },
    { retries: 2, minTimeout: DBLP_RATE_LIMIT_MS },
  );
}

async function persistConferencePaper(
  normalized: ReturnType<typeof normalizeDblpHit>,
): Promise<boolean> {
  const existing = await db.query.processingRegistry.findFirst({
    where: and(
      eq(processingRegistry.sourceType, 'conference'),
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
    classified:   emptyStage,
    infographic:  emptyStage,
    summary:      emptyStage,
    podcast:      emptyStage,
    criticScored: emptyStage,
    justified:    emptyStage,
  };
  await db.insert(processingRegistry).values({
    sourceType:    'conference',
    sourceId:      normalized.sourceId,
    contentHash:   normalized.contentHash,
    contentItemId: inserted.id,
    stages,
  }).onConflictDoNothing();

  return true;
}

export async function harvestConferences(maxPerVenue = 250): Promise<number> {
  logger.info('Starting conference harvest via DBLP');
  let total = 0;

  for (const [venue, dblpKey] of Object.entries(VENUE_DBLP_KEYS)) {
    try {
      logger.info({ venue, dblpKey }, 'Fetching DBLP proceedings');
      const hits = await fetchDblpVenue(dblpKey, maxPerVenue);
      logger.info({ venue, count: hits.length }, 'DBLP hits received');

      for (const hit of hits) {
        try {
          const normalized = normalizeDblpHit(hit, venue);
          if (!normalized.title) continue;
          const inserted = await persistConferencePaper(normalized);
          if (inserted) total++;
        } catch (err) {
          logger.error({ venue, title: hit.info?.title, err }, 'Failed to persist conference paper');
        }
      }
      await new Promise((r) => setTimeout(r, DBLP_RATE_LIMIT_MS));
    } catch (err) {
      logger.error({ venue, err }, 'DBLP venue fetch failed, continuing');
    }
  }

  logger.info({ total }, 'Conference DBLP harvest complete');
  return total;
}
