export type ContentSourceType =
  | 'paper'
  | 'video'
  | 'tweet'
  | 'social'
  | 'blog'
  | 'conference'
  | 'model';

export interface TaxonomyTags {
  primaryArea: string;
  subAreas: string[];
  taskTypes: string[];
  applicationDomains: string[];
}

export interface SummarySchema {
  tldr: string;
  problem: string;
  keyInsight: string;
  results: string;
  limitations: string;
  whyItMatters: string;
  practicalTakeaway: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  wordCount: number;
}

export interface ContentItem {
  id: string;
  sourceType: ContentSourceType;
  sourceId: string;
  sourceUrl: string;
  title: string;
  authors: string[] | null;
  publishedAt: Date;
  harvestedAt: Date;
  rawText: string | null;
  contentHash: string;
  taxonomy: TaxonomyTags | null;
  concepts: string[] | null;
  difficultyLevel: string | null;
  infographicUrl: string | null;
  summary: SummarySchema | null;
  podcastUrl: string | null;
  podcastDuration: number | null;
  criticScores: import('./critic').CriticScores | null;
  cohortRank: import('./critic').CohortRank | null;
  justification: import('./critic').JustificationDossier | null;
  trendIds: string[] | null;
  conferenceMetadata: ConferenceMetadata | null;
  processingStatus: string;
  citationCount: number;
  engagementScore: number;
  globalQuality: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ProcessingStage =
  | 'harvested'
  | 'classified'
  | 'processed'
  | 'scored'
  | 'complete';

export interface StageRecord {
  done: boolean;
  at: string;
  url?: string;
}

export interface RegistryStages {
  harvested:    StageRecord;
  classified:   StageRecord;
  infographic:  StageRecord;
  summary:      StageRecord;
  podcast:      StageRecord;
  criticScored: StageRecord;
  justified:    StageRecord;
}

export interface ConferenceMetadata {
  venue:             string;   // 'NeurIPS' | 'ICML' | 'ICLR' | 'ACL' | 'EMNLP' | 'CVPR' | 'AAAI' | 'MLSys'
  year:              number;
  sessionTrack?:     string;   // e.g. 'oral' | 'spotlight' | 'poster' | 'workshop'
  acceptanceStatus?: string;   // e.g. 'accepted' | 'spotlight' | 'oral'
  recordingUrl?:     string;
  abstract?:         string;   // full abstract from conference page
  enrichedAt?:       string;   // ISO timestamp — set when Playwright enrichment completes
}
