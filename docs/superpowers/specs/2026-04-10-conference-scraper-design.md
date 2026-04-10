# Design Spec — Conference Scraper (Phase 5)

**Date:** 2026-04-10
**Status:** Approved
**Branch target:** `feat/phase-5-conference-scraper`

---

## Goal

Add a Conference Scraper harvester that collects proceedings metadata for 8 major AI/ML venues via the DBLP API, then enriches each paper with recordings, session tracks, acceptance status, and full abstracts via Playwright scraping of official conference pages. Conference papers enter the existing processing pipeline: classified + summary always, infographic + podcast settings-gated.

---

## Architecture

```
Weekly cron (Monday 06:00 UTC)
    │
    ▼
harvestJob('conference')      ← harvest worker
    │
    ├── harvestConferences()  ← DBLP API: 8 venues × 250 papers
    │       insert new contentItems (sourceType: 'conference')
    │
    └── enrichConferencePapers()  ← Playwright: scrape official pages
            match by title → add conferenceMetadata JSONB
    │
    ▼
BullMQ process worker         ← existing, unchanged
    classify → summary (always) → infographic/podcast (settings-gated)
```

The pattern mirrors the existing paper harvester: `harvestArxiv()` inserts, then `enrichRecentPapers()` enriches via Semantic Scholar. No new patterns are introduced.

---

## Venues

| Venue   | DBLP Key   | Playwright Target URL |
|---------|-----------|----------------------|
| NeurIPS | NeurIPS    | proceedings.neurips.cc/paper_files/paper/\<year\> |
| ICML    | ICML       | proceedings.mlr.press/v\<volume\>/ |
| ICLR    | ICLR       | openreview.net/group?id=ICLR.\<year\>/Conference |
| ACL     | ACL        | aclanthology.org/events/acl-\<year\>/ |
| EMNLP   | EMNLP      | aclanthology.org/events/emnlp-\<year\>/ |
| CVPR    | CVPR       | openaccess.thecvf.com/CVPR\<year\> |
| AAAI    | AAAI       | ojs.aaai.org/index.php/AAAI/issue/archive |
| MLSys   | MLSys      | proceedings.mlsys.org/\<year\>/ |

---

## DBLP Harvester

**Endpoint:** `https://dblp.org/search/publ/api?q=venue:<key>&format=json&h=250`

**Rate limiting:** 1 req/sec (`DBLP_RATE_LIMIT_MS = 1000`), `p-retry` with exponential backoff (2 retries).

**Normalized fields per paper:**

| Field | Source |
|-------|--------|
| `sourceType` | `'conference'` (hardcoded) |
| `sourceId` | DOI if present; else `dblp:<venue>:<year>:<sha256(title)[0:16]>` |
| `title` | DBLP `title` field, HTML-stripped |
| `authors` | DBLP `authors.author[].text` |
| `publishedAt` | `new Date(<year>, 0, 1)` — Jan 1 of conference year |
| `sourceUrl` | DBLP paper page URL (`info.url`) |
| `rawText` | `"${title}. ${authors.join(', ')}. ${venue} ${year}."` |
| `citationCount` | `0` (no citation data from DBLP free tier) |
| `contentHash` | `sha256('conference:' + venue + ':' + title)` |

Processing registry check before insert — idempotent, nothing is processed twice.

---

## Playwright Enrichment

`enrichConferencePapers()` runs after `harvestConferences()` in the same job. It:

1. Selects `contentItems` where `sourceType = 'conference'` AND `conferenceMetadata IS NULL` AND `publishedAt > now() - 30 days`
2. Groups by venue
3. Launches one Playwright browser instance (Chromium, headless)
4. For each venue, navigates to the proceedings page and extracts a list of `{ title, recordingUrl, sessionTrack, acceptanceStatus, abstract }` entries
5. For each DB paper, fuzzy-matches by normalized title (lowercase, punctuation-stripped, Levenshtein distance ≤ 3)
6. On match: updates `conferenceMetadata` JSONB column
7. Closes browser

