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

export interface AreaForecastSignals {
  clusterGrowthRate: number[];  // COUNT(*) per week, 8 weeks oldest→newest
  citationVelocity:  number[];  // AVG(citationCount) per week, 8 weeks
  engagementTrend:   number[];  // AVG(engagementScore) per week, 8 weeks
  harvestVolume:     number[];  // COUNT(*) per week (same as clusterGrowthRate here)
}

export interface AreaForecastPrediction {
  growthPercent: number;
  confidence:    'low' | 'medium' | 'high';
  horizon:       '6mo';
}

export interface AreaForecast {
  id:           string;
  taxonomyArea: string;
  forecastDate: Date;
  signals:      AreaForecastSignals;
  prediction:   AreaForecastPrediction;
  narrative:    string;
  createdAt:    Date;
}
