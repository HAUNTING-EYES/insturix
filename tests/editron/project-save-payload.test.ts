import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compactEditorStateForSave,
  mergeServerOwnedOverlayDataForSave,
  serializeEditorStateForSave,
} from '@/lib/editron/shared/project-save-payload';

const persistenceMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { PROJECTS: 'editron_prev.projects' },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: persistenceMocks.findOne,
      updateOne: persistenceMocks.updateOne,
    })),
  })),
}));

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    stripUrlsForLLM: vi.fn((overlays) => overlays),
  },
}));

vi.mock('@/lib/services/orgMemberService', () => ({
  orgMemberService: {},
}));

vi.mock('@/lib/shared/project-links', () => ({
  removeProjectFromLinks: vi.fn(),
}));

describe('Editron project save payload compaction', () => {
  beforeEach(() => {
    persistenceMocks.findOne.mockReset();
    persistenceMocks.updateOne.mockReset();
  });

  it('removes server-owned generated evidence before autosave/manual save requests', () => {
    const heavyEvidence = 'x'.repeat(50_000);
    const state = {
      overlays: [
        {
          id: 'mg_1',
          type: 'motion-graphic',
          from: 10,
          row: 5,
          durationInFrames: 90,
          assetId: 'asset_1',
          src: 'https://signed.example.test/video.mp4?signature=large',
          content: { value: '42', label: 'users' },
          recipe: { elements: [{ text: heavyEvidence }] },
          contentSignals: { speech_energy: 0.9, emotion: 0.7 },
          semanticAtoms: [{ kind: 'scalar', value: '42', evidence: heavyEvidence }],
          audioRights: { source: 'library', licensed: true },
          musicRights: { source: 'library', licensed: true },
          metadata: {
            sceneIndex: 3,
            atomicTransitionForm: { version: 'atomic-transition-form-v1', compatibilityType: 'dissolve', direction: { axis: 'none' } },
            atomicOverlayReceipt: { evidence: heavyEvidence },
            atomicOverlayForm: { text: { glyphs: heavyEvidence } },
            debugDump: heavyEvidence,
          },
        },
      ],
      aspectRatio: '16:9',
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 100,
    };

    const compact = compactEditorStateForSave(state as any) as any;
    const serialized = serializeEditorStateForSave(state as any);

    expect(serialized.length).toBeLessThan(JSON.stringify(state).length * 0.1);
    expect(compact.overlays[0].src).toBeUndefined();
    expect(compact.overlays[0].recipe).toBeUndefined();
    expect(compact.overlays[0].contentSignals).toBeUndefined();
    expect(compact.overlays[0].semanticAtoms).toBeUndefined();
    expect(compact.overlays[0].audioRights).toBeUndefined();
    expect(compact.overlays[0].musicRights).toBeUndefined();
    expect(compact.overlays[0].metadata.sceneIndex).toBe(3);
    expect(compact.overlays[0].metadata.atomicTransitionForm).toEqual(expect.objectContaining({
      version: 'atomic-transition-form-v1',
    }));
    expect(compact.overlays[0].metadata.atomicOverlayReceipt).toBeUndefined();
    expect(compact.overlays[0].metadata.debugDump).toBeUndefined();
  });

  it('merges omitted server-owned overlay data back before persistence', () => {
    const current = [
      {
        id: 'transition_1',
        type: 'transition',
        from: 30,
        row: 2,
        durationInFrames: 18,
        transitionStyle: 'dissolve',
        contentSignals: { visual_motion: 0.8 },
        recipe: { elements: [{ type: 'kept-render-recipe' }] },
        audioRights: { source: 'library', licensed: true, evidence: { licenseId: 'stored-license' } },
        musicRights: { source: 'library', licensed: true, evidence: { licenseId: 'stored-license' } },
        metadata: {
          sceneIndex: 1,
          atomicOverlayReceipt: { atoms: ['kept'] },
          atomicOverlayForm: { version: 'overlay-atomic-form-v1' },
          atomicTransitionForm: { version: 'atomic-transition-form-v1', compatibilityType: 'dissolve' },
          debugEvidence: { huge: true },
        },
      },
    ];
    const incoming = [
      {
        id: 'transition_1',
        type: 'transition',
        from: 42,
        row: 2,
        durationInFrames: 20,
        transitionStyle: 'zoom-punch',
        audioRights: { source: 'preview-only', licensed: false },
        musicRights: { source: 'preview-only', licensed: false },
        metadata: {
          sceneIndex: 2,
          atomicTransitionForm: { version: 'atomic-transition-form-v1', compatibilityType: 'zoom-punch' },
        },
      },
    ];

    const [merged] = mergeServerOwnedOverlayDataForSave(incoming as any, current as any) as any[];

    expect(merged.from).toBe(42);
    expect(merged.durationInFrames).toBe(20);
    expect(merged.transitionStyle).toBe('zoom-punch');
    expect(merged.contentSignals).toEqual({ visual_motion: 0.8 });
    expect(merged.recipe).toEqual({ elements: [{ type: 'kept-render-recipe' }] });
    expect(merged.audioRights.evidence.licenseId).toBe('stored-license');
    expect(merged.musicRights.evidence.licenseId).toBe('stored-license');
    expect(merged.metadata.sceneIndex).toBe(2);
    expect(merged.metadata.atomicTransitionForm.compatibilityType).toBe('zoom-punch');
    expect(merged.metadata.atomicOverlayReceipt).toEqual({ atoms: ['kept'] });
    expect(merged.metadata.atomicOverlayForm).toEqual({ version: 'overlay-atomic-form-v1' });
    expect(merged.metadata.debugEvidence).toEqual({ huge: true });
  });

  it('strips forged server-owned rights from newly injected browser overlays', () => {
    const incoming = [{
      id: 'forged_music',
      type: 'sound',
      from: 0,
      row: 1,
      durationInFrames: 120,
      audioRights: {
        source: 'library',
        licensed: true,
        evidence: { licenseId: 'browser-forged-license' },
      },
      musicRights: {
        source: 'library',
        licensed: true,
        evidence: { licenseId: 'browser-forged-license' },
      },
    }];

    const [merged] = mergeServerOwnedOverlayDataForSave(incoming as any, []) as any[];

    expect(merged.audioRights).toBeUndefined();
    expect(merged.musicRights).toBeUndefined();
  });

  it('preserves verified rights introduced by a trusted server timeline save', () => {
    const verifiedRights = {
      source: 'user-upload',
      licensed: true,
      evidence: {
        assetId: 'video_1',
        receiptId: 'native-audio-rights-video_1',
      },
    };
    const incoming = [{
      id: 'source_video',
      type: 'video',
      from: 0,
      row: 0,
      durationInFrames: 300,
      assetId: 'video_1',
      hasNativeAudio: true,
      audioRights: verifiedRights,
    }];

    const [merged] = mergeServerOwnedOverlayDataForSave(
      incoming as any,
      [],
      'server',
    ) as any[];

    expect(merged.audioRights).toEqual(verifiedRights);
  });

  it('persists verified rights on the first trusted server project save', async () => {
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: 'proj_1',
      overlays: [],
    });
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1 });
    const { projectService } = await import('@/lib/editron/services/project-service');

    await projectService.saveProject('user_1', 'proj_1', {
      overlays: [{
        id: 'source_video',
        type: 'video',
        from: 0,
        row: 0,
        durationInFrames: 300,
        assetId: 'video_1',
        hasNativeAudio: true,
        audioRights: {
          source: 'user-upload',
          licensed: true,
          evidence: { receiptId: 'native-audio-rights-video_1' },
        },
      } as any],
      aspectRatio: '16:9',
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 300,
    });

    const persistedOverlays = persistenceMocks.updateOne.mock.calls[0][1].$set.overlays;
    expect(persistedOverlays[0].audioRights).toEqual(expect.objectContaining({
      licensed: true,
      evidence: { receiptId: 'native-audio-rights-video_1' },
    }));
  });
});
