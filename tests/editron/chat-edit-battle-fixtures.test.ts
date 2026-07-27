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
      seedTranscript: true,
      preserveSoundOverlays: false,
    });
    expect(plan('mixed-multi-step')).toMatchObject({
      profile: 'audio',
      preserveSoundOverlays: true,
    });
    expect(plan('replace-selected-sfx')).toMatchObject({ profile: 'audio', selectedOverlayType: 'sound' });
    expect(plan('edit-html-scene')).toMatchObject({ profile: 'generated-scene', selectedOverlayType: 'html-scene' });
    expect(plan('explicit-asset')).toMatchObject({ requiresImageAssetAlias: true });
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
    expect(plan('selected-overlay-edit')).toMatchObject({ requiredSourceCapabilities: [] });
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
