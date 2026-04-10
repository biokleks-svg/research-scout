import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { isNotNull } from 'drizzle-orm';
import { buildRecommendations } from './rec-engine';
import type { TaxonomyTags, SummarySchema } from '@/types/content';
import { pino } from 'pino';

const logger = pino({ name: 'digest-composer' });

export interface DigestItem {
  id:       string;
  title:    string;
  sourceUrl: string;
  taxonomy: TaxonomyTags | null;
  score:    number;
  summary:  SummarySchema | null;
}

export function groupByTopic(items: DigestItem[]): Map<string, DigestItem[]> {
  const groups = new Map<string, DigestItem[]>();
  for (const item of items) {
    const topic = item.taxonomy?.primaryArea ?? 'General';
    if (!groups.has(topic)) groups.set(topic, []);
    groups.get(topic)!.push(item);
  }
  return groups;
}

export function formatDigestItem(item: DigestItem): string {
  const lines = [`• **${item.title}**`, `  ${item.sourceUrl}`];
  if (item.summary?.tldr) lines.push(`  > ${item.summary.tldr}`);
  return lines.join('\n');
}

export async function composeDigest(userId: string, limit = 10): Promise<string> {
  const recs = await buildRecommendations(userId, limit);
  const items: DigestItem[] = recs.map(r => ({
    id:       r.id,
    title:    r.title,
    sourceUrl: r.sourceUrl,
    taxonomy: r.taxonomy as TaxonomyTags | null,
    score:    r.score,
    summary:  r.summary as SummarySchema | null,
  }));

  if (items.length === 0) return 'No new content to digest. Check back tomorrow.';

  const grouped = groupByTopic(items);
  const sections: string[] = [`# Your AI Research Digest\n*${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}*\n`];

  for (const [topic, topicItems] of grouped) {
    sections.push(`## ${topic}\n`);
    for (const item of topicItems) sections.push(formatDigestItem(item));
    sections.push('');
  }

  return sections.join('\n');
}

export async function composeDigestForAllUsers(): Promise<void> {
  logger.info('Composing digests for all users');
  const usersWithEmbeddings = await db.query.users.findMany({
    where: isNotNull(users.interestEmbedding),
    columns: { id: true },
  });

  for (const user of usersWithEmbeddings) {
    try {
      await composeDigest(user.id);
      logger.info({ userId: user.id }, 'Digest composed');
    } catch (err) {
      logger.error({ userId: user.id, err }, 'Failed to compose digest');
    }
  }
}
