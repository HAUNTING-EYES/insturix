/**
 * Reference Content Extractor
 *
 * Extends the existing EditDNA extraction to ALSO return a contentMap
 * (scene-by-scene breakdown of the reference video's content).
 *
 * Single Gemini call → EditDNA + contentMap. No additional cost vs.
 * the existing style-transfer flow.
 *
 * Per EDITRON_MATCH_EDIT_PLAN.md Phase 1.
 */

import type { EditDNA } from './style-transfer-service';

// ─── Types (per Plan Phase 1) ───────────────────────────────────

export interface ReferenceScene {
  index: number;
  startApproxSec: number;
  endApproxSec: number;
  description: string;
  keyVisuals: string[];
  narrationSummary: string;
  isCritical: boolean;
}

export interface ReferenceAnalysis {
  dna: EditDNA;
  contentMap: ReferenceScene[];
}

// ─── Combined Prompt ────────────────────────────────────────────

const COMBINED_PROMPT = `<role>You are a professional video editor analyzing a reference video.</role>

<task>Extract TWO things in a SINGLE JSON response: the video's Editing Style (EditDNA) and a scene-by-scene Content Map.</task>

<rules>
RULE 1 — EditDNA (editing fingerprint) must include:
  - cutRhythm: { avgCutsPerMinute, pattern (steady|fast-slow-fast|building|random), avgClipDuration }
  - transitions: { dominant (hard_cut|fade|wipe|zoom_punch|slide), frequency (0-100%) }
  - colorGrade: { temperature (warm|cool|neutral), saturation (high|normal|desaturated), contrast (high|normal|low), dominantColors (hex[]) }
  - textStyle: { fontWeight (light|normal|bold|extra-bold), position (center|lower_third|top|varied), animation (fade|slide|pop|typewriter|none), frequency (heavy|moderate|minimal) }
  - musicStyle: { tempo (slow|medium|fast), genre (string), energyLevel (low|medium|high) }
  - pacing: { overall (slow|medium|fast), hookSpeed (fast|medium), mainSpeed (slow|medium|fast) }
  - graphicsDensity: heavy|moderate|minimal
RULE 2 — Content Map: for each distinct scene/segment provide:
  - index (0-based)
  - startApproxSec / endApproxSec
  - description (one sentence: who/what, what's happening)
  - keyVisuals (2-3 brief visual descriptors)
  - narrationSummary (quote or paraphrase of speech, empty if silent)
  - isCritical (true if this scene carries a core message that can't be skipped)
RULE 3 — Return ONLY valid JSON. No markdown. No explanation.
</rules>

<output_format>
{
  "editDNA": { cutRhythm, transitions, colorGrade, textStyle, musicStyle, pacing, graphicsDensity },
  "contentMap": [ { index, startApproxSec, endApproxSec, description, keyVisuals, narrationSummary, isCritical } ]
}
</output_format>`;

// ─── Main Entry ─────────────────────────────────────────────────

/**
 * Extract EditDNA + contentMap from a reference video in 1 Gemini call.
 * Uses Gemini Files API for video upload (same as video-understanding-service).
 */
