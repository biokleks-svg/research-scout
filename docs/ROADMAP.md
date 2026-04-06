# Roadmap

## Phase 1 — Foundation (Weeks 1-4)

- Next.js monorepo with tRPC, Drizzle, Tailwind, shadcn/ui
- PostgreSQL schema with pgvector; Docker Compose with MinIO
- Paper Harvester Agent (arXiv + Semantic Scholar)
- Dedup & Classification Agent (Gemini embeddings)
- Basic feed UI with content cards (metadata only)
- Offline pipeline scheduler (node-cron + BullMQ)

## Phase 2 — Three-Pass + Interest Input (Weeks 5-8)

- Infographic Generator (Nano Banana 2)
- Summary Writer (Gemini 2.5 Flash)
- Podcast Generator (NotebookLM + fallback)
- All outputs persisted to R2 + PostgreSQL
- User auth (Lucia) + Interest Manager Panel
- Progressive disclosure UI (collapsed -> expanded cards)
- Deploy MVP: web app to Railway, workers locally

## Phase 3 — Critic + Trends (Weeks 9-12)

- Multi-Dimensional Scorer (all 8 dimensions)
- Cohort Rank Synthesizer + materialized views
- Justification Composer (Paper Dossier)
- Trend Detector + Trend Narrative agents
- Trends Dashboard with per-category views
- Trend-inherited popularity propagation

## Phase 4 — Full Harvesters + Rec Engine (Weeks 13-16)

- Video Harvester, Social Harvester, Blog Watcher, HF Tracker, Conference Scraper
- Recommendation Engine with user feedback loop
- Digest Composer + email delivery
- Admin dashboard, pipeline monitoring
- Settings Panel with cost controls
- Performance optimization, podcast RSS feed
- Data export/privacy controls, documentation

## Phase 5 — Future

- RAG chat: "Ask me about this paper"
- Multi-user mode with collaborative collections
- PWA with offline podcast downloads
- Zotero/Mendeley integration for reference management
- Custom agent plugins for user-defined data sources
- Predictive trend model (embedding-cluster growth velocity for 6-month forecasting)

## Risks & Mitigations

| Risk | Prob. | Impact | Mitigation |
|------|-------|--------|------------|
| X/Twitter API cost/restriction | High | Med | Start without it; use free alternatives; X is nice-to-have |
| NotebookLM API access denied | Med | Med | Open-source fallback (local-notebooklm) from day one |
| Gemini API cost spikes at scale | Med | High | Tiered processing (full three-pass only for top-ranked); use Flash for everything possible; batch API for 50% discount |
| YouTube transcript access breaks | Med | Med | Multiple fallback options (Supadata API, Apify); degrade to metadata-only |
| Cold-start recommendation quality | High | Low | Rich onboarding with Interest Panel; seed papers; fall back to global popularity |
| Nano Banana 2 infographic quality inconsistent | Med | Low | Post-processing with Sharp; template-based layout spec; quality filter |
| Trend false positives (noise) | Med | Med | z-score threshold tuning; require multi-source confirmation; human review for first month |
| Solo developer burnout | High | High | Phase-based roadmap; each phase deployable; automate everything |
