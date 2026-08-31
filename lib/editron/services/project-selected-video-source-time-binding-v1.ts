import { canonicalizeEditronJsonV1 } from './canonical-json-v1';
import {
  readMediaProxyMasterActiveMappingAssetStateV1,
} from './media-proxy-master-active-mapping-asset-owner-v1';
import type { MediaProxyMasterTimeMapReferenceV1 }
  from './media-proxy-master-time-mapping-v1';
import type { MediaSourcePtsCadenceMapAssetStateInputV3 }
  from './media-source-pts-cadence-map-asset-owner-v3';
import {
  assertMediaSourceVersionEvidenceRecordV1,
  mediaSourceVersionEvidenceAssetViewV1,
  type MediaSourceVersionEvidenceScopeV1,
} from './media-source-version-evidence-owner-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';
import {
  resolveProjectVideoSourceStorageV1,
  type ProjectVideoSourceStorageAssetV1,
  type ProjectVideoSourceStorageResolutionV1,
} from './project-video-source-version-pin-v1';
import {
  resolveVerifiedVideoSourceEpochTimeBindingV3,
  type VerifiedVideoSourceEpochTimeBindingV3,
} from './video-source-time-transform-v1';

export const PROJECT_SELECTED_VIDEO_SOURCE_TIME_BINDING_KIND_V1 =
  'EDITRON_PROJECT_SELECTED_VIDEO_SOURCE_TIME_BINDING_V1' as const;

type SelectedAssetV1 = ProjectVideoSourceStorageAssetV1
  & MediaSourcePtsCadenceMapAssetStateInputV3;

type SelectedResolutionV1 = Exclude<
  ProjectVideoSourceStorageResolutionV1,
  Readonly<{ disposition: 'UNVERIFIABLE'; reason: string }>
>;

export type ProjectSelectedVideoSourceTimeBindingPortsV1 = Readonly<{
  loadSourceVersionEvidence(
    scope: MediaSourceVersionEvidenceScopeV1,
  ): Promise<unknown | null>;
}>;

export type ProjectSelectedVideoSourceTimeBindingResultV1 = Readonly<
  | {
      disposition: 'RESOLVED';
      kind: typeof PROJECT_SELECTED_VIDEO_SOURCE_TIME_BINDING_KIND_V1;
      sourceRole: 'PROXY' | 'MASTER';
      storageKey: string;
      sourcePinSha256: string | null;
      activeMappingStateSha256: string | null;
      sourceVersionEvidenceSha256: string | null;
      sourceVersion: Readonly<MediaSourceVersionV1>;
      binding: VerifiedVideoSourceEpochTimeBindingV3;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason:
        | 'SOURCE_SELECTION_UNVERIFIABLE'
        | 'SELECTED_SOURCE_VERSION_INVALID'
        | 'CURRENT_SOURCE_V3_REQUIRED'
        | 'HISTORICAL_SOURCE_ACTIVE_MAPPING_REQUIRED'
        | 'ACTIVE_MAPPING_INVALID'
        | 'SOURCE_VERSION_EVIDENCE_REQUIRED'
        | 'SOURCE_VERSION_EVIDENCE_INVALID'
        | 'SELECTED_SOURCE_V3_REQUIRED'
        | 'SELECTED_SOURCE_SCOPE_MISMATCH'
        | 'ACTIVE_TIME_MAP_REFERENCE_MISMATCH';
    }
>;

