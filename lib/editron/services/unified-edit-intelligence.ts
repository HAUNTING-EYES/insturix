/**
 * Unified Edit Intelligence Engine
 *
 * REPLACES the old Reactive Edit Engine's frame-by-frame scoring approach.
 * Instead of separate engines for motion, subjects, speech, etc., this makes
 * ONE Gemini call with the COMPLETE project context and gets back a full
 * edit plan that's informed by everything — script, video, audio, storyboard.
 *
 * Why this is better:
 * - Old way: Motion engine sees "peak at frame 60" → outputs generic "cut"
 * - New way: Gemini sees "frame 60 has motion peak" + "script says 'Quick cuts'" +
 *   "voiceover says 'anticipation' at 0:02" + "BGM beat at 0:02" → outputs
 *   "zoom punch at frame 60 synced to word 'anticipation' on beat drop"
 *
 * Cost: ~$0.05-0.10 per call (Gemini 2.5 Flash structured output, ~4K tokens)
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { AssetAnalysis } from './five-track-analysis';
import { DEFAULT_CONFIG } from '@/lib/editron/config/editron-config';
import { ROW } from '@/lib/pipeline/scene-to-editron';

// ─── Types ───────────────────────────────────────────────────────

/** An anchor is a moment in the video where an edit decision SHOULD happen.
 * Multiple sources can produce anchors (motion, voiceover, beats, narrative).
 * When sources converge (motion peak + voiceover emphasis at same frame), the
 * anchor gets boosted confidence — that's the most important moment. */
export interface AnchorPoint {
  type: 'motion-peak' | 'voiceover-word' | 'bgm-beat' | 'narrative-beat' | 'storyboard-intent';
  frame: number;          // Absolute timeline frame
  timestampMs: number;
  confidence: number;     // 0.0-1.0
  description: string;
  suggestedDecisions: string[];
  isCompound?: boolean;   // True when multiple sources converge at this frame
  sources?: string[];     // Which source types contributed (for compound anchors)
}

export interface UnifiedContext {
  projectId: string;
  fps: number;
  totalFrames: number;
  totalDurationMs: number;

  // Per-scene merged context (script + video + audio)
  scenes: SceneContext[];

  // Anchor timeline — edit decision points ranked by confidence (Phase 1D)
  anchors?: AnchorPoint[];

  // Global context
  globalEditDirections?: any;
  overallMusicPrompt?: string;
  colorPalette?: string[];
  environmentNotes?: string;
  editProfileName?: string;
}

export interface SceneContext {
  sceneIndex: number;
  assetId?: string;
  fromFrame: number;
  durationFrames: number;

  // From script (storyboard descriptor)
  title: string;
  narration: string;
  mood: string;
  visualDescription: string;
  scriptTransition?: { type: string; durationMs?: number };
  scriptPacing?: string;
  sfxCue?: string;
  motionGraphicCue?: string;
  /** Phase A3.4 — exact verbatim on-screen text strings extracted from the script.
   *  When present, the EDL MUST use these exact strings for graphic text instead of
   *  inventing/paraphrasing copy. See parser SceneEditDirectionsSchema.onScreenText. */
  onScreenText?: string[];
  cameraDirection?: string;

  // From video analysis (5-Track)
  detectedSubjects: Array<{ label: string; category: string; confidence: number; position?: any }>;
  motionType: string; // static, pan, dolly, handheld, etc.
  motionIntensity: number; // 0-1
  keyframeDescriptions: string[]; // Gemini Vision descriptions of key moments
  naturalCutPoints: number[]; // frames relative to scene start

  // From voiceover
  voiceoverWords: Array<{ word: string; startMs: number; endMs: number }>;

  // From BGM (if available)
  bgmBeatsInScene?: number[]; // frame positions of beats within this scene
  bgmEnergyLevel?: number; // 0-1 average energy
}

export interface EditPlanDecision {
  type: 'cut' | 'transition' | 'zoom' | 'speed-change' | 'graphic' | 'sfx-trigger' | 'filter-change' | 'caption-emphasis' | 'camera-shake';
  frame: number;
  durationFrames?: number;
  reason: string;
  params: Record<string, any>;
  confidence: number;
  sources: string[]; // Which context sources informed this decision
}

export interface EditPlan {
  projectId: string;
  generatedAt: Date;
  decisions: EditPlanDecision[];
  stats: {
    cutsPerMinute: number;
    transitionCount: number;
    graphicCount: number;
    zoomCount: number;
    totalDecisions: number;
    averageConfidence: number;
  };
}

// ─── Context Assembler ────────────────────────────────────────────

/**
 * Assemble unified context from all available project data.
 * Merges: project overlays + storyboard descriptors + 5-Track analyses + voiceover transcriptions
 */
