import { z } from 'zod';
import { db } from '@/server/db';
import { contentItems, processingRegistry } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { getFlashModel } from '@/lib/gemini';
import { pino } from 'pino';

const logger = pino({ name: 'summary-writer' });

// ─── Zod schema (validates Gemini output before persisting) ─────────────────

const SummaryZodSchema = z.object({
  tldr:              z.string().min(1),
  problem:           z.string().min(1),
  keyInsight:        z.string().min(1),
  results:           z.string().min(1),
  limitations:       z.string().min(1),
  whyItMatters:      z.string().min(1),
  practicalTakeaway: z.string().min(1),
  difficulty:        z.enum(['beginner', 'intermediate', 'advanced']),
  wordCount:         z.number().int().positive(),
});

// ─── Pure helpers (exported for unit testing) ────────────────────────────────

export function buildSummaryPrompt(title: string, text: string): string {
  return `You are an expert AI researcher. Summarize the following research paper.
Return ONLY a JSON object matching this exact schema — no markdown, no commentary:

{
  "tldr": "one sentence summary (≤25 words)",
  "problem": "what problem does this paper address (2-3 sentences)",
  "keyInsight": "the core novel contribution or idea (2-3 sentences)",
  "results": "quantitative results or empirical findings (2-3 sentences)",
  "limitations": "honest assessment of limitations (1-2 sentences)",
  "whyItMatters": "why this matters to the AI field (2-3 sentences)",
  "practicalTakeaway": "actionable insight for practitioners (1-2 sentences)",
  "difficulty": "beginner | intermediate | advanced",
  "wordCount": <integer count of words in the full summary>
}

Title: ${title}

Text:
${text.slice(0, 8000)}`;
}

export function parseSummaryResponse(raw: string) {
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const parsed  = JSON.parse(cleaned) as unknown;
  return SummaryZodSchema.parse(parsed);
}

// ─── Main entrypoint ─────────────────────────────────────────────────────────

/**
 * Generate and persist a structured summary for the given contentItemId.
 * Idempotent: skips if summary already exists.
 * Returns true on success, false on failure.
 */
export async function writeSummary(contentItemId: string): Promise<boolean> {
  try {
    const [item] = await db
      .select({
        id:      contentItems.id,
        title:   contentItems.title,
        rawText: contentItems.rawText,
        summary: contentItems.summary,
      })
      .from(contentItems)
      .where(eq(contentItems.id, contentItemId))
      .limit(1);

    if (!item) {
      logger.warn({ contentItemId }, 'Item not found');
      return false;
    }

    if (item.summary) {
      logger.info({ contentItemId }, 'Summary already exists, skipping');
      return true;
    }

    const text   = item.rawText ?? item.title;
    const model  = getFlashModel();
    const result = await model.generateContent(buildSummaryPrompt(item.title, text));
    const raw    = result.response.text();
    const summary = parseSummaryResponse(raw);

    await db.update(contentItems)
      .set({ summary, processingStatus: 'processed', updatedAt: new Date() })
      .where(eq(contentItems.id, contentItemId));

    await db.update(processingRegistry)
      .set({ lastCheckedAt: new Date() })
      .where(eq(processingRegistry.contentItemId, contentItemId));

    logger.info({ contentItemId }, 'Summary written successfully');
    return true;
  } catch (err) {
    logger.error({ contentItemId, err }, 'Failed to write summary');
    return false;
  }
}
