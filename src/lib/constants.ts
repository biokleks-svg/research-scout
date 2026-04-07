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
