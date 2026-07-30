import { describe, expect, it } from 'vitest';

import { getChatEditBattleScenario } from '@/lib/editron/services/chat-edit-battle-harness';
import { planChatBattleFixture } from '@/lib/editron/services/chat-edit-battle-fixture-plan';
import {
  cloneChatBattleAnalysisDocuments,
  cloneChatBattleUploadBatch,
  inspectChatBattleFixtureCapabilities,
  prepareChatBattleFixture,
} from '@/lib/editron/services/chat-edit-battle-fixtures';

const NOW = new Date('2026-07-18T12:00:00.000Z');

describe('chat edit battle fixtures', () => {
  it('maps commands to sources with the prerequisites their real tool paths need', () => {
    expect(plan('selected-overlay-edit')).toMatchObject({ profile: 'mixed', selectedOverlayType: 'text' });
    expect(plan('spoken-phrase-devanagari')).toMatchObject({
      profile: 'speech',
      sourceProjectId: 'proj_FYZeVGomJuSh',
      seedTranscript: true,
      soundOverlayPolicy: 'remove',
      nativeAudioPolicy: 'mute-embedded-for-seeded-transcript',
    });
    expect(plan('mixed-multi-step')).toMatchObject({
      profile: 'audio',
      soundOverlayPolicy: 'preserve-all',
      nativeAudioPolicy: 'preserve',
    });
    expect(plan('replace-selected-sfx')).toMatchObject({
      profile: 'sfx',
      sourceProjectId: 'proj_chatbattle_impact_audio_v1',
      selectedOverlayType: 'sound',
      selectedOverlayRole: 'sfx',
      soundOverlayPolicy: 'preserve-sfx-only',
    });
    expect(plan('edit-html-scene')).toMatchObject({ profile: 'generated-scene', selectedOverlayType: 'html-scene' });
    expect(plan('explicit-asset')).toMatchObject({ requestedAssetAlias: 'explicit-image' });
    expect(plan('place-uploaded-asset')).toMatchObject({
      requestedAssetAlias: 'portrait-image',
      selectedOverlayType: undefined,
    });
    expect(plan('replace-with-uploaded-footage')).toMatchObject({
      requestedAssetAlias: 'embroidery-video',
      selectedOverlayType: 'video',
    });
    expect(plan('selected-dialogue-dubbing')).toMatchObject({
      profile: 'dubbing',
      sourceProjectId: 'proj_FYZeVGomJuSh',
      selectedOverlayType: 'video',
      seedTranscript: false,
    });
    expect(plan('spoken-phrase-english')).toMatchObject({
      profile: 'speech',
      sourceProjectId: 'proj_FYZeVGomJuSh',
      seedTranscript: true,
    });
    expect(plan('vertical-subject-reframe')).toMatchObject({ profile: 'visual-multi-asset' });
    expect(plan('visual-object-paraphrase')).toMatchObject({
      requiredSourceCapabilities: ['semantic-visual'],
    });
    expect(plan('vertical-subject-reframe')).toMatchObject({
      requiredSourceCapabilities: ['spatial-visual-all-video-assets'],
    });
    expect(plan('multiasset-script-chat')).toMatchObject({
      requiresUploadBatchClone: true,
      requiredSourceCapabilities: ['multi-asset', 'semantic-visual-all-video-assets'],
    });
    expect(plan('close-timeline-gaps')).toMatchObject({ seedTimelineGapFrames: 30 });
    expect(plan('reorder-overlay-layer')).toMatchObject({
      selectedOverlayType: 'text',
      alignSelectedWithOverlayType: 'image',
    });
    expect(plan('selected-overlay-edit')).toMatchObject({ requiredSourceCapabilities: [] });
    expect(getChatEditBattleScenario('place-uploaded-asset')?.requiredToolSequence).toEqual([
      ['read_project_file', 'get_timeline_view'],
      'resolve_user_asset_overlay',
      'add_overlay',
    ]);
    expect(getChatEditBattleScenario('replace-with-uploaded-footage')?.requiredToolSequence).toEqual([
      ['read_project_file', 'get_timeline_view'],
      'resolve_user_asset_overlay',
      'use_matching_footage',
    ]);
  });

  it('rejects semantically blind visual fixtures before they can produce false product failures', () => {
    const report = inspectChatBattleFixtureCapabilities({
      sourceProject: sourceProject(),
      sourceAnalyses: [{
        projectId: 'source-project',
        assetId: 'video-asset',
        segmentAnalysis: { segments: [{ semanticVisual: null }] },
      }],
      required: ['semantic-visual'],
    });

    expect(report).toMatchObject({
      ok: false,
      missing: ['semantic-visual'],
      videoAssetIds: ['video-asset'],
      semanticVisualAssetIds: [],
    });
  });

  it('requires time-localized semantic and spatial truth for every used video in multi-asset fixtures', () => {
    const source = sourceProject();
    source.sourceAssetIds = ['video-asset', 'video-asset-2', 'image-asset'];
    source.overlays.push({
      id: 'video-2',
      type: 'video',
      from: 300,
      durationInFrames: 300,
      assetId: 'video-asset-2',
    });
    const analyses = [
      visualAnalysis('video-asset'),
      visualAnalysis('video-asset-2'),
    ];

    expect(inspectChatBattleFixtureCapabilities({
      sourceProject: source,
      sourceAnalyses: analyses,
      required: ['multi-asset', 'semantic-visual-all-video-assets', 'spatial-visual-all-video-assets'],
    })).toMatchObject({
      ok: true,
      missing: [],
      videoAssetIds: ['video-asset', 'video-asset-2'],
      semanticVisualAssetIds: ['video-asset', 'video-asset-2'],
      spatialVisualAssetIds: ['video-asset', 'video-asset-2'],
    });

    expect(inspectChatBattleFixtureCapabilities({
      sourceProject: source,
      sourceAnalyses: [analyses[0]],
      required: ['semantic-visual-all-video-assets', 'spatial-visual-all-video-assets'],
    })).toMatchObject({
      ok: false,
      missing: ['semantic-visual-all-video-assets', 'spatial-visual-all-video-assets'],
    });
  });

  it('clones without mutating source truth and removes stale render verdicts', () => {
    const source = sourceProject();
    const snapshot = structuredClone(source);
    const prepared = prepareChatBattleFixture({
      sourceProject: source,
      fixtureProjectId: 'proj_chatbattle_clone1',
      plan: plan('selected-overlay-edit'),
      now: NOW,
    });

    expect(source).toEqual(snapshot);
    expect(prepared.project).toMatchObject({
      projectId: 'proj_chatbattle_clone1',
      status: 'ready',
      metadata: { battleTest: { disposable: true, scenarioId: 'selected-overlay-edit' } },
    });
    expect(prepared.project).not.toHaveProperty('_id');
    expect(prepared.project).not.toHaveProperty('qualityReview');
    expect(prepared.project.intelligence).not.toHaveProperty('phase0RenderedStillEvidence');
    expect(prepared.selectedOverlayId).toBe('title-1');
    expect(prepared.clientContext).toMatchObject({ selectedOverlayId: 'title-1', activePanel: 'ai-chat' });
    expect(overlays(prepared.project).some((overlay) => overlay.type === 'sound')).toBe(false);
  });

  it('seeds a real main-video gap only for the gap-closing scenario', () => {
    const source = sourceProject();
    source.overlays.push({
      id: 'video-2',
      type: 'video',
      from: 900,
      durationInFrames: 120,
      row: 0,
      assetId: 'video-asset-2',
    });
    source.durationInFrames = 1_020;
    const snapshot = structuredClone(source);
    const prepared = prepareChatBattleFixture({
      sourceProject: source,
      fixtureProjectId: 'proj_chatbattle_gap1',
      plan: plan('close-timeline-gaps'),
      now: NOW,
    });
    const videos = overlays(prepared.project).filter((overlay) => overlay.type === 'video');

    expect(source).toEqual(snapshot);
    expect(videos[1].from).toBe(930);
    expect(prepared.project.durationInFrames).toBe(1_050);
  });

  it('makes the selected title and image overlap for a meaningful layer-order test', () => {
    const source = sourceProject();
    const snapshot = structuredClone(source);
    const prepared = prepareChatBattleFixture({
      sourceProject: source,
      fixtureProjectId: 'proj_chatbattle_layer1',
      plan: plan('reorder-overlay-layer'),
      now: NOW,
    });
    const preparedOverlays = overlays(prepared.project);
    const selected = preparedOverlays.find((overlay) => overlay.id === prepared.selectedOverlayId);
    const image = preparedOverlays.find((overlay) => overlay.type === 'image');

    expect(source).toEqual(snapshot);
    expect(selected).toMatchObject({ type: 'text' });
    expect(image).toMatchObject({
      from: selected?.from,
      durationInFrames: selected?.durationInFrames,
    });
  });

  it('fails fixture preflight immediately when an audio scenario inherits unlicensed sound', () => {
    const source = sourceProject();
    const backgroundMusic = overlays(source).find((overlay) => overlay.type === 'sound');
    if (!backgroundMusic) throw new Error('Expected sound fixture.');
    backgroundMusic.row = 1;
    expect(() => prepareChatBattleFixture({
      sourceProject: source,
      fixtureProjectId: 'proj_chatbattle_audio_rights1',
      plan: plan('mixed-multi-step'),
      now: NOW,
    })).toThrow(/unrenderable audio required by mixed-multi-step/);
  });

  it('fails fixture preflight when retained video embeds unlicensed native audio', () => {
    const source = sourceProject();
    const video = overlays(source).find((overlay) => overlay.type === 'video');
    if (!video) throw new Error('Expected video fixture.');
    video.hasNativeAudio = true;
    delete video.audioRights;

    expect(() => prepareChatBattleFixture({
      sourceProject: source,
      fixtureProjectId: 'proj_chatbattle_native_audio_rights1',
      plan: plan('selected-overlay-edit'),
      now: NOW,
    })).toThrow(/embedded native audio has no durable rights receipt/);
  });

  it('preserves attested native dialogue alongside independently licensed music', () => {
    const source = sourceProject();
    const video = overlays(source).find((overlay) => overlay.type === 'video');
    const music = overlays(source).find((overlay) => overlay.type === 'sound');
    if (!video) throw new Error('Expected video fixture.');
    if (!music) throw new Error('Expected music fixture.');
    video.hasNativeAudio = true;
    video.src = 'https://assets.example/video.mp4';
    video.audioRights = nativeAudioRights('video-asset');
    music.row = 1;
    music.src = 'https://assets.example/music.wav';
    music.audioRights = musicRights('audio-asset');
    music.musicRights = musicRights('audio-asset');

    const prepared = prepareChatBattleFixture({
      sourceProject: source,
      fixtureProjectId: 'proj_chatbattle_explicit_audio1',
      plan: plan('bgm-explicit'),
      now: NOW,
    });
    const preparedVideo = overlays(prepared.project).find((overlay) => overlay.type === 'video');

    expect(preparedVideo).toMatchObject({
      hasNativeAudio: true,
      audioRights: expect.objectContaining({
        mediaRole: 'native-video',
        licensed: true,
      }),
    });
    expect(overlays(prepared.project).some((overlay) => overlay.type === 'sound')).toBe(true);
  });

  it('requires independently renderable dialogue, music, beats, speech timing, and SFX', () => {
    const source = audioCapabilityProject();
    const report = inspectChatBattleFixtureCapabilities({
      sourceProject: source,
      sourceAnalyses: [{
        assetId: 'video-asset',
        rawFootageAnalysis: {
          transcription: {
            words: [{ word: 'hello', startMs: 0, endMs: 400 }],
          },
        },
      }],
      required: [
        'renderable-native-audio',
        'speech-timing',
        'renderable-music',
        'music-beat-grid',
        'renderable-sfx',
      ],
    });

    expect(report).toMatchObject({
      ok: true,
      missing: [],
      renderableNativeAudioAssetIds: ['video-asset'],
      renderableMusicOverlayIds: ['sound-1'],
      musicBeatGridOverlayIds: ['sound-1'],
      renderableSfxOverlayIds: ['sfx-1'],
      speechTimingAssetIds: ['video-asset'],
    });
  });

  it('rejects playable-looking audio without durable rights or grounded timing', () => {
    const source = audioCapabilityProject();
    const video = overlays(source).find((overlay) => overlay.type === 'video');
    const music = overlays(source).find((overlay) => overlay.id === 'sound-1');
    const sfx = overlays(source).find((overlay) => overlay.id === 'sfx-1');
    const caption = overlays(source).find((overlay) => overlay.type === 'caption');
    if (!video || !music || !sfx || !caption) {
      throw new Error('Expected complete audio capability fixture.');
    }
    delete video.audioRights;
    delete music.audioRights;
    delete music.musicRights;
    delete music.metadata;
    delete sfx.audioRights;
    caption.words = [];

    const report = inspectChatBattleFixtureCapabilities({
      sourceProject: source,
      sourceAnalyses: [],
      required: [
        'renderable-native-audio',
        'speech-timing',
        'renderable-music',
        'music-beat-grid',
        'renderable-sfx',
      ],
    });

    expect(report).toMatchObject({
      ok: false,
      missing: [
        'renderable-native-audio',
        'speech-timing',
        'renderable-music',
        'music-beat-grid',
        'renderable-sfx',
      ],
    });
  });

  it('mutes embedded audio for synthetic transcript fixtures without retaining source sounds', () => {
    const source = sourceProject();
    const video = overlays(source).find((overlay) => overlay.type === 'video');
    if (!video) throw new Error('Expected video fixture.');
    video.hasNativeAudio = true;
    delete video.audioRights;

    const prepared = prepareChatBattleFixture({
      sourceProject: source,
      fixtureProjectId: 'proj_chatbattle_seeded_speech1',
      plan: plan('batch-caption-edit'),
      now: NOW,
    });
    const preparedVideo = overlays(prepared.project).find((overlay) => overlay.type === 'video');
    const preparedCaption = overlays(prepared.project).find((overlay) => overlay.type === 'caption');

    expect(preparedVideo).toMatchObject({
      hasNativeAudio: false,
      metadata: {
        battleFixtureAudio: {
          embeddedNativeAudio: 'muted',
          reason: 'synthetic-transcript-fixture',
        },
      },
    });
    expect(overlays(prepared.project).some((overlay) => overlay.type === 'sound')).toBe(false);
    expect(preparedCaption).toBeDefined();
    expect(preparedCaption?.captions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        text: expect.any(String),
        startMs: expect.any(Number),
        endMs: expect.any(Number),
        words: expect.any(Array),
      }),
    ]));
    for (const group of preparedCaption?.captions as Array<{
      startMs: number;
      endMs: number;
      words: unknown[];
    }>) {
      const durationSeconds = (group.endMs - group.startMs) / 1_000;
      const requiredSeconds = 0.35 + (group.words.length / 3.2);
      expect(durationSeconds + 0.05).toBeGreaterThanOrEqual(requiredSeconds);
    }
  });

  it('preserves and selects only a real SFX for the replacement scenario', () => {
    const source = sourceProject();
    const genericSound = overlays(source).find((overlay) => overlay.type === 'sound');
    if (!genericSound) throw new Error('Expected sound fixture.');
    genericSound.assetId = 'sfx_lib_fixture';
    genericSound.src = 'https://assets.example/paper.wav';
    genericSound.role = 'sfx';
    genericSound.audioRights = generatedSfxRights('sfx_lib_fixture');
    source.overlays.push({
      id: 'unlicensed-bgm',
      type: 'sound',
      from: 0,
      durationInFrames: 900,
      row: 1,
      assetId: 'bgm_fixture',
    });

    const prepared = prepareChatBattleFixture({
      sourceProject: source,
      fixtureProjectId: 'proj_chatbattle_sfx1',
      plan: plan('replace-selected-sfx'),
      now: NOW,
    });
    const sounds = overlays(prepared.project).filter((overlay) => overlay.type === 'sound');

    expect(sounds).toHaveLength(1);
    expect(sounds[0]).toMatchObject({ id: 'sound-1', assetId: 'sfx_lib_fixture' });
    expect(prepared.selectedOverlayId).toBe('sound-1');
  });

  it('seeds exact multilingual and speech-anchor words as timed caption truth', () => {
    const prepared = prepareChatBattleFixture({
      sourceProject: sourceProject(),
      fixtureProjectId: 'proj_chatbattle_speech1',
      plan: plan('spoken-phrase-devanagari'),
      now: NOW,
    });
    const caption = overlays(prepared.project).find((overlay) => overlay.type === 'caption');
    const tokens = (caption?.words as Array<{ word: string }>).map((word) => word.word);

    expect(tokens.join(' ')).toContain('pricing is simple');
    expect(tokens.join(' ')).toContain('कीमत आसान है');
    expect(tokens.join(' ')).toContain('this is the key point');
    expect(caption?.metadata).toMatchObject({ battleFixtureTranscript: true });
    expect(prepared.transcriptAssetAlias).toMatchObject({
      sourceAssetId: 'video-asset',
      fixtureAssetId: 'battle_proj_chatbattle_speech1',
      transcription: {
        transcript: expect.stringContaining('pricing is simple'),
        language: 'multilingual-fixture',
      },
    });
    expect(overlays(prepared.project).find((overlay) => overlay.type === 'video')?.assetId)
      .toBe('battle_proj_chatbattle_speech1');
  });

  it('removes captions only for add-caption cases and keeps the source unchanged', () => {
    const source = sourceProject();
    const prepared = prepareChatBattleFixture({
      sourceProject: source,
      fixtureProjectId: 'proj_chatbattle_caption1',
      plan: plan('plain-caption-track'),
      now: NOW,
    });
    expect(overlays(prepared.project).some((overlay) => overlay.type === 'caption')).toBe(false);
    expect(overlays(source).some((overlay) => overlay.type === 'caption')).toBe(true);
    expect(prepared.transcriptAssetAlias).toMatchObject({
      sourceAssetId: 'video-asset',
      fixtureAssetId: 'battle_proj_chatbattle_caption1',
      transcription: {
        transcript: expect.stringContaining('pricing is simple'),
        language: 'multilingual-fixture',
      },
    });
    expect(overlays(prepared.project).find((overlay) => overlay.type === 'video')?.assetId)
      .toBe('battle_proj_chatbattle_caption1');
  });

  it('fails loudly when a selected-overlay command has no compatible overlay', () => {
    const source = sourceProject();
    source.overlays = overlays(source).filter((overlay) => overlay.type !== 'text');
    expect(() => prepareChatBattleFixture({
      sourceProject: source,
      fixtureProjectId: 'proj_chatbattle_invalid1',
      plan: plan('selected-overlay-edit'),
      now: NOW,
    })).toThrow(/has no text overlay/);
  });

  it('seeds a trusted selected video target for uploaded-footage replacement', () => {
    const prepared = prepareChatBattleFixture({
      sourceProject: sourceProject(),
      fixtureProjectId: 'proj_chatbattle_replace1',
      plan: plan('replace-with-uploaded-footage'),
      now: NOW,
    });

    expect(prepared.selectedOverlayId).toBe('video-1');
    expect(prepared.clientContext).toMatchObject({
      selectedOverlayId: 'video-1',
      selectedRange: {
        startFrame: 0,
        endFrame: 900,
        source: 'selected-overlay',
      },
    });
  });

  it('clones analysis documents without retaining ids or changing originals', () => {
    const analyses = [{ _id: 'mongo-id', projectId: 'source', assetId: 'asset-1', segmentAnalysis: { segments: [1] } }];
    const snapshot = structuredClone(analyses);
    const cloned = cloneChatBattleAnalysisDocuments(analyses, 'proj_chatbattle_analysis1', NOW);

    expect(analyses).toEqual(snapshot);
    expect(cloned).toEqual([{
      projectId: 'proj_chatbattle_analysis1',
      assetId: 'asset-1',
      segmentAnalysis: { segments: [1] },
      createdAt: NOW,
      updatedAt: NOW,
    }]);
  });

  it('keeps cloned media and analysis transcript truth aligned for seeded speech cases', () => {
    const source = sourceProject();
    const prepared = prepareChatBattleFixture({
      sourceProject: source,
      fixtureProjectId: 'proj_chatbattle_analysis_speech1',
      plan: plan('spoken-phrase-english'),
      now: NOW,
    });
    const analyses = [{
      _id: 'analysis-source-id',
      projectId: 'source-project',
      assetId: 'video-asset',
      rawFootageAnalysis: {
        transcription: {
          transcript: 'I look at you.',
          words: [{ word: 'I', startMs: 500, endMs: 700, confidence: 0.9 }],
        },
      },
      segmentAnalysis: {
        segments: [{
          startMs: 0,
          endMs: 6_000,
          transcript: { text: 'I look at you.' },
          visual: { motionIntensity: 0.4 },
        }],
      },
    }];
    const snapshot = structuredClone(analyses);
    const cloned = cloneChatBattleAnalysisDocuments(
      analyses,
      'proj_chatbattle_analysis_speech1',
      NOW,
      prepared.transcriptAssetAlias,
    );

    expect(analyses).toEqual(snapshot);
    expect(cloned[0]).toMatchObject({
      projectId: 'proj_chatbattle_analysis_speech1',
      assetId: 'battle_proj_chatbattle_analysis_speech1',
      rawFootageAnalysis: {
        transcription: {
          transcript: expect.stringContaining('pricing is simple'),
          language: 'multilingual-fixture',
        },
      },
      segmentAnalysis: {
        segments: [{
          transcript: { text: expect.stringContaining('pricing is simple') },
          visual: { motionIntensity: 0.4 },
        }],
      },
    });
    expect(cloned[0]).not.toHaveProperty('_id');
  });

  it('clones upload batches under fixture ownership without stale orchestration output', () => {
    const source = {
      _id: 'mongo-batch-id',
      uploadBatchId: 'source-batch',
      projectId: 'source-project',
      userId: 'user-1',
      assetIds: ['asset-1'],
      assetsById: { YXNzZXQtMQ: { assetId: 'asset-1', analysisStatus: 'complete' } },
      lastChatScriptIntentId: 'old-intent',
      orchestrationLeaseUntil: NOW,
      orchestrationMessageId: 'old-message',
      deliverables: [{ projectId: 'old-output' }],
    };
    const snapshot = structuredClone(source);
    const clone = cloneChatBattleUploadBatch(
      source,
      'proj_chatbattle_script1',
      'upload_batch_cb_script1',
      NOW,
    );

    expect(source).toEqual(snapshot);
    expect(clone).toMatchObject({
      uploadBatchId: 'upload_batch_cb_script1',
      projectId: 'proj_chatbattle_script1',
      userId: 'user-1',
      assetIds: ['asset-1'],
      orchestrationStatus: 'ready',
      metadata: { battleFixture: true },
    });
    expect(clone).not.toHaveProperty('_id');
    expect(clone).not.toHaveProperty('lastChatScriptIntentId');
    expect(clone).not.toHaveProperty('orchestrationLeaseUntil');
    expect(clone).not.toHaveProperty('orchestrationMessageId');
    expect(clone).not.toHaveProperty('deliverables');
  });

  it('adds fresh cursor evidence only for the cursor scenario', () => {
    const prepared = prepareChatBattleFixture({
      sourceProject: sourceProject(),
      fixtureProjectId: 'proj_chatbattle_cursor1',
      plan: plan('spatial-cursor-reference'),
      now: NOW,
    });
    expect(prepared.clientContext.spatialCursor).toMatchObject({
      surface: 'preview',
      normalizedX: 0.78,
      capturedAtMs: NOW.getTime(),
    });
  });
});