export async function assembleUnifiedContext(
  projectId: string,
  userId: string,
): Promise<UnifiedContext> {
  const { getDatabase, COLLECTIONS } = await import('../db/mongodb');
  const { getAnalysis } = await import('./five-track-analysis');

  const db = await getDatabase();

  // Load project
  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId }) as any;
  if (!project) throw new Error(`Project ${projectId} not found`);

  const fps = project.fps || 30;
  const totalFrames = project.durationInFrames || 900;
  const overlays = project.overlays || [];

  // Load storyboard
  let storyboardScenes: any[] = [];
  let globalEditDirections: any = null;
  let overallMusicPrompt = '';
  let colorPalette: string[] = [];
  let environmentNotes = '';

  if (project.sourceStoryboardId) {
    const sb = await db.collection('storyboards').findOne({ storyboardId: project.sourceStoryboardId }) as any;
    if (sb) {
      storyboardScenes = sb.scenes || [];
      globalEditDirections = (sb as any).globalEditDirections || null;
      overallMusicPrompt = sb.overallMusicPrompt || '';
      colorPalette = (sb as any).colorPalette || [];
      environmentNotes = (sb as any).environmentNotes || '';
    }
  }

  // Get video overlays sorted by position
  const videoOverlays = overlays
    .filter((o: any) => o.type === 'video')
    .sort((a: any, b: any) => a.from - b.from);

  // Get voiceover overlays
  const voiceoverOverlays = overlays
    .filter((o: any) => o.type === 'sound' && ((o.assetId || '').startsWith('voiceover_') || o.row === ROW.VOICEOVER));

  // Build per-scene context
  const scenes: SceneContext[] = [];

  for (let i = 0; i < videoOverlays.length; i++) {
    const vo = videoOverlays[i];

    // FIX Problem 1: Match storyboard scene by metadata.sceneIndex, not array position.
    // Sub-shots create multiple video overlays from one storyboard scene.
    // Old: storyboardScenes[i] → wrong when i=1 is scene 0's 2nd sub-shot
    // New: find by sceneIndex → correct regardless of sub-shot count
    const overlaySceneIndex = (vo as any).metadata?.sceneIndex ?? i;
    const sbScene = storyboardScenes.find((s: any) => s.sceneIndex === overlaySceneIndex)
      || storyboardScenes[Math.min(i, storyboardScenes.length - 1)]; // fallback to prevent undefined
    const descriptor = sbScene?.descriptor || {};

    // Get 5-Track analysis (with error handling — one bad asset shouldn't crash context assembly)
    let analysis: AssetAnalysis | null = null;
    if (vo.assetId) {
      try {
        analysis = await getAnalysis(vo.assetId);
      } catch (err: any) {
        console.warn(`[UnifiedIntel] Analysis lookup failed for ${vo.assetId}: ${err.message}`);
      }
    }

    // FIX Problem 2: Match voiceover by TIME OVERLAP, not start-frame proximity.
    // Old: v.from >= vo.from - 15 → misses J-cuts where VO starts 20+ frames before video
    // New: check if voiceover and video share ANY time range
    let voWords: Array<{ word: string; startMs: number; endMs: number }> = [];
    const videoEnd = vo.from + vo.durationInFrames;
    const matchingVo = voiceoverOverlays.find((v: any) => {
      const voEnd = v.from + v.durationInFrames;
      return v.from < videoEnd && voEnd > vo.from; // time overlap check
    });
    if (matchingVo?.assetId) {
      const voAsset = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne({ assetId: matchingVo.assetId }) as any;
      if (voAsset?.transcription?.words) {
        voWords = voAsset.transcription.words;
      }
    }

    // Extract detected subjects from analysis
    const subjects = (analysis?.subjectTracks || []).slice(0, 5).map((s: any) => ({
      label: s.label || s.subjectId || 'unknown',
      category: s.category || (s.label?.includes('person') ? 'person' : 'object'),
      confidence: s.confidence || 0.5,
      position: s.boundingBox,
    }));

    // FIX Problem 3: Report ALL motion segments, not just the first.
    // Old: analysis?.motionSegments?.[0] → only sees first segment
    // New: report peak segment + full summary for Gemini
    const allMotion = analysis?.motionSegments || [];
    const peakSegment = allMotion.length > 0
      ? allMotion.reduce((max, seg) => seg.motionIntensity > max.motionIntensity ? seg : max, allMotion[0])
      : null;
    const motionType = peakSegment?.cameraMotion || 'static';
    const motionIntensity = peakSegment?.motionIntensity || 0.1;

    // FIX Problem 4: Include ALL keyframe descriptions, not just the first.
    // Old: only keyframeDescriptions[0] shown in prompt (truncated to 120 chars)
    // New: all descriptions passed, prompt builder decides how to present
    const kfDescs = (analysis?.keyframeAnalyses || []).map((kf: any) =>
      kf.description || `Frame ${kf.frame}: ${kf.shotType || 'unknown'} shot`
    );

    // Natural cut points (relative to scene start)
    const cuts = (analysis?.naturalCutPoints || []).filter((c: number) => c > 5 && c < (vo.durationInFrames - 5));

    scenes.push({
      sceneIndex: i,
      assetId: (vo as any).assetId || '',
      fromFrame: vo.from,
      durationFrames: vo.durationInFrames,
      title: descriptor.title || `Scene ${i + 1}`,
      narration: descriptor.narration || '',
      mood: descriptor.mood || 'neutral',
      visualDescription: descriptor.visualDescription || '',
      scriptTransition: descriptor.editDirections?.transition,
      scriptPacing: descriptor.editDirections?.pacing,
      sfxCue: descriptor.editDirections?.sfxCue,
      motionGraphicCue: descriptor.editDirections?.motionGraphicCue,
      onScreenText: (descriptor.editDirections as any)?.onScreenText,
      cameraDirection: descriptor.cameraDirection,
      detectedSubjects: subjects,
      motionType,
      motionIntensity,
      keyframeDescriptions: kfDescs,
      naturalCutPoints: cuts,
      voiceoverWords: voWords,
    });
  }

  // Phase 1D: Build anchor timeline from all available sources
  const anchors: AnchorPoint[] = [];

  for (const scene of scenes) {
    const sceneStartMs = (scene.fromFrame / fps) * 1000;

    // Anchor source 1: Motion peaks (from 5-Track)
    for (const cutFrame of scene.naturalCutPoints) {
      const absFrame = scene.fromFrame + cutFrame;
      anchors.push({
        type: 'motion-peak',
        frame: absFrame,
        timestampMs: (absFrame / fps) * 1000,
        confidence: scene.motionIntensity > 0.3 ? 0.8 : 0.4,
        description: `Motion peak in "${scene.title}"`,
        suggestedDecisions: ['zoom', 'speed-change', 'sfx-trigger', 'camera-shake'],
      });
    }

    // Anchor source 2: Voiceover emphasis words
    for (const word of scene.voiceoverWords) {
      // Detect emphasis: numbers, short power words, ALL CAPS
      const isEmphasis = /^\d/.test(word.word) || /^[A-Z]{2,}$/.test(word.word)
        || ['never', 'always', 'every', 'only', 'first', 'best', 'worst', 'new', 'free', 'now'].includes(word.word.toLowerCase());
      if (isEmphasis) {
        const wordFrame = scene.fromFrame + Math.round((word.startMs / 1000) * fps);
        anchors.push({
          type: 'voiceover-word',
          frame: wordFrame,
          timestampMs: sceneStartMs + word.startMs,
          confidence: 0.85,
          description: `Emphasis word: "${word.word}"`,
          suggestedDecisions: ['graphic', 'caption-emphasis', 'zoom'],
        });
      }
    }

    // Anchor source 3: BGM beats (if available in scene)
    if (scene.bgmBeatsInScene) {
      for (const beatFrame of scene.bgmBeatsInScene) {
        anchors.push({
          type: 'bgm-beat',
          frame: beatFrame,
          timestampMs: (beatFrame / fps) * 1000,
          confidence: 0.7,
          description: `Beat in "${scene.title}"`,
          suggestedDecisions: ['cut', 'transition', 'sfx-trigger'],
        });
      }
    }

    // Anchor source 4: Narrative beat (scene boundary — always available)
    anchors.push({
      type: 'narrative-beat',
      frame: scene.fromFrame,
      timestampMs: sceneStartMs,
      confidence: 0.55,
      description: `Scene start: "${scene.title}" (${scene.mood})`,
      suggestedDecisions: ['transition', 'filter-change'],
    });
  }

  // Merge compound anchors: when multiple sources converge within ±5 frames (167ms)
  anchors.sort((a, b) => a.frame - b.frame);
  const mergedAnchors: AnchorPoint[] = [];
  let i = 0;
  while (i < anchors.length) {
    const group = [anchors[i]];
    let j = i + 1;
    while (j < anchors.length && anchors[j].frame - anchors[i].frame <= 5) {
      group.push(anchors[j]);
      j++;
    }
    if (group.length === 1) {
      mergedAnchors.push(group[0]);
    } else {
      // Compound anchor — boost confidence, merge descriptions
      const best = group.reduce((a, b) => a.confidence > b.confidence ? a : b);
      const avgFrame = Math.round(group.reduce((s, a) => s + a.frame, 0) / group.length);
      mergedAnchors.push({
        type: best.type,
        frame: avgFrame,
        timestampMs: (avgFrame / fps) * 1000,
        confidence: Math.min(1.0, group.reduce((s, a) => s + a.confidence, 0) / group.length + 0.15),
        description: `[COMPOUND] ${group.map(a => a.description).join(' + ')}`,
        suggestedDecisions: [...new Set(group.flatMap(a => a.suggestedDecisions))],
        isCompound: true,
        sources: group.map(a => a.type),
      });
    }
    i = j;
  }

  console.log(`[UnifiedIntel] Anchors: ${mergedAnchors.length} total (${mergedAnchors.filter(a => a.isCompound).length} compound), from ${anchors.length} raw sources`);

  return {
    projectId,
    fps,
    totalFrames,
    totalDurationMs: (totalFrames / fps) * 1000,
    scenes,
    anchors: mergedAnchors,
    globalEditDirections,
    overallMusicPrompt,
    colorPalette,
    environmentNotes,
  };
}

// ─── Gemini Intelligence Call ─────────────────────────────────────

// ─── OLD: Mechanical EditDecision schema (frame-level, LLM guesses frames) ──
// Replaced by CreativeIntent schema below. The old schema asked the LLM to
// output exact frame numbers, which it approximated from anchor points.
// The new schema asks for WHAT + WHY (creative intent), and deterministic code
// resolves the exact frame numbers using raw 5-Track data.
//
// The old EditDecisionSchema is preserved in a comment for backward compatibility
// reference. The EDL executor still consumes EditDecisionList — the intent-
// translator module converts creative intents to EDL decisions.

