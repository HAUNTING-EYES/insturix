import { createHash } from 'node:crypto';

import { applyCameraShakeToProject, type CameraShakePlan } from '@/lib/editron/agent/chat-visual-tools';
import { alignCutsToBeatsWithEvidence, type BeatAlignmentResult } from '@/lib/pipeline/scene-to-editron';

import { hashCanonicalJsonV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;

export interface Dev03NativeProxyFixtureV2 {
  schemaVersion: 'EDITRON_OE_DEV03_NATIVE_PROXY_FIXTURE_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_AUTHORITY';
  project: { projectId: 'oe-dev-03'; projectRevision: 'R11'; fps: 30; durationInFrames: 600; playerDimensions: { width: 320; height: 180 }; overlays: JsonRecord[] };
  assets: {
    cards: { assetId: 'dev03-cards'; sha256: string; width: 640; height: 360; fpsNumerator: 30; fpsDenominator: 1; durationInFrames: 600 };
    beats: { assetId: 'dev03-beats'; sha256: string; sampleRate: 48000; channels: 1; durationInFrames: 600 };
  };
  evidence: { protectedAudioRange: readonly [250, 350]; initialBoundaryFrames: readonly [114, 246, 472]; sourceStartFrames: readonly [0, 160, 10, 470]; maxBoundaryShiftFrames: 12 };
  expected: { strongPeakFrames: readonly [119, 239, 359, 479]; alignedBoundaryFrames: readonly [119, 239, 479]; finalHitFrame: 479; finalHitOverlayId: 'dev03-card-4'; shakeIntensity: 0.3; shakeDurationFrames: 10; shakeNeutralLocalFrame: 11 };
}

export function getCanonicalDev03NativeProxyFixtureV2(): Dev03NativeProxyFixtureV2 {
  return structuredClone({
    schemaVersion: 'EDITRON_OE_DEV03_NATIVE_PROXY_FIXTURE_V2', authority: 'RESEARCH_ONLY_NO_PROJECT_AUTHORITY',
    project: {
      projectId: 'oe-dev-03', projectRevision: 'R11', fps: 30, durationInFrames: 600, playerDimensions: { width: 320, height: 180 },
      overlays: [
        video('dev03-card-1', 0, 114, 0), video('dev03-card-2', 114, 132, 160),
        video('dev03-card-3', 246, 226, 10), video('dev03-card-4', 472, 128, 470),
        { id: 'dev03-beats-track', type: 'sound', assetId: 'dev03-beats', row: 4, from: 0, durationInFrames: 600, startFromSound: 0, metadata: { role: 'background-music' } },
      ],
    },
    assets: {
      cards: { assetId: 'dev03-cards', sha256: '4e1050d3922a599b9354a3eb87a670acfdd4232e839058071e46081df4d9ebfd', width: 640, height: 360, fpsNumerator: 30, fpsDenominator: 1, durationInFrames: 600 },
      beats: { assetId: 'dev03-beats', sha256: '62b685b0c90aeabe87bc695dfd7b0881386f2872b8fccd9020318056745ed3aa', sampleRate: 48_000, channels: 1, durationInFrames: 600 },
    },
    evidence: { protectedAudioRange: [250, 350], initialBoundaryFrames: [114, 246, 472], sourceStartFrames: [0, 160, 10, 470], maxBoundaryShiftFrames: 12 },
    expected: { strongPeakFrames: [119, 239, 359, 479], alignedBoundaryFrames: [119, 239, 479], finalHitFrame: 479, finalHitOverlayId: 'dev03-card-4', shakeIntensity: 0.3, shakeDurationFrames: 10, shakeNeutralLocalFrame: 11 },
  });
}

export function hashCanonicalDev03NativeProxyFixtureV2(): string {
  return hashCanonicalJsonV1(getCanonicalDev03NativeProxyFixtureV2());
}

export function executeDev03BeatAlignmentV2(strongPeakFrames: readonly number[]): {
  project: JsonRecord;
  result: BeatAlignmentResult;
} {
  const fixture = getCanonicalDev03NativeProxyFixtureV2();
  const project = jsonReloadClone(fixture.project) as JsonRecord;
  const overlays = records(project.overlays);
  const result = alignCutsToBeatsWithEvidence(
    overlays,
    strongPeakFrames.map((frame, index) => ({ frame, isDownbeat: index === 0 })),
    fixture.project.fps,
    {
      maxSnapFrames: fixture.evidence.maxBoundaryShiftFrames, minClipFrames: 30, maxConsecutiveBeatCuts: 4,
      protectedBoundaryFrames: fixture.evidence.protectedAudioRange, protectedBoundaryToleranceFrames: 2,
      sourceDurationFramesByAssetId: { [fixture.assets.cards.assetId]: fixture.assets.cards.durationInFrames }, requireSourceHandles: true,
    },
  );
  if (result.snappedCount !== 3 || result.rejections.length
    || !same(result.changes.map(({ alignedFrame }) => alignedFrame), fixture.expected.alignedBoundaryFrames)) {
    throw new Error('DEV03_FIXTURE_ALIGNMENT_OWNER_REJECTED');
  }
  project.overlays = overlays;
  return { project: jsonReloadClone(project), result };
}

export function executeDev03FinalShakeV2(project: JsonRecord, targetFrame: number): {
  project: JsonRecord;
  plan: CameraShakePlan;
} {
  const fixture = getCanonicalDev03NativeProxyFixtureV2();
  const clone = jsonReloadClone(project);
  const plan = applyCameraShakeToProject(clone, { targetFrame, videoOverlayId: fixture.expected.finalHitOverlayId, replacePositionKeyframes: false });
  const update = plan.updates[0];
  if (plan.status !== 'changed' || plan.updates.length !== 1 || !update
    || update.overlayId !== fixture.expected.finalHitOverlayId || update.intensity !== fixture.expected.shakeIntensity
    || update.durationFrames !== fixture.expected.shakeDurationFrames) throw new Error('DEV03_FIXTURE_SHAKE_OWNER_REJECTED');
  clone.overlays = records(clone.overlays).map((overlay) => overlay.id === update.overlayId
    ? { ...overlay, keyframeTracks: update.nextKeyframeTracks }
    : overlay);
  return { project: jsonReloadClone(clone), plan };
}

export function sha256Dev03FixtureBytesV2(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function video(id: string, from: number, durationInFrames: number, sourceStartFrame: number): JsonRecord { return { id, type: 'video', assetId: 'dev03-cards', row: 0, from, durationInFrames, sourceStartFrame, videoStartTime: sourceStartFrame, keyframeTracks: [] }; }
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function jsonReloadClone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
