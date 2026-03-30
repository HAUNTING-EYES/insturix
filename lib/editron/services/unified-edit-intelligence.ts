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

// ─── Types ───────────────────────────────────────────────────────

export interface UnifiedContext {
  projectId: string;
  fps: number;
  totalFrames: number;
  totalDurationMs: number;

  // Per-scene merged context (script + video + audio)
  scenes: SceneContext[];

  // Global context
  globalEditDirections?: any;
  overallMusicPrompt?: string;
  colorPalette?: string[];
  environmentNotes?: string;
  editProfileName?: string;
}

export interface SceneContext {
  sceneIndex: number;
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
    .filter((o: any) => o.type === 'sound' && ((o.assetId || '').startsWith('voiceover_') || o.row === 3));

  // Build per-scene context
  const scenes: SceneContext[] = [];

  for (let i = 0; i < videoOverlays.length; i++) {
    const vo = videoOverlays[i];
    const sbScene = storyboardScenes[i];
    const descriptor = sbScene?.descriptor || {};

    // Get 5-Track analysis
    let analysis: AssetAnalysis | null = null;
    if (vo.assetId) {
      analysis = await getAnalysis(vo.assetId);
    }

    // Get voiceover transcription
    let voWords: Array<{ word: string; startMs: number; endMs: number }> = [];
    const matchingVo = voiceoverOverlays.find((v: any) =>
      v.from >= vo.from - 15 && v.from <= vo.from + vo.durationInFrames
    );
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

    // Extract motion info
    const motionSeg = analysis?.motionSegments?.[0];
    const motionType = motionSeg?.cameraMotion || 'static';
    const motionIntensity = motionSeg?.motionIntensity || 0.1;

    // Extract keyframe descriptions
    const kfDescs = (analysis?.keyframeAnalyses || []).map((kf: any) =>
      kf.description || `Frame ${kf.frame}: ${kf.shotType || 'unknown'} shot`
    );

    // Natural cut points (relative to scene start)
    const cuts = (analysis?.naturalCutPoints || []).filter((c: number) => c > 5 && c < (vo.durationInFrames - 5));

    scenes.push({
      sceneIndex: i,
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
      cameraDirection: descriptor.cameraDirection,
      detectedSubjects: subjects,
      motionType,
      motionIntensity,
      keyframeDescriptions: kfDescs,
      naturalCutPoints: cuts,
      voiceoverWords: voWords,
    });
  }

  return {
    projectId,
    fps,
    totalFrames,
    totalDurationMs: (totalFrames / fps) * 1000,
    scenes,
    globalEditDirections,
    overallMusicPrompt,
    colorPalette,
    environmentNotes,
  };
}

// ─── Gemini Intelligence Call ─────────────────────────────────────

const EditDecisionSchema = z.object({
  type: z.enum(['cut', 'transition', 'zoom', 'speed-change', 'graphic', 'sfx-trigger', 'filter-change', 'caption-emphasis', 'camera-shake']),
  frame: z.number().describe('Absolute timeline frame for this decision'),
  durationFrames: z.number().optional().describe('Duration in frames (for transitions, graphics, zooms)'),
  reason: z.string().describe('Human-readable reason combining all context sources. Example: "Zoom punch at 2.1s — voiceover emphasis on \'anticipation\' + motion peak + BGM beat"'),
  transitionType: z.string().optional().describe('For type=transition: dissolve, dip-to-black, wipe-left, zoom-punch, hard-cut, etc.'),
  graphicType: z.string().optional().describe('For type=graphic: callout, stat-counter, lower-third, logo-reveal, emphasis-text'),
  graphicText: z.string().optional().describe('Text content for the graphic'),
  zoomScale: z.number().optional().describe('For type=zoom: target scale (1.0 = normal, 1.15 = 15% zoom in)'),
  speedMultiplier: z.number().optional().describe('For type=speed-change: 0.5 = slow-mo, 1.5 = speed up'),
  confidence: z.number().min(0).max(1).describe('How confident this decision is (0-1). Higher when multiple sources agree.'),
  sources: z.array(z.string()).describe('Which context sources informed this: "script", "video-analysis", "voiceover", "bgm", "subjects"'),
});