export async function resolveProjectSelectedVideoSourceTimeBindingV1(
  input: Readonly<{
    projectId: string;
    overlayId: number;
    assetId: string;
    sourcePin?: unknown;
    asset: SelectedAssetV1;
    ports?: ProjectSelectedVideoSourceTimeBindingPortsV1;
  }>,
): Promise<ProjectSelectedVideoSourceTimeBindingResultV1> {
  const selection = resolveProjectVideoSourceStorageV1({
    projectId: input.projectId,
    overlayId: input.overlayId,
    assetId: input.assetId,
    sourcePin: input.sourcePin,
    asset: input.asset,
  });
  if (selection.disposition === 'UNVERIFIABLE') {
    return unverifiable('SOURCE_SELECTION_UNVERIFIABLE');
  }

  let selectedSource: Readonly<MediaSourceVersionV1>;
  try {
    selectedSource = selectedSourceVersion(input.asset, selection);
  } catch {
    return unverifiable('SELECTED_SOURCE_VERSION_INVALID');
  }
  if (!sourceMatchesSelection(
    selectedSource,
    input.assetId,
    selection,
  )) {
    return unverifiable('SELECTED_SOURCE_SCOPE_MISMATCH');
  }
  const sourceRole = selection.disposition === 'PINNED_PROXY_SOURCE'
    || (selection.disposition === 'DIRECT_SOURCE'
      && input.asset.isProxy === true)
    ? 'PROXY' as const
    : 'MASTER' as const;

  let activeState: ReturnType<
  typeof readMediaProxyMasterActiveMappingAssetStateV1
  >;
  try {
    activeState = readMediaProxyMasterActiveMappingAssetStateV1(input.asset);
  } catch {
    return unverifiable('ACTIVE_MAPPING_INVALID');
  }

  if (!activeState) {
    const currentSource = currentSourceVersion(input.asset);
    if (!currentSource
      || canonicalizeEditronJsonV1(currentSource)
        !== canonicalizeEditronJsonV1(selectedSource)) {
      return unverifiable('HISTORICAL_SOURCE_ACTIVE_MAPPING_REQUIRED');
    }
    const binding = currentBinding(input.asset);
    if (!binding) return unverifiable('CURRENT_SOURCE_V3_REQUIRED');
    if (!bindingMatchesSource(binding, selectedSource, input.assetId)) {
      return unverifiable('SELECTED_SOURCE_SCOPE_MISMATCH');
    }
    return resolved(selection, sourceRole, selectedSource, binding, null);
  }

  if (selection.disposition === 'DIRECT_SOURCE'
    || selection.activeMappingStateSha256
      !== activeState.proxyMasterActiveMappingStateSha256V1) {
    return unverifiable('ACTIVE_MAPPING_INVALID');
  }
  const map = selection.disposition === 'PINNED_PROXY_SOURCE'
    ? activeState.proxyMasterActiveMappingV1.qualification.mapping.proxyTimeMap
    : activeState.proxyMasterActiveMappingV1.qualification.mapping.masterTimeMap;
  const ports = input.ports ?? defaultPorts();
  let storedEvidence: unknown | null;
  try {
    storedEvidence = await ports.loadSourceVersionEvidence({
      owner: selectedSource.owner,
      assetId: input.assetId,
      sourceVersionSha256: selectedSource.sourceVersionSha256,
    });
  } catch {
    return unverifiable('SOURCE_VERSION_EVIDENCE_REQUIRED');
  }
  if (storedEvidence === null) {
    return unverifiable('SOURCE_VERSION_EVIDENCE_REQUIRED');
  }

  let evidence: ReturnType<typeof assertMediaSourceVersionEvidenceRecordV1>;
  let binding: ReturnType<typeof resolveVerifiedVideoSourceEpochTimeBindingV3>;
  try {
    evidence = assertMediaSourceVersionEvidenceRecordV1(storedEvidence);
    if (canonicalizeEditronJsonV1(evidence.sourceVersionV1)
      !== canonicalizeEditronJsonV1(selectedSource)) {
      return unverifiable('SELECTED_SOURCE_SCOPE_MISMATCH');
    }
    binding = resolveVerifiedVideoSourceEpochTimeBindingV3(
      mediaSourceVersionEvidenceAssetViewV1(evidence),
    );
  } catch {
    return unverifiable('SOURCE_VERSION_EVIDENCE_INVALID');
  }
  if (!binding) return unverifiable('SELECTED_SOURCE_V3_REQUIRED');
  if (!bindingMatchesSource(binding, selectedSource, input.assetId)) {
    return unverifiable('SELECTED_SOURCE_SCOPE_MISMATCH');
  }
  if (!bindingMatchesTimeMap(binding, map)) {
    return unverifiable('ACTIVE_TIME_MAP_REFERENCE_MISMATCH');
  }
  return resolved(
    selection,
    sourceRole,
    selectedSource,
    binding,
    evidence.evidenceSha256,
  );
}

function selectedSourceVersion(
  asset: SelectedAssetV1,
  selection: SelectedResolutionV1,
): Readonly<MediaSourceVersionV1> {
  if (selection.disposition === 'PINNED_PROXY_SOURCE') {
    return assertMediaSourceVersionV1(
      asset.isProxy === true
        ? asset.sourceVersionV1
        : asset.proxySourceVersionV1,
    );
  }
  return assertMediaSourceVersionV1(asset.sourceVersionV1);
}

