/**
 * Video Understanding Service — "Reverse Storyboard"
 *
 * Accepts a video URL → Gemini Vision analyzes the full video →
 * produces a SyntheticStoryboard that mimics ThinkForge's output.
 *
 * The key insight: if you can fake a storyboard from a real video,
 * the entire Director pipeline runs as-is (Plan 2 architecture).
 *
 * Output shape matches StoryboardScene.descriptor so Director,
 * profile-detection, and all downstream consumers work unchanged.
 *
 * Cost: 1 Gemini call (~$0.05-0.15 depending on video length).
 */

import type { SceneEditDirections } from '@/lib/pipeline/schemas/storyboard';

// ─── Types ──────────────────────────────────────────────────────

export interface SyntheticScene {
  sceneIndex: number;
  startSec: number;
  endSec: number;
  sceneType: 'continuous' | 'montage' | 'talking-head' | 'text-card' | 'logo-reveal';
  descriptor: {
    narration: string;
    visualDescription: string;
    mood: string;
    cameraDirection: string;
    audioDescription: string;
    musicDescription: string;
    sfxDescription: string;
    editDirections: {
      transition: { type: string };
      pacing: string;
      onScreenText: string[];
    };
    durationSeconds: number;
  };
}

export interface SyntheticStoryboard {
  sourceVideoUrl: string;
  contentType: string;
  platform: string;
  title: string;
  overallMusicPrompt: string;
  globalEditDirections: {
    colorGrade: string;
    pacing: string;
    graphicsDensity: string;
    musicMood: string;
    narrativeArc: string;
  };
  scenes: SyntheticScene[];
  analyzedAt: string;
}

// ─── Main Entry ─────────────────────────────────────────────────

/**
 * Analyze a video and produce a SyntheticStoryboard.
 * Uses Gemini Vision to watch the full video and extract:
 * - Scene breakdown (timestamps, descriptions, moods)
 * - Narration/speech transcript
 * - Edit style recommendations
 * - Content type + platform detection
 *
 * @param videoUrl - Playable video URL (R2 CDN or GCS signed)
 * @param durationSec - Video duration in seconds
 * @param userIntent - Optional hint ("gym promo for Instagram")
 */
