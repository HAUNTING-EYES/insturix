/**
 * Reactive Edit Engine
 *
 * Reads all 5 analysis layers + Track A + Track C simultaneously
 * and generates an Edit Decision List (EDL) — a complete ordered
 * sequence of every edit action with frame-accurate timing.
 *
 * From brainstorm architecture:
 * "For each frame across all tracks:
 *   → Collect all signals at this timestamp
 *   → Score each signal
 *   → Apply priority rules
 *   → Generate EditDecision"
 *
 * Priority hierarchy:
 * HIGHEST: Music drop → hard cut (F1 mode)
 *          Explicit script direction → whatever it says
 * HIGH:    Speech statistic → graphic appears
 *          Motion peak → cut point
 *          Beat + motion peak coincidence → zoom punch
 * MEDIUM:  B-roll suggestion → cutaway
 *          Keyword highlight → caption emphasis
 * LOW:     Aesthetic improvement → filter adjustment
 *          Pacing normalization → duration adjustment
 */

import type {
  AssetAnalysis,
  SpeechSegment,
  MusicStructure,
  MusicSection,
  MotionSegment,
  FrameAnalysis,
  SubjectTrackEntry,
} from './five-track-analysis';

// ─── Types ───────────────────────────────────────────────────────

export type EditDecisionType =
  | 'cut' | 'transition' | 'zoom' | 'pan' | 'graphic'
  | 'sfx' | 'speed-change' | 'filter-change' | 'caption-emphasis'
  | 'audio-duck' | 'fade' | 'slow-motion' | 'filter' | 'pacing';

export interface EditDecision {
  type: EditDecisionType;
  frame: number;
  durationFrames?: number;
  priority: number;         // 1=highest, 5=lowest
  source: string;           // Which track generated this
  signal: string;           // What triggered it (e.g., 'drop_hit', 'statistic_detected')
  reason: string;           // Human-readable
  params: Record<string, any>;
  confidence: number;       // 0-1
}

export interface EditDecisionList {
  projectId: string;
  generatedAt: Date;
  totalDecisions: number;
  decisions: EditDecision[];
  stats: {
    cutsPerMinute: number;
    transitionCount: number;
    graphicCount: number;
    zoomCount: number;
    speedChangeCount: number;
    averageConfidence: number;
  };
}

// ─── Engine ──────────────────────────────────────────────────────

const FPS = 30;
const msToFrame = (ms: number) => Math.round((ms / 1000) * FPS);

