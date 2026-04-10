import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { contentItems } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { PodcastButton } from '@/components/content/PodcastButton';
import { CriticRadarChart } from '@/components/content/CriticRadarChart';
import { JustificationPanel } from '@/components/content/JustificationPanel';
import type { PodcastStatusValue } from '@/agents/processors/podcast';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PaperPage({ params }: Props) {
  const { id } = await params;
  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, id))
    .limit(1);

  if (!item) notFound();

  const published = item.publishedAt.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const DIFFICULTY_COLORS: Record<string, string> = {
    beginner:     'bg-green-100 text-green-800',
    intermediate: 'bg-yellow-100 text-yellow-800',
    advanced:     'bg-red-100 text-red-800',
  };

  const podcastInitialStatus = (item.podcastUrl ? 'available' : (item.podcastStatus ?? 'not_requested')) as PodcastStatusValue;

  const summaryFields = item.summary ? [
    { label: 'Problem',            key: 'problem'           },
    { label: 'Key Insight',        key: 'keyInsight'        },
    { label: 'Results',            key: 'results'           },
    { label: 'Limitations',        key: 'limitations'       },
    { label: 'Why It Matters',     key: 'whyItMatters'      },
    { label: 'Practical Takeaway', key: 'practicalTakeaway' },
  ] as const : [];

  return (
    <main className="max-w-3xl mx-auto py-10 px-4 space-y-8">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold leading-tight">{item.title}</h1>
        <p className="text-sm text-muted-foreground">
          {(item.authors ?? []).join(', ')} · {published}
          {(item.citationCount ?? 0) > 0 && ` · ${item.citationCount?.toLocaleString()} citations`}
        </p>
        <div className="flex flex-wrap gap-2">
          {item.taxonomy?.primaryArea && (
            <Badge className="bg-blue-100 text-blue-800">{item.taxonomy.primaryArea}</Badge>
          )}
          {item.difficultyLevel && (
            <Badge className={DIFFICULTY_COLORS[item.difficultyLevel] ?? 'bg-gray-100 text-gray-800'}>
              {item.difficultyLevel}
            </Badge>
          )}
        </div>
        <div className="flex gap-3 items-center">
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
            View source →
          </a>
          <PodcastButton
            contentId={item.id}
            podcastUrl={item.podcastUrl}
            initialStatus={podcastInitialStatus}
          />
        </div>
      </div>

      {item.infographicUrl && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Infographic</h2>
          <img
            src={item.infographicUrl}
            alt="Research infographic"
            className="w-full rounded-lg shadow-sm"
            style={{ aspectRatio: '16/9', objectFit: 'cover' }}
          />
        </div>
      )}

      {item.summary && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Summary</h2>
          <p className="text-base text-muted-foreground italic">&ldquo;{item.summary.tldr}&rdquo;</p>
          {summaryFields.map(({ label, key }) => (
            <div key={key}>
              <h3 className="text-sm font-semibold mb-1">{label}</h3>
              <p className="text-sm text-muted-foreground">{item.summary![key]}</p>
            </div>
          ))}
        </div>
      )}

      {!item.summary && item.rawText && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Abstract</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{item.rawText.slice(0, 2000)}</p>
        </div>
      )}

      {!item.summary && !item.rawText && (
        <p className="text-sm text-muted-foreground italic">Content is being processed…</p>
      )}

      {item.criticScores && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Critic Scores</h2>
          <CriticRadarChart scores={item.criticScores} />
        </div>
      )}

      {item.justification && (
        <JustificationPanel justification={item.justification} />
      )}
    </main>
  );
}