**Timeout:** 15s per page navigation. **Failure handling:** each venue is wrapped in try/catch — one failing venue does not block others. If zero matches found for a venue, logs a warning and continues.

**Idempotency:** `conferenceMetadata IS NULL` guard ensures no re-scraping. Once `enrichedAt` is set, the paper is skipped forever.

---

## Data Model

### New column on `content_items`

```sql
conference_metadata JSONB DEFAULT NULL
```

TypeScript type:

```typescript
interface ConferenceMetadata {
  venue:             string;   // 'NeurIPS' | 'ICML' | 'ICLR' | 'ACL' | 'EMNLP' | 'CVPR' | 'AAAI' | 'MLSys'
  year:              number;
  sessionTrack?:     string;   // 'oral' | 'spotlight' | 'poster' | 'workshop'
  acceptanceStatus?: string;   // 'accepted' | 'spotlight' | 'oral'
  recordingUrl?:     string;
  abstract?:         string;   // full abstract from conference page
  enrichedAt?:       string;   // ISO timestamp — signals Playwright ran successfully
}
```

One new Drizzle migration (`0003_conference_metadata.sql`). No changes to `processingRegistry` schema — existing stages cover everything.

---

## Processing Pipeline Integration

Conference papers enter the existing process worker queue automatically after harvest (same as all other `sourceType` values). No changes to the process worker itself.

| Stage | Behavior |
|-------|----------|
| classify | Always — embedding + taxonomy |
| summary | Always — Gemini 2.5 Flash |
| infographic | Gated by `pass1.infographic.enabled` setting |
| podcast | On-demand only, gated by `pass3.podcast.enabled` setting |
| criticScored | Always — 8-dimension scoring |
| justified | Always — dossier generation |

---

## Scheduler

```typescript
// Weekly: Monday 06:00 UTC — conference harvest + enrichment
cron.schedule('0 6 * * 1', async () => {
  await harvestQueue.add('harvest-conference', { agentType: 'conference' });
});
```

---

## Files

**New:**
- `src/agents/harvesters/conference.ts` — DBLP fetch + Playwright enrichment
- `src/agents/harvesters/__tests__/conference.test.ts`
- `drizzle/migrations/0003_conference_metadata.sql`

**Modified:**
- `src/server/db/schema.ts` — `conferenceMetadata` column
- `src/lib/constants.ts` — `DBLP_RATE_LIMIT_MS`, `CONFERENCE_VENUES` map
- `src/workers/harvest.ts` — `'conference'` case in `harvestJob()`
- `src/scheduler.ts` — weekly cron

**New dependency:**
- `playwright` (dev + runtime for worker process): `pnpm add playwright`

---

## Testing Strategy

TDD on pure functions only. No Playwright in unit tests.

| Test | Function |
|------|----------|
| stable 64-char hash | `buildConferenceContentHash(venue, title)` |
| normalize DBLP hit → ContentItem shape | `normalizeDblpHit(hit, venue)` |
| fuzzy title match logic | `matchPaperToPage(title, entries)` |
| parse fixture HTML | `parseConferenceMetadata(venue, html)` — one fixture per venue |

`enrichConferencePapers()` is a coordinator — not unit-tested. Covered by an integration test using a mock HTTP server (Playwright fetches from `localhost` in CI, no real browser sessions hit production sites).

---

## Deferred

- **Season detection** — weekly-always schedule chosen for simplicity; daily-during-conference-season is a future optimization
- **Citation enrichment** — DBLP free tier has no citation counts; could be added later via Semantic Scholar by DOI lookup (same pattern as paper harvester)
- **OpenReview deep integration** — ICLR uses OpenReview; basic scraping covers it, but full OpenReview API integration (reviews, scores, decision metadata) is deferred