export async function extractReferenceAnalysis(
  videoUrl: string,
  userId: string,
  sourceName?: string,
): Promise<ReferenceAnalysis> {
  // Upload to Gemini Files API
  const { default: uploadVideoToGemini } = await importUploader();
  const fileUri = await uploadVideoToGemini(videoUrl);
  if (!fileUri) {
    throw new Error('Failed to upload reference video to Gemini Files API');
  }

  const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
  const model = await getAnalysisModel();

  console.log(`[RefExtractor] Analyzing reference: ${sourceName || videoUrl.substring(0, 60)}...`);

  const result = await model.generateContent([
    { fileData: { fileUri, mimeType: 'video/mp4' } },
    { text: COMBINED_PROMPT },
  ]);

  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Gemini returned no JSON for reference analysis');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Normalize EditDNA
  const { nanoid } = await import('nanoid');
  const profileId = `style_${nanoid(12)}`;
  const dna: EditDNA = {
    profileId,
    sourceName: sourceName || 'Reference Video',
    sourceUrl: videoUrl,
    cutRhythm: {
      avgCutsPerMinute: Number(parsed.editDNA?.cutRhythm?.avgCutsPerMinute) || 10,
      pattern: parsed.editDNA?.cutRhythm?.pattern || 'steady',
      avgClipDuration: Number(parsed.editDNA?.cutRhythm?.avgClipDuration) || 3,
    },
    transitions: {
      dominant: parsed.editDNA?.transitions?.dominant || 'hard_cut',
      frequency: Number(parsed.editDNA?.transitions?.frequency) || 30,
    },
    colorGrade: {
      temperature: parsed.editDNA?.colorGrade?.temperature || 'neutral',
      saturation: parsed.editDNA?.colorGrade?.saturation || 'normal',
      contrast: parsed.editDNA?.colorGrade?.contrast || 'normal',
      dominantColors: parsed.editDNA?.colorGrade?.dominantColors || [],
    },
    textStyle: {
      fontWeight: parsed.editDNA?.textStyle?.fontWeight || 'normal',
      position: parsed.editDNA?.textStyle?.position || 'lower_third',
      animation: parsed.editDNA?.textStyle?.animation || 'fade',
      frequency: parsed.editDNA?.textStyle?.frequency || 'moderate',
    },
    musicStyle: {
      tempo: parsed.editDNA?.musicStyle?.tempo || 'medium',
      genre: parsed.editDNA?.musicStyle?.genre || 'cinematic',
      energyLevel: parsed.editDNA?.musicStyle?.energyLevel || 'medium',
    },
    pacing: {
      overall: parsed.editDNA?.pacing?.overall || 'medium',
      hookSpeed: parsed.editDNA?.pacing?.hookSpeed || 'fast',
      mainSpeed: parsed.editDNA?.pacing?.mainSpeed || 'medium',
    },
    graphicsDensity: parsed.editDNA?.graphicsDensity || 'moderate',
  };

  // Normalize contentMap
  const contentMap: ReferenceScene[] = (parsed.contentMap || []).map((s: any, i: number) => ({
    index: s.index ?? i,
    startApproxSec: Number(s.startApproxSec) || 0,
    endApproxSec: Number(s.endApproxSec) || 0,
    description: s.description || '',
    keyVisuals: Array.isArray(s.keyVisuals) ? s.keyVisuals : [],
    narrationSummary: s.narrationSummary || '',
    isCritical: s.isCritical === true,
  }));

  console.log(`[RefExtractor] Done: ${contentMap.length} scenes, pacing=${dna.pacing.overall}, transitions=${dna.transitions.dominant}`);

  return { dna, contentMap };
}

// Lazy import to avoid circular deps
async function importUploader() {
  const mod = await import('./video-understanding-service');
  // Re-export the upload function — it's not directly exported, so we
  // recreate it using the same logic (download → Gemini Files API)
  return {
    default: async (videoUrl: string): Promise<string | null> => {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) return null;

      try {
        const response = await fetch(videoUrl);
        if (!response.ok) return null;
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > 2 * 1024 * 1024 * 1024) return null; // Gemini Files API 2GB limit

        const { GoogleAIFileManager } = await import('@google/generative-ai/server');
        const fileManager = new GoogleAIFileManager(apiKey);
        const os = await import('os');
        const path = await import('path');
        const fs = await import('fs');
        const tmpPath = path.join(os.tmpdir(), `ref_${Date.now()}.mp4`);

        try {
          fs.writeFileSync(tmpPath, buffer);
          const uploadResult = await fileManager.uploadFile(tmpPath, {
            mimeType: 'video/mp4',
            displayName: `reference-${Date.now()}.mp4`,
          });
          const fileUri = uploadResult?.file?.uri;
          if (!fileUri) return null;

          let state = uploadResult?.file?.state;
          const fileName = uploadResult?.file?.name;
          let retries = 0;
          while (state !== 'ACTIVE' && retries < 20) {
            await new Promise(r => setTimeout(r, 2000));
            try { const c = await fileManager.getFile(fileName!); state = c?.state; } catch {}
            retries++;
          }
          return state === 'ACTIVE' ? fileUri : null;
        } finally {
          try { fs.unlinkSync(tmpPath); } catch {}
        }
      } catch {
        return null;
      }
    },
  };
}
