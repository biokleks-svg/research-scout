// Harvest sources
export const ARXIV_BASE_URL = 'https://export.arxiv.org/api/query';
export const ARXIV_CATEGORIES = ['cs.AI', 'cs.LG', 'cs.CL', 'stat.ML'] as const;
export const SEMANTIC_SCHOLAR_BASE_URL = 'https://api.semanticscholar.org/graph/v1';

// Processing
export const DEDUP_SIMILARITY_THRESHOLD = 0.92;
export const EMBEDDING_DIMENSIONS = 768;
export const GEMINI_EMBEDDING_MODEL = 'text-embedding-004';
export const GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
export const GEMINI_PRO_MODEL = 'gemini-2.5-pro';
export const GEMINI_IMAGE_MODEL = 'nano-banana-2';   // Gemini image-gen codename

// Infographic output dimensions
export const INFOGRAPHIC_WIDTH_PX  = 1200;
export const INFOGRAPHIC_HEIGHT_PX = 675;

// Queue names
export const QUEUE_HARVEST     = 'harvest';
export const QUEUE_PROCESS     = 'process';
export const QUEUE_INTELLIGENCE = 'intelligence';
export const QUEUE_CRITIC      = 'critic';
export const QUEUE_PODCAST     = 'podcast';

// Rate limits (ms between requests)
export const ARXIV_RATE_LIMIT_MS            = 3000;
export const SEMANTIC_SCHOLAR_RATE_LIMIT_MS = 1000;

// Pagination
export const DEFAULT_FEED_LIMIT = 20;
export const MAX_FEED_LIMIT     = 100;

// Critic layer
export const TREND_INHERITANCE_FACTOR = 0.3;

export const CRITIC_DIMENSION_WEIGHTS = {
  aiNovelty:           0.20,
  usefulness:          0.15,
  methodologicalRigor: 0.10,
  reproducibility:     0.10,
  webBuzz:             0.15,
  popularity:          0.15,
  industryRelevance:   0.10,
  longevityPotential:  0.05,
} as const;

// Trend detection
export const TREND_Z_SCORE_EMERGING = 2.0;
export const TREND_Z_SCORE_RISING   = 3.5;
export const TREND_Z_SCORE_FADING   = 1.5;
export const TREND_FADING_DAYS      = 14;
export const TREND_LOOKBACK_WEEKS   = 12;

// New harvesters
export const HF_API_BASE          = 'https://huggingface.co/api';
export const YOUTUBE_API_BASE     = 'https://www.googleapis.com/youtube/v3';
export const BLUESKY_API_BASE     = 'https://public.api.bsky.app';
export const HN_API_BASE          = 'https://hn.algolia.com/api/v1';
export const HF_RATE_LIMIT_MS     = 1000;
export const SOCIAL_RATE_LIMIT_MS = 500;
export const YOUTUBE_RATE_LIMIT_MS = 100;

export const BLOG_FEED_URLS: string[] = [
  'https://openai.com/blog/rss.xml',
  'https://www.anthropic.com/blog/rss.xml',
  'https://deepmind.google/blog/rss/',
  'https://ai.meta.com/blog/rss/',
  'https://mistral.ai/news/rss.xml',
  'https://huggingface.co/blog/feed.xml',
  'https://www.deeplearning.ai/the-batch/rss/',
  'https://sebastianraschka.com/rss_feed.xml',
];

export const YOUTUBE_AI_CHANNELS: string[] = [
  'UCbmNph6atAoGfqLoCL_duAg', // Yannic Kilcher
  'UCbfYPyITQ-7l4upoX8nvctg', // Two Minute Papers
  'UCnUYZLuoy1rq1aVMwx4aTzw', // AI Explained
  'UCYO_jab_esuFRV4b17AJtAg', // 3Blue1Brown
];

// Recommendation engine
export const REC_ENGINE_WINDOW_DAYS     = 21;
export const REC_ENGINE_CANDIDATE_LIMIT = 200;
export const REC_ENGINE_OUTPUT_LIMIT    = 20;

export const REC_WEIGHT_RELEVANCE = 0.40;
export const REC_WEIGHT_QUALITY   = 0.30;
export const REC_WEIGHT_FRESHNESS = 0.20;
export const REC_WEIGHT_TREND     = 0.10;

// Conference harvester
export const DBLP_API_BASE                = 'https://dblp.org/search/publ/api';
export const DBLP_RATE_LIMIT_MS          = 1000;
export const CONFERENCE_ENRICH_WINDOW_DAYS = 30;