// ─── NEW: Creative Intent Schema ─────────────────────────────────
// The LLM picks from constrained enums (code can handle every value).
// No frame numbers — just WHAT and WHY. The intent-translator resolves frames.

const GraphicIntentSchema = z.object({
  type: z.enum(['none', 'text-overlay', 'stat-counter', 'lower-third', 'callout', 'keyword-highlight', 'quote-card', 'logo']).describe('Type of graphic overlay'),
  text: z.string().optional().describe('Text content for the graphic (use VERBATIM from onScreenText if available)'),
  triggerMoment: z.string().describe('When this appears, in natural language: "when narrator says X", "at scene start", "at emotional peak"'),
});

const SceneIntentSchema = z.object({
  sceneIndex: z.number().describe('Scene index (0-based)'),
  decisiveMoment: z.string().describe('Natural language description of THE key moment in this clip. NOT a frame number. Example: "the toddler\'s biggest ketchup smile" or "when narrator says \'transformed\'" or "the product hero shot at center frame"'),
  zoomIntent: z.enum([
    'none',              // No zoom — the content speaks for itself
    'gentle-drift',      // Subtle 3-6% drift (delegate to post-processing)
    'slow-push',         // Gradual push-in over scene duration (emotional engagement)
    'slow-pull',         // Gradual pull-back (reveal, resolution, breathing room)
    'punch-at-peak',     // Quick zoom punch at decisive moment (maximum emphasis)
    'push-to-subject',   // Push toward the main subject
    'pull-from-detail',  // Start on detail, pull to reveal context
  ]).describe('Zoom approach for this scene'),
  pacingIntent: z.enum([
    'hold-natural',         // Use script duration as-is
    'extend-for-emphasis',  // 20% longer — let the moment breathe
    'compress-energy',      // 15% shorter — build momentum in montage
    'freeze-for-graphic',   // Freeze video behind a graphic overlay
  ]).describe('Pacing approach for this scene'),
  transitionIn: z.enum([
    'hard-cut', 'dissolve', 'dip-to-black', 'dip-to-white', 'soft-cut',
    'zoom-punch', 'flash', 'blur', 'wipe', 'film-burn', 'glitch', 'match-cut',
  ]).describe('Transition INTO this scene from previous'),
  transitionOut: z.enum([
    'hard-cut', 'dissolve', 'dip-to-black', 'dip-to-white', 'soft-cut',
    'zoom-punch', 'flash', 'blur', 'wipe', 'film-burn', 'glitch', 'match-cut',
  ]).describe('Transition OUT of this scene to next'),
  audioIntent: z.object({
    nativeAudio: z.enum([
      'keep-full',       // Play native audio at full volume (no voiceover in scene)
      'keep-ambient',    // Keep as ambient bed (duck under voiceover or other primary audio)
      'duck-under-vo',   // Specifically duck under voiceover narration
      'mute',            // Mute native audio entirely
    ]).describe('How to handle model-generated native audio'),
    sfxOnEntry: z.string().optional().describe('SFX when scene starts: "whoosh", "riser", "impact", etc.'),
    sfxAtPeak: z.string().optional().describe('SFX at decisive moment: "bass-hit", "ding", "pop", etc.'),
  }).describe('Audio treatment for this scene'),
  graphicIntents: z.array(GraphicIntentSchema).max(3).describe('Graphics to place in this scene (max 3). Include ALL onScreenText entries as separate graphics.'),
  shakeIntent: z.enum([
    'none',              // No camera shake
    'subtle-at-peak',    // Light shake at decisive moment (emphasis)
    'impact-hit',        // Strong impact shake (bass drop, collision, reveal)
  ]).describe('Camera shake for this scene'),
  reasoning: z.string().describe('WHY these choices — reference Murch\'s hierarchy, editing principles, or narrative arc. Example: "Hold longer because the smile IS the emotion (Murch: emotion 51%). No zoom — restraint is the decision. Dissolve in from montage to signal resolution."'),
});

const CreativeIntentPlanSchema = z.object({
  sceneIntents: z.array(SceneIntentSchema).describe('Creative intent for each scene, ordered by sceneIndex'),
});

// ─── Legacy Schema (kept for generateUnifiedEditPlan fallback) ───
const LegacyEditDecisionSchema = z.object({
  type: z.enum(['cut', 'transition', 'zoom', 'speed-change', 'graphic', 'sfx-trigger', 'filter-change', 'caption-emphasis', 'camera-shake']),
  frame: z.number(),
  durationFrames: z.number().optional(),
  reason: z.string(),
  transitionType: z.string().optional(),
  graphicType: z.string().optional(),
  graphicText: z.string().optional(),
  zoomScale: z.number().optional(),
  zoomType: z.enum(['punch-in', 'slow-push', 'pull-back']).optional(),
  speedMultiplier: z.number().optional(),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.string()),
});

const EditPlanSchema = z.object({
  decisions: z.array(LegacyEditDecisionSchema),
});

/**
 * Generate a complete edit plan from unified project context.
 * LEGACY — kept for reactive engine fallback. The primary path now uses
 * generateCreativeIntentPlan() which outputs creative intent, not frame numbers.
 */
export async function generateUnifiedEditPlan(
  context: UnifiedContext,
  options: {
    editProfileName?: string;
    targetCutsPerMinute?: number;
    graphicDensity?: 'minimal' | 'moderate' | 'heavy';
    style?: string; // 'hormozi', 'iman-gadzhi', 'documentary', 'balanced'
  } = {},
): Promise<EditPlan> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not configured');

  const google = createGoogleGenerativeAI({ apiKey });

  // Build the context summary for Gemini
  const contextSummary = buildContextSummary(context, options);

  console.log(`[UnifiedIntel] Generating edit plan for ${context.projectId} (${context.scenes.length} scenes, ${Math.round(context.totalDurationMs / 1000)}s)`);

  // OLD: hardcoded 'gemini-2.5-flash'. NEW: configurable via LLM_INTELLIGENCE_MODEL env var.
  const model = google(DEFAULT_CONFIG.aiModels.unifiedIntelligenceModel);

  // geminiRetry (Batch 4, Toyota A.gemini.6): transient 429 / 5xx / network
  // errors get exponential-backoff retries. A Director run that used to hard-
  // fail on a single rate-limit spike now recovers. Daily quota + 401/403
  // bail immediately.
  const { geminiRetry } = await import('@/lib/pipeline/gemini-retry');
  const { object } = await geminiRetry(() => generateObject({
    model,
    schema: EditPlanSchema,
    prompt: contextSummary,
    temperature: DEFAULT_CONFIG.aiModels.editingTemperature,
  }), { label: 'unified-edit-intelligence plan', maxRetries: 2 });

  const decisions: EditPlanDecision[] = object.decisions.map(d => ({
    type: d.type,
    frame: d.frame,
    durationFrames: d.durationFrames,
    reason: d.reason,
    params: {
      ...(d.transitionType && { transitionType: d.transitionType }),
      ...(d.graphicType && { graphicType: d.graphicType }),
      ...(d.graphicText && { text: d.graphicText }),
      ...(d.zoomScale && { scaleFrom: 1.0, scaleTo: d.zoomScale }),
      ...(d.zoomType && { zoomType: d.zoomType }),
      ...(d.speedMultiplier && { speedMultiplier: d.speedMultiplier }),
    },
    confidence: d.confidence,
    sources: d.sources,
  }));

  // Sort by frame
  decisions.sort((a, b) => a.frame - b.frame);

  const totalMinutes = context.totalDurationMs / 60000;
  const cuts = decisions.filter(d => d.type === 'cut').length;

  const plan: EditPlan = {
    projectId: context.projectId,
    generatedAt: new Date(),
    decisions,
    stats: {
      cutsPerMinute: totalMinutes > 0 ? cuts / totalMinutes : 0,
      transitionCount: decisions.filter(d => d.type === 'transition').length,
      graphicCount: decisions.filter(d => d.type === 'graphic').length,
      zoomCount: decisions.filter(d => d.type === 'zoom').length,
      totalDecisions: decisions.length,
      averageConfidence: decisions.length > 0
        ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length
        : 0,
    },
  };

  console.log(`[UnifiedIntel] Plan: ${plan.stats.totalDecisions} decisions, ${plan.stats.cutsPerMinute.toFixed(1)} cuts/min, avg confidence ${plan.stats.averageConfidence.toFixed(2)}`);

  return plan;
}

