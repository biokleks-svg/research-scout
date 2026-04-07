import { db } from '@/server/db';
import { contentItems, processingRegistry } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { uploadFile } from '@/lib/r2';
import { pino } from 'pino';

const logger = pino({ name: 'podcast-generator' });

export type PodcastStatusValue = 'not_requested' | 'queued' | 'generating' | 'available';

/** Pure helper: derive display status from DB columns */
export function buildPodcastStatus(
  podcastUrl: string | null,
  podcastStatus: string | null,
): PodcastStatusValue {
  if (podcastUrl) return 'available';
  if (podcastStatus === 'generating') return 'generating';
  if (podcastStatus === 'queued') return 'queued';
  return 'not_requested';
}

/**
 * Generate and persist a podcast MP3 for the given contentItemId.
 * Idempotent: skips if podcastUrl already set.
 * Returns true on success, false on failure.
 */
export async function generatePodcast(contentItemId: string): Promise<boolean> {
  try {
    const [item] = await db
      .select({
        id:         contentItems.id,
        title:      contentItems.title,
        rawText:    contentItems.rawText,
        summary:    contentItems.summary,
        podcastUrl: contentItems.podcastUrl,
      })
      .from(contentItems)
      .where(eq(contentItems.id, contentItemId))
      .limit(1);

    if (!item) {
      logger.warn({ contentItemId }, 'Item not found');
      return false;
    }

    if (item.podcastUrl) {
      logger.info({ contentItemId }, 'Podcast already exists, skipping');
      await db.update(contentItems)
        .set({ podcastStatus: 'available' })
        .where(eq(contentItems.id, contentItemId));
      return true;
    }

    await db.update(contentItems)
      .set({ podcastStatus: 'generating' })
      .where(eq(contentItems.id, contentItemId));

    const podcastBuffer = await callPodcastAPI(item.title, item.rawText ?? '', item.summary);

    const r2Key      = `podcasts/${contentItemId}.mp3`;
    const podcastUrl = await uploadFile(r2Key, podcastBuffer, 'audio/mpeg');

    const wordCount   = (item.rawText ?? '').split(/\s+/).length;
    const durationSec = Math.round((wordCount / 150) * 60);

    await db.update(contentItems)
      .set({ podcastUrl, podcastDuration: durationSec, podcastStatus: 'available', updatedAt: new Date() })
      .where(eq(contentItems.id, contentItemId));

    await db.update(processingRegistry)
      .set({ lastCheckedAt: new Date() })
      .where(eq(processingRegistry.contentItemId, contentItemId));

    logger.info({ contentItemId, podcastUrl }, 'Podcast generated');
    return true;
  } catch (err) {
    logger.error({ contentItemId, err }, 'Failed to generate podcast');
    await db.update(contentItems)
      .set({ podcastStatus: 'not_requested' })
      .where(eq(contentItems.id, contentItemId))
      .catch(() => {/* swallow secondary error */});
    return false;
  }
}

async function callPodcastAPI(
  title: string,
  rawText: string,
  summary: unknown,
): Promise<Buffer> {
  const projectId = process.env.NOTEBOOKLM_PROJECT_ID;

  if (projectId) {
    const text = [
      `Title: ${title}`,
      summary ? `Summary: ${JSON.stringify(summary)}` : '',
      rawText.slice(0, 50000),
    ].filter(Boolean).join('\n\n');

    const response = await fetch(
      `https://notebooklm.googleapis.com/v1/projects/${projectId}/notebooks:generateAudio`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, style: 'podcast' }),
      },
    );

    if (!response.ok) {
      throw new Error(`NotebookLM API error: ${response.status}`);
    }

    const data = await response.json() as { audioContent: string };
    return Buffer.from(data.audioContent, 'base64');
  }

  // Fallback: silent MP3 stub for local dev without API key
  logger.warn({ title }, 'NOTEBOOKLM_PROJECT_ID not set; generating silent MP3 stub');
  return Buffer.from([
    0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0xFF, 0xFB, 0x90, 0x00,
    ...Array(413).fill(0x00),
  ]);
}
