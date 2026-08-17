import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildChatEditClientContext,
  buildChatEditContextBundle,
  canApplyChatProjectResponse,
  formatChatEditContextForPrompt,
} from '@/lib/editron/agent/chat-edit-context';
import {
  applyAudioDuckingToProject,
  buildAudioEditResolutionEnvelope,
  findAudioMomentCandidates,
  findStrongestImpactEmphasisCandidates,
  resolveAudioEditTiming,
} from '@/lib/editron/agent/chat-audio-tools';
import {
  resolveUserAssetOverlayPlacement,
  type NormalizedAssetCandidate,
} from '@/lib/editron/agent/chat-asset-tools';
import {
  findTranscriptMomentCandidates,
  resolveStickerOverlayTiming,
  resolveTranscriptEditRange,
  type TranscriptSearchWord,
} from '@/lib/editron/agent/chat-transcript-tools';
import {
  applySubjectReframeMutation,
  applyCameraShakeToProject,
  applyFadeToProject,
  applyFilterToProject,
  applyLayerReorderToProject,
  applyMoveRetimeToProject,
  applySpeedRampToProject,
  findVisualMomentCandidates,
  resolveKeyframeEditParams,
  resolveVisualEditPlacement,
} from '@/lib/editron/agent/chat-visual-tools';
import { getChatToolMetadata } from '@/lib/editron/agent/chat-tool-registry';
import { AUDIO_LEVELS } from '@/lib/editron/constants/audio-standards';

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

  it('builds explicit editor context from selection, viewport, panel, and recent pointer', () => {
    const nowMs = 2_000_000;
    const clientContext = buildChatEditClientContext({
      currentFrame: 95,
      selectedOverlayId: 0,
      selectedOverlay: {
        id: 0,
        from: 60,
        durationInFrames: 45,
      },
      durationInFrames: 300,
      overlayCount: 4,
      activePanel: 'ai-chat',
      canvas: { width: 1280, height: 720 },
      playerDimensions: { width: 960, height: 540 },
      timelineViewport: {
        scrollLeft: 320,
        viewportWidth: 640,
        contentWidth: 1280,
        zoomScale: 2,
      },
      spatialCursor: {
        surface: 'preview',
        frame: 95,
        normalizedX: 0.25,
        normalizedY: 0.5,
        canvasX: 320,
        canvasY: 360,
        capturedAtMs: nowMs - 1_000,
        source: 'last-editor-pointer',
      },
      nowMs,
    });

    expect(clientContext).toMatchObject({
      currentFrame: 95,
      selectedOverlayId: 0,
      selectedRange: {
        startFrame: 60,
        endFrame: 105,
        source: 'selected-overlay',
      },
      visibleTimeline: {
        startFrame: 75,
        endFrame: 225,
        source: 'timeline-viewport',
      },
      activePanel: 'ai-chat',
      spatialCursor: {
        surface: 'preview',
        frame: 95,
        normalizedX: 0.25,
        normalizedY: 0.5,
        canvasX: 320,
        canvasY: 360,
      },
    });

    const bundle = buildChatEditContextBundle(project, { clientContext, contextNowMs: nowMs });
    expect(bundle.selectedRange).toEqual({
      startFrame: 60,
      endFrame: 105,
      durationInFrames: 45,
      source: 'selected-overlay',
    });
    expect(bundle.visibleTimeline).toEqual({
      startFrame: 75,
      endFrame: 225,
      durationInFrames: 150,
      source: 'timeline-viewport',
    });
    expect(bundle.spatialCursor).toMatchObject({ surface: 'preview', frame: 95, ageMs: 1_000 });
    expect(formatChatEditContextForPrompt(bundle)).toContain(
      'Last editor pointer: surface=preview, frame=95',
    );
  });

  it('expires stale pointer evidence and rejects stale or aborted project responses', () => {
    const nowMs = 5_000_000;
    const clientContext = buildChatEditClientContext({
      durationInFrames: 300,
      spatialCursor: {
        surface: 'timeline',
        frame: 120,
        capturedAtMs: nowMs - 30_001,
        source: 'last-editor-pointer',
      },
      nowMs,
    });

    expect(clientContext.spatialCursor).toBeUndefined();
    expect(canApplyChatProjectResponse({ expectedProjectId: 'proj_a', activeProjectId: 'proj_a' })).toBe(true);
    expect(canApplyChatProjectResponse({ expectedProjectId: 'proj_a', activeProjectId: 'proj_b' })).toBe(false);
    expect(canApplyChatProjectResponse({
      expectedProjectId: 'proj_a',
      activeProjectId: 'proj_a',
      aborted: true,
    })).toBe(false);
  });

  it('funnels every chat project overlay reload through the post-await project guard', () => {
    const source = readFileSync(join(
      process.cwd(),
      'components/editron/editor/version-7.0.0/components/ai-chat/ai-chat-panel.tsx',
    ), 'utf8');

    expect(source.match(/setOverlays\(/g)).toHaveLength(1);
    expect(source).toContain('const projectData = await projectResponse.json()');
    expect(source.indexOf('canApplyChatProjectResponse({')).toBeLessThan(
      source.indexOf('setOverlays(projectData.project.overlays)'),
    );
  });

  it('covers user asset tools with registry metadata without importing Mongo-backed tools', () => {
    const source = readFileSync(join(process.cwd(), 'lib/editron/agent/chat-asset-tools.ts'), 'utf8');
    const toolNames = [...source.matchAll(/name:\s*["']([^"']+)["']/g)].map((match) => match[1]);

    expect(toolNames).toEqual(['list_user_assets', 'search_user_assets', 'inspect_user_asset', 'resolve_user_asset_overlay']);
    expect(toolNames.map((toolName) => getChatToolMetadata(toolName)?.receiptLabel)).toEqual([
      'Listed uploaded assets',
      'Searched uploaded assets',
      'Inspected uploaded asset',
      'Resolved uploaded asset',
    ]);
    expect(getChatToolMetadata('resolve_user_asset_overlay')).toMatchObject({
      label: 'Resolving uploaded asset',
      shortLabel: 'Asset edit',
      receiptLabel: 'Resolved uploaded asset',
      mutatesProject: false,
      riskLevel: 'read',
    });
  });

  it('resolves uploaded logo asset placement into add_overlay params without mutating', () => {
    const logoCandidate: NormalizedAssetCandidate = {
      assetId: 'asset_logo',
      type: 'image',
      name: 'brand-logo-transparent.png',
      duration: undefined,
      dimensions: { width: 800, height: 240 },
      thumbnailHint: 'available',
      tags: ['logo', 'brand'],
      score: 0.92,
      confidence: 0.92,
      confidenceLabel: 'high',
      matchReasons: ['tag'],
      usedInProject: false,
      overlayIds: [],
      sceneIndexes: [],
      useWith: {
        tool: 'add_overlay',
        assetId: 'asset_logo',
        note: 'Use add_overlay with this assetId when placing this uploaded asset on the timeline.',
      },
    };

    const plan = resolveUserAssetOverlayPlacement(project, [logoCandidate], {
      query: 'Use my logo in the corner during the intro',
      minConfidence: 0.65,
    });

    expect(plan).toMatchObject({
      status: 'ready',
      inferredType: 'image',
      placement: 'corner',
      candidate: { assetId: 'asset_logo' },
      useWith: {
        add_overlay: {
          type: 'image',
          assetId: 'asset_logo',
          start: 0,
          duration: 90,
          styles: {
            objectFit: 'contain',
            opacity: 1,
          },
        },
      },
    });
    const addOverlay = plan.useWith?.add_overlay;
    expect(addOverlay).toBeDefined();
    if (!addOverlay) throw new Error('Expected placement resolution to authorize add_overlay.');
    expect(addOverlay.styles).not.toHaveProperty('animation');
    expect(addOverlay.x).toBeGreaterThan(900);
    expect(addOverlay.y).toBeGreaterThan(500);
    expect(addOverlay.width).toBeGreaterThanOrEqual(96);
    expect(addOverlay.height).toBeGreaterThanOrEqual(36);

    const constrainedPlan = resolveUserAssetOverlayPlacement(project, [logoCandidate], {
      query: 'a_portrait123',
      placement: 'corner',
      horizontal: 'right',
      vertical: 'bottom',
      startSeconds: 2,
      endSeconds: 6,
    });
    expect(constrainedPlan).toMatchObject({
      status: 'ready',
      useWith: {
        add_overlay: {
          assetId: 'asset_logo',
          start: 60,
          duration: 120,
        },
      },
    });
    expect(constrainedPlan.useWith?.add_overlay?.x).toBeGreaterThan(900);
    expect(constrainedPlan.useWith?.add_overlay?.y).toBeGreaterThan(500);

    const clippedPlan = resolveUserAssetOverlayPlacement(project, [logoCandidate], {
      query: 'a_portrait123',
      startSeconds: 9,
      endSeconds: 20,
    });
    expect(clippedPlan).toMatchObject({
      status: 'ready',
      useWith: {
        add_overlay: {
          start: 270,
          duration: 30,
        },
      },
    });

    const entirePlan = resolveUserAssetOverlayPlacement(project, [logoCandidate], {
      query: 'a_portrait123',
      timingAnchor: 'entire',
    });
    expect(entirePlan).toMatchObject({
      status: 'ready',
      useWith: {
        add_overlay: {
          start: 0,
          duration: 300,
        },
      },
    });

    const ambiguous = resolveUserAssetOverlayPlacement(project, [
      logoCandidate,
      { ...logoCandidate, assetId: 'asset_logo_alt', name: 'second-logo.png', confidence: 0.88, score: 0.88 },
    ], { query: 'Use my logo in the corner during the intro' });
    expect(ambiguous.status).toBe('ambiguous');
    expect(ambiguous.useWith).toBeUndefined();

    const lowConfidence = resolveUserAssetOverlayPlacement(project, [
      { ...logoCandidate, confidence: 0.4, score: 0.4, confidenceLabel: 'low' },
    ], { query: 'Use my logo in the corner during the intro' });
    expect(lowConfidence.status).toBe('low-confidence');
    expect(lowConfidence.useWith).toBeUndefined();

    const videoCandidate: NormalizedAssetCandidate = {
      ...logoCandidate,
      assetId: 'asset_embroidery',
      type: 'video',
      name: 'embroidery.mp4',
      duration: 12,
      confidence: 0.94,
      score: 0.94,
      confidenceLabel: 'high',
      useWith: {
        tool: 'use_matching_footage',
        assetId: 'asset_embroidery',
        note: 'Use when replacing an existing generated scene; provide the sceneIndex plus this assetId.',
      },
    };
    const replacement = resolveUserAssetOverlayPlacement(project, [videoCandidate], {
      query: 'Replace the selected scene with my embroidery clip',
      operation: 'replace',
      targetOverlayId: 17,
      sourceStartFrame: 24,
    });
    expect(replacement).toMatchObject({
      status: 'ready',
      operation: 'replace',
      useWith: {
        use_matching_footage: {
          overlayId: 17,
          assetId: 'asset_embroidery',
          sourceStartFrame: 24,
        },
      },
    });
    expect(replacement.useWith).not.toHaveProperty('add_overlay');

    const missingReplacementTarget = resolveUserAssetOverlayPlacement(project, [videoCandidate], {
      query: 'Replace a scene with my embroidery clip',
      operation: 'replace',
    });
    expect(missingReplacementTarget.status).toBe('no-target');
    expect(missingReplacementTarget.useWith).toBeUndefined();

    const conflictingReplacementTarget = resolveUserAssetOverlayPlacement(project, [videoCandidate], {
      query: 'Replace a scene with my embroidery clip',
      operation: 'replace',
      targetOverlayId: 17,
      targetSceneIndex: 2,
    });
    expect(conflictingReplacementTarget.status).toBe('conflicting-target');
    expect(conflictingReplacementTarget.useWith).toBeUndefined();

    const invalidReplacementSource = resolveUserAssetOverlayPlacement(project, [logoCandidate], {
      query: 'Replace this video with my logo',
      operation: 'replace',
      targetOverlayId: 17,
    });
    expect(invalidReplacementSource.status).toBe('unsupported-type');
    expect(invalidReplacementSource.useWith).toBeUndefined();
  });

  it('covers transcript moment search and transcript edit resolution with registry metadata without importing Mongo-backed tools', () => {
    const source = readFileSync(join(process.cwd(), 'lib/editron/agent/chat-transcript-tools.ts'), 'utf8');
    const toolNames = [...source.matchAll(/name:\s*["']([^"']+)["']/g)].map((match) => match[1]);

    expect(toolNames).toEqual(['find_transcript_moment', 'resolve_transcript_edit', 'resolve_sticker_overlay']);
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
    expect(getChatToolMetadata('resolve_sticker_overlay')).toMatchObject({
      label: 'Resolving sticker timing',
      shortLabel: 'Sticker timing',
      receiptLabel: 'Resolved sticker timing',
      mutatesProject: false,
      riskLevel: 'read',
    });
  });

  it('covers visual moment search, camera shake, speed ramp, fade, layer reorder, move/retime, and filter with registry metadata without importing Mongo-backed tools', () => {
    const source = readFileSync(join(process.cwd(), 'lib/editron/agent/chat-visual-tools.ts'), 'utf8');
    const toolNames = [...source.matchAll(/name:\s*["']([^"']+)["']/g)].map((match) => match[1]);

    expect(toolNames).toEqual(['find_visual_moment', 'resolve_visual_edit', 'resolve_keyframe_edit', 'apply_camera_shake', 'apply_speed_ramp', 'apply_fade', 'reorder_layer', 'move_retime_overlay', 'apply_filter', 'reframe_project']);
    expect(getChatToolMetadata('find_visual_moment')).toMatchObject({
      label: 'Finding visual moment',
      shortLabel: 'Find visual',
      receiptLabel: 'Found visual moment',
      mutatesProject: false,
      riskLevel: 'read',
    });
    expect(getChatToolMetadata('resolve_visual_edit')).toMatchObject({
      label: 'Resolving visual edit',
      shortLabel: 'Visual edit',
      receiptLabel: 'Resolved visual edit',
      mutatesProject: false,
      riskLevel: 'read',
    });
    expect(getChatToolMetadata('resolve_keyframe_edit')).toMatchObject({
      label: 'Resolving keyframes',
      shortLabel: 'Keyframes',
      receiptLabel: 'Resolved keyframes',
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
    expect(getChatToolMetadata('reframe_project')).toMatchObject({
      label: 'Reframing project',
      shortLabel: 'Reframe',
      receiptLabel: 'Reframed project',
      mutatesProject: true,
      requiresProjectReload: true,
      riskLevel: 'high',
      turnContract: { owner: 'mechanical-editor', evidenceStrategy: 'preflight' },
    });
  });

  it('persists one subject-aware reframe mutation with focal tracks and its audit receipt', async () => {
    const saveProject = async (_userId: string, _projectId: string, state: Record<string, any>) => {
      savedProject = state;
    };
    const updateProject = async (_userId: string, _projectId: string, updates: Record<string, unknown>) => {
      savedAudit = updates;
    };
    let savedProject: Record<string, any> | null = null;
    let savedAudit: Record<string, unknown> | null = null;
    const reframeProject = {
      projectId: 'proj-chat-reframe',
      fps: 30,
      durationInFrames: 90,
      aspectRatio: '16:9',
      playerDimensions: { width: 1920, height: 1080 },
      overlays: [{
        id: 41,
        type: 'video',
        assetId: 'asset-subject',
        from: 0,
        durationInFrames: 90,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        styles: { objectFit: 'cover' },
      }],
    };

    const plan = await applySubjectReframeMutation({
      userId: 'user-1',
      projectId: reframeProject.projectId,
      project: reframeProject,
      analyses: [{
        projectId: reframeProject.projectId,
        assetId: 'asset-subject',
        segmentAnalysis: {
          segments: [{
            startMs: 0,
            endMs: 3_000,
            transcript: { text: '' },
            visual: { mainSubject: { x: 0.65, y: 0.2, width: 0.2, height: 0.5 } },
            weight: { finalWeight: 0.8 },
          }],
        },
      }],
      targetAspectRatio: '9:16',
    }, {
      loadProject: async () => reframeProject,
      loadAnalyses: async () => [],
      saveProject,
      updateProject,
    });

    expect(plan).toMatchObject({ status: 'changed', subjectTrackedOverlayIds: [41] });
    expect(savedProject).toMatchObject({
      aspectRatio: '9:16',
      playerDimensions: { width: 1080, height: 1920 },
      overlays: [expect.objectContaining({
        id: 41,
        width: 1080,
        height: 1920,
        keyframeTracks: expect.arrayContaining([
          expect.objectContaining({ property: 'objectPositionX' }),
          expect.objectContaining({ property: 'objectPositionY' }),
        ]),
      })],
    });
    expect(savedAudit).toHaveProperty('intelligence.lastSubjectReframe');
  });

  it('covers audio moment search with registry metadata without importing Mongo-backed tools', () => {
    const source = readFileSync(join(process.cwd(), 'lib/editron/agent/chat-audio-tools.ts'), 'utf8');
    const toolNames = [...source.matchAll(/name:\s*["']([^"']+)["']/g)].map((match) => match[1]);

    expect(toolNames).toEqual(['find_audio_moment', 'resolve_audio_edit', 'apply_audio_ducking']);
    expect(getChatToolMetadata('find_audio_moment')).toMatchObject({
      label: 'Finding audio moment',
      shortLabel: 'Find audio',
      receiptLabel: 'Found audio moment',
      mutatesProject: false,
      riskLevel: 'read',
    });
    expect(getChatToolMetadata('resolve_audio_edit')).toMatchObject({
      label: 'Resolving audio edit',
      shortLabel: 'Audio edit',
      receiptLabel: 'Resolved audio edit',
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
        volume: AUDIO_LEVELS.BGM_WITHOUT_VO,
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

  it('resolves transcript-anchored sticker timing into generate_html_sticker params without mutating', () => {
    const words = makeTranscriptWords(['we', 'win', 'today'], 30);
    const plan = resolveStickerOverlayTiming(words, 'win', {
      description: 'small animated sparkle sticker',
      durationFrames: 60,
      width: 128,
      height: 128,
    });

    expect(plan).toMatchObject({
      status: 'ready',
      candidate: { text: 'win', startFrame: 36 },
      useWith: {
        generate_html_sticker: {
          start: 36,
          duration: 60,
          description: 'small animated sparkle sticker',
          x: '78%',
          y: '14%',
          width: 128,
          height: 128,
          enterAnimation: 'pop',
          exitAnimation: 'fade',
        },
      },
    });
    expect(plan.warnings).toContain('Using upper-right safe placement because transcript words do not provide screen coordinates.');

    const ambiguous = resolveStickerOverlayTiming(makeTimedTranscriptWords([
      ['win', 30, 36],
      ['again', 42, 48],
      ['win', 60, 66],
    ]), 'win');

    expect(ambiguous.status).toBe('ambiguous');
    expect(ambiguous.useWith).toBeUndefined();
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

  it('resolves visual highlight placement from a high-confidence bounding box fact', () => {
    const plan = resolveVisualEditPlacement({
      fps: 30,
      durationInFrames: 180,
      overlays: [{ id: 1, type: 'video', from: 0, durationInFrames: 180, assetId: 'asset_video' }],
      analysis: {
        keyframeAnalyses: [{
          frame: 96,
          subjects: [{
            label: 'logo',
            boundingBox: { x: 0.7, y: 0.1, width: 0.2, height: 0.12 },
            confidence: 0.92,
          }],
        }],
      },
    }, 'logo', {
      action: 'highlight',
      durationFrames: 36,
    });

    expect(plan).toMatchObject({
      status: 'ready',
      action: 'highlight',
      candidate: {
        text: 'logo',
        frame: 96,
        boundingBox: {
          x: 0.7,
          y: 0.1,
          width: 0.2,
          height: 0.12,
          units: 'normalized',
        },
      },
      useWith: {
        add_overlay: {
          type: 'shape',
          start: 96,
          duration: 36,
          x: '80%',
          y: '16%',
          width: '20%',
          height: '12%',
          styles: {
            fill: 'transparent',
            stroke: '#ffcc00',
            strokeWidth: 4,
            borderRadius: '10px',
            opacity: 0.95,
          },
        },
        visual_inspect_frame: {
          frame: 96,
        },
      },
    });
  });

  it('resolves a visual action into an exact speed-ramp authorization', () => {
    const plan = resolveVisualEditPlacement(project, 'logo appears on laptop', {
      action: 'speed_ramp',
    });

    expect(plan).toMatchObject({
      status: 'ready',
      action: 'speed_ramp',
      candidate: {
        frame: 96,
      },
      useWith: {
        apply_speed_ramp: {
          targetFrame: 96,
          durationFrames: 30,
        },
      },
    });
    expect(plan.useWith?.add_overlay).toBeUndefined();
    expect(plan.useWith?.set_keyframes).toBeUndefined();
  });

  it('refuses visual highlight placement when the visual fact has no bounding box', () => {
    const plan = resolveVisualEditPlacement(project, 'logo appears on laptop', {
      action: 'highlight',
    });

    expect(plan).toMatchObject({
      status: 'no-placement',
      action: 'highlight',
      candidate: {
        frame: 96,
      },
      useWith: {
        visual_inspect_frame: {
          frame: 96,
        },
      },
    });
    expect(plan.useWith?.add_overlay).toBeUndefined();
    expect(plan.message).toContain('no bounding box');
  });

  it('resolves selected clip zoom into set_keyframes params without mutating', () => {
    const plan = resolveKeyframeEditParams(project, {
      overlayId: 1,
      direction: 'in',
      startFrame: 90,
      endFrame: 120,
      scaleDelta: 0.5,
    });
    const conflict = resolveKeyframeEditParams({
      overlays: [{
        id: 10,
        type: 'video',
        from: 0,
        durationInFrames: 60,
        keyframeTracks: [{
          property: 'scale',
          keyframes: [
            { frame: 0, value: 1, easing: 'linear' },
            { frame: 30, value: 1.1, easing: 'ease-out' },
          ],
        }],
      }],
    }, { overlayId: 10 });
    const captionBlocked = resolveKeyframeEditParams(project, { overlayId: 2 });

    expect(plan).toMatchObject({
      status: 'ready',
      targetOverlayId: 1,
      startFrame: 90,
      endFrame: 120,
      localStartFrame: 90,
      localEndFrame: 120,
      direction: 'in',
      scaleDelta: 0.35,
      useWith: {
        set_keyframes: {
          overlayId: 1,
          property: 'scale',
          keyframes: [
            { frame: 90, value: 1, easing: 'ease-in-out' },
            { frame: 120, value: 1.35, easing: 'ease-out' },
          ],
        },
      },
    });
    expect(conflict).toMatchObject({
      status: 'conflict',
      targetOverlayId: 10,
    });
    expect(conflict.useWith).toBeUndefined();
    expect(conflict.message).toContain('already has scale keyframes');
    expect(captionBlocked).toMatchObject({
      status: 'conflict',
      targetOverlayId: 2,
    });
    expect(captionBlocked.useWith).toBeUndefined();
    expect(captionBlocked.message).toContain('captions/subtitles');
  });

  it('clamps a duration-derived zoom window to the selected clip but rejects an explicit overflow', () => {
    const shortProject = {
      durationInFrames: 57,
      overlays: [{
        id: 21,
        type: 'video',
        from: 0,
        durationInFrames: 57,
        row: 0,
      }],
    };

    const clamped = resolveKeyframeEditParams(shortProject, {
      overlayId: 21,
      direction: 'in',
      startFrame: 0,
      durationFrames: 60,
      scaleDelta: 0.08,
    });
    const explicitOverflow = resolveKeyframeEditParams(shortProject, {
      overlayId: 21,
      direction: 'in',
      startFrame: 0,
      endFrame: 60,
      scaleDelta: 0.08,
    });

    expect(clamped).toMatchObject({
      status: 'ready',
      targetOverlayId: 21,
      startFrame: 0,
      endFrame: 57,
      localStartFrame: 0,
      localEndFrame: 57,
      warnings: [
        'Requested 60-frame zoom was clamped to overlay 21 ending at frame 57.',
      ],
      useWith: {
        set_keyframes: {
          overlayId: 21,
          property: 'scale',
          keyframes: [
            { frame: 0, value: 1, easing: 'ease-in-out' },
            { frame: 57, value: 1.08, easing: 'ease-out' },
          ],
        },
      },
    });
    expect(explicitOverflow).toMatchObject({
      status: 'no-target',
      targetOverlayId: 21,
    });
    expect(explicitOverflow.message).toContain('outside overlay 21 frames 0-57');
  });

  it('resolves a grounded zoom frame through the atomic zoom-form owner', () => {
    const plan = resolveKeyframeEditParams(project, {
      targetFrame: 96,
      direction: 'in',
      evidenceModality: 'transcript',
      evidenceStrength: 0.86,
      scaleDelta: 0.12,
      focalPoint: { x: 0.745, y: 0.5 },
    });
    const keyframes = plan.useWith?.set_keyframes.keyframes ?? [];

    expect(plan).toMatchObject({
      status: 'ready',
      targetOverlayId: 1,
      direction: 'in',
      useWith: {
        set_keyframes: {
          overlayId: 1,
          property: 'scale',
          focalPoint: { x: 0.745, y: 0.5 },
        },
      },
    });
    expect(plan.message).toContain('atomic zoom-form owner');
    expect(keyframes.length).toBeGreaterThanOrEqual(2);
    expect(keyframes[0].frame).toBeLessThanOrEqual(96);
    expect(Math.max(...keyframes.map(({ value }) => value))).toBeCloseTo(1.12, 6);
  });

  it('fails closed when a grounded zoom frame has no unique active visual source', () => {
    const noSource = resolveKeyframeEditParams(project, {
      targetFrame: 240,
      direction: 'in',
      evidenceModality: 'visual',
      evidenceStrength: 0.9,
    });
    const ambiguous = resolveKeyframeEditParams({
      overlays: [
        { id: 10, type: 'video', row: 0, from: 0, durationInFrames: 120 },
        { id: 11, type: 'video', row: 0, from: 0, durationInFrames: 120 },
      ],
    }, {
      targetFrame: 60,
      direction: 'in',
      evidenceModality: 'audio',
      evidenceStrength: 0.9,
    });

    expect(noSource).toMatchObject({ status: 'no-target' });
    expect(noSource.message).toContain('No visual source is active');
    expect(noSource.useWith).toBeUndefined();
    expect(ambiguous).toMatchObject({ status: 'no-target' });
    expect(ambiguous.message).toContain('Multiple visual sources are active');
    expect(ambiguous.useWith).toBeUndefined();
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
    const plan = applySpeedRampToProject({
      ...project,
      overlays: project.overlays.map((overlay) => overlay.type === 'caption'
        ? {
            ...overlay,
            words: [{ word: 'Dialogue', startMs: 1000, endMs: 2000 }],
          }
        : overlay),
    }, {
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

  it('allows speed ramp inside a silent interval of a longer caption track', () => {
    const plan = applySpeedRampToProject({
      ...project,
      overlays: project.overlays.map((overlay) => overlay.type === 'caption'
        ? {
            ...overlay,
            words: [{ word: 'Earlier', startMs: 0, endMs: 500 }],
          }
        : overlay),
    }, {
      startFrame: 90,
      endFrame: 120,
      targetSpeed: 0.5,
    });

    expect(plan).toMatchObject({
      status: 'changed',
      startFrame: 90,
      endFrame: 120,
      targetOverlayId: 1,
    });
  });

  it('keeps untimed legacy caption tracks fail-closed', () => {
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

  it('plans fade in and out as one atomic opacity envelope', () => {
    const plan = applyFadeToProject(project, {
      overlayId: 4,
      direction: 'both',
      durationFrames: 12,
    });

    expect(plan).toMatchObject({
      status: 'changed',
      startFrame: 90,
      endFrame: 135,
      targetOverlayId: 4,
      updates: [{
        overlayId: 4,
        localStartFrame: 0,
        localEndFrame: 45,
        previousKeyframeTrackCount: 0,
        fromOpacity: 0,
        toOpacity: 1,
        reason: 'semantic-fade-both',
      }],
    });

    const opacityTrack = plan.updates[0].nextKeyframeTracks.find((track: any) => track.property === 'opacity');
    expect(opacityTrack).toEqual({
      property: 'opacity',
      keyframes: [
        { frame: 0, value: 0, easing: 'ease-out' },
        { frame: 12, value: 1, easing: 'linear' },
        { frame: 33, value: 1, easing: 'ease-in' },
        { frame: 45, value: 0, easing: 'linear' },
      ],
      metadata: { family: 'fade', source: 'apply_fade', direction: 'both' },
    });
  });

  it('caps a two-sided fade to short overlays and refuses an impossible one-frame envelope', () => {
    const shortPlan = applyFadeToProject({
      durationInFrames: 2,
      overlays: [{ id: 40, type: 'text', from: 0, durationInFrames: 2, content: 'Cut' }],
    }, {
      overlayId: 40,
      direction: 'both',
      durationFrames: 20,
    });

    expect(shortPlan.status).toBe('changed');
    expect(shortPlan.updates[0].nextKeyframeTracks[0].keyframes).toEqual([
      { frame: 0, value: 0, easing: 'ease-out' },
      { frame: 1, value: 1, easing: 'ease-in' },
      { frame: 2, value: 0, easing: 'linear' },
    ]);

    expect(applyFadeToProject({
      durationInFrames: 1,
      overlays: [{ id: 41, type: 'text', from: 0, durationInFrames: 1, content: 'Cut' }],
    }, {
      overlayId: 41,
      direction: 'both',
    })).toMatchObject({
      status: 'no-target',
      targetOverlayId: 41,
      updates: [],
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

  it('does not stack a second opacity owner over renderer-owned fade motion', () => {
    const projectWithRendererFade = {
      durationInFrames: 80,
      overlays: [{
        id: 21,
        type: 'text',
        from: 10,
        durationInFrames: 40,
        content: 'CTA',
        styles: {
          color: '#ffffff',
          animation: { enter: 'fade', exit: 'fade', duration: 15 },
        },
      }],
    };

    expect(applyFadeToProject(projectWithRendererFade, {
      overlayId: 21,
      direction: 'both',
    })).toMatchObject({
      status: 'no-target',
      targetOverlayId: 21,
      updates: [],
      message: 'Overlay 21 already has the requested renderer fade.',
    });

    const replacement = applyFadeToProject(projectWithRendererFade, {
      overlayId: 21,
      direction: 'both',
      durationFrames: 10,
      replaceExistingOpacityKeyframes: true,
    });
    expect(replacement).toMatchObject({
      status: 'changed',
      targetOverlayId: 21,
      updates: [{
        overlayId: 21,
        nextStyles: {
          color: '#ffffff',
          animation: { duration: 15 },
        },
      }],
    });
  });

  it('plans layer reorder as a row-only move when the requested relation is not satisfied', () => {
    const plan = applyLayerReorderToProject({
      overlays: [
        { id: 30, type: 'image', from: 90, durationInFrames: 60, row: 0, content: 'Logo mark' },
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
        previousRow: 0,
        nextRow: 2,
        referenceOverlayId: 31,
        relation: 'behind',
        reason: 'semantic-layer-reorder',
      }],
    });
    expect(plan.message).toContain('Moved overlay 30 from row 0 to row 2');
  });

  it('returns a semantic no-op when the requested layer relation is already true', () => {
    const projectWithSatisfiedRelations = {
      overlays: [
        { id: 30, type: 'text', from: 0, durationInFrames: 60, row: 0, content: 'Title' },
        { id: 31, type: 'image', from: 0, durationInFrames: 60, row: 2, content: 'Photo' },
        { id: 32, type: 'shape', from: 0, durationInFrames: 60, row: 4, content: 'Background' },
      ],
    };

    expect(applyLayerReorderToProject(projectWithSatisfiedRelations, {
      overlayId: 30,
      referenceOverlayId: 31,
      relation: 'in-front-of',
    })).toMatchObject({
      status: 'no-target',
      targetOverlayId: 30,
      referenceOverlayId: 31,
      updates: [],
      message: 'Overlay 30 is already in front of reference overlay 31.',
    });

    expect(applyLayerReorderToProject(projectWithSatisfiedRelations, {
      overlayId: 32,
      relation: 'back',
    })).toMatchObject({
      status: 'no-target',
      targetOverlayId: 32,
      updates: [],
      message: 'Overlay 32 is already behind every other ordinary layer.',
    });
  });

  it('refuses layer reorder into an occupied overlapping row unless explicitly allowed', () => {
    const plan = applyLayerReorderToProject({
      overlays: [
        { id: 30, type: 'image', from: 90, durationInFrames: 70, row: 0, content: 'Logo mark' },
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

  it('resolves audio references into safe edit operation params', () => {
    const impact = resolveAudioEditTiming(project, 'add impact on the first beat drop', {
      action: 'add_sfx',
    });
    const silenceCut = resolveAudioEditTiming(project, 'cut the long silence', {
      action: 'cut_section',
    });
    const cameraShake = resolveAudioEditTiming(project, 'shake on the first beat drop', {
      action: 'camera_shake',
    });
    const invalidCameraShake = resolveAudioEditTiming(project, 'shake on the long silence', {
      action: 'camera_shake',
    });
    const invalidBeatSync = resolveAudioEditTiming(project, 'sync cuts to the long silence', {
      action: 'sync_cuts_to_beats',
    });
    const missing = resolveAudioEditTiming(project, 'add impact on the air horn', {
      action: 'add_sfx',
      minConfidence: 0.99,
    });

    expect(impact).toMatchObject({
      status: 'ready',
      action: 'add_sfx',
      candidate: {
        audioKind: 'beat-drop',
        frame: 90,
      },
      useWith: {
        add_sfx: {
          query: 'impact hit',
          frame: 90,
          sync: 'audio-anchor',
        },
      },
    });
    expect(impact.warnings[0]).toContain('first audio reference');
    expect(silenceCut).toMatchObject({
      status: 'ready',
      action: 'cut_section',
      candidate: {
        audioKind: 'silence',
      },
      useWith: {
        cut_section: {
          startFrame: 36,
          endFrame: 66,
        },
      },
    });
    expect(cameraShake).toMatchObject({
      status: 'ready',
      action: 'camera_shake',
      candidate: {
        audioKind: 'beat-drop',
        frame: 90,
      },
      useWith: {
        apply_camera_shake: {
          targetFrame: 90,
        },
      },
    });
    expect(invalidCameraShake).toMatchObject({
      status: 'unsupported',
      action: 'camera_shake',
      candidate: {
        audioKind: 'silence',
      },
    });
    expect(invalidBeatSync).toMatchObject({
      status: 'unsupported',
      action: 'sync_cuts_to_beats',
      candidate: {
        audioKind: 'silence',
      },
    });
    expect(missing).toMatchObject({
      status: 'no-match',
      action: 'add_sfx',
      searchedCandidateCount: 0,
    });
  });

  it('resolves the first qualifying downbeat after a server-resolved reference frame', () => {
    const relativeProject = {
      ...project,
      analysis: {
        ...project.analysis,
        audio: {
          ...project.analysis.audio,
          beats: [
            { timestampMs: 1000, strength: 0.96, beatType: 'downbeat' },
            { timestampMs: 3000, strength: 0.95, beatType: 'downbeat' },
            { timestampMs: 5000, strength: 0.94, beatType: 'downbeat' },
          ],
        },
      },
    };

    const resolution = resolveAudioEditTiming(relativeProject, 'strong downbeat', {
      action: 'add_sfx',
      sfxQuery: 'restrained impact sound',
      temporalConstraint: {
        referenceFrame: 100,
        relation: 'after',
        occurrence: 'first',
      },
    });
    const missing = resolveAudioEditTiming(relativeProject, 'strong downbeat', {
      action: 'add_sfx',
      temporalConstraint: {
        referenceFrame: 200,
        relation: 'after',
        occurrence: 'first',
      },
    });

    expect(resolution).toMatchObject({
      status: 'ready',
      candidate: { audioKind: 'downbeat', frame: 150 },
      useWith: {
        add_sfx: {
          query: 'restrained impact sound',
          frame: 150,
        },
      },
    });
    expect(resolution.warnings).toContain(
      'Selected the first qualifying audio candidate after reference frame 100.',
    );
    expect(missing).toMatchObject({
      status: 'no-match',
      candidates: [],
    });
  });

  it('ranks measured impact strength without lexical ambiguity or confidence-as-intensity', () => {
    const rankedProject = {
      fps: 30,
      durationInFrames: 600,
      overlays: [{
        id: 'audio-evidence',
        type: 'sound',
        from: 0,
        durationInFrames: 600,
        metadata: {
          audioAnalysis: {
            transients: [
              { timestampMs: 3000, strength: 0.72, confidence: 0.99 },
              { timestampMs: 7000, strength: 1, confidence: 0.81 },
            ],
          },
          beatGrid: {
            beats: [
              { frame: 30, confidence: 1 },
              { frame: 60, strength: 0.64 },
            ],
          },
        },
      }],
    };

    const candidates = findStrongestImpactEmphasisCandidates(rankedProject);
    expect(candidates[0]).toMatchObject({
      frame: 210,
      audioKind: 'transient',
      signalStrength: 1,
      matchType: 'signal-ranked',
      safeForAutoEdit: true,
      useWith: {
        apply_camera_shake: {
          targetFrame: 210,
        },
      },
    });
    expect(candidates.some((candidate) => candidate.frame === 30)).toBe(false);
  });

  it('refuses an exact tie between distinct strongest measured impacts', () => {
    const tiedProject = {
      fps: 30,
      durationInFrames: 300,
      analysis: {
        audio: {
          transients: [
            { frame: 60, strength: 0.9 },
            { frame: 180, strength: 0.9 },
          ],
        },
      },
    };

    const candidates = findStrongestImpactEmphasisCandidates(tiedProject);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      signalStrength: 0.9,
      safeForAutoEdit: false,
    });
    expect(candidates[1]).toMatchObject({
      signalStrength: 0.9,
      safeForAutoEdit: false,
    });
  });

  it('preserves audio resolver terminal outcomes instead of reporting safe refusals as errors', () => {
    const ready = buildAudioEditResolutionEnvelope({
      status: 'ready',
      action: 'add_sfx',
      query: 'first beat',
      searchedCandidateCount: 1,
      candidates: [],
      warnings: [],
      message: 'Ready.',
    });
    const ambiguous = buildAudioEditResolutionEnvelope({
      status: 'ambiguous',
      action: 'add_sfx',
      query: 'a beat',
      searchedCandidateCount: 2,
      candidates: [],
      warnings: ['Two equal candidates.'],
      message: 'Choose a beat.',
    });
    const missing = buildAudioEditResolutionEnvelope({
      status: 'no-match',
      action: 'add_sfx',
      query: 'air horn',
      searchedCandidateCount: 0,
      candidates: [],
      warnings: [],
      message: 'No match.',
    });
    const unsupported = buildAudioEditResolutionEnvelope({
      status: 'unsupported',
      action: 'camera_shake',
      query: 'long silence',
      searchedCandidateCount: 1,
      candidates: [],
      warnings: [],
      message: 'Not a point-like anchor.',
    });

    expect(ready).toMatchObject({
      status: 'success',
      error: null,
      nextAction: 'continue',
    });
    expect(ambiguous).toMatchObject({
      status: 'needs-choice',
      error: null,
      nextAction: 'ask_clarification',
    });
    expect(missing).toMatchObject({
      status: 'declined',
      error: null,
      nextAction: 'stop',
    });
    expect(unsupported).toMatchObject({
      status: 'declined',
      error: null,
      nextAction: 'stop',
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