// ─── Creative Intent Types (exported for intent-translator) ──────

export type ZoomIntent = z.infer<typeof SceneIntentSchema>['zoomIntent'];
export type PacingIntent = z.infer<typeof SceneIntentSchema>['pacingIntent'];
export type TransitionIntent = z.infer<typeof SceneIntentSchema>['transitionIn'];
export type AudioIntentNative = z.infer<typeof SceneIntentSchema>['audioIntent']['nativeAudio'];
export type ShakeIntent = z.infer<typeof SceneIntentSchema>['shakeIntent'];
export type GraphicIntentType = z.infer<typeof GraphicIntentSchema>['type'];

export interface SceneIntent {
  sceneIndex: number;
  decisiveMoment: string;
  zoomIntent: ZoomIntent;
  pacingIntent: PacingIntent;
  transitionIn: TransitionIntent;
  transitionOut: TransitionIntent;
  audioIntent: {
    nativeAudio: AudioIntentNative;
    sfxOnEntry?: string;
    sfxAtPeak?: string;
  };
  graphicIntents: Array<{
    type: GraphicIntentType;
    text?: string;
    triggerMoment: string;
  }>;
  shakeIntent: ShakeIntent;
  reasoning: string;
}

export interface CreativeIntentPlan {
  projectId: string;
  generatedAt: Date;
  sceneIntents: SceneIntent[];
  stats: {
    totalScenes: number;
    zoomCount: number;
    graphicCount: number;
    transitionCount: number;
  };
}

/**
 * Generate creative intent plan — the LLM outputs WHAT + WHY per scene.
 * No frame numbers. The intent-translator resolves frames from raw analysis data.
 *
 * This replaces generateUnifiedEditPlan() in the director-agent flow.
 * The old function is kept for backward compatibility with the reactive engine fallback.
 */
export async function generateCreativeIntentPlan(
  context: UnifiedContext,
  options: {
    editProfileName?: string;
    targetCutsPerMinute?: number;
    graphicDensity?: 'minimal' | 'moderate' | 'heavy';
    style?: string;
    /** Asset briefings (compressed 5-Track data for LLM prompt) */
    assetBriefings?: Map<string, { promptText: string; slopFlags: Array<{ startFrame: number; endFrame: number; description: string }> }>;
  } = {},
): Promise<CreativeIntentPlan> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not configured');

  const google = createGoogleGenerativeAI({ apiKey });
  const contextSummary = buildCreativeIntentPrompt(context, options);

  console.log(`[UnifiedIntel] Generating CREATIVE INTENT plan for ${context.projectId} (${context.scenes.length} scenes, ${Math.round(context.totalDurationMs / 1000)}s)`);

  const model = google(DEFAULT_CONFIG.aiModels.unifiedIntelligenceModel);

  const { geminiRetry } = await import('@/lib/pipeline/gemini-retry');
  const { object } = await geminiRetry(() => generateObject({
    model,
    schema: CreativeIntentPlanSchema,
    prompt: contextSummary,
    temperature: DEFAULT_CONFIG.aiModels.editingTemperature,
  }));

  // Defensive: Vercel AI SDK's generateObject can return undefined for nested
  // arrays/objects when Gemini omits optional fields. Guard every access.
  const sceneIntents: SceneIntent[] = (object.sceneIntents || []).map(si => ({
    sceneIndex: si.sceneIndex ?? 0,
    decisiveMoment: si.decisiveMoment ?? 'midpoint of the scene',
    zoomIntent: si.zoomIntent ?? 'none',
    pacingIntent: si.pacingIntent ?? 'maintain',
    transitionIn: si.transitionIn ?? 'hard-cut',
    transitionOut: si.transitionOut ?? 'hard-cut',
    audioIntent: {
      nativeAudio: si.audioIntent?.nativeAudio ?? 'keep',
      sfxOnEntry: si.audioIntent?.sfxOnEntry,
      sfxAtPeak: si.audioIntent?.sfxAtPeak,
    },
    graphicIntents: (si.graphicIntents || []).map(g => ({
      type: g.type ?? 'none',
      text: g.text,
      triggerMoment: g.triggerMoment ?? 'scene-start',
    })),
    shakeIntent: si.shakeIntent ?? 'none',
    reasoning: si.reasoning ?? '',
  }));

  const plan: CreativeIntentPlan = {
    projectId: context.projectId,
    generatedAt: new Date(),
    sceneIntents,
    stats: {
      totalScenes: sceneIntents.length,
      zoomCount: sceneIntents.filter(si => si.zoomIntent !== 'none' && si.zoomIntent !== 'gentle-drift').length,
      graphicCount: sceneIntents.reduce((sum, si) => sum + si.graphicIntents.filter(g => g.type !== 'none').length, 0),
      transitionCount: sceneIntents.filter(si => si.transitionIn !== 'hard-cut').length,
    },
  };

  console.log(`[UnifiedIntel] Creative Intent: ${plan.stats.totalScenes} scenes, ${plan.stats.zoomCount} zooms, ${plan.stats.graphicCount} graphics, ${plan.stats.transitionCount} non-cut transitions`);

  return plan;
}

// ─── Creative Intent Prompt Builder ──────────────────────────────

