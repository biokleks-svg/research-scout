import { db } from '@/server/db';
import { contentItems, processingRegistry } from '@/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { embedText } from '@/lib/gemini';
import { DEDUP_SIMILARITY_THRESHOLD } from '@/lib/constants';
import { pino } from 'pino';

const logger = pino({ name: 'dedup-classifier' });

// ─── Pure functions (testable without DB) ──────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vectors must have the same length');
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const AREA_KEYWORDS: Record<string, string[]> = {
  NLP:            ['language model', 'nlp', 'transformer', 'text generation', 'tokeniz', 'llm', 'gpt', 'bert', 'translation', 'language'],
  CV:             ['image', 'vision', 'detection', 'segmentation', 'diffusion', 'pixel', 'visual', 'convolutional'],
  RL:             ['reinforcement', 'reward', 'policy', 'agent', 'q-learning', 'ppo', 'rlhf', 'markov'],
  'Graph ML':     ['graph neural', 'gnn', 'knowledge graph', 'node classification', 'link prediction'],
  'Multimodal':   ['multimodal', 'vision-language', 'clip', 'image-text', 'cross-modal'],
  'Robotics':     ['robot', 'manipulation', 'locomotion', 'embodied', 'gripper'],
  'Theory':       ['convergence', 'generalization bound', 'pac learning', 'complexity', 'regret bound'],
  'Audio/Speech': ['speech', 'audio', 'asr', 'tts', 'voice', 'speaker'],
};

export function inferPrimaryArea(text: string): string {
  const lower = text.toLowerCase();
  let best = 'General AI';
  let bestCount = 0;

  for (const [area, keywords] of Object.entries(AREA_KEYWORDS)) {
    const count = keywords.filter((kw) => lower.includes(kw)).length;
    if (count > bestCount) {
      bestCount = count;
      best = area;
    }
  }
  return best;
}

export function inferDifficulty(text: string): 'beginner' | 'intermediate' | 'advanced' {
  const lower = text.toLowerCase();
  const advancedTerms = ['theorem', 'proof', 'convergence', 'variational', 'posterior', 'manifold', 'stochastic gradient'];
  const beginnerTerms = ['tutorial', 'introduction', 'survey', 'overview', 'beginner', 'getting started'];
  const adv = advancedTerms.filter((t) => lower.includes(t)).length;
  const beg = beginnerTerms.filter((t) => lower.includes(t)).length;
  if (adv >= 2) return 'advanced';
  if (beg >= 1) return 'beginner';
  return 'intermediate';
}

// ─── DB operations ─────────────────────────────────────────────────────────

async function findMostSimilar(embedding: number[]): Promise<number | null> {
  const vectorLiteral = `[${embedding.join(',')}]`;

  const result = await db.execute(
    sql`SELECT 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
        FROM content_items
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorLiteral}::vector
        LIMIT 1`,
  );

  const rows = result.rows as Array<{ similarity: number }>;
  if (rows.length === 0) return null;
  return rows[0]!.similarity;
}

export async function classifyContentItem(contentItemId: string): Promise<boolean> {
  const item = await db.query.contentItems.findFirst({
    where: eq(contentItems.id, contentItemId),
  });

  if (!item) {
    logger.error({ contentItemId }, 'Content item not found');
    return false;
  }

  if (!item.rawText) {
    logger.warn({ contentItemId }, 'No rawText, skipping classification');
    return false;
  }

  logger.info({ contentItemId, title: item.title }, 'Classifying content item');

  try {
    const textToEmbed = `${item.title}\n\n${item.rawText}`.slice(0, 8000);
    const embedding = await embedText(textToEmbed);

    const similarity = await findMostSimilar(embedding);
    if (similarity !== null && similarity > DEDUP_SIMILARITY_THRESHOLD) {
      logger.info({ contentItemId, similarity }, 'Duplicate detected');
      await db
        .update(contentItems)
        .set({ processingStatus: 'duplicate' })
        .where(eq(contentItems.id, contentItemId));
      return false;
    }

    const combinedText = `${item.title} ${item.rawText}`;
    const primaryArea = inferPrimaryArea(combinedText);
    const difficulty = inferDifficulty(combinedText);

    await db
      .update(contentItems)
      .set({
        embedding:        embedding as unknown as number[],
        taxonomy:         { primaryArea, subAreas: [], taskTypes: [], applicationDomains: [] },
        difficultyLevel:  difficulty,
        processingStatus: 'classified',
        updatedAt:        new Date(),
      })
      .where(eq(contentItems.id, contentItemId));

    await db.execute(sql`
      UPDATE processing_registry
      SET stages = jsonb_set(
        COALESCE(stages, '{}'::jsonb),
        '{classified}',
        ${JSON.stringify({ done: true, at: new Date().toISOString() })}::jsonb
      ),
      last_checked_at = NOW()
      WHERE content_item_id = ${contentItemId}
    `);

    logger.info({ contentItemId, primaryArea, difficulty }, 'Classification complete');
    return true;
  } catch (err) {
    logger.error({ err, contentItemId }, 'Classification failed');
    return false;
  }
}

export async function classifyPendingItems(batchSize = 10): Promise<number> {
  const pending = await db.query.contentItems.findMany({
    where: eq(contentItems.processingStatus, 'harvested'),
    limit: batchSize,
  });

  let classified = 0;
  for (const item of pending) {
    const ok = await classifyContentItem(item.id);
    if (ok) classified++;
  }
  return classified;
}
