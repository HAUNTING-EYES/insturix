import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

import {
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';
import type { ProjectRevisionV1 } from './project-service';

export const USER_MEDIA_REPLACEMENT_FORM_KIND_V1 =
  'EDITRON_USER_MEDIA_REPLACEMENT_FORM_V1' as const;

type FrameRangeV1 = Readonly<{ startFrame: number; endFrame: number }>;

export interface UserMediaReplacementRightsEvidenceV1 {
  schemaVersion: 1;
  authority: string;
  evidenceId: string;
  disposition: 'OWNED_BY_USER' | 'OWNED_BY_ORG' | 'LICENSED_FOR_PROJECT';
  projectId: string;
  assetId: string;
  sourceVersionSha256: string;
  permittedUse: 'EDIT_AND_RENDER_PROJECT';
  evidenceSha256: string;
}

export interface UserMediaReplacementSourceHandleEvidenceV1 {
  schemaVersion: 1;
  authority: string;
  evidenceId: string;
  projectId: string;
  assetId: string;
  sourceVersionSha256: string;
  selectedSourceRange: FrameRangeV1;
  availableSourceRange: FrameRangeV1;
  sourcePtsMapTerminalReceiptSha256: string;
  nativeAudioDisposition: 'MUTED';
  evidenceSha256: string;
}

export interface UserMediaReplacementEvidenceV1 {
  projectRevision: Readonly<ProjectRevisionV1>;
  sourceVersion: Readonly<MediaSourceVersionV1>;
  rights: Readonly<UserMediaReplacementRightsEvidenceV1>;
  sourceHandles: Readonly<UserMediaReplacementSourceHandleEvidenceV1>;
  trustedEvidenceSha256: Readonly<{
    rights: string;
    sourceHandles: string;
  }>;
}

export interface VerifiedUserMediaReplacementFormV1 {
  schemaVersion: 1;
  kind: typeof USER_MEDIA_REPLACEMENT_FORM_KIND_V1;
  projectId: string;
  expectedProjectRevision: Readonly<ProjectRevisionV1>;
  expectedProjectRevisionSha256: string;
  target: Readonly<{
    overlayId: string | number;
    oldAssetId: string;
    oldSourceStartFrame: number;
    timelineRange: FrameRangeV1;
    presentation: Readonly<Record<string, unknown>>;
    presentationSha256: string;
    outsideTargetStateSha256: string;
  }>;
  replacement: Readonly<{
    assetId: string;
    sourceVersionSha256: string;
    storageVersionSha256: string;
    sourceRange: FrameRangeV1;
    rightsEvidenceId: string;
    rightsEvidenceSha256: string;
    sourceHandleEvidenceId: string;
    sourceHandleEvidenceSha256: string;
    sourcePtsMapTerminalReceiptSha256: string;
    nativeAudioDisposition: 'MUTED';
  }>;
  requiredMutationOrder: readonly ['add_overlay', 'delete_overlay'];
  formSha256: string;
}

export type UserMediaReplacementFormResolutionV1 =
  | Readonly<{ status: 'READY'; form: Readonly<VerifiedUserMediaReplacementFormV1> }>
  | Readonly<{
      status: 'SAFE_STOP';
      code:
        | 'REPLACEMENT_EVIDENCE_MISSING'
        | 'PROJECT_REVISION_INVALID'
        | 'SOURCE_VERSION_INVALID'
        | 'RIGHTS_EVIDENCE_INVALID'
        | 'SOURCE_HANDLES_INVALID'
        | 'TARGET_PRESENTATION_INVALID';
    }>;

/**
 * Verifies the final replacement form selected by resolve_user_asset_overlay.
 * It owns no media, rights, project state, or mutation. Trust anchors must be
 * supplied by their real owners; a model-authored hash is not sufficient.
 */
export function resolveVerifiedUserMediaReplacementFormV1(input: Readonly<{
  projectId: string;
  replacementAssetId: string;
  targetOverlay: Readonly<Overlay>;
  outsideTargetStateSha256: string;
  evidence?: Readonly<UserMediaReplacementEvidenceV1>;
}>): UserMediaReplacementFormResolutionV1 {
  if (!input.evidence) return safeStop('REPLACEMENT_EVIDENCE_MISSING');
  const projectId = cleanIdentifier(input.projectId);
  if (!projectId || !isProjectRevision(input.evidence.projectRevision)) {
    return safeStop('PROJECT_REVISION_INVALID');
  }

  let sourceVersion: Readonly<MediaSourceVersionV1>;
  try {
    sourceVersion = assertMediaSourceVersionV1(input.evidence.sourceVersion);
  } catch {
    return safeStop('SOURCE_VERSION_INVALID');
  }
  if (sourceVersion.mediaKind !== 'video'
    || sourceVersion.assetId !== cleanIdentifier(input.replacementAssetId)) {
    return safeStop('SOURCE_VERSION_INVALID');
  }

  const rights = input.evidence.rights;
  if (!verifiedEvidenceHash(rights, input.evidence.trustedEvidenceSha256.rights)
    || rights.schemaVersion !== 1
    || !cleanIdentifier(rights.authority)
    || !cleanIdentifier(rights.evidenceId)
    || rights.projectId !== projectId
    || rights.assetId !== sourceVersion.assetId
    || rights.sourceVersionSha256 !== sourceVersion.sourceVersionSha256
    || rights.permittedUse !== 'EDIT_AND_RENDER_PROJECT'
    || !['OWNED_BY_USER', 'OWNED_BY_ORG', 'LICENSED_FOR_PROJECT'].includes(rights.disposition)) {
    return safeStop('RIGHTS_EVIDENCE_INVALID');
  }

  const handles = input.evidence.sourceHandles;
  const timelineRange = overlayTimelineRange(input.targetOverlay);
  if (!verifiedEvidenceHash(handles, input.evidence.trustedEvidenceSha256.sourceHandles)
    || handles.schemaVersion !== 1
    || !cleanIdentifier(handles.authority)
    || !cleanIdentifier(handles.evidenceId)
    || handles.projectId !== projectId
    || handles.assetId !== sourceVersion.assetId
    || handles.sourceVersionSha256 !== sourceVersion.sourceVersionSha256
    || !isSha256(handles.sourcePtsMapTerminalReceiptSha256)
    || handles.nativeAudioDisposition !== 'MUTED'
    || !validRange(handles.selectedSourceRange)
    || !validRange(handles.availableSourceRange)
    || handles.selectedSourceRange.startFrame < handles.availableSourceRange.startFrame
    || handles.selectedSourceRange.endFrame > handles.availableSourceRange.endFrame
    || rangeLength(handles.selectedSourceRange) !== rangeLength(timelineRange)) {
    return safeStop('SOURCE_HANDLES_INVALID');
  }

  let presentation: Readonly<Record<string, unknown>>;
  try {
    presentation = userMediaReplacementPresentationV1(input.targetOverlay);
  } catch {
    return safeStop('TARGET_PRESENTATION_INVALID');
  }
  if (!isSha256(input.outsideTargetStateSha256)) {
    return safeStop('TARGET_PRESENTATION_INVALID');
  }

  const targetAssetId = cleanIdentifier(input.targetOverlay.assetId);
  if (!targetAssetId) return safeStop('TARGET_PRESENTATION_INVALID');
  const material = {
    schemaVersion: 1 as const,
    kind: USER_MEDIA_REPLACEMENT_FORM_KIND_V1,
    projectId,
    expectedProjectRevision: cloneCanonicalEditronJsonV1(input.evidence.projectRevision),
    expectedProjectRevisionSha256: hashEditronCanonicalJsonV1(input.evidence.projectRevision),
    target: {
      overlayId: input.targetOverlay.id,
      oldAssetId: targetAssetId,
      oldSourceStartFrame: sourceStartFrame(input.targetOverlay),
      timelineRange,
      presentation,
      presentationSha256: hashEditronCanonicalJsonV1(presentation),
      outsideTargetStateSha256: input.outsideTargetStateSha256,
    },
    replacement: {
      assetId: sourceVersion.assetId,
      sourceVersionSha256: sourceVersion.sourceVersionSha256,
      storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
      sourceRange: handles.selectedSourceRange,
      rightsEvidenceId: rights.evidenceId,
      rightsEvidenceSha256: rights.evidenceSha256,
      sourceHandleEvidenceId: handles.evidenceId,
      sourceHandleEvidenceSha256: handles.evidenceSha256,
      sourcePtsMapTerminalReceiptSha256: handles.sourcePtsMapTerminalReceiptSha256,
      nativeAudioDisposition: handles.nativeAudioDisposition,
    },
    requiredMutationOrder: ['add_overlay', 'delete_overlay'] as const,
  };
  return deepFreezeEditronJsonV1({
    status: 'READY' as const,
    form: { ...material, formSha256: hashEditronCanonicalJsonV1(material) },
  });
}

export function userMediaReplacementPresentationV1(
  overlay: Readonly<Overlay>,
): Readonly<Record<string, unknown>> {
  return cloneCanonicalEditronJsonV1({
    timeline: overlayTimelineRange(overlay),
    row: overlay.row,
    geometry: {
      left: overlay.left,
      top: overlay.top,
      width: overlay.width,
      height: overlay.height,
      rotation: overlay.rotation,
    },
    styles: overlay.styles,
    keyframeTracks: overlay.keyframeTracks ?? [],
  });
}

export function userMediaReplacementOutsideTargetStateSha256V1(
  project: Readonly<Record<string, unknown>>,
  targetOverlayId: string | number,
): string {
  const overlays = Array.isArray(project.overlays) ? project.overlays : [];
  const plainProjectState = JSON.parse(JSON.stringify({
    projectId: project.projectId,
    userId: project.userId,
    aspectRatio: project.aspectRatio,
    playerDimensions: project.playerDimensions,
    fps: project.fps,
    durationInFrames: project.durationInFrames,
    overlays: overlays.filter((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
      return String((value as Record<string, unknown>).id) !== String(targetOverlayId);
    }),
  }));
  return hashEditronCanonicalJsonV1(plainProjectState);
}

function overlayTimelineRange(overlay: Readonly<Overlay>): FrameRangeV1 {
  const startFrame = nonNegativeSafeInteger(overlay.from);
  const duration = positiveSafeInteger(overlay.durationInFrames);
  return { startFrame, endFrame: startFrame + duration };
}

function sourceStartFrame(overlay: Readonly<Overlay>): number {
  const value = 'sourceStartFrame' in overlay ? overlay.sourceStartFrame : undefined;
  return nonNegativeSafeInteger(value ?? ('videoStartTime' in overlay ? overlay.videoStartTime : 0) ?? 0);
}

function verifiedEvidenceHash(value: { evidenceSha256: string }, trustedSha256: string): boolean {
  if (!isSha256(value.evidenceSha256) || value.evidenceSha256 !== trustedSha256) return false;
  const unsigned = { ...value } as Record<string, unknown>;
  delete unsigned.evidenceSha256;
  return hashEditronCanonicalJsonV1(unsigned) === value.evidenceSha256;
}

function isProjectRevision(value: ProjectRevisionV1): boolean {
  return value?.schemaVersion === 1
    && Number.isSafeInteger(value.value) && value.value >= 0
    && typeof value.compatibilityUpdatedAt === 'string'
    && Number.isFinite(Date.parse(value.compatibilityUpdatedAt));
}

function validRange(value: FrameRangeV1): boolean {
  return Number.isSafeInteger(value.startFrame) && value.startFrame >= 0
    && Number.isSafeInteger(value.endFrame) && value.endFrame > value.startFrame;
}
function rangeLength(value: FrameRangeV1): number { return value.endFrame - value.startFrame; }
function nonNegativeSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('FRAME_INVALID');
  return Number(value);
}
function positiveSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error('FRAME_INVALID');
  return Number(value);
}
function cleanIdentifier(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function safeStop(code: Extract<UserMediaReplacementFormResolutionV1, { status: 'SAFE_STOP' }>['code']) {
  return deepFreezeEditronJsonV1({ status: 'SAFE_STOP' as const, code });
}