export function generateEditDecisionList(
  analyses: AssetAnalysis[],
  projectDurationMs: number,
  options: {
    mode?: 'iman-gadzhi' | 'f1-cinematic' | 'documentary' | 'balanced';
    targetCutsPerMinute?: number;
    transitionStyle?: string;
    graphicDensity?: 'minimal' | 'moderate' | 'heavy';
    pacing?: 'slow' | 'medium' | 'fast';
  } = {},
): EditDecisionList {
  const {
    mode = 'balanced',
    graphicDensity = 'moderate',
    pacing = 'medium',
  } = options;

  const decisions: EditDecision[] = [];

  for (const analysis of analyses) {
    // Timeline offset: each analysis reports frames relative to clip start (0-N).
    // We need to shift all decisions to absolute timeline frames.
    // Without this, all 7 scenes produce decisions at frames 0-150 and get deduplicated.
    const offsetFrames = (analysis as any)._timelineOffsetFrames || 0;

    const offsetDecisions = (decs: EditDecision[]): EditDecision[] =>
      decs.map(d => ({ ...d, frame: d.frame + offsetFrames }));

    // ─── Track A: Speech-driven (narration-reactive) ───────────
    if (analysis.speechSegments.length > 0) {
      decisions.push(...offsetDecisions(generateSpeechDecisions(analysis.speechSegments, graphicDensity)));
    }

    // ─── Track C: Music-driven (rhythm-reactive) ───────────────
    if (analysis.musicStructure) {
      decisions.push(...offsetDecisions(generateMusicDecisions(analysis.musicStructure, mode, pacing)));
    }

    // ─── Layer 2: Motion-driven ────────────────────────────────
    if (analysis.motionSegments.length > 0) {
      decisions.push(...offsetDecisions(generateMotionDecisions(analysis.motionSegments, analysis.motionPeaks)));
    }

    // ─── Layer 5: Subject-driven ───────────────────────────────
    if (analysis.subjectTracks.length > 0) {
      decisions.push(...offsetDecisions(generateSubjectDecisions(analysis.subjectTracks, graphicDensity)));
    }

    // ─── Layer 4: Visual-driven ────────────────────────────────
    if (analysis.keyframeAnalyses.length > 0) {
      decisions.push(...offsetDecisions(generateVisualDecisions(analysis.keyframeAnalyses)));
    }

    // ─── Layer 3: Audio sync points ────────────────────────────
    if (analysis.audio) {
      decisions.push(...offsetDecisions(generateAudioSyncDecisions(analysis.audio.transients, analysis.audio.beats)));
    }

    // ─── Cinematic moments (multi-track peaks) ─────────────────
    decisions.push(...offsetDecisions(detectCinematicMoments(analysis)));

    // ─── Script edit directions (HIGHEST priority — explicit intent) ───
    // These come from ThinkForge script via storyboard enrichment.
    // Script directions always override analysis-derived decisions.
    if (analysis.speechSegments.length > 0) {
      for (const seg of analysis.speechSegments) {
        const ed = (seg as any).scriptEditDirections;
        if (!ed) continue;

        // Transition from script: "DISSOLVE TO", "CUT TO", "FADE TO BLACK"
        if (ed.transition) {
          decisions.push({
            frame: seg.endFrame,
            type: 'transition',
            trigger: { track: 'speech', signal: 'script_transition', confidence: 1.0 },
            action: { tool: 'add_transition', params: { type: ed.transition.type, durationMs: ed.transition.durationMs || 500, afterOverlayId: undefined } },
            priority: 100, // HIGHEST — script intent overrides everything
            confidence: 1.0,
          });
        }

        // Camera movement from script: "SLOW PUSH IN", "DOLLY", "WHIP PAN"
        if (ed.cameraRig) {
          const camLower = ed.cameraRig.toLowerCase();
          const isZoom = camLower.includes('push in') || camLower.includes('zoom in') || camLower.includes('pull out') || camLower.includes('zoom out');
          if (isZoom) {
            const zoomIn = camLower.includes('push in') || camLower.includes('zoom in');
            decisions.push({
              frame: seg.startFrame,
              type: 'zoom',
              trigger: { track: 'speech', signal: 'script_camera', confidence: 0.95 },
              action: {
                tool: 'set_keyframes',
                params: {
                  property: 'scale',
                  keyframes: [
                    { frame: 0, value: zoomIn ? 1.0 : 1.08, easing: 'ease-in-out' },
                    { frame: seg.endFrame - seg.startFrame, value: zoomIn ? 1.08 : 1.0, easing: 'ease-in-out' },
                  ],
                },
              },
              priority: 90,
              confidence: 0.95,
            });
          }
        }

        // Filter from script: "cool sophisticated palette", "warm cinematic"
        if (ed.filterPresetId) {
          decisions.push({
            frame: seg.startFrame,
            type: 'filter',
            trigger: { track: 'speech', signal: 'script_filter', confidence: 1.0 },
            action: { tool: 'apply_filter', params: { filterPresetId: ed.filterPresetId } },
            priority: 85,
            confidence: 1.0,
          });
        }

        // Pacing from script: "quick cuts", "slow reveal", "building"
        if (ed.pacing) {
          decisions.push({
            frame: seg.startFrame,
            type: 'pacing',
            trigger: { track: 'speech', signal: 'script_pacing', confidence: 0.9 },
            action: { tool: 'adjust_pacing', params: { pacing: ed.pacing } },
            priority: 80,
            confidence: 0.9,
          });
        }
      }
    }
  }

  // Sort by frame, then priority
  decisions.sort((a, b) => a.frame - b.frame || a.priority - b.priority);

  // Deduplicate conflicting decisions
  const deduped = deduplicateDecisions(decisions);

  const totalMinutes = projectDurationMs / 60000;

  return {
    projectId: '',
    generatedAt: new Date(),
    totalDecisions: deduped.length,
    decisions: deduped,
    stats: {
      cutsPerMinute: totalMinutes > 0 ? deduped.filter(d => d.type === 'cut').length / totalMinutes : 0,
      transitionCount: deduped.filter(d => d.type === 'transition').length,
      graphicCount: deduped.filter(d => d.type === 'graphic').length,
      zoomCount: deduped.filter(d => d.type === 'zoom').length,
      speedChangeCount: deduped.filter(d => d.type === 'speed-change' || d.type === 'slow-motion').length,
      averageConfidence: deduped.length > 0
        ? deduped.reduce((sum, d) => sum + d.confidence, 0) / deduped.length
        : 0,
    },
  };
}

