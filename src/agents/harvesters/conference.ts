import { createHash } from 'crypto';
import pRetry from 'p-retry';
import { chromium, type Page } from 'playwright';
import { db } from '@/server/db';
import { contentItems, processingRegistry } from '@/server/db/schema';
import { and, eq, isNotNull, gt, sql } from 'drizzle-orm';
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
  venue: string,
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
    .values({
      ...normalized,
      processingStatus: 'harvested',
      conferenceMetadata: { venue, year: normalized.publishedAt.getUTCFullYear() },
    })
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
          const inserted = await persistConferencePaper(normalized, venue);
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

// ─── Playwright enrichment ───────────────────────────────────────────────────

/**
 * Per-venue page scrapers. Each returns a list of ConferencePageEntry objects.
 * Returns [] on failure — callers handle empty results gracefully.
 */

async function scrapeNeurIPS(page: Page, year: number): Promise<ConferencePageEntry[]> {
  try {
    await page.goto(getConferenceUrl('NeurIPS', year), { timeout: 15000 });
    const entries = await page.$$eval('li.conference, .paper-title-cell, li', (els) =>
      els.map((el) => ({
        title: (el.querySelector('a') ?? el).textContent?.trim() ?? '',
        recordingUrl: (el.querySelector('a[href*="youtube"], a[href*="slideslive"]') as HTMLAnchorElement)?.href,
        sessionTrack: el.querySelector('.oral-label, .poster-label, .spotlight-label')?.textContent?.trim(),
      })),
    );
    return entries.filter((e) => e.title.length > 10);
  } catch (err) {
    logger.warn({ venue: 'NeurIPS', year, err }, 'NeurIPS scrape failed');
    return [];
  }
}

async function scrapeACLAnthology(page: Page, venue: string, year: number): Promise<ConferencePageEntry[]> {
  try {
    await page.goto(getConferenceUrl(venue, year), { timeout: 15000 });
    const entries = await page.$$eval('.paper-title, strong.align-middle', (els) =>
      els.map((el) => {
        const row = el.closest('p, li, .row');
        return {
          title: el.textContent?.trim() ?? '',
          recordingUrl: (row?.querySelector('a[href*="anthology"], a[href*="aclanthology"]') as HTMLAnchorElement)?.href,
          sessionTrack: row?.querySelector('.badge')?.textContent?.trim(),
        };
      }),
    );
    return entries.filter((e) => e.title.length > 10);
  } catch (err) {
    logger.warn({ venue, year, err }, 'ACL Anthology scrape failed');
    return [];
  }
}

async function scrapeOpenReview(page: Page, venue: string, year: number): Promise<ConferencePageEntry[]> {
  try {
    await page.goto(getConferenceUrl(venue, year), { timeout: 15000 });
    const entries = await page.$$eval('.note-content-title, .paper-title', (els) =>
      els.map((el) => {
        const card = el.closest('.note, .paper-card');
        return {
          title: el.textContent?.trim() ?? '',
          sessionTrack: card?.querySelector('.decision, .venue-decision')?.textContent?.trim(),
          acceptanceStatus: card?.querySelector('[class*="oral"], [class*="spotlight"], [class*="poster"]')?.textContent?.trim(),
        };
      }),
    );
    return entries.filter((e) => e.title.length > 10);
  } catch (err) {
    logger.warn({ venue, year, err }, 'OpenReview scrape failed');
    return [];
  }
}

async function scrapeCVPR(page: Page, year: number): Promise<ConferencePageEntry[]> {
  try {
    await page.goto(getConferenceUrl('CVPR', year), { timeout: 15000 });
    const entries = await page.$$eval('dt.ptitle, .ptitle', (els) =>
      els.map((el) => ({
        title: el.querySelector('a')?.textContent?.trim() ?? el.textContent?.trim() ?? '',
        recordingUrl: undefined,
        sessionTrack: 'accepted',
      })),
    );
    return entries.filter((e) => e.title.length > 10);
  } catch (err) {
    logger.warn({ venue: 'CVPR', year, err }, 'CVPR scrape failed');
    return [];
  }
}

