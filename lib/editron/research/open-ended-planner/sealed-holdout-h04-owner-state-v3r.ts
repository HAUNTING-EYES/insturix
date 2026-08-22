import { cutTimelineRange } from '@/lib/editron/services/timeline-range-cut';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  assertSealedHoldoutCohortManifestV3R,
  type SealedHoldoutCohortManifestV3R,
} from './sealed-holdout-cohort-v3r';
import {
  assertSealedHoldoutCohortManifestV3R2,
  type SealedHoldoutCohortManifestV3R2,
} from './sealed-holdout-cohort-v3r2';

type JsonRecord = Record<string, unknown>;

const PRESENTATION_REFERENCE_V3R = 'sha256:caption-presentation-v1';
const RETAINED_WORDS_V3R = ['our', 'launch', 'is', 'Friday'] as const;

export const SEALED_HOLDOUT_H04_OWNER_STATE_VERSION_V3R =
  'EDITRON_OE_SEALED_HOLDOUT_H04_ISOLATED_OWNER_STATE_V3R_1' as const;

export class SealedHoldoutH04OwnerStateV3R {
  private overlays: JsonRecord[];
  private durationInFrames = 540;
  private revision = 'R6';

  constructor(input: {
    manifest: Readonly<SealedHoldoutCohortManifestV3R | SealedHoldoutCohortManifestV3R2>;
    caseId: 'HOLD-04:C1' | 'HOLD-04:C2';
  }) {
    const manifest = input.manifest.version === 'EDITRON_OE_SEALED_HOLDOUT_COHORT_V3R_2'
      ? assertSealedHoldoutCohortManifestV3R2(input.manifest)
      : assertSealedHoldoutCohortManifestV3R(input.manifest);
    const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
    const publicCase = record(taskCase?.publicCase);
    const project = record(publicCase.project);
    const captionEvidence = records(record(taskCase?.ownerOnly).evidence)
      .find(({ kind }) => kind === 'CAPTION_STATE');
    const captionState = record(captionEvidence?.value);
    if (publicCase.taskId !== 'HOLD-04'
      || project.projectId !== 'oe-hold-04'
      || project.expectedProjectRevision !== 'R6'
      || project.durationFrames !== 540
      || captionState.family !== 'generated'
      || captionState.presentationHash !== PRESENTATION_REFERENCE_V3R
      || captionState.overwriteAuthorized !== true) {
      fail('SEALED_H04_STATE_INITIAL_BINDING_INVALID');
    }
    this.overlays = buildInitialOverlaysV3R();
  }

  readTimeline(input: { currentProjectRevision: string }): Readonly<JsonRecord> {
    if (input.currentProjectRevision !== this.revision) {
      fail('SEALED_H04_STATE_READ_REVISION_CONFLICT');
    }
    return deepFreezeV1({
      ownerStateVersion: SEALED_HOLDOUT_H04_OWNER_STATE_VERSION_V3R,
      stateReceipt: this.stateReceipt(),
      projection: projectStateProjectionV3R(this.overlays, this.durationInFrames),
    });
  }

  executeMutation(input: {
    operatorId: string;
    arguments: Readonly<JsonRecord>;
    beforeProjectRevision: string;
    writerIssuedProjectRevision: string;
  }): Readonly<JsonRecord> {
    if (input.operatorId !== 'cut_section') fail('SEALED_H04_STATE_OPERATOR_UNSUPPORTED');
    if (input.beforeProjectRevision !== this.revision
      || input.arguments.expectedProjectRevision !== this.revision
      || input.arguments.projectId !== 'oe-hold-04') {
      fail('SEALED_H04_STATE_MUTATION_REVISION_CONFLICT');
    }
    const targetRange = record(input.arguments.targetRange);
    const startFrame = integer(targetRange.startFrame);
    const endFrame = integer(targetRange.endFrame);
    if (startFrame < 0 || endFrame <= startFrame || endFrame > this.durationInFrames) {
      fail('SEALED_H04_STATE_MUTATION_RANGE_INVALID');
    }
    const beforeStateReceipt = this.stateReceipt();
    const result = cutTimelineRange({
      overlays: this.overlays,
      startFrame,
      endFrame,
      fps: 30,
      durationInFrames: this.durationInFrames,
    });
    this.overlays = structuredClone(result.overlays) as JsonRecord[];
    this.durationInFrames = result.newDurationInFrames;
    this.revision = input.writerIssuedProjectRevision;
    const afterStateReceipt = this.stateReceipt();
    return deepFreezeV1({
      timelineCoordinateTransform: result.timelineCoordinateTransform,
      splitChildren: result.splitChildren,
      isolatedStateTransition: {
        ownerStateVersion: SEALED_HOLDOUT_H04_OWNER_STATE_VERSION_V3R,
        beforeStateSha256: beforeStateReceipt.stateSha256,
        afterStateReceipt,
        projection: projectStateProjectionV3R(this.overlays, this.durationInFrames),
      },
    });
  }