// ─── Track-Specific Generators ───────────────────────────────────

function generateSpeechDecisions(
  segments: SpeechSegment[],
  density: string,
): EditDecision[] {
  const decisions: EditDecision[] = [];

  for (const seg of segments) {
    // Skip neutral segments for graphics
    if (seg.contentType === 'neutral' || seg.contentType === 'transition_phrase') continue;

    // Only add graphics for confident classifications
    if (seg.confidence < 0.6) continue;
    if (density === 'minimal' && seg.contentType !== 'statistic' && seg.contentType !== 'cta') continue;

    // Insert graphic at segment start
    if (seg.suggestedGraphicType && seg.suggestedGraphicType !== 'none') {
      decisions.push({
        type: 'graphic',
        frame: seg.startFrame,
        durationFrames: Math.round((seg.endMs - seg.startMs) / 1000 * FPS),
        priority: 2,
        source: 'speech-semantic',
        signal: `${seg.contentType}_detected`,
        reason: `${seg.contentType}: "${seg.text.substring(0, 50)}"`,
        params: {
          graphicType: seg.suggestedGraphicType,
          graphicData: seg.suggestedGraphicData,
          text: seg.text,
          contentType: seg.contentType,
        },
        confidence: seg.confidence,
      });
    }

    // Caption emphasis for keywords
    for (const kw of seg.keywordHighlights || []) {
      if (kw.importance !== 'normal') {
        decisions.push({
          type: 'caption-emphasis',
          frame: msToFrame(kw.startMs),
          durationFrames: msToFrame((kw.endMs || kw.startMs + 500) - kw.startMs),
          priority: 3,
          source: 'speech-semantic',
          signal: `keyword_${kw.importance}`,
          reason: `"${kw.word}" is a ${kw.importance} keyword`,
          params: { word: kw.word, importance: kw.importance },
          confidence: 0.8,
        });
      }
    }

    // Transition phrases = cut/transition opportunity
    if (seg.contentType === 'transition_phrase') {
      decisions.push({
        type: 'transition',
        frame: seg.startFrame,
        durationFrames: 15,
        priority: 2,
        source: 'speech-semantic',
        signal: 'topic_transition',
        reason: `Topic transition: "${seg.text.substring(0, 40)}"`,
        params: { transitionType: 'soft-cut' },
        confidence: 0.75,
      });
    }
  }

  return decisions;
}

