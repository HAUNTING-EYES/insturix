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
  type TranscriptSearchWord,
} from '@/lib/editron/agent/chat-transcript-tools';
import {
  applyCameraShakeToProject,
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

  it('covers transcript moment search with registry metadata without importing Mongo-backed tools', () => {
    const source = readFileSync(join(process.cwd(), 'lib/editron/agent/chat-transcript-tools.ts'), 'utf8');
    const toolNames = [...source.matchAll(/name:\s*["']([^"']+)["']/g)].map((match) => match[1]);

    expect(toolNames).toEqual(['find_transcript_moment']);
    expect(getChatToolMetadata('find_transcript_moment')).toMatchObject({
      label: 'Finding transcript moment',
      shortLabel: 'Find speech',
      receiptLabel: 'Found transcript moment',
      mutatesProject: false,
      riskLevel: 'read',
    });
  });

  it('covers visual moment search and camera shake with registry metadata without importing Mongo-backed tools', () => {
    const source = readFileSync(join(process.cwd(), 'lib/editron/agent/chat-visual-tools.ts'), 'utf8');
    const toolNames = [...source.matchAll(/name:\s*["']([^"']+)["']/g)].map((match) => match[1]);

    expect(toolNames).toEqual(['find_visual_moment', 'apply_camera_shake']);
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