  snapshot(): Readonly<JsonRecord> {
    return deepFreezeV1({
      ownerStateVersion: SEALED_HOLDOUT_H04_OWNER_STATE_VERSION_V3R,
      stateReceipt: this.stateReceipt(),
      projection: projectStateProjectionV3R(this.overlays, this.durationInFrames),
      stateEffects: [] as const,
    });
  }

  private stateReceipt(): Readonly<JsonRecord> {
    const state = {
      projectId: 'oe-hold-04', projectRevision: this.revision,
      timebase: { numerator: 30, denominator: 1, coordinateDomain: 'PROJECT_FRAME' },
      durationInFrames: this.durationInFrames,
      overlays: toJsonContractValueV3R(this.overlays, 'overlays'),
    };
    return deepFreezeV1({
      ownerStateVersion: SEALED_HOLDOUT_H04_OWNER_STATE_VERSION_V3R,
      projectRevision: this.revision,
      durationInFrames: this.durationInFrames,
      stateSha256: hashCanonicalJsonV1(state),
    });
  }
}

function buildInitialOverlaysV3R(): JsonRecord[] {
  const words = [...captionWordsAtV3R(120), ...captionWordsAtV3R(225)];
  const video: JsonRecord = {
    id: 401, type: 'video', from: 0, durationInFrames: 540, row: 0,
    assetId: 'h04-host', src: 'bound-by-media-manifest', sourceStartFrame: 0,
    videoStartTime: 0,
  };
  const caption: JsonRecord = {
    id: 402, type: 'caption', from: 0, durationInFrames: 540, row: 4,
    words,
    captions: [captionGroupAtV3R(120), captionGroupAtV3R(225)],
    styles: {
      fontFamily: 'Inter', fontSize: 64, fontWeight: 700,
      color: '#fff7e6', textAlign: 'center', textTransform: 'none',
    },
    displayConfig: {
      mode: 'phrase', showPreviousWords: false, fadeOutPreviousWords: false,
    },
    metadata: {
      source: 'canonical-caption-track',
      presentationHash: PRESENTATION_REFERENCE_V3R,
    },
  };
  return [video, caption];
}

function projectStateProjectionV3R(
  overlays: readonly JsonRecord[],
  durationInFrames: number,
): JsonRecord {
  const caption = overlays.find(({ type }) => type === 'caption');
  const captionWords = records(caption?.words).map(({ word }) => text(word));
  const captionGroups = records(caption?.captions);
  return {
    durationInFrames,
    overlays: overlays.map((overlay) => ({
      id: overlay.id, type: overlay.type, from: overlay.from,
      durationInFrames: overlay.durationInFrames, row: overlay.row,
      ...(overlay.assetId ? { assetId: overlay.assetId } : {}),
      ...(record(overlay.metadata).presentationHash
        ? { presentationHash: record(overlay.metadata).presentationHash } : {}),
    })),
    captionSemanticState: {
      text: captionWords.join(' '), wordCount: captionWords.length,
      groupCount: captionGroups.length,
      presentationHash: record(caption?.metadata).presentationHash ?? null,
    },
  };
}

function captionWordsAtV3R(startFrame: number): JsonRecord[] {
  return RETAINED_WORDS_V3R.map((word, index) => ({
    word,
    startMs: frameToMsV3R(startFrame + index * 18),
    endMs: frameToMsV3R(startFrame + (index + 1) * 18),
    confidence: 1,
  }));
}
function captionGroupAtV3R(startFrame: number): JsonRecord {
  const words = captionWordsAtV3R(startFrame);
  return {
    text: RETAINED_WORDS_V3R.join(' '), words,
    startMs: words[0].startMs, endMs: words[words.length - 1].endMs,
  };
}
function frameToMsV3R(frame: number): number { return Math.round(frame / 30 * 1_000); }
function toJsonContractValueV3R(value: unknown, path: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value)) return value.map((entry, index) => {
    if (entry === undefined) fail(`SEALED_H04_STATE_UNDEFINED_ARRAY_VALUE:${path}[${index}]`);
    return toJsonContractValueV3R(entry, `${path}[${index}]`);
  });
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => (
    entry === undefined ? [] : [[key, toJsonContractValueV3R(entry, `${path}.${key}`)]]
  )));
  fail(`SEALED_H04_STATE_NON_JSON_VALUE:${path}`);
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number { return Number.isSafeInteger(value) ? Number(value) : -1; }
function fail(code: string): never { throw new Error(code); }