function plan(scenarioId: string) {
  const scenario = getChatEditBattleScenario(scenarioId);
  if (!scenario) throw new Error(`Missing scenario ${scenarioId}`);
  return planChatBattleFixture(scenario);
}

function sourceProject(): Record<string, any> {
  return {
    _id: 'mongo-source-id',
    projectId: 'source-project',
    userId: 'user-1',
    name: 'Source',
    fps: 30,
    durationInFrames: 900,
    overlays: [
      { id: 'video-1', type: 'video', from: 0, durationInFrames: 900, row: 0, assetId: 'video-asset' },
      { id: 'image-1', type: 'image', from: 60, durationInFrames: 90, row: 2, assetId: 'image-asset' },
      { id: 'title-1', type: 'text', from: 30, durationInFrames: 90, row: 3, content: 'Source title' },
      { id: 'caption-1', type: 'caption', from: 0, durationInFrames: 900, row: 4, words: [] },
      { id: 'sound-1', type: 'sound', from: 0, durationInFrames: 900, row: 0, assetId: 'audio-asset' },
      { id: 'scene-1', type: 'html-scene', from: 180, durationInFrames: 120, row: 5, content: '<div>Scene</div>' },
    ],
    intelligence: {
      phase0RenderedStillEvidence: { status: 'completed' },
      phase0RenderedQualityGate: { reviewedAt: 'old' },
      phase0RenderedAestheticReport: { status: 'pass' },
      visualSignals: { retained: true },
    },
    qualityReview: { overallScore: 100 },
    metadata: { source: true },
  };
}

