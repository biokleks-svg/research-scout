# Agent Specifications

AI Pulse deploys 17 specialized agents across 4 tiers. All are stateless TypeScript workers pulling jobs from BullMQ queues. All LLM agents use Gemini exclusively.

## Tier 1 — Harvest Agents (6)

### 1. Paper Harvester

- **Sources:** arXiv API (OAI-PMH for bulk, REST for targeted — cs.AI, cs.LG, cs.CL, stat.ML), Semantic Scholar Graph API (citations, h-index, recommendations), OpenReview (NeurIPS, ICML, ICLR submissions)
- **Schedule:** Every 2 hours (arXiv new); daily (Semantic Scholar enrichment)
- **Rate limits:** arXiv: 1 req/3s. Semantic Scholar: 1 RPS free, 10 RPS with key. OpenReview: reasonable use
- **Auth:** arXiv: none. Semantic Scholar: free API key. OpenReview: optional account
- **Cost:** Free
- **Output:** ContentItem with full metadata, abstract, PDF URL, citation count, Semantic Scholar paper ID
- **Fallback:** Kaggle arXiv dataset (monthly snapshot), S2ORC open dataset

### 2. Video Harvester

- **Sources:** YouTube Data API v3 (search + channel monitoring for curated list), transcript extraction via `youtube-transcript-api` npm package
- **Curated channels:** Yannic Kilcher, Two Minute Papers, AI Explained, 3Blue1Brown, Andrej Karpathy, Computerphile, StatQuest
- **Schedule:** Every 6 hours. Prioritize by view velocity in first 48h
- **Rate limits:** 10,000 units/day (search = 100 units, list = 1 unit)
- **Auth:** API key / OAuth
- **Cost:** Free
- **Output:** ContentItem with title, channel, transcript, view count, engagement metrics
- **Fallback:** RSS for channels (zero quota), Supadata API for transcripts ($0.001/each)

### 3. Social Harvester (Multi-Platform)

Monitors all major platforms where AI/ML researchers publish and discuss work:

| Platform | API | Rate Limit | Auth | Cost | Notes |
|----------|-----|-----------|------|------|-------|
| **Bluesky** (primary) | AT Protocol firehose + lists | Generous | App password / OAuth | Free | #1 platform for AI researchers; highest science engagement |
| **X / Twitter** | RSS bridges (Nitter) or API v2 | Free: 1 req/15min; Basic: 10K tweets/mo | OAuth 2.0 | $0–100/mo | Optional — start without official API |
| **Mastodon** | Federated API | 300 req/5min per instance | OAuth (user) / none (public) | Free | sigmoid.social, fosstodon.org |
| **Reddit** | Reddit API | 100 req/min (OAuth) | OAuth 2.0 | Free | r/MachineLearning, r/LocalLLaMA, r/artificial |
| **LinkedIn** | Playwright scraping | Rate-limited by anti-bot | Session cookies | Free | No public post API; curated profiles only |
| **Threads** | Unofficial API / RSS bridges | Varies | Varies | Free | Growing academic presence |
| **Hacker News** | Algolia API | 10,000 req/hr | None | Free | Strong practitioner interest signal |
| **Discord** | Bot API (Discord.js) | 50 req/sec per bot | Bot token | Free | Eleuther AI, HuggingFace, Stability AI servers |
| **ResearchGate** | Playwright scraping | Self-limited | None | Free | Publication alerts + discussions |
| **Academia.edu** | RSS monitoring | N/A | None | Free | 294M+ accounts |

- **Schedule:** Every 2h (Bluesky/X/Reddit); every 6h (LinkedIn/Threads/HN); daily (ResearchGate/Academia)
- **Output:** ContentItem with post text, engagement metrics, platform source tag, linked URLs

### 4. Conference Scraper

- **Sources:** Playwright scraping of conference websites (NeurIPS, ICML, ICLR, ACL, EMNLP, CVPR, AAAI, MLSys) + DBLP API for proceedings metadata
- **Schedule:** Weekly (daily during conference season)
- **Auth:** None
- **Cost:** Free
- **Output:** ContentItem with conference metadata, acceptance status, recordings

### 5. Blog & Newsletter Watcher

