# Trend Detection Engine

## Overview

The trend engine is the analytical core of AI Pulse. It operates on two levels: signal-level detection (what's getting more attention right now?) and narrative-level synthesis (why does this matter?). It operates like a social listening + competitive intelligence platform, specialized for the AI/ML research ecosystem.

## Signal Sources & Weights

| Signal | Source Agent | Weight | Computation Method | Time Window |
|--------|-------------|--------|--------------------|-------------|
| Paper burst | Paper Harvester | 0.25 | Count of papers with concept in abstract/title. Z-score vs. 90-day rolling baseline for that topic cluster. | 7-day rolling |
| Citation velocity | Paper Harvester (Semantic Scholar) | 0.15 | Mean citations/day for papers in cluster, first 7 days post-publication. Compared to category mean. | 7-day post-pub |
| Social buzz | Social Harvester | 0.20 | Weighted mentions: post from h-index>=20 account = 5x weight. Quote-posts = 2x. Thread length bonus. Normalized by source. Platform weights: Bluesky 1.5x, X 1.0x, HN 1.2x, Reddit 1.0x, LinkedIn 0.8x. | 48h rolling |
| Video surge | Video Harvester | 0.15 | New videos on topic from tracked channels. View velocity (views/hour in first 48h). Transcript keyword density for topic confirmation. | 7-day rolling |
| Blog coverage | Blog Watcher | 0.10 | Posts from major lab blogs or curated newsletters. Lab blog post = 3x weight vs. individual blog. | 14-day rolling |
| Model/code release | HF Model Tracker | 0.10 | HuggingFace model releases or GitHub repos linked to papers in the cluster. Download velocity. | 14-day rolling |
| Conference signal | Conference Scraper | 0.05 | Accepted papers, invited talks, or dedicated workshops at major venues. | Season-based |

## Keyword Extraction & Concept Clustering

Rather than a fixed keyword list, the trend engine dynamically extracts concepts:

### Step 1: Concept Extraction
Gemini 2.5 Flash extracts 3-5 key concepts from each content item as structured tags (e.g., "tokenizer collation", "BPE alternatives", "vocabulary compression"). Cached — never re-extracted.

### Step 2: Embedding & Clustering
Concept tags are embedded (Gemini `text-embedding-004`) and clustered using HDBSCAN on the pgvector index. Clusters represent "trend topics." Cluster centroids are named by Gemini (e.g., "LLM Tokenizer Design").

### Step 3: Growth Detection
For each cluster, compute the growth rate of items added in the current window vs. baseline. A z-score > 2.0 = emerging trend. z > 3.5 = rising. This catches novel concepts that wouldn't exist in any predefined dictionary.

## Trend Lifecycle & State Machine

90-day lifecycle with 4 states:

```
                    ┌─────────┐
         z > 2.0   │EMERGING │   z > 3.5
         ─────────>│ (new)   ├──────────┐
                    └────┬────┘          │
                         │ sustained     ▼
                         │ 3+ days  ┌─────────┐
                         └─────────>│ RISING  │
                                    │ (hot!)  │
                                    └────┬────┘
                              score      │ score declines
                              peaks      │ for 3+ days
                                 │       │
                                 ▼       ▼
                            ┌─────────┐
                            │  PEAK   │
                            │(snapshot)│
                            └────┬────┘
                                 │ z < 1.5 for 14+ days
                                 ▼
                            ┌─────────┐
                            │ FADING  │──> Archive
                            │(decline)│   (after 90 days)
                            └─────────┘
```

State transitions:
- **Emerging**: z-score > 2.0 detected. New trend entity created.
- **Rising**: z-score > 3.5 OR sustained above 2.0 for 3+ days. Generating momentum.
- **Peak**: Score reaches maximum then begins declining for 3+ days. Snapshot taken.
- **Fading**: z-score drops below 1.5 for 14+ consecutive days. "What replaced this?" pointer generated.
- **Archive**: After 90 days from detection, moved to archive. Still queryable but not shown in active feeds.

## Trend Propagation to Content Items

This is the mechanism by which papers inherit topic popularity:

```typescript
async function propagateTrendToContent(trend: Trend) {
  // Find all content items in this trend's topic cluster
  const items = await db.select()
    .from(contentItems)
    .where(sql`embedding <=> ${trend.centroidEmbedding} < 0.3`)
    .where(gte(contentItems.publishedAt, subDays(new Date(), 90)));

  for (const item of items) {
    const trendBonus = trend.momentumScore * TREND_INHERITANCE_FACTOR; // 0.3
    const newPopularity = item.criticScores.popularity.base + trendBonus;

    await db.update(contentItems).set({
      criticScores: {
        ...item.criticScores,
        popularity: { base: item.criticScores.popularity.base, trendBonus, total: newPopularity }
      },
      trendIds: [...(item.trendIds || []), trend.id],
    }).where(eq(contentItems.id, item.id));
  }
}
```

Formula: `popularityScore = basePopularity + (trendMomentum × 0.3)`

The trendInheritanceFactor (0.3) is configurable and capped to prevent runaway amplification.

## Trends Dashboard (Per-Category View)

The frontend at `/trending` shows:

| Section | What It Shows |
|---------|---------------|
| Category Tabs | Filter trends by AI sub-field: NLP, Computer Vision, RL, Multi-Agent Systems, Efficiency/Inference, Safety/Alignment. "All" tab for cross-category. |
| Emerging Trends | New signals detected in last 48h. Green badges. Sparkline showing growth rate. Linked evidence. |
| Rising / Active Trends | Trends gaining momentum. Momentum score bar. Narrative blurb from Trend Narrative Agent. Content counts. |
| Peak Trends | Trends at their height. Comprehensive trend report link. Best content items. "This Week's Big Story" callout. |
| Fading Trends | Previously hot topics losing steam. Archive link. "What replaced this?" pointer. |
| Trend History Timeline | Recharts-powered timeline showing lifecycle over weeks/months. Interactive: click trend to see all associated content. |

## Trend Narrative Generation

The Trend Narrative Agent (Gemini 2.5 Pro) takes raw trend signals and generates human-readable narratives. Two output types:
- Short blurbs for feed cards (1-2 sentences)
- Long-form weekly reports (comprehensive analysis)

All narratives are persisted and never regenerated.
