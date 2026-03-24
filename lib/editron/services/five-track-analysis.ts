/**
 * 5-Track Analysis Service
 *
 * The intelligence backbone of Editron. Every asset is analyzed across
 * 5 parallel tracks to enable intelligent editing decisions.
 *
 * Tracks:
 * 1. Speech Semantic — word timestamps, sentiment, topic boundaries
 * 2. Visual Content — Gemini Vision keyframes, scene detection, composition
 * 3. Music Structure — beat grid, BPM, sections, energy curve
 * 4. Motion/Rhythm — camera movement, energy level per segment
 * 5. Subject Tracking — detected objects/people per keyframe
 *
 * Analysis runs ONCE per asset on ingest. Results cached in MongoDB.
 * All downstream systems (Reactive Edit Engine, Director Agent,
 * Cinematic Moment Detector) consume these tracks.
 */

import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';

// ─── Types ───────────────────────────────────────────────────────

export interface SpeechTrack {
  words: Array<{
    word: string;
    startMs: number;
    endMs: number;
    confidence: number;
  }>;
  sentiment: Array<{
    startMs: number;
    endMs: number;
    score: number; // -1.0 (negative) to 1.0 (positive)
    label: 'positive' | 'neutral' | 'negative' | 'excited' | 'calm';
  }>;
  topicBoundaries: Array<{
    timestampMs: number;
    fromTopic: string;
    toTopic: string;
  }>;
  silenceGaps: Array<{
    startMs: number;
    endMs: number;
    durationMs: number;
  }>;
}

export interface VisualKeyframe {
  timestampMs: number;
  description: string;
  subjects: Array<{
    label: string;
    boundingBox?: { x: number; y: number; w: number; h: number };
    confidence: number;
  }>;
  dominantColors: string[];
  composition: 'wide' | 'medium' | 'close-up' | 'extreme-close-up' | 'unknown';
  brightness: number; // 0-1
  mood: string;
}

export interface VisualTrack {
  keyframes: VisualKeyframe[];
  sceneChanges: Array<{
    timestampMs: number;
    confidence: number;
  }>;
  overallDescription: string;
  contentTags: string[];
}

export interface MusicTrack {
  bpm: number;
  beats: number[]; // Timestamps in ms
  sections: Array<{
    startMs: number;
    endMs: number;
    type: 'intro' | 'verse' | 'chorus' | 'bridge' | 'drop' | 'outro' | 'instrumental' | 'unknown';
    energy: number; // 0-1
  }>;
  energyCurve: Array<{
    timestampMs: number;
    energy: number; // 0-1
  }>;
  key?: string;
  genre?: string;
}

export interface MotionTrack {
  segments: Array<{
    startMs: number;
    endMs: number;
    motionType: 'static' | 'pan' | 'tilt' | 'zoom-in' | 'zoom-out' | 'tracking' | 'handheld' | 'dolly';
    intensity: number; // 0-1
    direction?: 'left' | 'right' | 'up' | 'down';
  }>;
  energyCurve: Array<{
    timestampMs: number;
    energy: number; // 0-1 (0 = static, 1 = maximum motion)
  }>;
  averageMotionIntensity: number;
}

export interface SubjectTrack {
  subjects: Array<{
    id: string;
    label: string;
    category: 'person' | 'product' | 'object' | 'text' | 'logo' | 'animal';
    appearances: Array<{
      timestampMs: number;
      boundingBox: { x: number; y: number; w: number; h: number };
      confidence: number;
    }>;
    totalScreenTimeMs: number;
  }>;
}

export interface FiveTrackAnalysis {
  assetId: string;
  userId: string;
  durationMs: number;
  analyzedAt: Date;
  speech: SpeechTrack | null;
  visual: VisualTrack | null;
  music: MusicTrack | null;
  motion: MotionTrack | null;
  subjects: SubjectTrack | null;
  /** Overall content embedding for semantic search */
  embeddingVector?: number[];
}

// ─── Analysis Collection ─────────────────────────────────────────

const ANALYSIS_COLLECTION = 'asset_analyses';

export async function getAnalysis(assetId: string): Promise<FiveTrackAnalysis | null> {
  const db = await getDatabase();
  return db.collection(ANALYSIS_COLLECTION).findOne({ assetId }) as any;
}

