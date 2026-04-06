# Infrastructure & Hosting

## Docker Compose (Local Development)

```yaml
services:
  # -- Web App (Online Display Layer) --
  app:
    build: { context: ., dockerfile: Dockerfile.app }
    ports: ["3000:3000"]
    environment: &env
      DATABASE_URL: postgresql://pulse:pulse@postgres:5432/aipulse
      REDIS_URL: redis://redis:6379
      R2_ENDPOINT: http://minio:9000
      R2_ACCESS_KEY: minioadmin
      R2_SECRET_KEY: minioadmin
      GEMINI_API_KEY: ${GEMINI_API_KEY}
    depends_on: [postgres, redis, minio]

  # -- Offline Pipeline Workers --
  worker-harvest:
    build: { context: ., dockerfile: Dockerfile.worker }
    command: node dist/workers/harvest.js
    environment: *env
    depends_on: [postgres, redis]

  worker-process:
    build: { context: ., dockerfile: Dockerfile.worker }
    command: node dist/workers/process.js
    environment: *env
    depends_on: [postgres, redis]

  worker-intelligence:
    build: { context: ., dockerfile: Dockerfile.worker }
    command: node dist/workers/intelligence.js
    environment: *env
    depends_on: [postgres, redis]

  worker-critic:
    build: { context: ., dockerfile: Dockerfile.worker }
    command: node dist/workers/critic.js
    environment: *env
    depends_on: [postgres, redis]

  # -- Scheduler (triggers pipeline runs) --
  scheduler:
    build: { context: ., dockerfile: Dockerfile.worker }
    command: node dist/scheduler.js
    environment: *env
    depends_on: [postgres, redis]

  # -- Infrastructure --
  postgres:
    image: pgvector/pgvector:pg16
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment: { POSTGRES_DB: aipulse, POSTGRES_USER: pulse, POSTGRES_PASSWORD: pulse }

  redis:
    image: redis:7-alpine
    volumes: ["redisdata:/data"]

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
    volumes: ["miniodata:/data"]
    environment: { MINIO_ROOT_USER: minioadmin, MINIO_ROOT_PASSWORD: minioadmin }

volumes:
  pgdata:
  redisdata:
  miniodata:
```

## From Local to Production

Moving from local to production requires only swapping environment variables:
- `DATABASE_URL` -> Neon / Supabase / Railway Postgres
- `REDIS_URL` -> Upstash Redis
- `R2_ENDPOINT` -> Cloudflare R2 (swap MinIO for R2; same S3 API)

The offline workers can keep running on your home machine or a VPS while the web app deploys to Vercel/Railway/Fly.io. Or deploy everything to one VPS with Docker Compose.

## Cloud Deployment Options

### Railway (Recommended for Getting Started)

**Setup:** Web app + 4 worker services + scheduler deployed from one GitHub repo. Managed Postgres (pgvector available) + Redis add-ons. **Est. $25-50/mo.**

**Pros:**
- Simplest deployment path (GitHub push -> auto-deploy)
- Excellent DX with logs, metrics, env var management
- Managed database backups
- Supports Docker and Nixpacks
- Auto-restart on crash
- Team collaboration features

**Cons:**
- Can get expensive with multiple always-on workers (~$5/service/mo minimum)
- No scale-to-zero for workers
- Postgres pgvector requires manual extension enable
- Egress costs for large podcast files (use R2 for that)
- Limited regions (US-West, US-East, EU-West)

### Hetzner VPS + Coolify

**Setup:** Docker Compose on a dedicated VPS (CX31: 4 vCPU, 8GB RAM, 80GB SSD). Coolify as open-source Heroku alternative. **Est. $10-20/mo.**

**Pros:**
- Cheapest option for sustained workloads
- Full control over everything
- No vendor lock-in
- Excellent European data centers (GDPR-friendly)
- Predictable pricing — no surprises
- Can run offline pipeline + web app on same box
- Coolify provides auto-deploy, SSL, backups

**Cons:**
- You're the sysadmin (security patches, monitoring, backups)
- No auto-scaling
- If VPS goes down, everything goes down (no HA)
- Initial setup takes 2-3 hours
- No managed Postgres — you run it in Docker

### Hybrid: Vercel + Home Server

**Setup:** Next.js on Vercel (free tier). Offline pipeline workers on home machine, Raspberry Pi, or cheap VPS. Neon (free tier Postgres with pgvector) + Upstash (free tier Redis). **Est. $0-5/mo (+ API costs only).**

**Pros:**
- Near-zero hosting cost
- Vercel's edge network gives fastest frontend globally
- Free Neon Postgres includes pgvector
- Upstash Redis has generous free tier with pay-per-request
- Workers run on hardware you already own
- Perfect for solo developer / testing phase

**Cons:**
- Split architecture adds complexity
- Home server must stay online for pipeline to run
- Neon free tier has cold-start latency (~1s on first query)
- Upstash free tier limited to 10K commands/day (tight for BullMQ)
- Vercel serverless functions have 10s timeout on free tier
- If your internet goes down, harvesting stops

### Fly.io

**Setup:** Fly Machines for web app + workers. Fly Postgres or Neon for DB. Upstash for Redis. **Est. $15-40/mo.**

**Pros:**
- Scale-to-zero for workers (pay only when running — great for scheduled pipeline)
- Global edge deployment for low-latency worldwide
- Built-in Wireguard private networking
- Excellent CLI and Dockerfile-native deploys
- Fly Volumes for persistent storage

**Cons:**
- Fly Postgres is just a managed VM — you handle failover/backups
- Pricing model is complex (CPU + memory + bandwidth)
- Occasional reliability issues with Fly Postgres (use Neon instead)
- Scale-to-zero has cold start latency
- Documentation can be sparse for advanced use cases

### DigitalOcean App Platform

**Setup:** App Platform for web app, managed Postgres, managed Redis. Workers as worker services. **Est. $25-55/mo.**

**Pros:**
- Mature platform with managed databases including automatic backups
- Simple, predictable pricing
- Good documentation
- pgvector available on managed Postgres
- Spaces (S3-compatible) for object storage

**Cons:**
- More expensive than Hetzner/Railway for equivalent resources
- No scale-to-zero
- Slower deploy times compared to Railway/Vercel
- Limited build customization
- No free tier for App Platform

## Cost Estimation

Monthly costs for solo user processing ~200 papers/week + ~50 videos + ~500 social items:

| Item | Usage | Monthly Cost |
|------|-------|-------------|
| Hosting (Railway) | App + 4 workers + scheduler + Postgres + Redis | $30-50 |
| Gemini Embeddings | ~50K items/mo x text-embedding-004 | Free tier |
| Nano Banana 2 (infographics) | ~800 images/mo x $0.065 | $52 |
| Gemini 2.5 Flash (summaries, classification, scoring) | ~3,000 calls/mo | $15-30 |
| Gemini 2.5 Pro (trend narratives) | ~200 calls/mo | $10-20 |
| NotebookLM Podcast API (on-demand) | ~20-50 episodes/mo | $3-8 |
| Cloudflare R2 | ~15GB storage | $0.23 |
| X/Twitter API (optional) | Basic tier | $0-100 |
| Resend (Email) | Digest emails | $0 (free tier) |
| **Total (without X API)** | | **$110-170/mo** |
| **Total (with X API Basic)** | | **$210-270/mo** |
| **Budget mode** | | **$40-60/mo** |

Budget mode: Run workers on home machine, use Vercel + Neon + Upstash free tiers, generate infographics only for top-20%, use open-source podcast fallback, skip X API.
