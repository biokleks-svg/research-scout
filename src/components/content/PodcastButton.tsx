'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Loader2, Play } from 'lucide-react';
import { trpc } from '@/app/providers';
import type { PodcastStatusValue } from '@/agents/processors/podcast';

interface PodcastButtonProps {
  contentId:     string;
  podcastUrl:    string | null;
  initialStatus: PodcastStatusValue;
}

export function PodcastButton({ contentId, podcastUrl, initialStatus }: PodcastButtonProps) {
  const [status, setStatus] = useState<PodcastStatusValue>(initialStatus);
  const [url,    setUrl]    = useState<string | null>(podcastUrl);

  const requestMutation = trpc.podcast.requestGeneration.useMutation({
    onSuccess(data) {
      setStatus(data.status as PodcastStatusValue);
      if ('podcastUrl' in data && data.podcastUrl) setUrl(data.podcastUrl);
    },
  });

  const { data: podcastData } = trpc.podcast.getStatus.useQuery(
    { contentId },
    {
      enabled: status === 'queued' || status === 'generating',
      refetchInterval: 5000,
    },
  );

  useEffect(() => {
    if (podcastData?.status === 'available' && podcastData.podcastUrl) {
      setStatus('available');
      setUrl(podcastData.podcastUrl);
    } else if (podcastData?.status) {
      setStatus(podcastData.status as PodcastStatusValue);
    }
  }, [podcastData]);

  if (status === 'available' && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs text-green-700 hover:underline"
      >
        <Play className="w-3 h-3" /> Listen to podcast
      </a>
    );
  }

  if (status === 'queued' || status === 'generating') {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        {status === 'queued' ? 'Queued…' : 'Generating podcast…'}
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-xs h-7 px-2"
      onClick={() => requestMutation.mutate({ contentId })}
      disabled={requestMutation.isPending}
    >
      <Mic className="w-3 h-3 mr-1" />
      Generate podcast
    </Button>
  );
}