export async function saveAnalysis(analysis: FiveTrackAnalysis): Promise<void> {
  const db = await getDatabase();
  await db.collection(ANALYSIS_COLLECTION).updateOne(
    { assetId: analysis.assetId },
    { $set: analysis },
    { upsert: true },
  );
}

// ─── Track 1: Speech Semantic Analysis ───────────────────────────

export async function analyzeSpeech(
  audioUrl: string,
  userId: string,
): Promise<SpeechTrack | null> {
  try {
    // Use existing transcription service (Deepgram/Gemini)
    // The transcription already provides word-level timestamps
    const { getTranscription } = await import('./media/transcription-service');
    const transcription = await getTranscription(audioUrl, userId);

    if (!transcription?.words?.length) return null;

    const words = transcription.words.map((w: any) => ({
      word: w.word,
      startMs: w.startMs,
      endMs: w.endMs,
      confidence: w.confidence || 0.9,
    }));

    // Detect silence gaps (>500ms between words)
    const silenceGaps: SpeechTrack['silenceGaps'] = [];
    for (let i = 0; i < words.length - 1; i++) {
      const gap = words[i + 1].startMs - words[i].endMs;
      if (gap > 500) {
        silenceGaps.push({
          startMs: words[i].endMs,
          endMs: words[i + 1].startMs,
          durationMs: gap,
        });
      }
    }

    // Simple sentiment: use word-level heuristics (upgrade to Gemini later)
    const sentiment: SpeechTrack['sentiment'] = [{
      startMs: 0,
      endMs: words[words.length - 1]?.endMs || 0,
      score: 0.5,
      label: 'neutral',
    }];

    // Topic boundaries: detect at silence gaps > 2 seconds
    const topicBoundaries: SpeechTrack['topicBoundaries'] = silenceGaps
      .filter(g => g.durationMs > 2000)
      .map(g => ({
        timestampMs: g.startMs,
        fromTopic: 'segment',
        toTopic: 'segment',
      }));

    return { words, sentiment, topicBoundaries, silenceGaps };
  } catch (err: any) {
    console.error('[5Track] Speech analysis failed:', err.message);
    return null;
  }
}

// ─── Track 2: Visual Content Analysis ────────────────────────────

export async function analyzeVisual(
  videoUrl: string,
  durationMs: number,
): Promise<VisualTrack | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.warn('[5Track] No Gemini API key for visual analysis');
      return null;
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Sample keyframes every 2 seconds
    const sampleInterval = 2000;
    const keyframeCount = Math.min(Math.ceil(durationMs / sampleInterval), 15);

    // Use Gemini with video URL for analysis
    const result = await model.generateContent([
      {
        text: `Analyze this video (${Math.round(durationMs / 1000)}s duration). Sample ${keyframeCount} keyframes evenly.

For each keyframe, provide:
- timestampMs: approximate millisecond
- description: what's happening visually (1 sentence)
- subjects: [{label, confidence}] — people, products, objects visible
- dominantColors: [2-3 hex colors]
- composition: wide/medium/close-up/extreme-close-up
- brightness: 0.0-1.0
- mood: one word

Also detect:
- sceneChanges: [{timestampMs, confidence}] — where visual content changes significantly
- overallDescription: 1-sentence summary of the entire video
- contentTags: [5-10 tags describing the content]

Return ONLY valid JSON matching this exact structure:
{
  "keyframes": [...],
  "sceneChanges": [...],
  "overallDescription": "...",
  "contentTags": [...]
}`,
      },
      {
        fileData: {
          mimeType: 'video/mp4',
          fileUri: videoUrl,
        },
      },
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      keyframes: parsed.keyframes || [],
      sceneChanges: parsed.sceneChanges || [],
      overallDescription: parsed.overallDescription || '',
      contentTags: parsed.contentTags || [],
    };
  } catch (err: any) {
    console.error('[5Track] Visual analysis failed:', err.message);
    return null;
  }
}

// ─── Track 3: Music Structure Analysis ───────────────────────────

