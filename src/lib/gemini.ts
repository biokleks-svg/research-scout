import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_FLASH_MODEL, GEMINI_PRO_MODEL, GEMINI_EMBEDDING_MODEL } from './constants';

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is required');
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

export function getFlashModel() {
  return getClient().getGenerativeModel({ model: GEMINI_FLASH_MODEL });
}

export function getProModel() {
  return getClient().getGenerativeModel({ model: GEMINI_PRO_MODEL });
}

export function getEmbeddingModel() {
  return getClient().getGenerativeModel({ model: GEMINI_EMBEDDING_MODEL });
}

/** Generate a 768-dim embedding for a text string. */
export async function embedText(text: string): Promise<number[]> {
  const model = getEmbeddingModel();
  const result = await model.embedContent(text);
  return result.embedding.values;
}

/** Generate embeddings for a batch of texts (sequential — Gemini has no native batching). */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await embedText(text));
  }
  return results;
}
