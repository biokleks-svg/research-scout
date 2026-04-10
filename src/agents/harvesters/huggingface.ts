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
  sourceType:    ContentSourceType;
  sourceId:      string;
  sourceUrl:     string;
  title:         string;
  publishedAt:   Date;
  rawText:       string;
  contentHash:   string;
  citationCount: number;
} {
  const modelId = model.modelId ?? model.id;
  return {
    sourceType:    'model',
    sourceId:      modelId,
    sourceUrl:     `https://huggingface.co/${modelId}`,
    title:         modelId,
    publishedAt:   new Date(model.createdAt),
    rawText:       `HuggingFace model: ${modelId}. Downloads: ${model.downloads}. Likes: ${model.likes}. Tags: ${model.tags.join(', ')}.`,
    contentHash:   buildHFContentHash(modelId),
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
          sourceType:       normalized.sourceType,
          sourceId:         normalized.sourceId,
          sourceUrl:        normalized.sourceUrl,
          title:            normalized.title,
          publishedAt:      normalized.publishedAt,
          rawText:          normalized.rawText,
          contentHash:      normalized.contentHash,
          citationCount:    normalized.citationCount,
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
      await db
        .insert(processingRegistry)
        .values({
          sourceType:    'model',
          sourceId:      normalized.sourceId,
          contentHash:   normalized.contentHash,
          contentItemId: inserted.id,
          stages,
        })
        .onConflictDoNothing();

      harvested++;
      await new Promise((r) => setTimeout(r, HF_RATE_LIMIT_MS));
    } catch (err) {
      logger.error({ modelId: model.modelId, err }, 'Failed to insert HF model');
    }
  }

  logger.info({ harvested }, 'HuggingFace harvest complete');
  return harvested;
}
