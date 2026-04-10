import { z } from 'zod';
import { db } from '@/server/db';
import { contentItems } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { getFlashModel } from '@/lib/gemini';
import type { CriticScores } from '@/types/critic';
import { pino } from 'pino';

const logger = pino({ name: 'critic-scorer' });

const GeminiDimensionSchema = z.object({
  score:     z.number().int().min(0).max(100),
  reasoning: z.string().min(1),
});

const GeminiScorerOutputSchema = z.object({
  aiNovelty:           GeminiDimensionSchema,
  usefulness:          GeminiDimensionSchema,
  methodologicalRigor: GeminiDimensionSchema,
  reproducibility:     GeminiDimensionSchema,
  industryRelevance:   GeminiDimensionSchema,
  longevityPotential:  GeminiDimensionSchema,
});

export function buildScorerPrompt(title: string, text: string): string {
  return `You are an expert AI research evaluator. Score this paper on 6 dimensions.
Return ONLY a JSON object — no markdown, no commentary:

{
  "aiNovelty":           { "score": <0-100>, "reasoning": "<1-2 sentences>" },
  "usefulness":          { "score": <0-100>, "reasoning": "<1-2 sentences>" },
  "methodologicalRigor": { "score": <0-100>, "reasoning": "<1-2 sentences>" },
  "reproducibility":     { "score": <0-100>, "reasoning": "<1-2 sentences>" },
  "industryRelevance":   { "score": <0-100>, "reasoning": "<1-2 sentences>" },
  "longevityPotential":  { "score": <0-100>, "reasoning": "<1-2 sentences>" }
}

Scoring rubric:
- aiNovelty: Is this a genuinely new technique/finding? 80+ = paradigm shift. 30-50 = incremental.
- usefulness: Can practitioners use this Monday morning? 80+ = code + benchmarks + applications.
- methodologicalRigor: Ablation studies? Statistical significance? Multiple baselines? Limitations discussed?
- reproducibility: Code/models/datasets released? 80+ = Docker + hyperparams + pre-trained weights.
- industryRelevance: Addresses deployment concerns (latency, cost, safety)? From industry lab?
- longevityPotential: Opens new research directions? Generalizable? Introduces benchmark?

Title: ${title}

Text:
${text.slice(0, 6000)}`;
}

export function parseScorerResponse(raw: string): z.infer<typeof GeminiScorerOutputSchema> {
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(cleaned) as unknown;
  return GeminiScorerOutputSchema.parse(parsed);
}

export function computeWebBuzzScore(engagementScore: number): number {
  return Math.min(100, Math.round(engagementScore * 100));
}

export function computeBasePopularity(citationCount: number): number {
  return Math.min(100, Math.round((citationCount / 1000) * 100));
}

/**
 * Score a content item on all 8 critic dimensions.
 * Idempotent: skips if criticScores already set.
 * Returns true on success, false on failure.
 */
export async function scoreContentItem(contentItemId: string): Promise<boolean> {
  try {
    const [item] = await db
      .select({
        id:              contentItems.id,
        title:           contentItems.title,
        rawText:         contentItems.rawText,
        criticScores:    contentItems.criticScores,
        citationCount:   contentItems.citationCount,
        engagementScore: contentItems.engagementScore,
      })
      .from(contentItems)
      .where(eq(contentItems.id, contentItemId))
      .limit(1);

    if (!item) {
      logger.warn({ contentItemId }, 'Item not found');
      return false;
    }

    if (item.criticScores) {
      logger.info({ contentItemId }, 'Already scored, skipping');
      return true;
    }

    const text   = item.rawText ?? item.title;
    const model  = getFlashModel();
    const result = await model.generateContent(buildScorerPrompt(item.title, text));
    const geminiScores = parseScorerResponse(result.response.text());

    const basePopularity = computeBasePopularity(item.citationCount ?? 0);
    const webBuzzScore   = computeWebBuzzScore(item.engagementScore ?? 0);

    const criticScores: CriticScores = {
      ...geminiScores,
      webBuzz:    { score: webBuzzScore, reasoning: 'Based on current engagement metrics.' },
      popularity: { base: basePopularity, trendBonus: 0, total: basePopularity },
    };

    await db.update(contentItems)
      .set({ criticScores, processingStatus: 'scored', updatedAt: new Date() })
      .where(eq(contentItems.id, contentItemId));

    logger.info({ contentItemId }, 'Scoring complete');
    return true;
  } catch (err) {
    logger.error({ contentItemId, err }, 'Failed to score content item');
    return false;
  }
}