function generateMusicDecisions(
  music: MusicStructure,
  mode: string,
  pacing: string,
): EditDecision[] {
  const decisions: EditDecision[] = [];

  // Drops = maximum impact edits
  for (const drop of music.drops) {
    decisions.push({
      type: mode === 'f1-cinematic' ? 'zoom' : 'transition',
      frame: drop,
      durationFrames: 8,
      priority: 1, // HIGHEST — music drop trumps everything
      source: 'music-structure',
      signal: 'drop_hit',
      reason: 'Music drop — maximum impact',
      params: mode === 'f1-cinematic'
        ? { scaleFrom: 1.0, scaleTo: 1.15 }
        : { transitionType: 'zoom-punch' },
      confidence: 0.9,
    });
  }

  // Builds = accelerating cuts
  for (const build of music.builds) {
    decisions.push({
      type: 'speed-change',
      frame: build,
      durationFrames: 60, // 2s of build
      priority: 2,
      source: 'music-structure',
      signal: 'build_start',
      reason: 'Music building — accelerate pacing',
      params: { speedFrom: 1.0, speedTo: 1.5, speedBack: 1.0 },
      confidence: 0.7,
    });
  }

  // Breakdowns = slow, held shots
  for (const breakdown of music.breakdowns) {
    if (mode === 'f1-cinematic') {
      decisions.push({
        type: 'slow-motion',
        frame: breakdown,
        durationFrames: 90, // 3s slow-mo
        priority: 2,
        source: 'music-structure',
        signal: 'breakdown',
        reason: 'Music breakdown — slow-motion reveal',
        params: { speed: 0.3 },
        confidence: 0.75,
      });
    }
  }

  // Section transitions = transition overlays
  for (let i = 1; i < music.sections.length; i++) {
    const section = music.sections[i];
    decisions.push({
      type: 'transition',
      frame: section.startFrame,
      durationFrames: section.type === 'drop' ? 6 : 15,
      priority: 2,
      source: 'music-structure',
      signal: `section_${section.type}`,
      reason: `Music → ${section.type} (${section.prescribedTransition})`,
      params: { transitionType: section.prescribedTransition },
      confidence: 0.8,
    });
  }

  // Stingers = SFX sync points
  for (const stinger of music.stingers.slice(0, 10)) {
    decisions.push({
      type: 'sfx',
      frame: stinger,
      priority: 3,
      source: 'music-structure',
      signal: 'stinger',
      reason: 'Musical accent — SFX sync point',
      params: { sfxType: 'impact' },
      confidence: 0.6,
    });
  }

  return decisions;
}

function generateMotionDecisions(
  segments: MotionSegment[],
  peaks: number[],
): EditDecision[] {
  const decisions: EditDecision[] = [];

  // Filter peaks: skip first and last frames (clip boundaries, not meaningful cuts)
  // and only use peaks with enough separation (>30 frames = 1s apart)
  const filteredPeaks = peaks.filter((peak, i) => {
    if (peak <= 5 || peak >= (segments[segments.length - 1]?.endFrame || 150) - 5) return false; // Skip clip boundaries
    if (i > 0 && peak - peaks[i - 1] < 30) return false; // Skip if too close to previous peak
    return true;
  });

  // Only the top 2-3 motion peaks per clip are meaningful (not every minor peak)
  const topPeaks = filteredPeaks.slice(0, 3);

  for (const peak of topPeaks) {
    decisions.push({
      type: 'cut',
      frame: peak,
      priority: 3,
      source: 'motion',
      signal: 'motion_peak',
      reason: `Motion intensity peak at ${(peak / 30).toFixed(1)}s — potential cut point`,
      params: {},
      confidence: 0.75,
    });
  }

  // Camera motion transitions = rich editing decisions
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];

    // Static → dynamic = zoom punch opportunity
    if (prev.cameraMotion === 'static' && curr.motionIntensity > 0.5) {
      decisions.push({
        type: 'zoom',
        frame: curr.startFrame,
        durationFrames: 15,
        priority: 3,
        source: 'motion',
        signal: 'motion_onset',
        reason: `Camera: static → ${curr.cameraMotion} (${Math.round(curr.motionIntensity * 100)}% intensity) — zoom punch`,
        params: { scaleFrom: 1.0, scaleTo: 1.05 + curr.motionIntensity * 0.1 },
        confidence: curr.motionIntensity,
      });
    }

    // High → low intensity = slow-motion opportunity
    if (prev.motionIntensity > 0.7 && curr.motionIntensity < 0.3) {
      decisions.push({
        type: 'speed-change',
        frame: curr.startFrame,
        durationFrames: 30,
        priority: 4,
        source: 'motion',
        signal: 'intensity_drop',
        reason: `Motion drops from ${Math.round(prev.motionIntensity * 100)}% → ${Math.round(curr.motionIntensity * 100)}% — slow-mo candidate`,
        params: { speedFrom: 1.0, speedTo: 0.5 },
        confidence: 0.6,
      });
    }

    // Pan/dolly = transition suggestion (dissolve or wipe in motion direction)
    if (curr.cameraMotion && !['static', 'handheld'].includes(curr.cameraMotion)) {
      const isHorizontal = ['pan', 'truck', 'dolly'].some(m => curr.cameraMotion.includes(m));
      if (isHorizontal && curr.motionIntensity > 0.4) {
        decisions.push({
          type: 'transition',
          frame: curr.startFrame,
          durationFrames: 15,
          priority: 4,
          source: 'motion',
          signal: 'camera_movement',
          reason: `${curr.cameraMotion} motion — use motion-matched transition`,
          params: { transitionType: 'wipe-left' },
          confidence: 0.5,
        });
      }
    }
  }

  return decisions;
}

