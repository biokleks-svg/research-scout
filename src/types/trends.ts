export type TrendStatus = 'emerging' | 'rising' | 'peak' | 'fading';

export interface TrendSignals {
  paperBurst:       { count: number; zScore: number; window: '7d' };
  citationVelocity: { meanPerDay: number; zScore: number };
  socialBuzz:       { mentions: number; weightedScore: number; topPlatform: string };
  videoSurge:       { newVideos: number; viewVelocity: number };
  blogCoverage:     { posts: number; labBlogCount: number };
  modelRelease:     { count: number; totalDownloads: number };
  conferenceSignal: { acceptedPapers: number; workshops: number };
}

export interface Trend {
  id:                string;
  name:              string;
  slug:              string;
  category:          string | null;
  description:       string | null;
  narrative:         string | null;
  status:            TrendStatus;
  momentumScore:     number;
  zScore:            number;
  signals:           TrendSignals | null;
  evidenceIds:       string[] | null;
  detectedAt:        Date;
  peakedAt:          Date | null;
  updatedAt:         Date;
}
