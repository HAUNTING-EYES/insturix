import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildChatEditContextBundle,
  formatChatEditContextForPrompt,
} from '@/lib/editron/agent/chat-edit-context';
import {
  applyAudioDuckingToProject,
  findAudioMomentCandidates,
} from '@/lib/editron/agent/chat-audio-tools';
import {
  findTranscriptMomentCandidates,
  resolveTranscriptEditRange,
  type TranscriptSearchWord,
} from '@/lib/editron/agent/chat-transcript-tools';
import {
  applyCameraShakeToProject,
  applyFadeToProject,
  applyFilterToProject,
  applyLayerReorderToProject,
  applyMoveRetimeToProject,
  applySpeedRampToProject,
  findVisualMomentCandidates,
} from '@/lib/editron/agent/chat-visual-tools';
import { getChatToolMetadata } from '@/lib/editron/agent/chat-tool-registry';

describe('chat edit context bundle', () => {
  const project = {
    projectId: 'proj_chat_context',
    fps: 30,
    durationInFrames: 300,
    dimensions: { width: 1280, height: 720 },
    overlays: [
      {
        id: 1,
        type: 'video',
        from: 0,
        durationInFrames: 180,
        row: 0,
        assetId: 'asset_video',
        src: 'https://example.com/video.mp4',
      },
      {
        id: 2,
        type: 'caption',
        from: 60,
        durationInFrames: 90,
        row: 3,
        content: 'Hello there',
        words: [
          { word: 'Hello', startFrame: 60, endFrame: 70 },
          { word: 'there', startFrame: 71, endFrame: 80 },
        ],
      },
      {
        id: 3,
        type: 'sound',
        from: 80,
        durationInFrames: 60,
        row: 4,
        assetId: 'asset_music',
      },
      {
        id: 4,
        type: 'text',
        from: 90,
        durationInFrames: 45,
        row: 2,
        content: 'Key point',
      },
    ],
    rawFootageAnalysis: {
      transcription: {
        segments: [{ text: 'Hello there from source' }],
        words: [
          { word: 'Hello', start: 0.1 },
          { word: 'there', start: 0.2 },
          { word: 'source', start: 0.3 },
        ],
      },
    },
    analysis: {
      audio: {
        beats: [{ timestampMs: 3000, strength: 0.91, beatType: 'downbeat' }],
        silences: [{ startMs: 1200, endMs: 2200, durationMs: 1000 }],
        energyCurve: [
          { timestampMs: 2600, energy: 0.24 },
          { timestampMs: 3000, energy: 0.94 },
          { timestampMs: 3400, energy: 0.38 },
        ],
      },
      keyframeAnalyses: [
        {
          frame: 96,
          description: 'Logo appears on laptop while a person points at the screen',
          objects: ['person', 'laptop', 'logo'],
          action: 'pointing',
        },
      ],
      shots: [
        {
          startFrame: 90,
          endFrame: 135,
          shotType: 'talking-head',
          sceneDescription: 'Company mark is visible on the laptop screen',
        },
      ],
    },
    musicStructure: {
      bpm: 120,
      sections: [{ startFrame: 84, endFrame: 126, startMs: 2800, endMs: 4200, type: 'drop', energyLevel: 'peak' }],
      energyCurve: [{ timestampMs: 2600, energy: 0.2 }, { timestampMs: 3000, energy: 0.95 }, { timestampMs: 3400, energy: 0.3 }],
      tensionCurve: [],
      drops: [90],
      builds: [72],
      breakdowns: [],
      stingers: [90],
    },
  };

  it('bundles playhead, selected overlay, transcript, audio, and media context deterministically', () => {
    const bundle = buildChatEditContextBundle(project, {
      selectedOverlayId: 1,
      clientContext: {
        currentFrame: 95,
        visibleTimeline: { startFrame: 30, endFrame: 180 },
        selectedRange: { startFrame: 90, endFrame: 120 },
      },
    });

    expect(bundle.playhead).toMatchObject({
      frame: 95,
      seconds: 3.167,
      timecode: '0:03.05',
      activeOverlayIds: [1, 2, 3, 4],
    });
    expect(bundle.selectedOverlay).toMatchObject({
      id: 1,
      type: 'video',
      from: 0,
      endFrame: 180,
      sceneIndex: 0,
    });
    expect(bundle.visibleTimeline).toEqual({ startFrame: 30, endFrame: 180, durationInFrames: 150 });
    expect(bundle.selectedRange).toEqual({ startFrame: 90, endFrame: 120, durationInFrames: 30 });
    expect(bundle.transcript).toMatchObject({
      captionOverlayCount: 1,
      captionWordCount: 2,
      rawSegmentCount: 1,
      rawWordCount: 3,
      hasWordTimestamps: true,
    });
    expect(bundle.audio).toEqual({
      soundOverlayCount: 1,
      nativeAudioVideoCount: 1,
    });
    expect(bundle.mediaRefs).toEqual([
      { assetId: 'asset_video', types: ['video'], overlayIds: [1] },
      { assetId: 'asset_music', types: ['sound'], overlayIds: [3] },
    ]);
    expect(bundle.resolverStatus.userMediaSearchAvailableToChat).toBe(true);
  });

  it('covers user asset tools with registry metadata without importing Mongo-backed tools', () => {
    const source = readFileSync(join(process.cwd(), 'lib/editron/agent/chat-asset-tools.ts'), 'utf8');
    const toolNames = [...source.matchAll(/name:\s*["']([^"']+)["']/g)].map((match) => match[1]);

    expect(toolNames).toEqual(['list_user_assets', 'search_user_assets', 'inspect_user_asset']);
    expect(toolNames.map((toolName) => getChatToolMetadata(toolName)?.receiptLabel)).toEqual([
      'Listed uploaded assets',
      'Searched uploaded assets',
      'Inspected uploaded asset',
    ]);
  });

  it('covers transcript moment search and transcript edit resolution with registry metadata without importing Mongo-backed tools', () => {
    const source = readFileSync(join(process.cwd(), 'lib/editron/agent/chat-transcript-tools.ts'), 'utf8');
    const toolNames = [...source.matchAll(/name:\s*["']([^"']+)["']/g)].map((match) => match[1]);

    expect(toolNames).toEqual(['find_transcript_moment', 'resolve_transcript_edit']);
    expect(getChatToolMetadata('find_transcript_moment')).toMatchObject({
      label: 'Finding transcript moment',
      shortLabel: 'Find speech',
      receiptLabel: 'Found transcript moment',
      mutatesProject: false,
      riskLevel: 'read',
    });
    expect(getChatToolMetadata('resolve_transcript_edit')).toMatchObject({
      label: 'Resolving transcript edit',
      shortLabel: 'Speech edit',
      receiptLabel: 'Resolved transcript edit',
      mutatesProject: false,
      riskLevel: 'read',
    });
  });

  it('covers visual moment search, camera shake, speed ramp, fade, layer reorder, move/retime, and filter with registry metadata without importing Mongo-backed tools', () => {
    const source = readFileSync(join(process.cwd(), 'lib/editron/agent/chat-visual-tools.ts'), 'utf8');
    const toolNames = [...source.matchAll(/name:\s*["']([^"']+)["']/g)].map((match) => match[1]);

    expect(toolNames).toEqual(['find_visual_moment', 'apply_camera_shake', 'apply_speed_ramp', 'apply_fade', 'reorder_layer', 'move_retime_overlay', 'apply_filter']);
    expect(getChatToolMetadata('find_visual_moment')).toMatchObject({
      label: 'Finding visual moment',
      shortLabel: 'Find visual',
      receiptLabel: 'Found visual moment',
      mutatesProject: false,
      riskLevel: 'read',
    });
    expect(getChatToolMetadata('apply_camera_shake')).toMatchObject({
      label: 'Applying camera shake',
      shortLabel: 'Shake',
      receiptLabel: 'Applied camera shake',
      mutatesProject: true,
      requiresProjectReload: true,
      riskLevel: 'medium',
    });
    expect(getChatToolMetadata('apply_speed_ramp')).toMatchObject({
      label: 'Applying speed ramp',
      shortLabel: 'Speed',
      receiptLabel: 'Applied speed ramp',
      mutatesProject: true,
      requiresProjectReload: true,
      riskLevel: 'medium',
    });
    expect(getChatToolMetadata('apply_fade')).toMatchObject({
      label: 'Applying fade',
      shortLabel: 'Fade',
      receiptLabel: 'Applied fade',
      mutatesProject: true,
      requiresProjectReload: true,
      riskLevel: 'medium',
    });
    expect(getChatToolMetadata('reorder_layer')).toMatchObject({
      label: 'Reordering layer',
      shortLabel: 'Layer',
      receiptLabel: 'Reordered layer',
      mutatesProject: true,
      requiresProjectReload: true,
      riskLevel: 'medium',
    });
    expect(getChatToolMetadata('move_retime_overlay')).toMatchObject({
      label: 'Moving/retiming element',
      shortLabel: 'Timing',
      receiptLabel: 'Moved/retimed element',
      mutatesProject: true,
      requiresProjectReload: true,
      riskLevel: 'medium',
    });
    expect(getChatToolMetadata('apply_filter')).toMatchObject({
      label: 'Applying filter',
      shortLabel: 'Filter',
      receiptLabel: 'Applied filter',
      mutatesProject: true,
      requiresProjectReload: true,
      riskLevel: 'medium',
    });
  });

  it('covers audio moment search with registry metadata without importing Mongo-backed tools', () => {
    const source = readFileSync(join(process.cwd(), 'lib/editron/agent/chat-audio-tools.ts'), 'utf8');
    const toolNames = [...source.matchAll(/name:\s*["']([^"']+)["']/g)].map((match) => match[1]);

    expect(toolNames).toEqual(['find_audio_moment', 'apply_audio_ducking']);
    expect(getChatToolMetadata('find_audio_moment')).toMatchObject({
      label: 'Finding audio moment',
      shortLabel: 'Find audio',
      receiptLabel: 'Found audio moment',
      mutatesProject: false,
      riskLevel: 'read',
    });
    expect(getChatToolMetadata('apply_audio_ducking')).toMatchObject({
      label: 'Applying audio ducking',
      shortLabel: 'Ducking',
      receiptLabel: 'Applied audio ducking',
      mutatesProject: true,
      requiresProjectReload: true,
      riskLevel: 'medium',
    });
  });

  it('plans audio ducking for BGM only and leaves SFX/voice tracks untouched', () => {
    const plan = applyAudioDuckingToProject({
      overlays: [
        { id: 10, type: 'sound', row: 1, assetId: 'bgm_main', styles: {} },
        { id: 11, type: 'sound', row: 0, assetId: 'sfx_whoosh', styles: { volume: 0.6 } },
        { id: 12, type: 'sound', row: 3, assetId: 'narration_track', styles: { volume: 1 } },
        { id: 13, type: 'caption', row: 4, content: 'spoken words' },
      ],
    }, { duckLevel: 0.18 });

    expect(plan).toMatchObject({
      status: 'changed',
      bgmOverlayIds: [10],
      voiceSourceOverlayIds: [12],
      speechEvidenceCount: 2,
      skippedOverlayIds: [11, 12],
      config: {
        enabled: true,
        duckLevel: 0.18,
        rampDownMs: 300,
        rampUpMs: 600,
        lookAheadMs: 200,
      },
    });
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({
      overlayId: 10,
      nextStyles: {
        volume: 0.75,
        duckingConfig: {
          enabled: true,
          duckLevel: 0.18,
        },
      },
    });
  });

  it('fails loudly when audio ducking is requested without BGM', () => {
    const plan = applyAudioDuckingToProject({
      overlays: [
        { id: 11, type: 'sound', row: 0, assetId: 'sfx_whoosh', styles: { volume: 0.6 } },
        { id: 12, type: 'sound', row: 3, assetId: 'narration_track', styles: { volume: 1 } },
      ],
    });

    expect(plan).toMatchObject({
      status: 'no-bgm',
      bgmOverlayIds: [],
      voiceSourceOverlayIds: [12],
      updates: [],
      skippedOverlayIds: [11, 12],
    });
    expect(plan.message).toContain('No background music overlay was found');
  });

  it('finds phrase-level transcript moments with frame hints for edit tools', () => {
    const words = makeTranscriptWords(
      ['two', 'human', 'beings', 'in', 'the', 'real', 'world'],
      90,
    );
    const candidates = findTranscriptMomentCandidates(words, 'two human beings', {
      limit: 3,
      minConfidence: 0.42,
    });

    expect(candidates[0]).toMatchObject({
      text: 'two human beings',
      startFrame: 90,
      endFrame: 108,
      confidenceLabel: 'high',
      matchType: 'phrase',
      safeForAutoEdit: true,
      useWith: {
        cut_section: {
          startFrame: 90,
          endFrame: 108,
        },
        add_motion_graphic: {
          frame: 90,
          text: 'two human beings',
        },
        add_sfx: {
          frame: 90,
          sync: 'word-start',
        },
      },
    });
    expect(candidates[0].surroundingWords).toContain('in the real world');
  });

  it('resolves post-phrase transcript cut range without cutting the phrase', () => {
    const words = makeTimedTranscriptWords([
      ['pricing', 42, 48],
      ['is', 48, 54],
      ['simple', 54, 60],
      ['next', 90, 96],
    ]);
    const plan = resolveTranscriptEditRange(words, 'pricing is simple', {
      action: 'cut_after_phrase',
      minGapFrames: 6,
      maxCutFrames: 90,
    });

    expect(plan).toMatchObject({
      status: 'ready',
      action: 'cut_after_phrase',
      candidate: {
        text: 'pricing is simple',
        startFrame: 42,
        endFrame: 60,
      },
      cutSection: {
        startFrame: 60,
        endFrame: 90,
      },
      useWith: {
        cut_section: {
          startFrame: 60,
          endFrame: 90,
        },
      },
    });
    expect(plan.message).toContain('frames 60-90');
  });

  it('blocks ambiguous repeated transcript phrase before cut resolution', () => {
    const words = makeTimedTranscriptWords([
      ['pricing', 42, 48],
      ['is', 48, 54],
      ['simple', 54, 60],
      ['again', 84, 90],
      ['pricing', 120, 126],
      ['is', 126, 132],
      ['simple', 132, 138],
      ['next', 168, 174],
    ]);
    const plan = resolveTranscriptEditRange(words, 'pricing is simple', {
      action: 'cut_after_phrase',
      minGapFrames: 6,
    });

    expect(plan).toMatchObject({
      status: 'ambiguous',
      action: 'cut_after_phrase',
    });
    expect(plan.cutSection).toBeUndefined();
    expect(plan.message).toContain('ambiguous');
  });

  it('refuses post-phrase cut when the following word is too close', () => {
    const words = makeTimedTranscriptWords([
      ['pricing', 42, 48],
      ['is', 48, 54],
      ['simple', 54, 60],
      ['next', 63, 69],
    ]);
    const plan = resolveTranscriptEditRange(words, 'pricing is simple', {
      action: 'cut_after_phrase',
      minGapFrames: 6,
    });

    expect(plan).toMatchObject({
      status: 'no-range',
      action: 'cut_after_phrase',
    });
    expect(plan.cutSection).toBeUndefined();
    expect(plan.message).toContain('minimum is 6');
  });

  it('finds visual moments from stored visual analysis with frame hints for edit tools', () => {
    const candidates = findVisualMomentCandidates(project, 'logo appears on laptop', {
      limit: 3,
      minConfidence: 0.3,
    });

    expect(candidates[0]).toMatchObject({
      frame: 96,
      startFrame: 96,
      endFrame: 97,
      confidenceLabel: 'high',
      matchType: 'exact-phrase',
      safeForAutoEdit: true,
      source: {
        type: 'analysis',
        path: 'analysis.keyframeAnalyses.0.description',
      },
      useWith: {
        visual_inspect_frame: {
          frame: 96,
        },
        add_motion_graphic: {
          frame: 96,
          text: 'logo appears on laptop',
        },
      },
    });
  });

  it('plans camera shake as bounded x/y tracks on the active video overlay', () => {
    const plan = applyCameraShakeToProject(project, {
      targetFrame: 90,
      intensity: 1,
      durationFrames: 30,
      canvasWidth: 1000,
    });

    expect(plan).toMatchObject({
      status: 'changed',
      targetFrame: 90,
      targetOverlayId: 1,
      updates: [{
        overlayId: 1,
        localFrame: 90,
        intensity: 0.8,
        durationFrames: 15,
        maxOffset: 8,
        reason: 'brief-impact-camera-shake',
      }],
    });

    const tracks = plan.updates[0].nextKeyframeTracks.filter((track: any) => track.property === 'x' || track.property === 'y');
    expect(tracks.map((track: any) => track.property)).toEqual(['x', 'y']);
    for (const track of tracks) {
      expect(track.metadata).toEqual({ family: 'camera-shake', source: 'apply_camera_shake' });
      expect(track.keyframes[0]).toEqual({ frame: 90, value: 0, easing: 'linear' });
      expect(track.keyframes[track.keyframes.length - 1]).toEqual({ frame: 106, value: 0, easing: 'ease-out' });
      const maxAbsOffset = Math.max(...track.keyframes.map((keyframe: any) => Math.abs(keyframe.value)));
      expect(maxAbsOffset).toBeLessThanOrEqual(8);
    }
  });

  it('refuses camera shake when existing position motion would be overwritten', () => {
    const plan = applyCameraShakeToProject({
      durationInFrames: 60,
      overlays: [{
        id: 10,
        type: 'video',
        from: 0,
        durationInFrames: 60,
        keyframeTracks: [{
          property: 'x',
          keyframes: [
            { frame: 0, value: 0, easing: 'linear' },
            { frame: 30, value: 24, easing: 'ease-in-out' },
          ],
        }],
      }],
    }, { targetFrame: 12 });

    expect(plan).toMatchObject({
      status: 'conflict',
      targetFrame: 12,
      targetOverlayId: 10,
      updates: [],
    });
    expect(plan.message).toContain('already has x/y position keyframes');
  });

  it('plans speed ramp as bounded speedCurve and matching speed keyframes', () => {
    const plan = applySpeedRampToProject(project, {
      startFrame: 150,
      endFrame: 175,
      targetSpeed: 0.1,
    });

    expect(plan).toMatchObject({
      status: 'changed',
      startFrame: 150,
      endFrame: 175,
      targetOverlayId: 1,
      updates: [{
        overlayId: 1,
        localStartFrame: 150,
        localMidFrame: 163,
        localEndFrame: 175,
        targetSpeed: 0.25,
        reason: 'bounded-semantic-speed-ramp',
      }],
    });

    expect(plan.updates[0].nextSpeedCurve).toEqual([
      { frame: 150, value: 1, easing: 'ease-in-out' },
      { frame: 163, value: 0.25, easing: 'ease-in-out' },
      { frame: 175, value: 1, easing: 'ease-out' },
    ]);
    const speedTrack = plan.updates[0].nextKeyframeTracks.find((track: any) => track.property === 'speed');
    expect(speedTrack).toMatchObject({
      property: 'speed',
      metadata: { family: 'speed-ramp', source: 'apply_speed_ramp' },
    });
    expect(speedTrack.keyframes).toEqual(plan.updates[0].nextSpeedCurve);
  });

  it('refuses speed ramp across caption dialogue unless explicitly allowed', () => {
    const plan = applySpeedRampToProject(project, {
      startFrame: 90,
      endFrame: 120,
      targetSpeed: 0.5,
    });

    expect(plan).toMatchObject({
      status: 'conflict',
      startFrame: 90,
      endFrame: 120,
      targetOverlayId: 1,
      updates: [],
    });
    expect(plan.message).toContain('overlap captions/dialogue');
  });

  it('refuses speed ramp when existing speed motion would be overwritten', () => {
    const plan = applySpeedRampToProject({
      durationInFrames: 60,
      overlays: [{
        id: 10,
        type: 'video',
        from: 0,
        durationInFrames: 60,
        speedCurve: [
          { frame: 0, value: 1, easing: 'linear' },
          { frame: 30, value: 0.5, easing: 'ease-in-out' },
        ],
      }],
    }, { startFrame: 10, endFrame: 40 });

    expect(plan).toMatchObject({
      status: 'conflict',
      startFrame: 10,
      endFrame: 40,
      targetOverlayId: 10,
      updates: [],
    });
    expect(plan.message).toContain('already has speed keyframes');
  });

  it('plans fade out as bounded opacity keyframes at the overlay end', () => {
    const plan = applyFadeToProject(project, {
      overlayId: 4,
      direction: 'out',
      durationFrames: 12,
    });

    expect(plan).toMatchObject({
      status: 'changed',
      startFrame: 123,
      endFrame: 135,
      targetOverlayId: 4,
      updates: [{
        overlayId: 4,
        localStartFrame: 33,
        localEndFrame: 45,
        previousKeyframeTrackCount: 0,
        fromOpacity: 1,
        toOpacity: 0,
        reason: 'semantic-fade-out',
      }],
    });

    const opacityTrack = plan.updates[0].nextKeyframeTracks.find((track: any) => track.property === 'opacity');
    expect(opacityTrack).toEqual({
      property: 'opacity',
      keyframes: [
        { frame: 33, value: 1, easing: 'ease-in' },
        { frame: 45, value: 0, easing: 'linear' },
      ],
      metadata: { family: 'fade', source: 'apply_fade', direction: 'out' },
    });
  });

  it('refuses fade on caption overlays unless explicitly allowed', () => {
    const plan = applyFadeToProject(project, {
      overlayId: 2,
      direction: 'out',
    });

    expect(plan).toMatchObject({
      status: 'conflict',
      targetOverlayId: 2,
      updates: [],
    });
    expect(plan.message).toContain('captions/subtitles');
  });

  it('refuses fade when existing opacity motion would be overwritten', () => {
    const plan = applyFadeToProject({
      durationInFrames: 80,
      overlays: [{
        id: 20,
        type: 'text',
        from: 10,
        durationInFrames: 40,
        content: 'CTA',
        keyframeTracks: [{
          property: 'opacity',
          keyframes: [
            { frame: 0, value: 0, easing: 'linear' },
            { frame: 10, value: 1, easing: 'ease-out' },
          ],
        }],
      }],
    }, { overlayId: 20, direction: 'out' });

    expect(plan).toMatchObject({
      status: 'conflict',
      startFrame: 30,
      endFrame: 50,
      targetOverlayId: 20,
      updates: [],
    });
    expect(plan.message).toContain('already has opacity keyframes');
  });

  it('plans layer reorder as a row-only move behind a reference overlay', () => {
    const plan = applyLayerReorderToProject({
      overlays: [
        { id: 30, type: 'image', from: 90, durationInFrames: 60, row: 4, content: 'Logo mark' },
        { id: 31, type: 'text', from: 90, durationInFrames: 60, row: 1, content: 'Main title' },
        { id: 32, type: 'shape', from: 180, durationInFrames: 30, row: 2, content: 'Later card' },
      ],
    }, {
      targetQuery: 'logo',
      referenceQuery: 'title',
      relation: 'behind',
    });

    expect(plan).toMatchObject({
      status: 'changed',
      targetOverlayId: 30,
      referenceOverlayId: 31,
      updates: [{
        overlayId: 30,
        previousRow: 4,
        nextRow: 2,
        referenceOverlayId: 31,
        relation: 'behind',
        reason: 'semantic-layer-reorder',
      }],
    });
    expect(plan.message).toContain('Moved overlay 30 from row 4 to row 2');
  });

  it('refuses layer reorder into an occupied overlapping row unless explicitly allowed', () => {
    const plan = applyLayerReorderToProject({
      overlays: [
        { id: 30, type: 'image', from: 90, durationInFrames: 70, row: 4, content: 'Logo mark' },
        { id: 31, type: 'text', from: 90, durationInFrames: 70, row: 1, content: 'Main title' },
        { id: 32, type: 'shape', from: 120, durationInFrames: 20, row: 2, content: 'Badge' },
      ],
    }, {
      overlayId: 30,
      referenceOverlayId: 31,
      relation: 'behind',
    });

    expect(plan).toMatchObject({
      status: 'conflict',
      targetOverlayId: 30,
      referenceOverlayId: 31,
      updates: [],
    });
    expect(plan.message).toContain('Row 2 already has overlapping ordinary visual overlay(s): 32');
  });

  it('refuses layer reorder against caption render priority', () => {
    const plan = applyLayerReorderToProject(project, {
      overlayId: 4,
      referenceOverlayId: 2,
      relation: 'behind',
    });

    expect(plan).toMatchObject({
      status: 'conflict',
      targetOverlayId: 4,
      referenceOverlayId: 2,
      updates: [],
    });
    expect(plan.message).toContain('captions use fixed render priority');
  });

  it('plans move/retime as existing timing field updates only', () => {
    const plan = applyMoveRetimeToProject(project, {
      overlayId: 4,
      startFrame: 120,
    });

    expect(plan).toMatchObject({
      status: 'changed',
      targetOverlayId: 4,
      updates: [{
        overlayId: 4,
        previousStartFrame: 90,
        previousEndFrame: 135,
        previousDurationFrames: 45,
        nextStartFrame: 120,
        nextEndFrame: 165,
        nextDurationFrames: 45,
        nextUpdates: {
          from: 120,
          durationInFrames: 45,
        },
        sourceTrimFrames: 0,
        reason: 'semantic-overlay-move',
      }],
    });
  });

  it('refuses move/retime into a same-row timeline collision unless explicitly allowed', () => {
    const plan = applyMoveRetimeToProject({
      durationInFrames: 120,
      overlays: [
        { id: 40, type: 'image', from: 10, durationInFrames: 30, row: 2, content: 'Badge' },
        { id: 41, type: 'text', from: 35, durationInFrames: 25, row: 2, content: 'Title' },
      ],
    }, {
      overlayId: 40,
      startFrame: 30,
    });

    expect(plan).toMatchObject({
      status: 'conflict',
      targetOverlayId: 40,
      updates: [],
    });
    expect(plan.message).toContain('already overlap overlay(s): 41');
  });

  it('refuses generic move/retime on captions to protect word timing sync', () => {
    const plan = applyMoveRetimeToProject(project, {
      overlayId: 2,
      startFrame: 70,
    });

    expect(plan).toMatchObject({
      status: 'conflict',
      targetOverlayId: 2,
      updates: [],
    });
    expect(plan.message).toContain('captions are protected from generic retime');
  });

  it('requires explicit source trim permission before changing media source offsets', () => {
    const mediaProject = {
      durationInFrames: 120,
      overlays: [
        { id: 50, type: 'video', from: 10, durationInFrames: 60, row: 0, videoStartTime: 5 },
      ],
    };
    const blocked = applyMoveRetimeToProject(mediaProject, {
      overlayId: 50,
      startFrame: 20,
      endFrame: 70,
    });
    const allowed = applyMoveRetimeToProject(mediaProject, {
      overlayId: 50,
      startFrame: 20,
      endFrame: 70,
      allowSourceTrim: true,
    });

    expect(blocked).toMatchObject({
      status: 'conflict',
      targetOverlayId: 50,
      updates: [],
    });
    expect(blocked.message).toContain('source-start trim');
    expect(allowed).toMatchObject({
      status: 'changed',
      targetOverlayId: 50,
      updates: [{
        overlayId: 50,
        nextStartFrame: 20,
        nextEndFrame: 70,
        nextDurationFrames: 50,
        nextUpdates: {
          from: 20,
          durationInFrames: 50,
          videoStartTime: 15,
        },
        sourceTrimFrames: 10,
        reason: 'semantic-overlay-source-trim',
      }],
    });
  });

  it('plans filter as a manual overlay style override only', () => {
    const plan = applyFilterToProject(project, {
      overlayId: 1,
      filterIntent: 'warmer',
    });

    expect(plan).toMatchObject({
      status: 'changed',
      targetOverlayId: 1,
      updates: [{
        overlayId: 1,
        previousFilter: 'none',
        nextFilter: 'sepia(0.18) saturate(1.12) hue-rotate(-6deg) brightness(1.03)',
        nextStyles: {
          filter: 'sepia(0.18) saturate(1.12) hue-rotate(-6deg) brightness(1.03)',
        },
        reason: 'manual-overlay-filter-override',
      }],
    });
    expect(plan.message).toContain('Applied manual filter');
  });

  it('refuses filter on captions unless explicitly allowed', () => {
    const plan = applyFilterToProject(project, {
      overlayId: 2,
      filterIntent: 'brighter',
    });

    expect(plan).toMatchObject({
      status: 'conflict',
      targetOverlayId: 2,
      updates: [],
    });
    expect(plan.message).toContain('captions/subtitles');
  });

  it('refuses unsafe filter CSS and blocks accidental existing-filter overwrite', () => {
    const unsafe = applyFilterToProject(project, {
      overlayId: 1,
      filterCss: 'url(https://example.com/filter.svg#x)',
    });
    const blocked = applyFilterToProject({
      overlays: [
        { id: 60, type: 'video', from: 0, durationInFrames: 60, styles: { filter: 'contrast(1.1)' } },
      ],
    }, {
      overlayId: 60,
      filterIntent: 'cooler',
    });
    const allowed = applyFilterToProject({
      overlays: [
        { id: 60, type: 'video', from: 0, durationInFrames: 60, styles: { filter: 'contrast(1.1)' } },
      ],
    }, {
      overlayId: 60,
      filterIntent: 'cooler',
      replaceExistingFilter: true,
    });

    expect(unsafe).toMatchObject({
      status: 'conflict',
      targetOverlayId: 1,
      updates: [],
    });
    expect(unsafe.message).toContain('Filter CSS was rejected');
    expect(blocked).toMatchObject({
      status: 'conflict',
      targetOverlayId: 60,
      updates: [],
    });
    expect(blocked.message).toContain('already has filter');
    expect(allowed).toMatchObject({
      status: 'changed',
      targetOverlayId: 60,
      updates: [{
        overlayId: 60,
        previousFilter: 'contrast(1.1)',
        nextFilter: 'saturate(0.95) hue-rotate(6deg) brightness(1.01)',
        nextStyles: {
          filter: 'saturate(0.95) hue-rotate(6deg) brightness(1.01)',
        },
      }],
    });
  });

  it('finds audio moments from stored audio analysis with frame hints for edit tools', () => {
    const silenceCandidates = findAudioMomentCandidates(project, 'cut the long silence', {
      limit: 3,
      minConfidence: 0.3,
    });
    const dropCandidates = findAudioMomentCandidates(project, 'add impact on the beat drop', {
      limit: 3,
      minConfidence: 0.3,
    });

    expect(silenceCandidates[0]).toMatchObject({
      audioKind: 'silence',
      startFrame: 36,
      endFrame: 66,
      confidenceLabel: 'high',
      safeForAutoEdit: true,
      useWith: {
        cut_section: {
          startFrame: 36,
          endFrame: 66,
        },
        add_sfx: {
          frame: 36,
          sync: 'audio-anchor',
        },
      },
    });
    expect(dropCandidates[0]).toMatchObject({
      audioKind: 'beat-drop',
      frame: 90,
      confidenceLabel: 'high',
      safeForAutoEdit: true,
      useWith: {
        sync_cuts_to_beats: {
          frame: 90,
        },
        add_sfx: {
          frame: 90,
          sync: 'audio-anchor',
        },
      },
    });
  });

  it('clamps playhead and makes missing resolvers explicit in the prompt', () => {
    const bundle = buildChatEditContextBundle(project, {
      clientContext: {
        currentFrame: 999,
        canvas: { width: 1080, height: 1920 },
      },
    });
    const prompt = formatChatEditContextForPrompt(bundle);

    expect(bundle.playhead.frame).toBe(300);
    expect(bundle.project.canvas).toEqual({ width: 1080, height: 1920 });
    expect(prompt).toContain('Reference rule: when the user says "this"');
    expect(prompt).toContain('User media search: available via list_user_assets, search_user_assets, and inspect_user_asset');
    expect(prompt).toContain('Transcript moment search: available via find_transcript_moment');
    expect(prompt).toContain('Visual moment search: available via find_visual_moment');
    expect(prompt).toContain('Audio moment search: available via find_audio_moment');
    expect(prompt).toContain('Missing semantic resolvers: none');
    expect(prompt).toContain('Do not ask for a timeframe when this context is enough.');
  });
});

function makeTimedTranscriptWords(items: Array<[string, number, number]>): TranscriptSearchWord[] {
  return items.map(([word, startFrame, endFrame]) => ({
    word,
    startMs: Math.round((startFrame / 30) * 1000),
    endMs: Math.round((endFrame / 30) * 1000),
    startFrame,
    endFrame,
    confidence: 0.94,
    source: {
      type: 'video-transcription',
      overlayId: 1,
      assetId: 'asset_video',
      overlayType: 'video',
    },
  }));
}

function makeTranscriptWords(words: string[], startFrame: number): TranscriptSearchWord[] {
  return words.map((word, index) => {
    const wordStart = startFrame + (index * 6);
    const wordEnd = wordStart + 6;
    return {
      word,
      startMs: Math.round((wordStart / 30) * 1000),
      endMs: Math.round((wordEnd / 30) * 1000),
      startFrame: wordStart,
      endFrame: wordEnd,
      confidence: 0.94,
      source: {
        type: 'video-transcription',
        overlayId: 1,
        assetId: 'asset_video',
        overlayType: 'video',
      },
    };
  });
}