async function scrapeGenericProceedings(page: Page, venue: string, year: number): Promise<ConferencePageEntry[]> {
  try {
    await page.goto(getConferenceUrl(venue, year), { timeout: 15000 });
    const entries = await page.$$eval('h3 a, h4 a, .paper a, .title a, li a', (els) =>
      els
        .filter((el) => (el.textContent?.trim().length ?? 0) > 15)
        .map((el) => ({ title: el.textContent?.trim() ?? '' })),
    );
    return entries.filter((e) => e.title.length > 10);
  } catch (err) {
    logger.warn({ venue, year, err }, 'Generic proceedings scrape failed');
    return [];
  }
}

async function scrapeVenue(page: Page, venue: string, year: number): Promise<ConferencePageEntry[]> {
  switch (venue) {
    case 'NeurIPS': return scrapeNeurIPS(page, year);
    case 'ACL':
    case 'EMNLP':   return scrapeACLAnthology(page, venue, year);
    case 'ICLR':    return scrapeOpenReview(page, venue, year);
    case 'CVPR':    return scrapeCVPR(page, year);
    default:        return scrapeGenericProceedings(page, venue, year);
  }
}

export async function enrichConferencePapers(): Promise<number> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - CONFERENCE_ENRICH_WINDOW_DAYS);

  const unenriched = await db.query.contentItems.findMany({
    where: and(
      eq(contentItems.sourceType, 'conference'),
      isNotNull(contentItems.conferenceMetadata),
      sql`${contentItems.conferenceMetadata}->>'enrichedAt' IS NULL`,
      gt(contentItems.publishedAt, windowStart),
    ),
    columns: { id: true, title: true, publishedAt: true, conferenceMetadata: true },
    limit: 500,
  });

  if (unenriched.length === 0) {
    logger.info('No unenriched conference papers found');
    return 0;
  }

  logger.info({ count: unenriched.length }, 'Starting Playwright enrichment');

  // Group papers by (venue, year) — both values come from the initial conferenceMetadata
  // written at harvest time, so no heuristic matching against the title is needed.
  const byVenueYear = new Map<string, typeof unenriched>();
  for (const paper of unenriched) {
    const meta = paper.conferenceMetadata!;
    const key = `${meta.venue}:${meta.year}`;
    if (!byVenueYear.has(key)) byVenueYear.set(key, []);
    byVenueYear.get(key)!.push(paper);
  }

  const browser = await chromium.launch({ headless: true });
  let enriched = 0;

  try {
    for (const [key, papers] of byVenueYear) {
      const [venue, yearStr] = key.split(':');
      const year = parseInt(yearStr, 10);
      try {
        const page = await browser.newPage();
        let entries: ConferencePageEntry[] = [];
        try {
          entries = await scrapeVenue(page, venue, year);
        } finally {
          await page.close();
        }

        logger.info({ venue, entries: entries.length, papers: papers.length }, 'Venue scraped');

        for (const paper of papers) {
          const match = matchPaperToPage(paper.title, entries);
          if (!match) continue;

          const meta: ConferenceMetadata = {
            venue,
            year,
            sessionTrack:     match.sessionTrack,
            acceptanceStatus: match.acceptanceStatus,
            recordingUrl:     match.recordingUrl,
            abstract:         match.abstract,
            enrichedAt:       new Date().toISOString(),
          };

          await db
            .update(contentItems)
            .set({ conferenceMetadata: meta })
            .where(eq(contentItems.id, paper.id));

          enriched++;
        }
      } catch (err) {
        logger.error({ venue, err }, 'Venue enrichment failed, continuing');
      }
    }
  } finally {
    await browser.close();
  }

  logger.info({ enriched }, 'Conference enrichment complete');
  return enriched;
}