function audioCapabilityProject(): Record<string, any> {
  const source = sourceProject();
  const video = overlays(source).find((overlay) => overlay.type === 'video');
  const caption = overlays(source).find((overlay) => overlay.type === 'caption');
  const music = overlays(source).find((overlay) => overlay.type === 'sound');
  if (!video || !caption || !music) {
    throw new Error('Expected source fixture media.');
  }

  video.src = 'https://assets.example/video.mp4';
  video.hasNativeAudio = true;
  video.audioRights = nativeAudioRights('video-asset');
  caption.words = [{ word: 'hello', startMs: 0, endMs: 400 }];
  music.row = 1;
  music.role = 'music';
  music.src = 'https://assets.example/music.wav';
  music.audioRights = musicRights('audio-asset');
  music.musicRights = musicRights('audio-asset');
  music.metadata = {
    beatGrid: {
      bpm: 120,
      beats: [{ frame: 0, isDownbeat: true }, { frame: 15, isDownbeat: false }],
      downbeats: [0],
      source: 'audio-analysis',
    },
  };
  source.overlays.push({
    id: 'sfx-1',
    type: 'sound',
    from: 300,
    durationInFrames: 30,
    row: 3,
    role: 'sfx',
    assetId: 'sfx-asset',
    src: 'https://assets.example/impact.wav',
    audioRights: generatedSfxRights('sfx-asset'),
  });
  return source;
}

