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

const EditDecisionSchema = z.object({
  type: z.enum(['cut', 'transition', 'zoom', 'speed-change', 'graphic', 'sfx-trigger', 'filter-change', 'caption-emphasis', 'camera-shake']),
  frame: z.number().describe('Absolute timeline frame for this decision'),
  durationFrames: z.number().optional().describe('Duration in frames (for transitions, graphics, zooms)'),
  reason: z.string().describe('Human-readable reason combining all context sources. Example: "Zoom punch at 2.1s — voiceover emphasis on \'anticipation\' + motion peak + BGM beat"'),
  transitionType: z.string().optional().describe('For type=transition: dissolve, dip-to-black, wipe-left, zoom-punch, hard-cut, etc.'),
  graphicType: z.string().optional().describe('For type=graphic: callout, stat-counter, lower-third, logo-reveal, emphasis-text'),
  graphicText: z.string().optional().describe('Text content for the graphic'),
  zoomScale: z.number().optional().describe('For type=zoom: target scale (1.0 = normal, 1.15 = 15% zoom in)'),
  zoomType: z.enum(['punch-in', 'slow-push', 'pull-back']).optional().describe('For type=zoom: punch-in (quick zoom + hold), slow-push (gradual over scene), pull-back (zoom out)'),
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

  const model = google('gemini-2.5-flash');

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

// ─── Prompt Builder ──────────────────────────────────────────────

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

  // ─── Part 9: SFX Pairing Rules ────────────────────────────────
  prompt += `\n## SFX PAIRING RULES:
- A-002: Zoom-punch and flash transitions MUST have impact-hit SFX (bass thud)
- A-010: Before major reveals, add a riser SFX (1.5-2.0s ascending tone)
- A-020: Graphic entrances get a subtle pop/notification SFX
- A-021: Stat-counter completion gets a click SFX when landing on final number
- A-032: Dramatic pause in voiceover → silence-beat (drop ALL audio for 0.5-0.8s)\n`;

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
6. Generate ${Math.round(totalSec * 0.6)}-${Math.round(totalSec * 1.0)} decisions for this ${totalSec}s video.
7. First scene: establish visual interest early. For short-form social (TikTok/Reels/Shorts): hook within 2-3s. For long-form/tutorial/documentary: can take 5-10s for context. Adapt to the content, don't force a 1s hook on a lecture (Rule P-002).
8. Last scene: logo-reveal graphic, pull-back zoom, resolving transition (Rule Z-021, G-020).`;

  return prompt;
}
