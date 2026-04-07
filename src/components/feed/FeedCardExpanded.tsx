import type { SummarySchema } from '@/types/content';
import { Badge } from '@/components/ui/badge';
import { PodcastButton } from '@/components/content/PodcastButton';
import type { PodcastStatusValue } from '@/agents/processors/podcast';

interface FeedCardExpandedProps {
  contentId:      string;
  summary:        SummarySchema | null;
  infographicUrl: string | null;
  podcastUrl:     string | null;
  podcastStatus:  string | null;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner:     'bg-green-100 text-green-800',
  intermediate: 'bg-yellow-100 text-yellow-800',
  advanced:     'bg-red-100 text-red-800',
};

export function FeedCardExpanded({ contentId, summary, infographicUrl, podcastUrl, podcastStatus }: FeedCardExpandedProps) {
  const initialStatus = (podcastUrl ? 'available' : (podcastStatus ?? 'not_requested')) as PodcastStatusValue;

  return (
    <div className="mt-3 border-t pt-3 space-y-4">
      {infographicUrl && (
        <img
          src={infographicUrl}
          alt="Research infographic"
          className="w-full rounded-md object-cover"
          style={{ aspectRatio: '16/9' }}
        />
      )}

      {summary && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{summary.tldr}</p>
          <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground">
            <div><span className="font-medium text-foreground">Problem: </span>{summary.problem}</div>
            <div><span className="font-medium text-foreground">Key insight: </span>{summary.keyInsight}</div>
            <div><span className="font-medium text-foreground">Results: </span>{summary.results}</div>
            <div><span className="font-medium text-foreground">Why it matters: </span>{summary.whyItMatters}</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`text-xs ${DIFFICULTY_COLORS[summary.difficulty] ?? 'bg-gray-100 text-gray-800'}`}>
              {summary.difficulty}
            </Badge>
            <span className="text-xs text-muted-foreground">{summary.wordCount.toLocaleString()} words</span>
          </div>
        </div>
      )}

      {!summary && !infographicUrl && (
        <p className="text-sm text-muted-foreground italic">Summary processing…</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <PodcastButton
          contentId={contentId}
          podcastUrl={podcastUrl}
          initialStatus={initialStatus}
        />
        <a href={`/paper/${contentId}`} className="text-xs text-blue-600 hover:underline">
          Full details →
        </a>
      </div>
    </div>
  );
}
