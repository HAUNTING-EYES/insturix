import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const projectServiceMock = vi.hoisted(() => ({
  loadProject: vi.fn(),
  saveProject: vi.fn(),
}));

vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: projectServiceMock,
}));

vi.mock('@/lib/editron/services/media', () => ({
  getTranscription: vi.fn(),
}));

import { executeSilenceRemoval } from '@/lib/editron/services/silence-removal-executor';
import { refineCutPlanWithVisualIntelligence } from '@/lib/editron/services/visual-cut-intelligence';
import type { RawFootageAnalysis, TranscriptSegment } from '@/lib/editron/services/raw-footage-processor';
import type { VjepaAnalysisResult, VjepaSegmentResult } from '@/lib/editron/services/vjepa-service';

function rawFootage(overrides: Partial<RawFootageAnalysis> = {}): RawFootageAnalysis {
  const segments: TranscriptSegment[] = [{
    text: 'opening words',
    startMs: 0,
    endMs: 1_000,
    wordCount: 2,
    words: [
      { word: 'opening', startMs: 0, endMs: 420, confidence: 0.98 },
      { word: 'words', startMs: 540, endMs: 1_000, confidence: 0.97 },
    ],
    fillerCount: 0,
    silenceGapCount: 0,
    avgWordGapMs: 120,
    index: 0,
  }];

  return {
    originalDurationMs: 12_000,
    estimatedCleanDurationMs: 12_000,
    silenceRemovalPlan: [],
    transcription: { text: 'opening words', words: segments[0].words },
    segments,
    contentTypeDetection: {
      contentType: 'demonstration',
      confidence: 0.9,
      signals: [],
      recommendedProfile: 'demo',
    },
    speechCoverage: 0.08,
    needsVisualDrivenEditing: true,
    ...overrides,
  } as RawFootageAnalysis;
}

function vjepa(segments: VjepaSegmentResult[]): VjepaAnalysisResult {
  return {
    segments,
    modelVersion: 'test-vjepa',
    processingTimeMs: 1,
  };
}

function visualSegment(overrides: Partial<VjepaSegmentResult>): VjepaSegmentResult {
  const startMs = overrides.startMs ?? 0;
  const endMs = overrides.endMs ?? startMs + 2_000;
  return {
    startMs,
    endMs,
    visualSignificance: 0.05,
    motionIntensity: 0.04,
    actionType: 'still',
    motionType: 'static',
    faceEmotion: null,
    eyeContact: null,
    motionVectorX: 0,
    motionVectorY: 0,
    mainSubject: { x: 0, y: 0, width: 0, height: 0, confidence: 0 },
    mainSubjectX: 0,
    mainSubjectY: 0,
    mainSubjectWidth: 0,
    mainSubjectHeight: 0,
    textBoxes: [],
    textBoxCount: 0,
    textCoverage: 0,
    objectCount: 0,
    faceCount: 0,
    negativeSpaceTop: 0.25,
    negativeSpaceRight: 0.25,
    negativeSpaceBottom: 0.25,
    negativeSpaceLeft: 0.25,
    primitivePresence: {
      motionVector: true,
      mainSubject: true,
      textBoxes: true,
      textCoverage: true,
      objectCount: true,
      faceCount: true,
      negativeSpace: true,
    },
    ...overrides,
  };
}

function mockProject(durationInFrames = 360) {
  projectServiceMock.loadProject.mockResolvedValue({
    fps: 30,
    durationInFrames,
    overlays: [{
      id: 1,
      type: 'video',
      from: 0,
      row: 0,
      durationInFrames,
      sourceStartFrame: 0,
      videoStartTime: 0,
      metadata: {},
    }],
  });
}

