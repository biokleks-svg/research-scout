export interface CriticDimension {
  score: number;
  reasoning: string;
}

export interface PopularityDimension {
  base: number;
  trendBonus: number;
  total: number;
}

export interface CriticScores {
  aiNovelty:           CriticDimension;
  usefulness:          CriticDimension;
  methodologicalRigor: CriticDimension;
  reproducibility:     CriticDimension;
  webBuzz:             CriticDimension;
  popularity:          PopularityDimension;
  industryRelevance:   CriticDimension;
  longevityPotential:  CriticDimension;
}

export interface CohortRank {
  clusterId:     string;
  weekId:        string;
  compositeRank: number;
  totalInCohort: number;
  percentiles:   Record<string, number>;
}

export interface AuditEntry {
  agent:     string;
  timestamp: string;
  action:    string;
  details:   string;
}

export interface PeerComparison {
  title:  string;
  rank:   number;
  scores: Record<string, number>;
}

export interface JustificationDossier {
  contentId:             string;
  generatedAt:           string;
  agentAuditTrail:       AuditEntry[];
  positionExplanation:   string;
  comparisonToTopPeers:  PeerComparison[];
}