- **Sources:** RSS/Atom feeds from AI labs (OpenAI, Anthropic, Google DeepMind, Meta FAIR, Mistral, Cohere, xAI), researcher blogs, newsletters (The Batch, Import AI, TLDR AI, Sebastian Raschka's substack)
- **Content extraction:** `@mozilla/readability` for clean text
- **Schedule:** Every 6 hours
- **Cost:** Free
- **Output:** ContentItem with extracted text, author, source publication

### 6. HuggingFace Model Tracker

- **Sources:** HuggingFace Hub API — trending models, new datasets, Spaces demos
- **Schedule:** Daily
- **Auth:** Free API token
- **Cost:** Free
- **Output:** ContentItem with model name, download stats, linked paper ID, benchmarks

## Tier 2 — Processing Agents (4)

### 7. Dedup & Classification Agent

- **Model:** Gemini `text-embedding-004` (768-dim)
- **Process:** Compute embedding → check pgvector cosine similarity > 0.92 → merge or classify → assign taxonomy, difficulty level, initial importance
- **Output:** Updated ContentItem with embedding, taxonomy, difficulty. Status: `classified`

### 8. Infographic Generator Agent

- **Model:** Nano Banana 2 (Gemini 3.1 Flash Image) — $0.065/image at 1K resolution
- **Process:** Gemini 2.5 Flash extracts visual spec (layout, diagrams, key numbers) from abstract + results → Nano Banana 2 generates image → Sharp post-processes to 1200x675px branded PNG → upload to R2
- **Output:** R2 URL saved to `infographic_url` column. Never regenerated
- **Configurable:** Can be disabled or limited to top-N% in Settings Panel

### 9. Summary Writer Agent

- **Model:** Gemini 2.5 Flash (structured output mode)
- **Process:** Generate ~500-word structured summary: problem, key insight, results, limitations, why it matters, practical takeaway. JSON schema enforced via Zod
- **Output:** SummarySchema JSON saved to `summary` JSONB column. Never regenerated

### 10. Podcast Generator Agent (ON-DEMAND)

- **Model:** NotebookLM Podcast API (primary) / Gemini 2.5 Pro + local TTS (fallback)
- **Trigger:** User clicks "Generate Podcast" in UI — NOT part of automatic pipeline
- **Process:** Paper text → NotebookLM API (< 100K tokens) → MP3 → FFmpeg normalization → R2 upload
- **Status flow:** `not_requested → queued → generating → available`
- **Output:** MP3 in R2, permanently persisted. Auto-added to RSS feed
- **Configurable:** Can enable auto-podcast for top-N papers/week in Settings Panel

## Tier 3 — Intelligence Agents (4)

### 11. Trend Detector Agent

- **Model:** Gemini 2.5 Flash (for concept extraction)
- **Process:** Cross-source signal aggregation with z-score anomaly detection. Monitors paper bursts, citation velocity, social buzz, video surges, blog coverage, model releases, conference signals. See `docs/TREND-ENGINE.md`
- **Output:** Trend entities with status (emerging/rising/peak/fading), momentum score, per-category breakdown

### 12. Trend Narrative Agent

- **Model:** Gemini 2.5 Pro (best writing quality)
- **Process:** Takes raw trend signals → generates human-readable narratives ("This week in AI: LLM tokenizer design is having a moment")
- **Output:** Short blurbs (feed cards) + long-form weekly reports. All persisted

### 13. Recommendation Engine Agent

- **Process:** Candidate generation (pgvector ANN, 21-day window, top 200) → feature scoring (relevance, quality, freshness, trend alignment, diversity) → Gemini re-ranker (top 50) → feed assembly (top 20 + trending + serendipity)
- **Output:** Per-user ranked feed cached in Redis

### 14. Digest Composer Agent

- **Process:** Select top-N items from rec engine → group by trend/topic → format as email (Resend) + in-app view
- **Output:** Digest HTML persisted as shareable URL

## Tier 4 — Critic Layer (3)

### 15. Multi-Dimensional Scorer Agent

- **Model:** Gemini 2.5 Flash
- **Dimensions:** AI Novelty, Usefulness, Methodological Rigor, Reproducibility, Web Buzz, Popularity (with trend-inherited boost), Industry Relevance, Longevity Potential
- **Output:** 8 scores (0-100 each) saved to `critic_scores` JSONB. See `docs/CRITIC-LAYER.md`

### 16. Cohort Rank Synthesizer Agent

- **Process:** Place item within weekly cohort + topic cluster. Compute percentile ranks per dimension. Refresh materialized views
- **Output:** `cohort_rank` JSONB with per-dimension percentile and composite rank

### 17. Justification Composer Agent

- **Model:** Gemini 2.5 Flash
- **Process:** Collect audit entries from all agents → generate natural language position explanation
- **Output:** `justification` JSONB with agent audit trail + `positionExplanation` + `comparisonToTopPeers`
