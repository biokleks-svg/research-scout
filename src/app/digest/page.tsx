import { redirect } from 'next/navigation';
import { lucia } from '@/lib/auth';
import { cookies } from 'next/headers';
import { db } from '@/server/db';
import { contentItems } from '@/server/db/schema';
import { desc, ne, and, isNotNull } from 'drizzle-orm';

export const revalidate = 3600; // 1 hour ISR

export default async function DigestPage() {
  const cookieStore = await cookies();
  const sessionId   = lucia.readSessionCookie(cookieStore.toString());
  if (!sessionId) redirect('/login');

  const { user } = await lucia.validateSession(sessionId);
  if (!user) redirect('/login');

  const items = await db.query.contentItems.findMany({
    where: and(
      ne(contentItems.processingStatus, 'duplicate'),
      isNotNull(contentItems.criticScores),
    ),
    orderBy: [desc(contentItems.globalQuality)],
    limit: 10,
    columns: {
      id: true, title: true, sourceUrl: true, taxonomy: true,
      globalQuality: true, summary: true, publishedAt: true,
    },
  });

  if (items.length === 0) {
    return (
      <main className="max-w-3xl mx-auto py-10 px-4">
        <h1 className="text-2xl font-bold mb-4">Your Daily Digest</h1>
        <p className="text-sm text-muted-foreground">No scored content yet. Check back soon.</p>
      </main>
    );
  }

  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const topic = (item.taxonomy as { primaryArea?: string } | null)?.primaryArea ?? 'General';
    if (!grouped.has(topic)) grouped.set(topic, []);
    grouped.get(topic)!.push(item);
  }

  const published = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <main className="max-w-3xl mx-auto py-10 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Your Daily Digest</h1>
        <p className="text-sm text-muted-foreground mt-1">{published}</p>
      </div>

      {[...grouped.entries()].map(([topic, topicItems]) => (
        <section key={topic} className="space-y-4">
          <h2 className="text-lg font-semibold">{topic}</h2>
          {topicItems.map(item => (
            <div key={item.id} className="border rounded-lg p-4 space-y-1">
              <a href={`/paper/${item.id}`} className="font-medium text-sm hover:underline">{item.title}</a>
              {item.summary && (
                <p className="text-sm text-muted-foreground italic">
                  {(item.summary as { tldr?: string }).tldr}
                </p>
              )}
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                View source →
              </a>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
