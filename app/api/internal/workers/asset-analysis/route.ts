/**
 * POST /api/internal/workers/asset-analysis
 *
 * QStash worker that runs 5-Track analysis on a newly uploaded asset.
 * Triggered after media upload completes. Runs in background — doesn't
 * block the upload response.
 *
 * Generates:
 * - 5-Track analysis (speech, visual, music, motion, subjects)
 * - Auto-tags (content type, shot type, energy level, subjects)
 * - Semantic embedding (Gemini textEmbedding for search)
 *
 * Results stored in asset_analyses collection (same as Director uses)
 * + tags/embedding stored on the MediaAsset document itself.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface AssetAnalysisPayload {
  assetId: string;
  userId: string;
  type: 'video' | 'audio' | 'image';
  url: string;
  duration?: number;
  filename: string;
}

async function handler(request: NextRequest) {
  console.log('[AssetAnalysis] Worker started');

  try {
    const payload: AssetAnalysisPayload = await request.json();
    const { assetId, userId, type, url, duration, filename } = payload;

    if (!assetId || !userId || !url) {
      console.error('[AssetAnalysis] Missing required fields');
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
    }

    const db = await getDatabase();

    // Mark asset as analyzing
    await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId, userId },
      { $set: { analysisStatus: 'analyzing', analysisStartedAt: new Date() } },
    );

    const tags: string[] = [];
    let embedding: number[] | null = null;

    // ─── Video Analysis (full 5-Track) ──────────────────────────
    if (type === 'video') {
      try {
        const { runFullAnalysis } = await import('@/lib/editron/services/five-track-analysis');
        const durationMs = (duration || 5) * 1000;

        const analysis = await runFullAnalysis(assetId, userId, {
          videoUrl: url,
          durationMs,
          sourceType: 'real-footage',
        });

        if (analysis) {
          // Extract tags from analysis
          // Layer 4 (keyframes): shot types, subjects, moods
          if (analysis.keyframes) {
            for (const kf of analysis.keyframes) {
              if (kf.shotType && !tags.includes(kf.shotType)) tags.push(kf.shotType);
              if (kf.mood && !tags.includes(kf.mood)) tags.push(kf.mood);
              if (kf.subjects) {
                for (const s of kf.subjects) {
                  const tag = typeof s === 'string' ? s : s.label || s.category;
                  if (tag && !tags.includes(tag)) tags.push(tag);
                }
              }
            }
          }

          // Layer 2 (motion): dominant motion type
          if (analysis.motion?.segments) {
            const motionTypes = analysis.motion.segments.map((s: any) => s.type).filter(Boolean);
            const dominant = mostFrequent(motionTypes);
            if (dominant && !tags.includes(dominant)) tags.push(dominant);
          }

          // Energy level tag
          if (analysis.motion?.averageIntensity != null) {
            const intensity = analysis.motion.averageIntensity;
            tags.push(intensity > 0.7 ? 'high-energy' : intensity > 0.3 ? 'medium-energy' : 'calm');
          }

          // Layer 5 (subjects): subject categories
          if (analysis.subjects) {
            for (const subj of analysis.subjects) {
              const cat = subj.category || subj.label;
              if (cat && !tags.includes(cat)) tags.push(cat);
            }
          }

          console.log(`[AssetAnalysis] ${assetId}: 5-Track complete, ${tags.length} tags extracted`);
        }
      } catch (analysisErr: any) {
        console.warn(`[AssetAnalysis] ${assetId}: 5-Track failed: ${analysisErr.message}`);
        tags.push('analysis-failed');
      }
    }

    // ─── Image Analysis (Gemini Vision) ─────────────────────────
    if (type === 'image') {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const result = await model.generateContent([
          {
            inlineData: { mimeType: 'image/jpeg', data: '' }, // Will use URL
          },
          `Analyze this image. Return JSON only:
{
  "subjects": ["list of main subjects"],
  "shotType": "wide|medium|close-up|extreme-close-up|overhead",
  "mood": "energetic|calm|dramatic|playful|professional|dark|bright",
  "colors": ["dominant colors"],
  "tags": ["5-10 descriptive tags"]
}`,
        ]);

        // For images, use URL-based analysis instead
        const urlResult = await model.generateContent([
          `Analyze the image at this URL: ${url}
Return JSON only:
{
  "subjects": ["list of main subjects"],
  "shotType": "wide|medium|close-up|extreme-close-up|overhead",
  "mood": "energetic|calm|dramatic|playful|professional|dark|bright",
  "colors": ["dominant colors"],
  "tags": ["5-10 descriptive tags"]
}`,
        ]);

        const text = urlResult.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.tags) tags.push(...parsed.tags.filter((t: string) => !tags.includes(t)));
          if (parsed.shotType) tags.push(parsed.shotType);
          if (parsed.mood) tags.push(parsed.mood);
          if (parsed.subjects) tags.push(...parsed.subjects.filter((s: string) => !tags.includes(s)));
        }

        console.log(`[AssetAnalysis] ${assetId}: image analysis complete, ${tags.length} tags`);
      } catch (imgErr: any) {
        console.warn(`[AssetAnalysis] ${assetId}: image analysis failed: ${imgErr.message}`);
      }
    }

    // ─── Audio Analysis (basic metadata) ────────────────────────
    if (type === 'audio') {
      tags.push('audio');
      if (filename.match(/music|bgm|track|song/i)) tags.push('music');
      if (filename.match(/voice|narrat|speech|vo\b/i)) tags.push('voiceover');
      if (filename.match(/sfx|effect|sound/i)) tags.push('sound-effect');
      if (filename.match(/ambient|atmosphere/i)) tags.push('ambient');
    }

    // ─── Generate Semantic Embedding ────────────────────────────
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');
      const embModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

      // Build a text description from tags + filename for embedding
      const embeddingText = `${filename} ${type} ${tags.join(' ')}`;
      const embResult = await embModel.embedContent(embeddingText);
      embedding = embResult.embedding?.values || null;

      if (embedding) {
        console.log(`[AssetAnalysis] ${assetId}: embedding generated (${embedding.length} dims)`);
      }
    } catch (embErr: any) {
      console.warn(`[AssetAnalysis] ${assetId}: embedding failed: ${embErr.message}`);
    }

    // ─── Update MediaAsset with tags + embedding + status ───────
    const updateDoc: any = {
      analysisStatus: 'complete',
      analysisCompletedAt: new Date(),
      tags: [...new Set(tags)].slice(0, 30), // Dedupe, cap at 30 tags
    };
    if (embedding) {
      updateDoc.semanticEmbedding = embedding;
    }

    await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId, userId },
      { $set: updateDoc },
    );

    console.log(`[AssetAnalysis] ${assetId}: complete. ${tags.length} tags, embedding: ${!!embedding}`);

    return NextResponse.json({
      success: true,
      assetId,
      tags: updateDoc.tags,
      hasEmbedding: !!embedding,
    });
  } catch (error: any) {
    console.error('[AssetAnalysis] Worker error:', error);

    // Try to mark as failed
    try {
      const body = await request.clone().json().catch(() => null);
      if (body?.assetId && body?.userId) {
        const db = await getDatabase();
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: body.assetId, userId: body.userId },
          { $set: { analysisStatus: 'failed', analysisError: error.message } },
        );
      }
    } catch { /* best effort */ }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Helper: find most frequent string in array
function mostFrequent(arr: string[]): string | null {
  if (!arr.length) return null;
  const counts: Record<string, number> = {};
  for (const s of arr) counts[s] = (counts[s] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

export const POST = verifySignatureAppRouter(handler);