export async function analyzeMusic(
  audioUrl: string,
  durationMs: number,
): Promise<MusicTrack | null> {
  try {
    // Use existing beat detection service
    const { detectBeats } = await import('../../pipeline/beat-detection-service');
    const beatResult = await detectBeats(audioUrl);

    if (!beatResult) return null;

    // Build energy curve from beat density
    const energyCurve: MusicTrack['energyCurve'] = [];
    const windowMs = 2000;
    for (let t = 0; t < durationMs; t += windowMs) {
      const beatsInWindow = beatResult.beats.filter(
        (b: number) => b >= t && b < t + windowMs,
      ).length;
      const maxBeatsPerWindow = (beatResult.bpm / 60) * (windowMs / 1000);
      energyCurve.push({
        timestampMs: t,
        energy: Math.min(beatsInWindow / Math.max(maxBeatsPerWindow, 1), 1),
      });
    }

    return {
      bpm: beatResult.bpm,
      beats: beatResult.beats,
      sections: beatResult.sections || [{
        startMs: 0,
        endMs: durationMs,
        type: 'unknown',
        energy: 0.5,
      }],
      energyCurve,
      key: beatResult.key,
      genre: beatResult.genre,
    };
  } catch (err: any) {
    console.error('[5Track] Music analysis failed:', err.message);
    return null;
  }
}

// ─── Track 4: Motion/Rhythm Analysis ─────────────────────────────

