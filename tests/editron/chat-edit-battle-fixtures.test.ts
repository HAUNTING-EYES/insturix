import { describe, expect, it } from 'vitest';

import { getChatEditBattleScenario } from '@/lib/editron/services/chat-edit-battle-harness';
import { planChatBattleFixture } from '@/lib/editron/services/chat-edit-battle-fixture-plan';
import {
  cloneChatBattleAnalysisDocuments,
  cloneChatBattleUploadBatch,
  prepareChatBattleFixture,
} from '@/lib/editron/services/chat-edit-battle-fixtures';

const NOW = new Date('2026-07-18T12:00:00.000Z');

describe('chat edit battle fixtures', () => {
  it('maps commands to sources with the prerequisites their real tool paths need', () => {
    expect(plan('selected-overlay-edit')).toMatchObject({ profile: 'mixed', selectedOverlayType: 'text' });
    expect(plan('spoken-phrase-devanagari')).toMatchObject({ profile: 'speech', seedTranscript: true });
    expect(plan('mixed-multi-step')).toMatchObject({ profile: 'audio' });
    expect(plan('replace-selected-sfx')).toMatchObject({ profile: 'audio', selectedOverlayType: 'sound' });
    expect(plan('edit-html-scene')).toMatchObject({ profile: 'generated-scene', selectedOverlayType: 'html-scene' });
    expect(plan('explicit-asset')).toMatchObject({ requiresImageAssetAlias: true });
    expect(plan('selected-dialogue-dubbing')).toMatchObject({
      profile: 'dubbing',
      sourceProjectId: 'proj_FYZeVGomJuSh',
      selectedOverlayType: 'video',
      seedTranscript: true,
    });
    expect(plan('vertical-subject-reframe')).toMatchObject({ profile: 'visual-multi-asset' });
    expect(plan('multiasset-script-chat')).toMatchObject({ requiresUploadBatchClone: true });
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
