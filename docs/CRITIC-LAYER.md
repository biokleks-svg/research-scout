# Critic Layer

## Overview

The critic layer provides transparent, multi-dimensional evaluation of every content item. It runs after the three-pass processing pipeline and produces scores, rankings, and a human-readable justification dossier.

## 8 Scoring Dimensions

### Quality & Substance Dimensions

| Dimension | Range | How It's Computed | Sources |
|-----------|-------|-------------------|---------|
| **AI Novelty** | 0-100 | Gemini evaluates: Does this introduce a genuinely new technique/architecture/finding? Checked against existing papers in the same topic cluster (pgvector cosine search). High novelty = no close neighbors in embedding space. "Incremental improvement" papers score 30-50; paradigm shifts score 80+. | Paper text, embedding neighbors |
| **Usefulness / Practicality** | 0-100 | Does it release code? (GitHub link check) Reproducible results? (benchmark tables) Practical applications? (domain mentioned) Clear methodology? A paper with code + benchmarks + practical application scores 80+. Answers: "Can I use this on Monday?" | Paper text, GitHub detection, metadata |
| **Methodological Rigor** | 0-100 | Gemini evaluates: ablation studies present? Statistical significance reported? Multiple baselines compared? Limitations discussed honestly? Dataset documented? Follows best practices from NeurIPS reproducibility checklist. | Paper text (methods/experiments sections) |
| **Reproducibility** | 0-100 | Code available and runnable? (GitHub stars + recent commits). Pre-trained models released? (HuggingFace Hub lookup). Dataset publicly available? Clear hyperparameter specs? Docker/environment provided? Scored independently from Usefulness. | GitHub API, HuggingFace Hub API, paper text |

### Impact & Reach Dimensions

| Dimension | Range | How It's Computed | Sources |
|-----------|-------|-------------------|---------|
| **Web Buzz** | 0-100 | Composite of social mentions across all platforms (Bluesky, X, Mastodon, Reddit, LinkedIn, HN, Discord), YouTube videos, blog coverage, HuggingFace model releases. Normalized per topic. Platform weights: Bluesky 1.5x, X 1.0x, HN 1.2x, Reddit 1.0x, LinkedIn 0.8x. | Social Harvester (all platforms), Video/Blog/HF data |
| **Popularity** | 0-100 | Citation velocity (Semantic Scholar) + download/view counts + influence score + trend-inherited score. If paper's topic is trending, it inherits bonus: `trendBonus = trendMomentum * 0.3`. Ensures timely papers surface immediately. | Semantic Scholar, Trend Engine, engagement metrics |

### Forward-Looking Dimensions

| Dimension | Range | How It's Computed | Sources |
|-----------|-------|-------------------|---------|
| **Industry Relevance** | 0-100 | Is this from an industry lab? Does it address deployment concerns (latency, cost, safety, scale)? Are companies building on it? (HF downloads, company blog mentions). Measures the gap between "interesting research" and "will ship in a product." | Author affiliation, HF downloads, company blog mentions |
| **Longevity Potential** | 0-100 | Predictive: Is this foundational or a one-off result? Gemini evaluates: Does it open new research directions? Is the technique generalizable? Does it introduce a new benchmark or dataset? Papers that spawn sub-fields score high. Heuristic: papers with 5+ follow-up works in 30 days get a retroactive boost. | Citation network growth, concept cluster expansion, follow-up detection |

## Dimension Weights (User-Configurable)

Default weights: Novelty 20%, Usefulness 15%, Rigor 10%, Reproducibility 10%, Buzz 15%, Popularity 15%, Industry Relevance 10%, Longevity 5%.

Users can adjust these in the Settings Panel. A practitioner might upweight Usefulness and Industry Relevance; a researcher might prioritize Novelty and Rigor.

## Cross-Comparison Process

```typescript
async function runCriticPipeline(item: ContentItem) {
  // 1. Get the item's topic cluster
  const cluster = await getTopicCluster(item.embedding);
  const cohort = await getWeeklyCohort(cluster.id, item.publishedAt);

  // 2. Score on all 8 dimensions
  const scores = await scoreAllDimensions(item, cohort, cluster);

  // 3. Persist scores
  await db.update(contentItems)
    .set({ criticScores: scores })
    .where(eq(contentItems.id, item.id));

  // 4. Recompute cohort rankings (materialized view refresh)
  await refreshCohortRankings(cluster.id, getWeekId(item.publishedAt));

  // 5. Generate justification dossier
  await generateJustification(item, scores, cohort);
}
```

## Cohort Ranking

Items are ranked within their weekly cohort and topic cluster. Percentile ranks computed per dimension. Materialized views refreshed after each scoring run.

The CohortRank structure:
```typescript
interface CohortRank {
  clusterId: string;
  weekId: string;
  compositeRank: number;
  totalInCohort: number;
  percentiles: {
    aiNovelty: number;
    usefulness: number;
    methodologicalRigor: number;
    reproducibility: number;
    webBuzz: number;
    popularity: number;
    industryRelevance: number;
    longevityPotential: number;
  };
}
```

## Trend-Inherited Popularity

Formula: `popularityScore = basePopularity + (trendMomentum * trendInheritanceFactor)`

Where:
- `trendInheritanceFactor` = 0.3 (configurable in Settings)
- `trendMomentum` = 0-100 from Trend Detector

This creates a virtuous cycle: trending topics boost papers -> boosted papers get more engagement -> engagement signals feed back into trend detector -> trend strengthens. Factor is capped to prevent runaway amplification.

## Justification Dossier

Every content item has a transparent audit trail. Structure:

```json
{
  "contentId": "uuid",
  "generatedAt": "ISO8601",
  "agentAuditTrail": [
    {
      "agent": "Paper Harvester",
      "timestamp": "ISO8601",
      "action": "Discovered via arXiv API (cs.LG, daily scan)",
      "details": "Paper ID: 2604.01234. Cross-referenced with Semantic Scholar."
    },
    {
      "agent": "Dedup & Classifier",
      "timestamp": "ISO8601",
      "action": "Classified as: tokenizer-design / methods / intermediate",
      "details": "Nearest neighbor: 'BPE Is Not All You Need' (cosine 0.87)."
    }
    // ... entries from each agent that touched this item
  ],
  "positionExplanation": "This paper ranks #2 in its weekly 'tokenizer-design' cohort...",
  "comparisonToTopPeers": [
    { "title": "Adaptive BPE Merging", "rank": 1, "scores": { ... } },
    { "title": "[THIS PAPER]", "rank": 2, "scores": { ... } }
  ]
}
```

The `positionExplanation` is a Gemini-generated natural language explanation shown in the UI as a collapsible "Why is this here?" section.

## UI Integration

The content detail page (`/paper/[id]`) shows:
- Critic radar chart (8 dimensions) using Recharts
- Cohort comparison table with peer items
- Expandable "Why is this here?" justification panel
- Related items sidebar
