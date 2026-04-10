import { db } from '@/server/db';
import { contentItems, processingRegistry } from '@/server/db/schema';
import { eq, and, isNotNull, desc, sql } from 'drizzle-orm';
import { getFlashModel } from '@/lib/gemini';
import type { JustificationDossier, AuditEntry, PeerComparison } from '@/types/critic';
import type { RegistryStages } from '@/types/content';
import { computeCompositeScore } from './rank-synthesizer';
import { pino } from 'pino';

const logger = pino({ name: 'justification-composer' });

export function buildAuditTrail(stages: RegistryStages | null): AuditEntry[] {
  if (!stages) return [];
  const entries: AuditEntry[] = [];

  const add = (stageRecord: RegistryStages[keyof RegistryStages], agent: string, action: string) => {
    if (stageRecord?.done) {
      entries.push({ agent, timestamp: stageRecord.at, action, details: '' });
    }
  };

  add(stages.harvested,    'Paper Harvester',    'Content discovered and harvested');
  add(stages.classified,   'Dedup & Classifier', 'Classified and deduplicated');
  add(stages.infographic,  'Infographic Agent',  'Visual infographic generated');
  add(stages.summary,      'Summary Writer',     'Structured summary generated');
  add(stages.criticScored, 'Critic Layer',       'Scored on 8 dimensions');

  return entries;
}

export function buildJustificationPrompt(
  title: string,
  clusterId: string,
  weekId: string,
  compositeRank: number,
  totalInCohort: number,
  topPeers: Array<{ title: string; composite: number }>,
): string {
  const peersText = topPeers.length > 0
    ? topPeers.map((p, i) => `${i + 1}. "${p.title}" (composite score: ${p.composite})`).join('\n')
    : 'No peers available yet.';

  return `You are an expert AI research analyst. Explain in 2-3 sentences why this paper is ranked where it is.
Be specific about its strengths and weaknesses relative to its cohort. Focus on what distinguishes it.
Return ONLY the explanation text — no JSON, no markdown, no preamble.

Paper: "${title}"
Topic cluster: ${clusterId}
Week: ${weekId}
Composite rank: top ${100 - compositeRank}% of ${totalInCohort} papers in its cohort

Top peers in this cohort:
${peersText}`;
}

/**
 * Generate and persist a justification dossier for a content item.
 * Requires criticScores and cohortRank to already be set.
 * Returns true on success, false on failure.
 */
export async function generateJustification(contentItemId: string): Promise<boolean> {
  try {
    const [item] = await db
      .select({
        id:            contentItems.id,
        title:         contentItems.title,
        criticScores:  contentItems.criticScores,
        cohortRank:    contentItems.cohortRank,
        justification: contentItems.justification,
        taxonomy:      contentItems.taxonomy,
      })
      .from(contentItems)
      .where(eq(contentItems.id, contentItemId))
      .limit(1);

    if (!item) { logger.warn({ contentItemId }, 'Item not found'); return false; }
    if (item.justification) { logger.info({ contentItemId }, 'Already justified, skipping'); return true; }
    if (!item.criticScores || !item.cohortRank) {
      logger.warn({ contentItemId }, 'Missing criticScores or cohortRank — run scorer and ranker first');
      return false;
    }

    const [registry] = await db
      .select({ stages: processingRegistry.stages })
      .from(processingRegistry)
      .where(eq(processingRegistry.contentItemId, contentItemId))
      .limit(1);

    const { clusterId, weekId, compositeRank, totalInCohort } = item.cohortRank;

    const peerRows = await db
      .select({
        id:           contentItems.id,
        title:        contentItems.title,
        criticScores: contentItems.criticScores,
      })
      .from(contentItems)
      .where(
        and(
          isNotNull(contentItems.criticScores),
          sql`taxonomy->>'primaryArea' = ${item.taxonomy?.primaryArea ?? ''}`,
          sql`to_char(published_at, 'IYYY-"W"IW') = ${weekId}`,
        ),
      )
      .orderBy(desc(contentItems.globalQuality))
      .limit(4);

    const topPeers = peerRows
      .filter(p => p.id !== contentItemId)
      .slice(0, 3)
      .map((p, i) => ({
        title:     p.title,
        rank:      i + 1,
        composite: computeCompositeScore(p.criticScores!),
        scores:    {
          aiNovelty:  p.criticScores!.aiNovelty.score,
          usefulness: p.criticScores!.usefulness.score,
          popularity: p.criticScores!.popularity.total,
        } as Record<string, number>,
      }));

    const model = getFlashModel();
    const result = await model.generateContent(
      buildJustificationPrompt(
        item.title, clusterId, weekId, compositeRank, totalInCohort,
        topPeers.map(p => ({ title: p.title, composite: p.composite })),
      ),
    );

    const positionExplanation = result.response.text().trim();

    const comparisonToTopPeers: PeerComparison[] = topPeers.map(p => ({
      title:  p.title,
      rank:   p.rank,
      scores: p.scores,
    }));

    const justification: JustificationDossier = {
      contentId:            contentItemId,
      generatedAt:          new Date().toISOString(),
      agentAuditTrail:      buildAuditTrail(registry?.stages ?? null),
      positionExplanation,
      comparisonToTopPeers,
    };

    await db.update(contentItems)
      .set({ justification, processingStatus: 'complete', updatedAt: new Date() })
      .where(eq(contentItems.id, contentItemId));

    logger.info({ contentItemId }, 'Justification generated');
    return true;
  } catch (err) {
    logger.error({ contentItemId, err }, 'Failed to generate justification');
    return false;
  }
}