function buildCreativeIntentPrompt(
  context: UnifiedContext,
  options: {
    editProfileName?: string;
    targetCutsPerMinute?: number;
    graphicDensity?: string;
    style?: string;
    assetBriefings?: Map<string, { promptText: string; slopFlags: Array<{ startFrame: number; endFrame: number; description: string }> }>;
  },
): string {
  const fps = context.fps;
  const totalSec = Math.round(context.totalDurationMs / 1000);

  // Start with the same proven creative principles, but reframed for intent output
  let prompt = `You are the Creative Director for a ${totalSec}-second video. You make WHAT and WHY decisions for each scene. You NEVER specify frame numbers — code handles precision.

## YOUR JOB
For each scene, describe:
1. What is THE decisive moment (in words, not frames)
2. What edit decisions serve that moment (zoom, transition, pacing, audio, graphics)
3. WHY — which editing principle justifies each choice

## MURCH'S RULE OF SIX (your decision hierarchy)
1. EMOTION (51%) — Does this make the viewer FEEL something?
2. STORY (23%) — Does this advance the narrative?
3. RHYTHM (10%) — Does this maintain or break the pacing pattern intentionally?
4. EYE-TRACE (7%) — Does this respect where the viewer's eye is?
5. 2D PLANE (5%) — Does the composition work?
6. 3D CONTINUITY (4%) — Does spatial continuity make sense?
A technically perfect decision that kills emotion is a BAD decision.

## DECISIVE MOMENT PRINCIPLE
Each scene has ONE peak. ALL decisions serve it:
- Before peak: build (slower, tighter, rising energy)
- AT peak: maximum emphasis
- After peak: release (wider, dissolve, softer)

## CONTRAST CREATES IMPACT
Fast only feels fast after slow. A punch-zoom hits only after a static shot.
After high-intensity, the next scene MUST be low-intensity.

## HARD BUDGETS (${totalSec}s video)
- Punch-zooms: MAX ${Math.round(3 * totalSec / 30)}
- Camera shakes: MAX ${Math.round(2 * totalSec / 30)}
- Graphics: MAX ${Math.round(7 * totalSec / 30)}, minimum 3s apart
- "Loud" decisions (punch, shake, flash): MAX 2-3 total. Everything else "quiet."
- Flashy transitions: NEVER two consecutive

## PROJECT: ${totalSec}s, ${fps}fps, ${context.scenes.length} scenes
`;

  // Global context (same as before)
  if (context.overallMusicPrompt) prompt += `MUSIC: ${context.overallMusicPrompt}\n`;
  if (context.globalEditDirections) prompt += `GLOBAL STYLE: ${JSON.stringify(context.globalEditDirections)}\n`;
  if (context.colorPalette?.length) prompt += `COLORS: ${context.colorPalette.join(', ')}\n`;
  if (context.environmentNotes) prompt += `ENVIRONMENT: ${context.environmentNotes}\n`;

  // Profile constraints (in creative language, not mechanical rules)
  const profileName = options.editProfileName || context.editProfileName || '';
  if (profileName) {
    prompt += `\nEDIT PROFILE: "${profileName}"\n`;
    prompt += `Target pacing: ${options.targetCutsPerMinute || 10} cuts/min. Graphics density: ${options.graphicDensity || 'moderate'}.\n`;
  }

  // Narrative arc (same detection as before)
  const narrativeArc = context.globalEditDirections?.narrativeArc || '';
  if (narrativeArc) {
    prompt += `\nNARRATIVE ARC: ${narrativeArc}\n`;
    // Same arc-specific rules as buildContextSummary()
    if (/nostalg|memory|childhood|remember|past.*present/i.test(
      context.scenes.map(s => s.narration).join(' ') + ' ' + (context.environmentNotes || '')
    )) {
      prompt += `NOSTALGIA PROGRESSION: early=vintage filter/slow dissolves, middle=sharper/faster, present=crisp/zoom-punches allowed, resolution=brightest/cleanest.\n`;
    }
  }

  // Platform overrides (same as before, condensed)
  if (profileName.toLowerCase().includes('tiktok') || profileName.toLowerCase().includes('reel')) {
    prompt += `PLATFORM: Short-form — hook in 2-3s, captions mandatory, faster transitions.\n`;
  } else if (profileName.toLowerCase().includes('linkedin')) {
    prompt += `PLATFORM: LinkedIn — NO aggressive shake, MAX 1 zoom-punch/30s, clean professional graphics.\n`;
  }

  // ─── Per-scene context (using asset briefings if available) ────
  prompt += `\n## SCENES\n\n`;

  for (const scene of context.scenes) {
    const startSec = (scene.fromFrame / fps).toFixed(1);
    const endSec = ((scene.fromFrame + scene.durationFrames) / fps).toFixed(1);

    prompt += `### Scene ${scene.sceneIndex + 1}: "${scene.title}" [${startSec}s–${endSec}s]\n`;
    prompt += `Narration: "${scene.narration || '(silent)'}"\n`;
    prompt += `Mood: ${scene.mood}\n`;

    // Use compressed asset briefing if available, otherwise fall back to raw data.
    // Briefings Map is keyed by assetId. Match via scene.assetId (added to context).
    const briefing = scene.assetId && options.assetBriefings
      ? options.assetBriefings.get(scene.assetId) || null
      : null;

    if (briefing) {
      prompt += `Asset: ${briefing.promptText}\n`;
      if (briefing.slopFlags.length > 0) {
        prompt += `⚠️ AI ARTIFACTS — avoid emphasizing: ${briefing.slopFlags.map(f => f.description).join('; ')}\n`;
      }
    } else {
      // Fallback to raw scene data (backward compat)
      prompt += `Visual: ${scene.visualDescription.substring(0, 200)}\n`;
      if (scene.keyframeDescriptions.length > 0) {
        prompt += `Video content: ${scene.keyframeDescriptions.slice(0, 3).map(d => d.substring(0, 100)).join(' | ')}\n`;
      }
    }

    // Script-level data (always available, not from 5-Track)
    if (scene.scriptTransition) prompt += `Script transition: ${scene.scriptTransition.type}\n`;
    if (scene.cameraDirection) prompt += `Camera: ${scene.cameraDirection}\n`;

    // On-screen text (must be reproduced VERBATIM as graphic intents)
    if (scene.onScreenText && scene.onScreenText.length > 0) {
      prompt += `ON-SCREEN TEXT (create one graphic per entry, use text VERBATIM):\n`;
      scene.onScreenText.forEach((t, i) => prompt += `  ${i + 1}. "${t}"\n`);
    }

    // Voiceover timing highlights (condensed)
    if (scene.voiceoverWords.length > 0) {
      const emphasisWords = scene.voiceoverWords.filter(w =>
        /^\d/.test(w.word) || /^[A-Z]{2,}$/.test(w.word) || w.word.length >= 6
      ).slice(0, 8);
      if (emphasisWords.length > 0) {
        prompt += `VO emphasis: ${emphasisWords.map(w => `"${w.word}" @${(w.startMs / 1000).toFixed(1)}s`).join(', ')}\n`;
      }
    }

    prompt += '\n';
  }

  // Anchor timeline (kept — the intent-translator uses this for frame resolution,
  // and showing it to the LLM helps it understand where the key moments are)
  if (context.anchors && context.anchors.length > 0) {
    prompt += `## KEY MOMENTS (ranked by importance)\n`;
    const topAnchors = context.anchors
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20);
    for (const anchor of topAnchors.sort((a, b) => a.frame - b.frame)) {
      const sec = (anchor.timestampMs / 1000).toFixed(1);
      const compound = anchor.isCompound ? ' ★COMPOUND' : '';
      prompt += `- ${sec}s: ${anchor.description} [${anchor.confidence.toFixed(2)}]${compound}\n`;
    }
    prompt += '\n';
  }

  prompt += `## OUTPUT
For EACH scene, provide creative intent using the structured schema. Remember:
- decisiveMoment: describe in WORDS, not frame numbers
- reasoning: cite Murch's hierarchy or editing principles
- graphicIntents: include ALL onScreenText entries as separate graphics
- The code will resolve your creative descriptions to exact frames using video analysis data
`;

  return prompt;
}

// ─── Prompt Builder (LEGACY — used by generateUnifiedEditPlan fallback) ──

