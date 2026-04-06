import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import {
  QUEUE_HARVEST, QUEUE_PROCESS, QUEUE_INTELLIGENCE, QUEUE_CRITIC,
} from './constants';

let connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // Required for BullMQ
    });
  }
  return connection;
}

export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};

export function createQueue(name: string) {
  return new Queue(name, {
    connection: getRedisConnection(),
    defaultJobOptions,
  });
}

export const harvestQueue    = createQueue(QUEUE_HARVEST);
export const processQueue    = createQueue(QUEUE_PROCESS);
export const intelligenceQueue = createQueue(QUEUE_INTELLIGENCE);
export const criticQueue     = createQueue(QUEUE_CRITIC);

// Job type payloads
export interface HarvestJobData {
  agentType: 'paper' | 'video' | 'social' | 'conference' | 'blog' | 'huggingface';
  params?: Record<string, unknown>;
}

export interface ProcessJobData {
  contentItemId: string;
  stages: Array<'classify' | 'infographic' | 'summary'>;
}