function overlays(project: Record<string, any>): Record<string, any>[] {
  return project.overlays as Record<string, any>[];
}

function visualAnalysis(assetId: string): Record<string, unknown> {
  return {
    projectId: 'source-project',
    assetId,
    segmentAnalysis: {
      segments: [{
        semanticVisual: {
          windows: [{ startSec: 0, endSec: 2, subjects: ['garment'] }],
        },
        visual: {
          primitivePresence: { mainSubject: true },
          mainSubjectX: 0.2,
          mainSubjectY: 0.1,
          mainSubjectWidth: 0.5,
          mainSubjectHeight: 0.8,
        },
      }],
    },
  };
}

function nativeAudioRights(assetId: string): Record<string, unknown> {
  return {
    mediaRole: 'native-video',
    source: 'user-upload',
    userChoice: 'attested',
    licensed: true,
    evidence: {
      kind: 'user-attestation',
      sourceAssetId: assetId,
      attestationVersion: 'audio-rights-attestation-v1',
      attestedAt: NOW.toISOString(),
      attestedBy: 'user-1',
    },
  };
}

function musicRights(assetId: string): Record<string, unknown> {
  return {
    mediaRole: 'music',
    source: 'user-upload',
    userChoice: 'attested',
    licensed: true,
    evidence: {
      kind: 'user-attestation',
      sourceAssetId: assetId,
      attestationVersion: 'music-rights-attestation-v1',
      attestedAt: NOW.toISOString(),
      attestedBy: 'user-1',
    },
  };
}

function generatedSfxRights(assetId: string): Record<string, unknown> {
  return {
    mediaRole: 'sfx',
    source: 'generated',
    userChoice: 'attested',
    licensed: true,
    evidence: {
      kind: 'generated-provider',
      sourceAssetId: assetId,
      licenseId: 'fixture-provider:commercial-use',
    },
  };
}
