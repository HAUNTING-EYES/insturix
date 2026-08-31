import type { ClipOverlay }
  from '@/components/editron/editor/version-7.0.0/types';

import type { MediaAsset } from './asset-resolver';
import type {
  AssetTranscriptionPrecisionV2,
} from './asset-transcription-source-binding-v2';
import type { EditorialPlanArtifactRefV1 } from './editorial-plan-v1';
import type { Project, ProjectRevisionV1 } from './project-service';
import {
  resolveProjectSelectedVideoSourceTimeBindingV1,
  type ProjectSelectedVideoSourceTimeBindingPortsV1,
  type ProjectSelectedVideoSourceTimeBindingResultV1,
} from './project-selected-video-source-time-binding-v1';
import {
  resolveSourceBoundAssetTranscriptionV2,
  type SourceBoundAssetTranscriptionPortsV2,
  type SourceBoundAssetTranscriptionSuccessV2,
} from './source-bound-asset-transcription-v2';
import type { SourceTranscriptionProviderIdV1 }
  from './source-transcription-egress-authorization-v1';

type SelectedVideoAssetV2 = MediaAsset
  & Parameters<typeof resolveProjectSelectedVideoSourceTimeBindingV1>[0]['asset'];

export type ResolvedSelectedVideoSourceV1 = Extract<
  ProjectSelectedVideoSourceTimeBindingResultV1,
  Readonly<{ disposition: 'RESOLVED' }>
>;

export type ProjectSelectedSourceTranscriptionResultV2 = Readonly<
  | (SourceBoundAssetTranscriptionSuccessV2 & Readonly<{
      selectedSource: ResolvedSelectedVideoSourceV1;
    }>)
  | { disposition: 'BLOCKED'; diagnosticCode: string }
>;

export type ProjectSelectedSourceTranscriptionPortsV2 = Readonly<{
  transcription: SourceBoundAssetTranscriptionPortsV2;
  selectedSource?: ProjectSelectedVideoSourceTimeBindingPortsV1;
  resolveSelectedSource?: typeof resolveProjectSelectedVideoSourceTimeBindingV1;
  resolveTranscription?: typeof resolveSourceBoundAssetTranscriptionV2;
}>;

/**
 * Composes the existing project-selected proxy/master owner with the existing
 * source-bound transcription owner. It never resolves media from an overlay
 * URL and never infers a source from `isProxy` outside the selection owner.
 */
export async function resolveProjectSelectedSourceTranscriptionV2(
  input: Readonly<{
    mode: 'FULL' | 'CACHE_ONLY';
    project: Project;
    projectRevision: ProjectRevisionV1;
    userId: string;
    overlay: ClipOverlay;
    asset: SelectedVideoAssetV2;
    requestedLanguage?: string | null;
    precision: AssetTranscriptionPrecisionV2;
    eligibleProviderIds: readonly SourceTranscriptionProviderIdV1[];
    privacyEgressPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
    /** Reuse the caller's already-authenticated selection when available. */
    selectedSource?: ResolvedSelectedVideoSourceV1;
  }>,
  ports: ProjectSelectedSourceTranscriptionPortsV2,
): Promise<ProjectSelectedSourceTranscriptionResultV2> {
  try {
    const projectId = identity(
      input.project?.projectId,
      'PROJECT_SELECTED_TRANSCRIPTION_PROJECT_INVALID',
    );
    const projectOwnerId = identity(
      input.project?.userId,
      'PROJECT_SELECTED_TRANSCRIPTION_OWNER_INVALID',
    );
    const userId = identity(
      input.userId,
      'PROJECT_SELECTED_TRANSCRIPTION_USER_INVALID',
    );
    const assetId = identity(
      input.overlay?.assetId,
      'PROJECT_SELECTED_TRANSCRIPTION_OVERLAY_ASSET_REQUIRED',
    );
    if (input.asset?.assetId !== assetId || input.asset.type !== 'video') {
      return blocked('PROJECT_SELECTED_TRANSCRIPTION_ASSET_SCOPE_MISMATCH');
    }
    if (!ports?.transcription) {
      return blocked('PROJECT_SELECTED_TRANSCRIPTION_PORTS_INVALID');
    }

    const selection = input.selectedSource
      ? assertProvidedSelection(input.selectedSource, assetId)
      : await (
          ports.resolveSelectedSource
            ?? resolveProjectSelectedVideoSourceTimeBindingV1
        )({
          projectId,
          overlayId: input.overlay.id,
          assetId,
          sourcePin: input.overlay.sourceVersionPinV1,
          asset: input.asset,
          ...(ports.selectedSource ? { ports: ports.selectedSource } : {}),
        });
    if (selection.disposition === 'UNVERIFIABLE') {
      return blocked(
        `PROJECT_SELECTED_TRANSCRIPTION_SOURCE_${selection.reason}`,
      );
    }

    const orgId = optionalIdentity(
      input.project.orgId,
      'PROJECT_SELECTED_TRANSCRIPTION_ORG_INVALID',
    );
    const transcription = await (
      ports.resolveTranscription ?? resolveSourceBoundAssetTranscriptionV2
    )({
      mode: input.mode,
      tenantId: orgId ?? projectOwnerId,
      userId,
      orgId,
      projectId,
      projectOwnerId,
      projectRevision: input.projectRevision,
      asset: input.asset,
      sourceVersion: selection.sourceVersion,
      sourceRole: selection.sourceRole,
      requestedLanguage: input.requestedLanguage ?? null,
      precision: input.precision,
      eligibleProviderIds: input.eligibleProviderIds,
      privacyEgressPolicyRef: input.privacyEgressPolicyRef,
    }, ports.transcription);
    if (transcription.disposition === 'BLOCKED') return transcription;
    return Object.freeze({ ...transcription, selectedSource: selection });
  } catch (error) {
    return blocked(diagnostic(error));
  }
}

function assertProvidedSelection(
  value: ResolvedSelectedVideoSourceV1,
  assetId: string,
): ResolvedSelectedVideoSourceV1 {
  if (value.disposition !== 'RESOLVED'
    || value.sourceVersion?.assetId !== assetId
    || (value.sourceRole !== 'PROXY' && value.sourceRole !== 'MASTER')) {
    throw new Error('PROJECT_SELECTED_TRANSCRIPTION_SOURCE_SELECTION_INVALID');
  }
  return value;
}

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;

function identity(value: unknown, code: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) throw new Error(code);
  return normalized;
}

function optionalIdentity(value: unknown, code: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return identity(value, code);
}

function blocked(diagnosticCode: string) {
  return Object.freeze({ disposition: 'BLOCKED' as const, diagnosticCode });
}

function diagnostic(error: unknown): string {
  return error instanceof Error
    && /^PROJECT_SELECTED_TRANSCRIPTION_[A-Z0-9_]{1,180}$/.test(error.message)
    ? error.message
    : 'PROJECT_SELECTED_TRANSCRIPTION_UNAVAILABLE';
}