export async function analyzeVideo(
  videoUrl: string,
  durationSec: number,
  userIntent?: string,
): Promise<SyntheticStoryboard | null> {
  const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');

  try {
    // Download video → upload to Gemini Files API for vision analysis
    const fileUri = await uploadVideoToGemini(videoUrl);
    if (!fileUri) {
      console.warn('[VideoUnderstanding] Gemini upload failed, returning null');
      return null;
    }

    const model = await getAnalysisModel();

    const intentContext = userIntent
      ? `\nUser intent: "${userIntent}" — use this to inform content type, platform, and edit style.\n`
      : '';

    const prompt = `You are a professional video editor analyzing raw footage to plan its edit.

Watch the full video and output a structured JSON analysis.${intentContext}

Return ONLY valid JSON matching this exact shape:
{
  "contentType": "tutorial|vlog|ad|interview|product-demo|sports|corporate|testimonial|music-video|documentary",
  "platform": "youtube|instagram|tiktok|linkedin|general",
  "title": "AI-generated descriptive title",
  "overallMusicPrompt": "mood and style for background music",
  "globalEditDirections": {
    "colorGrade": "warm|cool|neutral|cinematic|vibrant",
    "pacing": "fast|medium|slow",
    "graphicsDensity": "heavy|moderate|minimal",
    "musicMood": "one-line music mood description",
    "narrativeArc": "three-act|hook-value-cta|before-after|testimonial-arc|day-in-the-life"
  },
  "scenes": [
    {
      "sceneIndex": 0,
      "startSec": 0.0,
      "endSec": 5.0,
      "sceneType": "continuous|montage|talking-head|text-card|logo-reveal",
      "descriptor": {
        "narration": "exact speech transcript if any, empty string if silent",
        "visualDescription": "one sentence: who/what is on screen, what is happening",
        "mood": "energetic|calm|dramatic|playful|serious|inspirational|mysterious",
        "cameraDirection": "static|pan-left|pan-right|zoom-in|tracking|handheld",
        "audioDescription": "what audio is present (speech, music, ambient)",
        "musicDescription": "music mood for this scene",
        "sfxDescription": "ambient sounds + spot effects",
        "editDirections": {
          "transition": { "type": "dissolve|hard-cut|dip-to-black" },
          "pacing": "fast|medium|slow",
          "onScreenText": ["any text that should appear as graphics"]
        },
        "durationSeconds": 5.0
      }
    }
  ]
}

Rules:
- Detect scene boundaries from visual changes (new location, new subject, camera angle change)
- For each scene: narration = exact transcript of speech. Empty string if silent.
- Minimum scene duration: 2 seconds. Maximum: 15 seconds.
- Video is ${durationSec} seconds long. Produce ${Math.max(2, Math.ceil(durationSec / 8))} to ${Math.max(4, Math.ceil(durationSec / 4))} scenes.
- Content type and platform: infer from visual style, subjects, aspect ratio, length.
- Return ONLY the JSON object. No markdown, no explanation.`;

    console.log(`[VideoUnderstanding] Analyzing ${durationSec}s video...`);

    const result = await model.generateContent([
      { fileData: { fileUri, mimeType: 'video/mp4' } },
      { text: prompt },
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[VideoUnderstanding] No JSON in Gemini response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate + normalize
    const scenes: SyntheticScene[] = (parsed.scenes || []).map((s: any, i: number) => ({
      sceneIndex: s.sceneIndex ?? i,
      startSec: s.startSec ?? 0,
      endSec: s.endSec ?? durationSec,
      sceneType: s.sceneType || 'continuous',
      descriptor: {
        narration: s.descriptor?.narration || '',
        visualDescription: s.descriptor?.visualDescription || '',
        mood: s.descriptor?.mood || 'neutral',
        cameraDirection: s.descriptor?.cameraDirection || 'static',
        audioDescription: s.descriptor?.audioDescription || '',
        musicDescription: s.descriptor?.musicDescription || '',
        sfxDescription: s.descriptor?.sfxDescription || '',
        editDirections: {
          transition: { type: s.descriptor?.editDirections?.transition?.type || 'hard-cut' },
          pacing: s.descriptor?.editDirections?.pacing || 'medium',
          onScreenText: s.descriptor?.editDirections?.onScreenText || [],
        },
        durationSeconds: (s.endSec ?? durationSec) - (s.startSec ?? 0),
      },
    }));

    if (scenes.length === 0) {
      console.error('[VideoUnderstanding] Gemini returned 0 scenes');
      return null;
    }

    const storyboard: SyntheticStoryboard = {
      sourceVideoUrl: videoUrl,
      contentType: parsed.contentType || 'video',
      platform: parsed.platform || 'general',
      title: parsed.title || 'Untitled',
      overallMusicPrompt: parsed.overallMusicPrompt || '',
      globalEditDirections: {
        colorGrade: parsed.globalEditDirections?.colorGrade || 'neutral',
        pacing: parsed.globalEditDirections?.pacing || 'medium',
        graphicsDensity: parsed.globalEditDirections?.graphicsDensity || 'minimal',
        musicMood: parsed.globalEditDirections?.musicMood || '',
        narrativeArc: parsed.globalEditDirections?.narrativeArc || 'three-act',
      },
      scenes,
      analyzedAt: new Date().toISOString(),
    };

    console.log(`[VideoUnderstanding] Done: ${scenes.length} scenes, type=${storyboard.contentType}, platform=${storyboard.platform}`);
    return storyboard;

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[VideoUnderstanding] Analysis failed: ${msg}`);
    return null;
  }
}

// ─── Gemini Files Upload ────────────────────────────────────────

async function uploadVideoToGemini(videoUrl: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn('[VideoUnderstanding] No Gemini API key');
    return null;
  }

  try {
    const response = await fetch(videoUrl);
    if (!response.ok) {
      console.error(`[VideoUnderstanding] Video download failed: ${response.status}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const sizeKb = Math.round(buffer.length / 1024);

    if (buffer.length > 2 * 1024 * 1024 * 1024) {
      console.warn(`[VideoUnderstanding] Video too large (${sizeKb}KB), max 2GB (Gemini Files API limit)`);
      return null;
    }

    console.log(`[VideoUnderstanding] Downloaded ${sizeKb}KB, uploading to Gemini Files...`);

    const { GoogleAIFileManager } = await import('@google/generative-ai/server');
    const fileManager = new GoogleAIFileManager(apiKey);

    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs');
    const tmpPath = path.join(os.tmpdir(), `vu_${Date.now()}.mp4`);

    try {
      fs.writeFileSync(tmpPath, buffer);

      const uploadResult = await fileManager.uploadFile(tmpPath, {
        mimeType: 'video/mp4',
        displayName: `video-understanding-${Date.now()}.mp4`,
      });

      const fileUri = uploadResult?.file?.uri;
      if (!fileUri) return null;

      // Wait for ACTIVE state
      let state = uploadResult?.file?.state;
      const fileName = uploadResult?.file?.name;
      let retries = 0;
      while (state !== 'ACTIVE' && retries < 20) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const check = await fileManager.getFile(fileName!);
          state = check?.state;
        } catch {}
        retries++;
      }

      if (state !== 'ACTIVE') {
        console.error(`[VideoUnderstanding] File not ACTIVE after ${retries * 2}s`);
        return null;
      }

      return fileUri;
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[VideoUnderstanding] Upload failed: ${msg}`);
    return null;
  }
}