function generateSubjectDecisions(
  subjects: SubjectTrackEntry[],
  density: string,
): EditDecision[] {
  const decisions: EditDecision[] = [];
  if (density === 'minimal') return decisions;

  // Subject tracks can be in two formats:
  // 1. Grouped: { subjectId, category, frames: [{ frame, box, confidence }] }
  // 2. Flat: { frame, subjectId, label, boundingBox, confidence, category? }
  // Handle both by normalizing to a common structure.

  // Group flat entries by subjectId
  const groupedSubjects = new Map<string, { label: string; category: string; entries: Array<{ frame: number; box: any; confidence: number }> }>();

  for (const subject of subjects) {
    const sid = (subject as any).subjectId || subject.label || 'unknown';
    const isFlat = typeof (subject as any).frame === 'number' && !(subject as any).frames;

    if (isFlat) {
      // Flat format — group by subjectId
      if (!groupedSubjects.has(sid)) {
        // Infer category from label
        const label = ((subject as any).label || '').toLowerCase();
        let category = (subject as any).category || 'unknown';
        if (!category || category === 'unknown') {
          if (label.includes('logo') || label.includes('brand') || label.includes('arches')) category = 'logo';
          else if (label.includes('product') || label.includes('meal') || label.includes('fry') || label.includes('burger') || label.includes('drink')) category = 'product';
          else if (label.includes('person') || label.includes('man') || label.includes('woman') || label.includes('child') || label.includes('family')) category = 'person';
        }
        groupedSubjects.set(sid, { label: (subject as any).label || sid, category, entries: [] });
      }
      groupedSubjects.get(sid)!.entries.push({
        frame: (subject as any).frame,
        box: (subject as any).boundingBox,
        confidence: (subject as any).confidence || 0.5,
      });
    } else if ((subject as any).frames?.length > 0) {
      // Grouped format — use directly
      const frames = (subject as any).frames;
      groupedSubjects.set(sid, {
        label: subject.label || sid,
        category: (subject as any).category || 'unknown',
        entries: frames.map((f: any) => ({ frame: f.frame, box: f.box || f.boundingBox, confidence: f.confidence || 0.5 })),
      });
    }
  }

  for (const [sid, group] of groupedSubjects) {
    if (group.entries.length === 0) continue;
    const firstEntry = group.entries[0];

    // Products/logos = callout
    if (group.category === 'product' || group.category === 'logo') {
      decisions.push({
        type: 'graphic',
        frame: firstEntry.frame + 15,
        durationFrames: 90,
        priority: 4,
        source: 'subjects',
        signal: `${group.category}_detected`,
        reason: `${group.category}: "${group.label}"`,
        params: {
          graphicType: group.category === 'logo' ? 'logo-reveal' : 'callout',
          text: group.label,
          position: firstEntry.box,
        },
        confidence: firstEntry.confidence,
      });
    }

    // People = lower third (heavy density only)
    if (group.category === 'person' && density === 'heavy') {
      decisions.push({
        type: 'graphic',
        frame: firstEntry.frame + 30,
        durationFrames: 120,
        priority: 4,
        source: 'subjects',
        signal: 'person_detected',
        reason: `Person: "${group.label}"`,
        params: { graphicType: 'lower-third', text: group.label },
        confidence: firstEntry.confidence * 0.8,
      });
    }
  }

  return decisions;
}

