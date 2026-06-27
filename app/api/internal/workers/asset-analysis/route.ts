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
          if (analysis.keyframeAnalyses) {
            for (const kf of analysis.keyframeAnalyses) {
              if (kf.shotType && kf.shotType !== 'unknown' && !tags.includes(kf.shotType)) tags.push(kf.shotType);
              if (kf.subjects) {
                for (const s of kf.subjects) {
                  const tag = s.label;
                  if (tag && !tags.includes(tag)) tags.push(tag);
                }
              }
            }
          }

          // Layer 2 (motion): dominant motion type
          if (analysis.motionSegments?.length) {
            const motionTypes = analysis.motionSegments.map(s => s.cameraMotion).filter(Boolean);
            const dominant = mostFrequent(motionTypes);
            if (dominant && !tags.includes(dominant)) tags.push(dominant);
          }

          // Energy level tag from motion segments
          if (analysis.motionSegments?.length) {
            const avgIntensity = analysis.motionSegments.reduce((sum, s) => sum + (s.motionIntensity || 0), 0) / analysis.motionSegments.length;
            tags.push(avgIntensity > 0.7 ? 'high-energy' : avgIntensity > 0.3 ? 'medium-energy' : 'calm');
          }

          // Layer 5 (subjects): subject categories
          if (analysis.subjectTracks) {
            for (const subj of analysis.subjectTracks) {
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
      const embModel = genAI.getGenerativeModel({ model: 'text-embedding-005' });

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

    // ─── Enrich Neo4j Asset node via graph-sync worker ─────────
    if (embedding) {
      try {
        const qstashToken = process.env.QSTASH_TOKEN;
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

        if (qstashToken) {
          const { compressAnalysisToBriefing } = await import('@/lib/editron/services/asset-briefing');
          const analysisDoc = await db.collection('asset_analyses').findOne({ assetId });
          const briefing = analysisDoc ? compressAnalysisToBriefing(analysisDoc as any) : null;

          const dedupedTags = [...new Set(tags)];
          const subjects = dedupedTags.filter(t =>
            !['wide', 'medium', 'close-up', 'extreme-close-up', 'high-energy', 'medium-energy', 'calm', 'analysis-failed'].includes(t)
          );
          const shotTag = dedupedTags.find(t => ['wide', 'medium', 'close-up', 'extreme-close-up'].includes(t));
          const energyTag = dedupedTags.find(t => ['high-energy', 'medium-energy', 'calm'].includes(t));
          const energyLevel = energyTag === 'high-energy' ? 'high' : energyTag === 'medium-energy' ? 'medium' : 'low';

          // Extract visual attributes from raw 5-Track keyframe data
          const keyframes = (analysisDoc as any)?.keyframeAnalyses ?? [];
          let colorTemp: 'warm' | 'neutral' | 'cold' | null = null;
          let lighting: string | null = null;
          let dominantColors: string[] = [];

          if (keyframes.length > 0) {
            // Color temperature: median Kelvin across keyframes → warm/neutral/cold
            const kelvins = keyframes.map((kf: any) => kf.colorTemperatureK).filter(Boolean) as number[];
            if (kelvins.length > 0) {
              kelvins.sort((a: number, b: number) => a - b);
              const medianK = kelvins[Math.floor(kelvins.length / 2)];
              colorTemp = medianK < 4000 ? 'warm' : medianK > 6500 ? 'cold' : 'neutral';
            }

            // Lighting: derive from brightness distribution
            const brightnesses = keyframes.map((kf: any) => kf.brightness ?? 0.5) as number[];
            const avgBrightness = brightnesses.reduce((s: number, b: number) => s + b, 0) / brightnesses.length;
            if (avgBrightness > 0.7) lighting = 'natural';
            else if (avgBrightness > 0.5) lighting = 'studio';
            else if (avgBrightness > 0.3) lighting = 'dramatic';
            else lighting = 'low-key';

            // Dominant colors: collect across keyframes, dedupe, take top 5
            const allColors: string[] = [];
            for (const kf of keyframes) {
              if (kf.dominantColors) allColors.push(...(kf.dominantColors as string[]));
            }
            const colorCounts: Record<string, number> = {};
            for (const c of allColors) colorCounts[c] = (colorCounts[c] || 0) + 1;
            dominantColors = Object.entries(colorCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([c]) => c);
          }

          await fetch(`${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${baseUrl}/api/internal/workers/graph-sync`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${qstashToken}`,
              'Content-Type': 'application/json',
              'Upstash-Retries': '3',
            },
            body: JSON.stringify({
              action: 'asset_enriched',
              data: {
                assetId,
                enrichment: {
                  briefing: briefing?.visualSummary ?? `${type} asset: ${filename}`,
                  embedding,
                  colorTemp,
                  composition: shotTag ?? null,
                  lighting,
                  dominantColors,
                  mood: briefing?.mood ?? null,
                  energyLevel,
                  subjects,
                  hasAudio: briefing?.audioContent ?? null,
                  qualityScore: briefing?.quality === 'high' ? 80 : briefing?.quality === 'medium' ? 60 : 40,
                  slopFlags: briefing?.slopFlags?.map((f: any) => f.description) ?? [],
                },
              },
            }),
          });
          console.log(`[AssetAnalysis] ${assetId}: dispatched graph enrichment`);
        }
      } catch (graphErr: any) {
        console.warn(`[AssetAnalysis] ${assetId}: graph enrichment dispatch failed: ${graphErr.message}`);
      }
    }

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
    } catch (err: unknown) { console.warn('[AssetAnalysis] best-effort failure mark failed:', err instanceof Error ? err.message : err); }

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

// Lazy QStash verification: skip during build when env vars aren't available.
// In production, QSTASH_CURRENT_SIGNING_KEY is always set via Vercel env.
export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler;