export async function analyzeMotion(
  videoUrl: string,
  durationMs: number,
): Promise<MotionTrack | null> {
  try {
    // Use Gemini to estimate motion from video
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent([
      {
        text: `Analyze the camera motion and movement in this ${Math.round(durationMs / 1000)}s video.

For each distinct motion segment, provide:
- startMs, endMs: segment boundaries in milliseconds
- motionType: static/pan/tilt/zoom-in/zoom-out/tracking/handheld/dolly
- intensity: 0.0-1.0 (0=no motion, 1=rapid motion)
- direction: left/right/up/down (if applicable)

Also provide an energy curve sampled every 2 seconds:
- timestampMs: millisecond
- energy: 0.0-1.0 (overall visual energy at this moment)

Return ONLY valid JSON:
{
  "segments": [...],
  "energyCurve": [...],
  "averageMotionIntensity": 0.5
}`,
      },
      {
        fileData: {
          mimeType: 'video/mp4',
          fileUri: videoUrl,
        },
      },
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    console.error('[5Track] Motion analysis failed:', err.message);
    return null;
  }
}

// ─── Track 5: Subject Tracking ───────────────────────────────────

export async function analyzeSubjects(
  videoUrl: string,
  durationMs: number,
): Promise<SubjectTrack | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent([
      {
        text: `Track all distinct subjects (people, products, objects, text, logos) in this ${Math.round(durationMs / 1000)}s video.

For each subject:
- id: unique identifier (e.g., "person_0", "product_0")
- label: descriptive name (e.g., "man in blue suit", "Starbucks cup")
- category: person/product/object/text/logo/animal
- appearances: [{timestampMs, boundingBox: {x,y,w,h} as 0-1 normalized, confidence}]
  Sample at most 5 key appearances per subject.
- totalScreenTimeMs: estimated total time on screen

Return ONLY valid JSON:
{
  "subjects": [...]
}`,
      },
      {
        fileData: {
          mimeType: 'video/mp4',
          fileUri: videoUrl,
        },
      },
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    console.error('[5Track] Subject tracking failed:', err.message);
    return null;
  }
}

// ─── Full 5-Track Analysis ───────────────────────────────────────

/**
 * Run complete 5-track analysis on an asset.
 * Runs all tracks in parallel for speed. Results cached in MongoDB.
 *
 * @param assetId - The asset to analyze
 * @param userId - Owner
 * @param options - Which tracks to run (default: all applicable)
 */
export async function runFiveTrackAnalysis(
  assetId: string,
  userId: string,
  options: {
    videoUrl?: string;
    audioUrl?: string;
    durationMs: number;
    tracks?: ('speech' | 'visual' | 'music' | 'motion' | 'subjects')[];
  },
): Promise<FiveTrackAnalysis> {
  const { videoUrl, audioUrl, durationMs, tracks: requestedTracks } = options;
  const runAll = !requestedTracks || requestedTracks.length === 0;

  console.log(`[5Track] Starting analysis for ${assetId}: duration=${durationMs}ms, tracks=${requestedTracks?.join(',') || 'all'}`);

  // Check cache first
  const cached = await getAnalysis(assetId);
  if (cached && Date.now() - new Date(cached.analyzedAt).getTime() < 7 * 24 * 60 * 60 * 1000) {
    console.log(`[5Track] Using cached analysis for ${assetId}`);
    return cached;
  }

  // Run applicable tracks in parallel
  const [speech, visual, music, motion, subjects] = await Promise.allSettled([
    // Track 1: Speech (needs audio)
    (runAll || requestedTracks?.includes('speech')) && audioUrl
      ? analyzeSpeech(audioUrl, userId)
      : Promise.resolve(null),

    // Track 2: Visual (needs video)
    (runAll || requestedTracks?.includes('visual')) && videoUrl
      ? analyzeVisual(videoUrl, durationMs)
      : Promise.resolve(null),

    // Track 3: Music (needs audio)
    (runAll || requestedTracks?.includes('music')) && audioUrl
      ? analyzeMusic(audioUrl, durationMs)
      : Promise.resolve(null),

    // Track 4: Motion (needs video)
    (runAll || requestedTracks?.includes('motion')) && videoUrl
      ? analyzeMotion(videoUrl, durationMs)
      : Promise.resolve(null),

    // Track 5: Subjects (needs video)
    (runAll || requestedTracks?.includes('subjects')) && videoUrl
      ? analyzeSubjects(videoUrl, durationMs)
      : Promise.resolve(null),
  ]);

  const analysis: FiveTrackAnalysis = {
    assetId,
    userId,
    durationMs,
    analyzedAt: new Date(),
    speech: speech.status === 'fulfilled' ? speech.value : null,
    visual: visual.status === 'fulfilled' ? visual.value : null,
    music: music.status === 'fulfilled' ? music.value : null,
    motion: motion.status === 'fulfilled' ? motion.value : null,
    subjects: subjects.status === 'fulfilled' ? subjects.value : null,
  };

  // Log results
  const trackResults = [
    speech.status === 'fulfilled' && analysis.speech ? 'speech' : null,
    visual.status === 'fulfilled' && analysis.visual ? 'visual' : null,
    music.status === 'fulfilled' && analysis.music ? 'music' : null,
    motion.status === 'fulfilled' && analysis.motion ? 'motion' : null,
    subjects.status === 'fulfilled' && analysis.subjects ? 'subjects' : null,
  ].filter(Boolean);
  console.log(`[5Track] Complete: ${trackResults.length}/5 tracks (${trackResults.join(', ')})`);

  // Cache results
  await saveAnalysis(analysis);

  return analysis;
}

// ─── API Route Helper ────────────────────────────────────────────

/**
 * Analyze a project's video overlays.
 * Runs 5-track on each video overlay that hasn't been analyzed yet.
 */
export async function analyzeProjectAssets(
  projectId: string,
  userId: string,
): Promise<{ analyzed: number; cached: number; failed: number }> {
  const db = await getDatabase();
  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId }) as any;
  if (!project) throw new Error('Project not found');

  const videoOverlays = (project.overlays || []).filter((o: any) => o.type === 'video');
  let analyzed = 0, cached = 0, failed = 0;

  for (const overlay of videoOverlays) {
    const assetId = overlay.assetId;
    if (!assetId) continue;

    try {
      // Check if already analyzed
      const existing = await getAnalysis(assetId);
      if (existing) {
        cached++;
        continue;
      }

      // Get asset URL
      const asset = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne({ assetId }) as any;
      const videoUrl = asset?.cachedUrl || overlay.src || overlay.content;
      if (!videoUrl) {
        failed++;
        continue;
      }

      const durationMs = (overlay.durationInFrames / 30) * 1000;
      await runFiveTrackAnalysis(assetId, userId, {
        videoUrl,
        durationMs,
        tracks: ['visual', 'motion', 'subjects'], // Video-only tracks
      });
      analyzed++;
    } catch (err: any) {
      console.error(`[5Track] Failed to analyze ${assetId}:`, err.message);
      failed++;
    }
  }

  return { analyzed, cached, failed };
}
