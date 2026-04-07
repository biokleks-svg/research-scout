import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import { db } from '@/server/db';
import { contentItems, processingRegistry } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { uploadFile } from '@/lib/r2';
import {
  GEMINI_IMAGE_MODEL,
  INFOGRAPHIC_WIDTH_PX,
  INFOGRAPHIC_HEIGHT_PX,
} from '@/lib/constants';
import { getFlashModel } from '@/lib/gemini';
import { pino } from 'pino';

const logger = pino({ name: 'infographic-generator' });

// ─── Pure helpers (exported for unit testing) ────────────────────────────────

export function buildVisualSpecPrompt(title: string, abstract: string): string {
  return `You are an AI research visualizer. Create a concise, vivid infographic description for this paper.
Describe the key visual elements, layout, and data representations for a 1200x675px infographic.
Be specific: mention diagrams, charts, icons, color palette, and text callouts.
Keep the description under 300 words.

Paper title: ${title}

Abstract:
${abstract.slice(0, 2000)}

Respond with a single paragraph describing what the infographic should look like.`;
}

type GeminiResponseLike = {
  candidates?: Array<{
    content: {
      parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
    };
  }>;
};

export function extractImageFromResponse(response: GeminiResponseLike): Buffer | null {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData) return null;
  return Buffer.from(imagePart.inlineData.data, 'base64');
}

// ─── Main entrypoint ─────────────────────────────────────────────────────────

/**
 * Generate and persist an infographic for the given contentItemId.
 * Idempotent: skips if infographicUrl already set.
 * Returns true on success, false on failure.
 */
export async function generateInfographic(contentItemId: string): Promise<boolean> {
  try {
    const [item] = await db
      .select({
        id:             contentItems.id,
        title:          contentItems.title,
        rawText:        contentItems.rawText,
        infographicUrl: contentItems.infographicUrl,
      })
      .from(contentItems)
      .where(eq(contentItems.id, contentItemId))
      .limit(1);

    if (!item) {
      logger.warn({ contentItemId }, 'Item not found');
      return false;
    }

    if (item.infographicUrl) {
      logger.info({ contentItemId }, 'Infographic already exists, skipping');
      return true;
    }

    const text = item.rawText ?? item.title;

    // Step A: Gemini Flash generates a visual spec description
    const flashModel = getFlashModel();
    const specResult = await flashModel.generateContent(buildVisualSpecPrompt(item.title, text));
    const visualSpec = specResult.response.text();

    // Step B: Nano Banana 2 generates the infographic image
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is required');

    const imageClient = new GoogleGenerativeAI(apiKey);
    const imageModel  = imageClient.getGenerativeModel({
      model: GEMINI_IMAGE_MODEL,
      // @ts-expect-error — responseModalities supported but not in all type defs
      generationConfig: { responseModalities: ['IMAGE'] },
    });

    const imageResult = await imageModel.generateContent(
      `Generate a professional, branded research infographic: ${visualSpec}`
    );
    const rawBuffer = extractImageFromResponse(imageResult.response as GeminiResponseLike);

    if (!rawBuffer) {
      logger.warn({ contentItemId }, 'No image in model response');
      return false;
    }

    // Step C: Post-process with Sharp
    const processedBuffer = await sharp(rawBuffer)
      .resize(INFOGRAPHIC_WIDTH_PX, INFOGRAPHIC_HEIGHT_PX, { fit: 'cover' })
      .png()
      .toBuffer();

    // Step D: Upload to R2
    const r2Key          = `infographics/${contentItemId}.png`;
    const infographicUrl = await uploadFile(r2Key, processedBuffer, 'image/png');

    // Step E: Persist URL
    await db.update(contentItems)
      .set({ infographicUrl, updatedAt: new Date() })
      .where(eq(contentItems.id, contentItemId));

    await db.update(processingRegistry)
      .set({ lastCheckedAt: new Date() })
      .where(eq(processingRegistry.contentItemId, contentItemId));

    logger.info({ contentItemId, infographicUrl }, 'Infographic generated');
    return true;
  } catch (err) {
    logger.error({ contentItemId, err }, 'Failed to generate infographic');
    return false;
  }
}