function buildContextSummary(
  context: UnifiedContext,
  options: { editProfileName?: string; targetCutsPerMinute?: number; graphicDensity?: string; style?: string },
): string {
  const fps = context.fps;
  const totalSec = Math.round(context.totalDurationMs / 1000);

  let prompt = `You are an expert video editor operating under the Director Knowledge Base — a professional film editing intelligence system.

## CORE PHILOSOPHY (Murch's Rule of Six)
Every decision must serve this hierarchy. When rules conflict, higher criteria win:
1. EMOTION (51%) — Does this make the viewer FEEL something?
2. STORY (23%) — Does this advance the narrative?
3. RHYTHM (10%) — Does this maintain or intentionally break the pacing pattern?
4. EYE-TRACE (7%) — Does this respect where the viewer's eye is?
5. 2D PLANE (5%) — Does the composition work?
6. 3D CONTINUITY (4%) — Does spatial continuity make sense?
CRITICAL: A technically perfect decision that kills emotion is a BAD decision.

## DECISIVE MOMENT PRINCIPLE
Each scene has ONE peak moment (emotional, informational, or visual climax). ALL decisions in that scene serve that peak:
- Before peak: build anticipation (slower pace, tighter framing, rising energy)
- AT peak: maximum emphasis (zoom-punch, camera-shake, graphic, SFX)
- After peak: release (wider framing, dissolve, speed normalization)

## CONTRAST CREATES IMPACT
Fast only feels fast after slow. A zoom-punch only hits if the previous shot was static.
Track your previous decision intensity. After a high-intensity decision (zoom-punch, shake, flash), the NEXT decision MUST be low-intensity (clean cut, subtle push, gentle dissolve).

## HARD BUDGETS (NEVER exceed these)
- Punch-zooms (scale ≥1.10x): MAX ${Math.round(3 * totalSec / 30)} per video
- Camera shakes: MAX ${Math.round(4 * totalSec / 30)} total, MAX ${Math.round(2 * totalSec / 30)} aggressive
- Keyword graphics: MAX ${Math.round(7 * totalSec / 30)}, minimum 3s apart
- Caption emphases: MAX ${Math.round(10 * totalSec / 30)}
- Simultaneous overlays: MAX 2 (excluding captions)
- Flashy transitions (zoom-punch, flash, glitch): NEVER two consecutive
- Filter presets: MAX 2 distinct presets per 60s
- Slow-mo on AI video: NEVER below 0.5x speed
- In a ${totalSec}s video: 2-3 "loud" decisions maximum. Everything else "quiet."

## ANTI-PATTERNS (NEVER do these)
- AP-001: Zoom-punch on every cut → max 3 per 30s
- AP-002: Camera shake throughout → specific impact moments only
- AP-003: Every caption word highlighted → max 1 per sentence
- AP-004: Dissolve between high-energy scenes → use hard-cut
- AP-005: Dip-to-black in fast montage → kills momentum
- AP-006: Graphics overlapping captions → respect screen zones
- AP-011: Same scene duration throughout → vary durations
- AP-013: Graphic appearing during transition → graphics on stable frames only

## MOOD-TO-DECISION DEFAULTS
| Mood | Zoom | Transition | Shake | Filter |
|------|------|-----------|-------|--------|
| Happy/Playful | Push-in | Hard-cut, fast | None | Warm-vibrant |
| Sad/Reflective | Slow push | Dissolve | None | Cool-desat |
| Energetic | Punch-in | Zoom-punch, flash | Impact | High-contrast |
| Nostalgic/Warm | Drift zoom | Dissolve, film-burn | None | Vintage-film |
| Professional | Minimal push | Hard-cut, dissolve | None | Minimal-grade |

## PROJECT: ${totalSec}s video, ${fps}fps, ${context.scenes.length} scenes

`;

  // Global context
  if (context.overallMusicPrompt) {
    prompt += `## MUSIC: ${context.overallMusicPrompt}\n`;
  }
  if (context.globalEditDirections) {
    prompt += `## GLOBAL EDIT STYLE: ${JSON.stringify(context.globalEditDirections)}\n`;
  }
  if (context.colorPalette?.length) {
    prompt += `## COLOR PALETTE: ${context.colorPalette.join(', ')}\n`;
  }
  if (context.environmentNotes) {
    prompt += `## ENVIRONMENT: ${context.environmentNotes}\n`;
  }
  if (options.style) {
    prompt += `## EDITING STYLE: ${options.style}\n`;
    if (options.style === 'hormozi') {
      prompt += `Apply Alex Hormozi editing: aggressive jump cuts, digital zoom punches on emphasis words, bold keyword callouts, no dead air. Every pause and breath should be a cut opportunity.\n`;
    } else if (options.style === 'iman-gadzhi') {
      prompt += `Apply Iman Gadzhi editing: fast cuts with sudden slow-motion dips, camera shake on emphasis, bold floating text overlays at key points, smooth camera movements.\n`;
    }
  }

  // ─── Part 13: Narrative Arc Rules ─────────────────────────────
  const narrativeArc = context.globalEditDirections?.narrativeArc || '';
  if (narrativeArc) {
    prompt += `\n## NARRATIVE ARC: ${narrativeArc}\n`;
    switch (narrativeArc.toLowerCase()) {
      case 'before-after':
      case 'problem-solution':
        prompt += `Rule N-002: Create STARK contrast between halves:
- First half (problem/before): Cool/desaturated filter, slower pace, tighter framing, subtle handheld shake, risers building tension
- TRANSITION MOMENT: dip-to-black OR dip-to-white + silence-beat (0.8-1.0s)
- Second half (solution/after): Warm/vibrant filter, faster pace, wider framing, stable camera, resolving SFX
Every visual and audio element must reinforce which "world" we're in.\n`;
        break;
      case 'three-act':
      case '3-act':
        prompt += `Rule N-003: Place emphasis at structural beats:
- Inciting incident (10-15%): Flash or zoom-punch, camera-shake, SFX hit
- Rising action (15-60%): Gradually increasing pace, escalating zoom intensity
- Climax (60-75%): Maximum intensity — slow-mo on peak, biggest graphic, strongest SFX
- Resolution (75-100%): Rapid de-escalation — wider shots, pull-back, dissolves, softer music\n`;
        break;
      case 'aida':
        prompt += `Rule N-001: Per-section treatment:
- Attention (0-15%): Fast cuts, zoom-punches, flash transition. FIRST FRAME must hook.
- Interest (15-45%): Moderate pace, dissolves, stat-counters for proof. Push-in zooms.
- Desire (45-75%): Emotional pace, slow-mo on testimonial/result, warm filter, kinetic typography.
- Action (75-100%): Energy ramp-up, zoom-punch to CTA, logo-reveal, strong closing SFX.\n`;
        break;
      default:
        // Check if this is a nostalgia/memory progression
        if (/nostalg|memory|childhood|remember|past.*present/i.test(
          context.scenes.map(s => s.narration).join(' ') + ' ' + (context.environmentNotes || '')
        )) {
          prompt += `Rule N-010: NOSTALGIA TEMPORAL PROGRESSION detected:
- Early memories: Vintage-film filter (warm, grain, soft), slow dissolves, drift-zoom on stills, gentle music, voiceover pacing 0.85x
- Middle years: Filter gradually sharpens + saturates, cut pace increases, dissolves shift to cuts, music gains energy
- Present day: Crisp/vibrant filter, normal-to-fast cuts, zoom-punches allowed, full-energy music
- Future/CTA: Brightest filter, cleanest visuals, most confident pacing, resolving music
The visual treatment must SHOW time passing, not just rely on voiceover.\n`;
        }
    }
  }

  // ─── Part 14: Platform Overrides ──────────────────────────────
  const profileName = (options.editProfileName || context.editProfileName || '').toLowerCase();
  if (profileName.includes('tiktok') || profileName.includes('reel') || profileName.includes('short')) {
    prompt += `\n## PLATFORM: Short-Form (TikTok/Reels/Shorts) — Rule PL-001 OVERRIDES:
- PREFER shorter scene durations (2-5s) but DO NOT force a hard cap. Script durations take priority.
- Hook in first 2-3s recommended but respect the script's pacing — tutorials and educational shorts may need longer setups.
- Captions MANDATORY, position center-screen (not bottom)
- Zoom-punch budget INCREASED to 5 per 30s
- Keyword graphic density INCREASED: 1 per 2.5s allowed
- Transitions must be fast: dissolves < 0.5s, wipes < 0.3s
- NO dip-to-black longer than 0.5s (kills retention)
- BGM must have clear beat for first 5 seconds\n`;
  } else if (profileName.includes('youtube') && profileName.includes('long')) {
    prompt += `\n## PLATFORM: YouTube Long Form — Rule PL-010:
- Scene durations follow the script — can be 5s to 60s+ depending on content
- Graphics LESS frequent (1 per 5-6s max)
- Transitions can be longer (dissolves up to 1.0s)
- Allow establishing shots and slower openings (hook within first 10s)\n`;
  } else if (profileName.includes('linkedin')) {
    prompt += `\n## PLATFORM: LinkedIn — Rule PL-020 OVERRIDES:
- Captions MANDATORY (autoplay is muted)
- NO aggressive camera shake, NO snap zoom, NO glitch transitions
- Maximum 1 zoom-punch per 30s
- Graphic style: clean, data-focused (stat-counters, charts, lower-thirds)
- Filter: neutral to slightly warm
- Close with professional CTA (lower-third with link)\n`;
  }

  // ─── Part 5: Speed Change Rules ───────────────────────────────
  prompt += `\n## SPEED CHANGE RULES:
- S-001: Slow-mo (0.5x-0.7x) for THE emotional peak moment only. Use ONCE per video, max twice.
- S-010: Speed-ramp-up (1.5x-2.0x) during approach, then normal/slow at impact.
- S-020: FREEZE-FRAME when placing a graphic overlay — freeze video behind graphic for readability.
  This is the Hormozi signature: freeze → stat-counter animates → hold → unfreeze.
- S-002: AI-generated video: NEVER below 0.5x speed (artifacts become obvious).\n`;

  // ─── Part 8: Eisenstein Montage Vocabulary (Fix 21) ─────────
  prompt += `\n## MONTAGE METHODS (Sergei Eisenstein — select the most appropriate for each scene's pacing):
- **METRIC**: Fixed rhythmic cutting. Every N beats = a cut. For: music-driven montages, lyric videos, product reveals timed to BPM.
- **RHYTHMIC**: Content-driven rhythm. Cut length follows the ACTION in frame (fast action = short cut, slow action = long cut). For: sports highlights, cooking, dance.
- **TONAL**: Emotional tone determines cut timing. Sad = long holds, joyful = quick cuts, tense = accelerating. For: brand stories, testimonials, documentaries.
- **OVERTONAL**: Multiple signals layered — motion + color + composition + sound all influence cuts simultaneously. For: cinematic trailers, luxury brand films, music videos.
- **INTELLECTUAL**: Contrasting images juxtaposed to create NEW meaning neither has alone. For: social commentary, before/after, problem-solution ads.

Select ONE method per scene based on content type and mood. Default to RHYTHMIC for most content.\n`;

  // ─── Part 9: SFX Pairing Rules ────────────────────────────────
  prompt += `\n## SFX PAIRING TABLE (transition type → sound):
| Transition | SFX | Volume | Rule |
|------------|-----|--------|------|
| dissolve, wipe-*, iris-wipe, blur, slide-* | whoosh (subtle swoosh) | -10dB | A-001 |
| zoom-punch, flash, glitch | impact (bass thud) | -5dB | A-002 |
| whip-pan | whoosh (fast) | -8dB | A-001 |
| dip-to-black, dip-to-white, soft-cut | SILENCE (intentional) | — | — |
| film-burn | NONE (crackle IS the transition) | — | — |

OTHER SFX RULES:
- A-010: Before major reveals → riser SFX (1.5-2.0s ascending tone)
- A-020: Graphic entrance → subtle pop/notification
- A-021: Stat-counter landing → click SFX
- A-032: Dramatic VO pause → silence-beat (drop ALL audio 0.5-0.8s)\n`;

  prompt += `\n## SCENES (with ALL available context):\n\n`;

  for (const scene of context.scenes) {
    const startSec = (scene.fromFrame / fps).toFixed(1);
    const endSec = ((scene.fromFrame + scene.durationFrames) / fps).toFixed(1);

    prompt += `### Scene ${scene.sceneIndex + 1}: "${scene.title}" [${startSec}s - ${endSec}s] (frames ${scene.fromFrame}-${scene.fromFrame + scene.durationFrames})\n`;
    prompt += `- **Narration:** "${scene.narration}"\n`;
    prompt += `- **Mood:** ${scene.mood}\n`;
    prompt += `- **Visual:** ${scene.visualDescription.substring(0, 300)}\n`;
    prompt += `- **Camera:** ${scene.cameraDirection || scene.motionType} (${Math.round(scene.motionIntensity * 100)}% intensity)\n`;

    if (scene.scriptTransition) {
      prompt += `- **Script transition:** ${scene.scriptTransition.type} (${scene.scriptTransition.durationMs || 0}ms)\n`;
    }
    if (scene.scriptPacing) {
      prompt += `- **Script pacing:** ${scene.scriptPacing}\n`;
    }
    if (scene.sfxCue) {
      prompt += `- **SFX cue:** ${scene.sfxCue}\n`;
    }
    if (scene.motionGraphicCue) {
      prompt += `- **Motion graphic (free-form hint):** ${scene.motionGraphicCue}\n`;
    }
    // Phase A3.4 — exact verbatim on-screen text from the script. The EDL MUST
    // produce one graphic decision per entry, with graphicText set to the EXACT string.
    // No paraphrasing, no truncation, no merging — these are the script author's intent.
    if (scene.onScreenText && scene.onScreenText.length > 0) {
      prompt += `- **EXACT on-screen text (use VERBATIM as graphicText, do NOT rewrite):**\n`;
      scene.onScreenText.forEach((t, i) => {
        prompt += `    ${i + 1}. "${t}"\n`;
      });
      prompt += `  → Produce exactly ${scene.onScreenText.length} graphic decision(s) for this scene, one per entry, in order. Use the exact string as graphicText. Use graphicType "keyword-highlight" by default, unless the entry is the brand/product name (then "logo-reveal") or a numeric statistic (then "stat-counter").\n`;
    }

    // Detected subjects
    if (scene.detectedSubjects.length > 0) {
      const subjectList = scene.detectedSubjects.map(s => `${s.label} (${s.category}, ${Math.round(s.confidence * 100)}%)`).join(', ');
      prompt += `- **Detected in video:** ${subjectList}\n`;
    }

    // FIX Problem 4: Show ALL keyframe descriptions, not just the first truncated one.
    // Old: only keyframeDescriptions[0].substring(0, 120) — missed 5/6 keyframes
    // New: show up to 6 keyframes with 200-char descriptions
    if (scene.keyframeDescriptions.length > 0) {
      const kfSummary = scene.keyframeDescriptions
        .slice(0, 6) // cap at 6 to keep prompt manageable
        .map((desc, idx) => `  ${idx + 1}. ${desc.substring(0, 200)}`)
        .join('\n');
      prompt += `- **Video content (${scene.keyframeDescriptions.length} keyframes):**\n${kfSummary}\n`;
    }

    // Voiceover word timing — only emphasis words, not every word
    // Old: listed ALL words (200+ for long scenes → prompt bloat)
    // New: filter to emphasis-worthy words only
    if (scene.voiceoverWords.length > 0) {
      const emphasisWords = scene.voiceoverWords.filter(w => {
        const word = w.word.toLowerCase();
        return /^\d/.test(w.word) || /^[A-Z]{2,}$/.test(w.word)
          || w.word.length >= 6; // longer words tend to be more important
      });
      const wordsToShow = emphasisWords.length > 0 ? emphasisWords : scene.voiceoverWords.slice(0, 10);
      const wordTimeline = wordsToShow.map(w =>
        `"${w.word}" @${(w.startMs / 1000).toFixed(1)}s`
      ).join(', ');
      prompt += `- **Voiceover timing (${scene.voiceoverWords.length} words, ${emphasisWords.length} emphasis):** ${wordTimeline}\n`;
    }

    // Natural cut points
    if (scene.naturalCutPoints.length > 0) {
      prompt += `- **Natural cut points in video:** frames ${scene.naturalCutPoints.join(', ')} (relative to scene start)\n`;
    }

    prompt += '\n';
  }

  // Phase 1D: Add anchor timeline to prompt
  if (context.anchors && context.anchors.length > 0) {
    prompt += `## ANCHOR POINTS (ranked edit decision moments)\n\n`;
    prompt += `These are the moments where edit decisions SHOULD be placed, ranked by confidence.\n`;
    prompt += `COMPOUND anchors (multiple sources converging) are the MOST important moments — use maximum emphasis.\n`;
    prompt += `Place decisions AT these frames. Do NOT place decisions at frames not listed here unless you have strong justification.\n\n`;

    // Show top anchors (cap at 30 to keep prompt manageable)
    const topAnchors = context.anchors
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 30);

    for (const anchor of topAnchors.sort((a, b) => a.frame - b.frame)) {
      const sec = (anchor.timestampMs / 1000).toFixed(1);
      const compound = anchor.isCompound ? ' ★COMPOUND★' : '';
      prompt += `- Frame ${anchor.frame} (${sec}s): ${anchor.description} [confidence: ${anchor.confidence.toFixed(2)}] [suggested: ${anchor.suggestedDecisions.join(', ')}]${compound}\n`;
    }
    prompt += '\n';
  }

  prompt += `## AVAILABLE DECISION TYPES (use these — the executor handles all of them):

### TRANSITIONS (type: 'transition')
- transitionType options: 'dissolve', 'dip-to-black', 'dip-to-white', 'wipe-left', 'wipe-right',
  'zoom-punch', 'slide-up', 'slide-down', 'blur-transition', 'flash', 'hard-cut'
- Use dissolve for mood shifts, dip-to-black for scene breaks, zoom-punch for energy spikes
- durationFrames: 15-30 typical (0.5-1s)

### ZOOMS (type: 'zoom')
- PUNCH ZOOM: scaleTo 1.10-1.20, duration 10-15 frames, for emphasis moments. Set zoomType: 'punch-in'
- SLOW PUSH: scaleTo 1.05-1.08, duration = full scene, for emotional beats. Set zoomType: 'slow-push'
- PULL BACK: scaleTo 0.85-0.95, duration 30-60 frames, for reveals. Set zoomType: 'pull-back'
- CRITICAL: zoom frame MUST correspond to a naturalCutPoint, motionPeak, or voiceover emphasis word listed in the scene's data. Do NOT place zooms at arbitrary frames.
- Do NOT zoom on EVERY scene. Only zoom where the content demands it. Static scenes get drift-zoom automatically by post-processing — you do NOT need to add it.
- Always pair zoomScale with a reason tied to voiceover or visual content

### SPEED CHANGES (type: 'speed-change')
- SLOW-MO: speedMultiplier 0.3-0.5, duration 30-60 frames, for dramatic moments
- SPEED RAMP: speedMultiplier 1.5-2.0, duration 20-40 frames, for energy/montage
- Use at transitions between calm→intense or after beat drops

### CAMERA SHAKE (type: 'camera-shake')
- For emphasis, impact moments, bass drops
- Subtle: intensity 0.1-0.3, 10-15 frames
- Aggressive: intensity 0.5-0.8, 5-10 frames (Hormozi/Iman style)
- ALWAYS pair with a voiceover emphasis word or visual impact

### GRAPHICS (type: 'graphic')
- KEYWORD TEXT: graphicType 'keyword-highlight', graphicText = the emphasized word/phrase.
  Appears as bold animated text on screen synced to voiceover. Hormozi-style kinetic typography.
- STAT COUNTER: graphicType 'stat-counter', graphicText = number + label (e.g., "50% OFF").
  Animated counting number. Use when narration mentions statistics or numbers.
- LOWER THIRD: graphicType 'lower-third', graphicText = name/title.
  For speaker introductions or location labels.
- LOGO REVEAL: graphicType 'logo-reveal', graphicText = brand name.
  Animated brand reveal for final scenes.
- DO NOT use graphicType 'callout' — it creates ugly text boxes. Use keyword-highlight instead.

### SFX TRIGGERS (type: 'sfx-trigger')
- Triggers a sound effect at the exact frame
- Use for: whoosh on transitions, pop on text appearance, ding on emphasis, ambient enhancement
- The system will search for appropriate SFX based on the reason text

### CAPTION EMPHASIS (type: 'caption-emphasis')
- Highlights a specific word in the voiceover captions with bold/color/animation
- Use on: key emotional words, brand names, action verbs, statistics
- Creates Hormozi-style keyword highlighting in the subtitle text

### FILTER CHANGES (type: 'filter-change')
- Apply visual filter at a specific frame (brightness, saturation, contrast, blur)
- Use for: mood transitions (warm→cool), memory→present shifts, dramatic moments

### CUTS (type: 'cut')
- Scene boundary marker — informational only, no visual overlay created
- Use to mark hard cuts between scenes

## EDITING APPROACH:
- Identify the DECISIVE MOMENT in each scene first, then build all decisions around it
- 60-70% of transitions should be hard-cuts (Rule T-001). Dissolves/flashy transitions are RARE.
- Every zoom-punch MUST be synced to a voiceover emphasis word or visual impact (Rule Z-010)
- Keyword-highlight graphics on power words only: numbers, brand names, emotional triggers (Rule G-001)
- Slow push (1.03x-1.06x) is the DEFAULT camera move for any static scene (Rule Z-001)
- EVERY static image/storyboard scene MUST get drift-zoom (Rule Z-030)
- Contrast is king: after a "loud" decision, the next MUST be "quiet" (Section 1.4)

## OUTPUT RULES:
1. Use ABSOLUTE frame numbers (relative to full timeline start, not scene start).
2. Every decision MUST cite which Knowledge Base rule applies (e.g., "Rule Z-010: punch-in on emphasis word").
3. Don't create decisions at frame 0 or the last frame.
4. Respect ALL hard budgets listed above — the executor WILL reject decisions that exceed them.
5. confidence > 0.8 when multiple Murch criteria agree, 0.5-0.7 for single-source.
6. Generate ${(() => {
    // Content-length-aware decision density. Previously hardcoded 0.6-1.0
    // per second regardless of length — over-edited long-form (a 5-min
    // tutorial would request 180-300 decisions) and under-served the
    // differences between short-form punch and sustained long-form breathing.
    //
    // Per creative_production_knowledge.md §5 Pacing by Content Type:
    //   - Short-form social (Hormozi/TikTok/Reels): 15-25 cuts/min → 0.6-0.8/s
    //   - Brand ad (energy):                         12-20 cuts/min → 0.4-0.6/s
    //   - Brand ad (nostalgia/documentary):           6-10 cuts/min → 0.15-0.25/s
    //   - Tutorial / explainer:                       4-8  cuts/min → 0.1-0.2/s
    // We generalize by total-duration proxy (shorter content tends toward
    // more decisive social pacing; longer tends toward sustained).
    // Tier 18N: deterministic per totalSec — same input yields same range.
    let lowRate: number;
    let highRate: number;
    if (totalSec <= 15) {           // Short-form social / hook content
      lowRate = 0.6; highRate = 1.0;
    } else if (totalSec <= 30) {    // Brand ad short-cut
      lowRate = 0.5; highRate = 0.8;
    } else if (totalSec <= 60) {    // Standard brand ad
      lowRate = 0.35; highRate = 0.6;
    } else if (totalSec <= 180) {   // Long brand film / documentary short
      lowRate = 0.2; highRate = 0.4;
    } else {                        // Tutorial / long-form (>3 min)
      lowRate = 0.12; highRate = 0.25;
    }
    const low = Math.max(3, Math.round(totalSec * lowRate));
    const high = Math.max(low + 2, Math.round(totalSec * highRate));
    return `${low}-${high}`;
  })()} decisions for this ${totalSec}s video (density auto-scaled to content length — denser for short-form social, sparser for sustained long-form per creative doc §5).
7. First scene: establish visual interest early. For short-form social (TikTok/Reels/Shorts): hook within 2-3s. For long-form/tutorial/documentary: can take 5-10s for context. Adapt to the content, don't force a 1s hook on a lecture (Rule P-002).
8. Last scene: logo-reveal graphic, pull-back zoom, resolving transition (Rule Z-021, G-020).`;

  return prompt;
}