describe('visual cut intelligence end-to-end timeline execution', () => {
  beforeEach(() => {
    projectServiceMock.loadProject.mockReset();
    projectServiceMock.saveProject.mockReset();
  });

  it('turns low-speech visual dead air into a real timeline cut with correct source offsets', async () => {
    mockProject();

    const refined = refineCutPlanWithVisualIntelligence(
      rawFootage(),
      vjepa([visualSegment({ startMs: 2_000, endMs: 4_500 })]),
    );

    expect(refined.plan).toEqual([expect.objectContaining({
      action: 'remove',
      reason: 'visual-dead-air',
      startMs: 2_000,
      endMs: 4_500,
    })]);

    const result = await executeSilenceRemoval('proj_visual_e2e', 'user_1', refined.plan, 30);

    expect(result.totalFramesRemoved).toBe(75);
    expect(result.newDurationInFrames).toBe(285);
    expect(result.overlaysCreated).toBe(1);

    const savedProject = projectServiceMock.saveProject.mock.calls[0][2];
    const videos = savedProject.overlays.filter((overlay: any) => overlay.type === 'video');
    expect(videos).toEqual([
      expect.objectContaining({
        from: 0,
        durationInFrames: 60,
        sourceStartFrame: 0,
        videoStartTime: 0,
        metadata: expect.objectContaining({ sceneIndex: 0 }),
      }),
      expect.objectContaining({
        from: 60,
        durationInFrames: 225,
        sourceStartFrame: 135,
        videoStartTime: 135,
        metadata: expect.objectContaining({ sceneIndex: 1 }),
      }),
    ]);
    expect(savedProject.durationInFrames).toBe(285);
  });

  it('turns strong visual boundary evidence into a split without removing frames', async () => {
    mockProject();

    const refined = refineCutPlanWithVisualIntelligence(
      rawFootage(),
      vjepa([
        visualSegment({ startMs: 2_000, endMs: 4_000, visualSignificance: 0.35, motionIntensity: 0.12, objectCount: 1 }),
        visualSegment({ startMs: 5_000, endMs: 7_000, visualSignificance: 0.82, motionIntensity: 0.78, objectCount: 4 }),
      ]),
    );

    expect(refined.plan).toEqual([expect.objectContaining({
      action: 'split',
      reason: 'pacing-split',
      startMs: 5_000,
      endMs: 5_000,
      metadata: expect.objectContaining({
        source: 'vjepa-visual-boundary',
        boundaryReasons: expect.arrayContaining(['visual-state-change', 'visual-motion-change', 'visual-subject-change']),
      }),
    })]);

    const result = await executeSilenceRemoval('proj_visual_split_e2e', 'user_1', refined.plan, 30);

    expect(result.totalFramesRemoved).toBe(0);
    expect(result.newDurationInFrames).toBe(360);
    expect(result.overlaysCreated).toBe(1);

    const savedProject = projectServiceMock.saveProject.mock.calls[0][2];
    const videos = savedProject.overlays.filter((overlay: any) => overlay.type === 'video');
    expect(videos).toEqual([
      expect.objectContaining({
        from: 0,
        durationInFrames: 150,
        sourceStartFrame: 0,
        metadata: expect.objectContaining({
          sceneIndex: 0,
          pacingSplit: expect.objectContaining({ source: 'vjepa-visual-boundary' }),
        }),
      }),
      expect.objectContaining({
        from: 150,
        durationInFrames: 210,
        sourceStartFrame: 150,
        videoStartTime: 150,
        metadata: expect.objectContaining({
          sceneIndex: 1,
          pacingSplit: expect.objectContaining({ source: 'vjepa-visual-boundary' }),
        }),
      }),
    ]);
  });
  it('keeps visual cut refinement wired before silence removal in the video-analysis worker', () => {
    const source = readFileSync(join(process.cwd(), 'app/api/internal/workers/video-analysis/route.ts'), 'utf8');
    const visualStep = source.indexOf('Step 1.58: Visual cut intelligence');
    const silenceStep = source.indexOf('Step 1.6: Execute Silence Removal');
    const refineCall = source.indexOf('const visualCutResult = refineCutPlanWithVisualIntelligence(rawFootageAnalysis, precutVjepaAnalysis)');
    const planAssignment = source.indexOf('rawFootageAnalysis.silenceRemovalPlan = visualCutResult.plan');
    const executeCall = source.indexOf('await executeSilenceRemoval(projectId, userId, rawFootageAnalysis.silenceRemovalPlan)');

    expect(visualStep).toBeGreaterThan(-1);
    expect(silenceStep).toBeGreaterThan(visualStep);
    expect(source).toContain("await import('@/lib/editron/services/visual-cut-intelligence')");
    expect(refineCall).toBeGreaterThan(visualStep);
    expect(planAssignment).toBeGreaterThan(refineCall);
    expect(executeCall).toBeGreaterThan(planAssignment);
    expect(source).toContain("...(visualCutIntelligence && { 'intelligence.visualCutIntelligence': visualCutIntelligence })");
    expect(source).toContain('rawFootageAnalysis.visualCutIntelligence = visualCutResult.report');
  });
});