function currentSourceVersion(
  asset: SelectedAssetV1,
): Readonly<MediaSourceVersionV1> | null {
  try {
    return assertMediaSourceVersionV1(asset.sourceVersionV1);
  } catch {
    return null;
  }
}

function currentBinding(
  asset: SelectedAssetV1,
): VerifiedVideoSourceEpochTimeBindingV3 | null {
  try {
    return resolveVerifiedVideoSourceEpochTimeBindingV3(asset);
  } catch {
    return null;
  }
}

function sourceMatchesSelection(
  source: Readonly<MediaSourceVersionV1>,
  assetId: string,
  selection: SelectedResolutionV1,
): boolean {
  if (source.assetId !== assetId
    || source.mediaKind !== 'video'
    || source.storageVersion.locator.provider !== 'R2'
    || source.storageVersion.locator.objectKey !== selection.storageKey) {
    return false;
  }
  return selection.disposition === 'DIRECT_SOURCE'
    || (source.sourceVersionSha256 === selection.pin.sourceVersionSha256
      && source.storageVersion.storageVersionSha256
        === selection.pin.storageVersionSha256);
}

function bindingMatchesSource(
  binding: VerifiedVideoSourceEpochTimeBindingV3,
  source: Readonly<MediaSourceVersionV1>,
  assetId: string,
): boolean {
  return binding.assetId === assetId
    && binding.sourceVersionSha256 === source.sourceVersionSha256
    && binding.storageVersionSha256
      === source.storageVersion.storageVersionSha256;
}

function bindingMatchesTimeMap(
  binding: VerifiedVideoSourceEpochTimeBindingV3,
  map: MediaProxyMasterTimeMapReferenceV1,
): boolean {
  return binding.sourceVersionSha256 === map.sourceVersionSha256
    && binding.storageVersionSha256 === map.storageVersionSha256
    && binding.sourceBindingSha256 === map.sourceBindingSha256
    && binding.technicalObservationSha256
      === map.technicalObservationSha256
    && binding.sourcePtsCadenceMapStateSha256V3
      === map.sourcePtsCadenceMapStateSha256V3
    && binding.mapBindingSha256 === map.mapBindingSha256
    && binding.terminalReceiptSha256 === map.terminalReceiptSha256
    && binding.verificationSha256 === map.verificationSha256
    && binding.epochIndexContentSha256 === map.epochIndexContentSha256
    && binding.streamId === map.streamId
    && binding.videoStreamIndex === map.videoStreamIndex
    && binding.totalSourceFrameCount === map.totalFrameCount;
}

function resolved(
  selection: SelectedResolutionV1,
  sourceRole: 'PROXY' | 'MASTER',
  sourceVersion: Readonly<MediaSourceVersionV1>,
  binding: VerifiedVideoSourceEpochTimeBindingV3,
  sourceVersionEvidenceSha256: string | null,
): ProjectSelectedVideoSourceTimeBindingResultV1 {
  return Object.freeze({
    disposition: 'RESOLVED' as const,
    kind: PROJECT_SELECTED_VIDEO_SOURCE_TIME_BINDING_KIND_V1,
    sourceRole,
    storageKey: selection.storageKey,
    sourcePinSha256: selection.disposition === 'DIRECT_SOURCE'
      ? null : selection.pin.pinSha256,
    activeMappingStateSha256: selection.disposition === 'DIRECT_SOURCE'
      ? null : selection.activeMappingStateSha256,
    sourceVersionEvidenceSha256,
    sourceVersion,
    binding,
  });
}

function unverifiable(
  reason: Extract<
  ProjectSelectedVideoSourceTimeBindingResultV1,
  Readonly<{ disposition: 'UNVERIFIABLE' }>
  >['reason'],
): ProjectSelectedVideoSourceTimeBindingResultV1 {
  return Object.freeze({ disposition: 'UNVERIFIABLE' as const, reason });
}

function defaultPorts(): ProjectSelectedVideoSourceTimeBindingPortsV1 {
  return Object.freeze({
    async loadSourceVersionEvidence(scope) {
      const { createMediaSourceVersionEvidenceMongoStorePortsV1 } =
        await import('./media-source-version-evidence-mongo-store-v1');
      return createMediaSourceVersionEvidenceMongoStorePortsV1().load(scope);
    },
  });
}