function generateVisualDecisions(keyframes: FrameAnalysis[]): EditDecision[] {
  const decisions: EditDecision[] = [];

  // Only use natural cut points that have a specific reason (not generic)
  // and are not at clip boundaries (frame 0 or last frame)
  const lastFrame = keyframes.length > 0 ? Math.max(...keyframes.map(k => k.frame)) : 150;
  for (const kf of keyframes) {
    if (kf.naturalCutPoint && kf.frame > 5 && kf.frame < lastFrame - 5) {
      decisions.push({
        type: 'cut',
        frame: kf.frame,
        priority: 5,
        source: 'visual',
        signal: 'natural_cut',
        reason: kf.naturalCutReason || `Visual change at ${(kf.frame / 30).toFixed(1)}s`,
        params: {},
        confidence: 0.6,
      });
    }

    // Rich keyframe data: use mood/energy for pacing suggestions
    if (kf.moodScore !== undefined && kf.energyLevel !== undefined) {
      // High energy + high mood = fast pacing section
      if (kf.energyLevel > 0.7 && kf.moodScore > 0.6) {
        decisions.push({
          type: 'pacing',
          frame: kf.frame,
          priority: 5,
          source: 'visual',
          signal: 'high_energy',
          reason: `High energy moment (${Math.round(kf.energyLevel * 100)}%) — accelerate pacing`,
          params: { pacingMultiplier: 0.85 },
          confidence: kf.energyLevel,
        });
      }
    }
  }

  // Composition changes = zoom opportunities
  for (let i = 1; i < keyframes.length; i++) {
    const prev = keyframes[i - 1];
    const curr = keyframes[i];
    if (prev.shotType !== curr.shotType) {
      if (curr.shotType === 'close-up' && (prev.shotType === 'wide' || prev.shotType === 'medium')) {
        decisions.push({
          type: 'zoom',
          frame: curr.frame - 10,
          durationFrames: 20,
          priority: 5,
          source: 'visual',
          signal: 'composition_shift',
          reason: `${prev.shotType} → ${curr.shotType}`,
          params: { scaleFrom: 1.0, scaleTo: 1.2 },
          confidence: 0.5,
        });
      }
    }
  }

  return decisions;
}

function generateAudioSyncDecisions(transients: number[], beats: number[]): EditDecision[] {
  // Transient + beat coincidence = zoom punch opportunity
  const decisions: EditDecision[] = [];

  for (const transient of transients) {
    const nearBeat = beats.some(b => Math.abs(b - transient) < 3); // Within 3 frames
    if (nearBeat) {
      decisions.push({
        type: 'zoom',
        frame: transient,
        durationFrames: 8,
        priority: 2,
        source: 'audio-sync',
        signal: 'beat_transient_coincidence',
        reason: 'Beat + audio transient aligned — zoom punch',
        params: { scaleFrom: 1.0, scaleTo: 1.08 },
        confidence: 0.85,
      });
    }
  }

  return decisions;
}

// ─── Cinematic Moment Detection ──────────────────────────────────

