'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FeedCardExpanded } from './FeedCardExpanded';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { SummarySchema } from '@/types/content';

interface FeedCardProps {
  id:              string;
  title:           string;
  authors:         string[] | null;
  publishedAt:     Date | string;
  sourceUrl:       string;
  sourceType:      string;
  taxonomy:        { primaryArea: string; subAreas: string[]; taskTypes: string[]; applicationDomains: string[] } | null;
  difficultyLevel: string | null;
  citationCount:   number | null;
  processingStatus: string | null;
  summary:         SummarySchema | null;
  infographicUrl:  string | null;
  podcastUrl:      string | null;
  podcastStatus:   string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  paper:      'arXiv',
  video:      'YouTube',
  tweet:      'Social',
  blog:       'Blog',
  conference: 'Conference',
  model:      'HuggingFace',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner:     'bg-green-100 text-green-800',
  intermediate: 'bg-yellow-100 text-yellow-800',
  advanced:     'bg-red-100 text-red-800',
};

export function FeedCard({
  id, title, authors, publishedAt, sourceUrl, sourceType,
  taxonomy, difficultyLevel, citationCount,
  summary, infographicUrl, podcastUrl, podcastStatus,
}: FeedCardProps) {
  const [expanded, setExpanded] = useState(false);
  const authorList     = authors?.slice(0, 3).join(', ') ?? 'Unknown';
  const hasMoreAuthors = (authors?.length ?? 0) > 3;
  const published      = new Date(publishedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  const hasExpandableContent = !!(summary || infographicUrl);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-snug">
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">
              {title}
            </a>
          </CardTitle>
          <Badge variant="outline" className="shrink-0 text-xs">
            {SOURCE_LABELS[sourceType] ?? sourceType}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground mb-3">
          {authorList}{hasMoreAuthors ? ' et al.' : ''} · {published}
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          {taxonomy?.primaryArea && (
            <Badge className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-100">{taxonomy.primaryArea}</Badge>
          )}
          {difficultyLevel && (
            <Badge className={`text-xs hover:opacity-80 ${DIFFICULTY_COLORS[difficultyLevel] ?? 'bg-gray-100 text-gray-800'}`}>
              {difficultyLevel}
            </Badge>
          )}
          {(citationCount ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground">{(citationCount ?? 0).toLocaleString()} citations</span>
          )}
          {hasExpandableContent && (
            <button
              onClick={() => setExpanded((prev) => !prev)}
              className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
              aria-label={expanded ? 'Collapse summary' : 'Expand summary'}
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'Less' : 'Summary'}
            </button>
          )}
        </div>
        {expanded && (
          <FeedCardExpanded
            contentId={id}
            summary={summary}
            infographicUrl={infographicUrl}
            podcastUrl={podcastUrl}
            podcastStatus={podcastStatus}
          />
        )}
      </CardContent>
    </Card>
  );
}