const EditPlanSchema = z.object({
  decisions: z.array(EditDecisionSchema).describe('All edit decisions for the project, ordered by frame'),
});

/**
 * Generate a complete edit plan from unified project context.
 * ONE Gemini call that sees everything — script, video analysis, audio, storyboard.
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

  const model = google('gemini-2.5-flash', { structuredOutputs: true });

  const { object } = await generateObject({
    model,
    schema: EditPlanSchema,
    prompt: contextSummary,
    temperature: 0.3,
  });

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

// ─── Prompt Builder ──────────────────────────────────────────────

function buildContextSummary(
  context: UnifiedContext,
  options: { targetCutsPerMinute?: number; graphicDensity?: string; style?: string },
): string {
  const fps = context.fps;
  const totalSec = Math.round(context.totalDurationMs / 1000);

  let prompt = `You are an expert video editor. Analyze this project and produce SPECIFIC, ACTIONABLE edit decisions.

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

  prompt += `\n## SCENES (with ALL available context):\n\n`;

  for (const scene of context.scenes) {
    const startSec = (scene.fromFrame / fps).toFixed(1);
    const endSec = ((scene.fromFrame + scene.durationFrames) / fps).toFixed(1);

    prompt += `### Scene ${scene.sceneIndex + 1}: "${scene.title}" [${startSec}s - ${endSec}s] (frames ${scene.fromFrame}-${scene.fromFrame + scene.durationFrames})\n`;
    prompt += `- **Narration:** "${scene.narration}"\n`;
    prompt += `- **Mood:** ${scene.mood}\n`;
    prompt += `- **Visual:** ${scene.visualDescription.substring(0, 150)}\n`;
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
      prompt += `- **Motion graphic:** ${scene.motionGraphicCue}\n`;
    }

    // Detected subjects
    if (scene.detectedSubjects.length > 0) {
      const subjectList = scene.detectedSubjects.map(s => `${s.label} (${s.category}, ${Math.round(s.confidence * 100)}%)`).join(', ');
      prompt += `- **Detected in video:** ${subjectList}\n`;
    }

    // Keyframe descriptions (what Gemini Vision saw)
    if (scene.keyframeDescriptions.length > 0) {
      prompt += `- **Video content:** ${scene.keyframeDescriptions[0].substring(0, 120)}\n`;
    }

    // Voiceover word timing
    if (scene.voiceoverWords.length > 0) {
      const wordTimeline = scene.voiceoverWords.map(w =>
        `"${w.word}" @${(w.startMs / 1000).toFixed(1)}s`
      ).join(', ');
      prompt += `- **Voiceover timing:** ${wordTimeline}\n`;
    }

    // Natural cut points
    if (scene.naturalCutPoints.length > 0) {
      prompt += `- **Natural cut points in video:** frames ${scene.naturalCutPoints.join(', ')} (relative to scene start)\n`;
    }

    prompt += '\n';
  }

  prompt += `## RULES:
1. Use ABSOLUTE frame numbers (relative to full timeline start, not scene start).
2. Every decision MUST reference specific context: "zoom at frame 45 because voiceover emphasis on 'anticipation' coincides with subject motion peak"
3. Don't create decisions at frame 0 or the last frame — those are clip boundaries.
4. For transitions between scenes: use the script's transition type if specified, otherwise choose based on mood shift.
5. Products/brands detected in video → callout graphic with bounding box position.
6. Statistics or numbers in narration → stat-counter graphic.
7. Emphasis words in voiceover → zoom punch or caption-emphasis.
8. If the script says "Quick cuts" → place cuts at every subject change or voiceover phrase boundary.
9. Target: ${options.targetCutsPerMinute || 6} cuts per minute, ${options.graphicDensity || 'moderate'} graphic density.
10. confidence > 0.8 when multiple sources agree, 0.5-0.7 for single-source decisions.

Generate 15-30 decisions for this ${totalSec}s video.`;

  return prompt;
}