function detectCinematicMoments(analysis: AssetAnalysis): EditDecision[] {
  const decisions: EditDecision[] = [];
  const WINDOW_FRAMES = 15; // 0.5s at 30fps

  // Sample every 0.5s
  const totalFrames = Math.round(analysis.durationMs / 1000 * FPS);
  for (let frame = 0; frame < totalFrames; frame += WINDOW_FRAMES) {
    const signals: { track: string; score: number }[] = [];

    // Music energy at this frame
    if (analysis.musicStructure) {
      const ms = (frame / FPS) * 1000;
      const energy = getValueAt(analysis.musicStructure.energyCurve, ms);
      if (energy > 0.7) signals.push({ track: 'music', score: energy });

      const tension = getValueAt(analysis.musicStructure.tensionCurve, ms);
      if (tension > 0.8) signals.push({ track: 'tension', score: tension });
    }

    // Motion at this frame
    const motionSeg = analysis.motionSegments.find(
      s => frame >= s.startFrame && frame <= s.endFrame,
    );
    if (motionSeg && motionSeg.motionIntensity > 0.7) {
      signals.push({ track: 'motion', score: motionSeg.motionIntensity });
    }

    // Speech emphasis
    const speechSeg = analysis.speechSegments.find(
      s => frame >= s.startFrame && frame <= s.endFrame,
    );
    if (speechSeg && (speechSeg.contentType === 'emphasis' || speechSeg.contentType === 'statistic')) {
      signals.push({ track: 'speech', score: speechSeg.confidence });
    }

    // 2+ tracks peaking = cinematic moment
    if (signals.length >= 2) {
      const combinedScore = signals.reduce((sum, s) => sum + s.score, 0) / signals.length;
      const tracks = signals.map(s => s.track);

      // Determine edit type based on which tracks are peaking
      let editType: EditDecisionType = 'zoom';
      let params: Record<string, any> = { scaleFrom: 1.0, scaleTo: 1.1 };

      if (tracks.includes('music') && tracks.includes('motion')) {
        editType = 'zoom';
        params = { scaleFrom: 1.0, scaleTo: 1.0 + combinedScore * 0.15 };
      } else if (tracks.includes('tension') && tracks.includes('motion')) {
        editType = 'slow-motion';
        params = { speed: 0.3 };
      } else if (tracks.includes('speech') && tracks.includes('music')) {
        editType = 'graphic';
        params = { graphicType: 'emphasis-pulse' };
      }

      decisions.push({
        type: editType,
        frame,
        durationFrames: editType === 'slow-motion' ? 60 : 15,
        priority: 1,
        source: 'cinematic-moment',
        signal: `multi_track_peak_${tracks.join('+')}`,
        reason: `Cinematic moment: ${tracks.join(' + ')} peaking (${Math.round(combinedScore * 100)}%)`,
        params,
        confidence: combinedScore,
      });
    }
  }

  return decisions;
}

// ─── Helpers ─────────────────────────────────────────────────────

function getValueAt(
  curve: Array<{ timestampMs: number; energy?: number; tension?: number }>,
  timestampMs: number,
): number {
  if (curve.length === 0) return 0;
  const nearest = curve.reduce((best, c) =>
    Math.abs(c.timestampMs - timestampMs) < Math.abs(best.timestampMs - timestampMs) ? c : best,
  );
  return (nearest as any).energy ?? (nearest as any).tension ?? 0;
}

function deduplicateDecisions(decisions: EditDecision[]): EditDecision[] {
  const result: EditDecision[] = [];
  const MIN_GAP = 10; // Minimum 10 frames between same-type decisions

  for (const decision of decisions) {
    const conflict = result.some(existing => {
      if (Math.abs(existing.frame - decision.frame) > MIN_GAP) return false;
      if (existing.type === decision.type) return true;
      if ((existing.type === 'cut' && decision.type === 'transition') ||
          (existing.type === 'transition' && decision.type === 'cut')) return true;
      if (existing.type === 'zoom' && decision.type === 'zoom') return true;
      return false;
    });

    if (!conflict) result.push(decision);
  }

  return result;
}
