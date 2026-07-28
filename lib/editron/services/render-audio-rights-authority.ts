import {
  getGeneratedNativeVideoReceiptIssue,
  isCanonicalMusicOverlay,
  resolveAudioRightsClaim,
  type AudioRightsContract,
} from '@/lib/editron/shared/render-request-payload';

type UnknownRecord = Record<string, unknown>;

const GENERATED_SFX_LICENSE_SOURCES = new Map<string, ReadonlySet<string>>([
  [
    'fal-ai:cassetteai/sound-effects-generator:commercial-use',
    new Set(['cassetteai', 'generated']),
  ],
  [
    'fal-ai:cassetteai/music-generator:commercial-use',
    new Set(['cassetteai', 'generated']),
  ],
  [
    'fal-ai:mirelo-ai/sfx-v1.5/video-to-audio:commercial-use',
    new Set(['mirelo-video-to-audio', 'generated']),
  ],
]);

interface StoredAudioAsset extends UnknownRecord {
  assetId?: unknown;
  userId?: unknown;
  projectId?: unknown;
  type?: unknown;
  source?: unknown;
  parentAssetId?: unknown;
  assignmentStatus?: unknown;
  musicRights?: unknown;
  audioRights?: unknown;
  audioSeparationReceipt?: unknown;
  generatedVideoReceipt?: unknown;
  libraryLicenseReceipt?: unknown;
  sfxLibrarySource?: unknown;
  sfxProviderId?: unknown;
}

interface AudioSeparationReceipt extends UnknownRecord {
  version: 'editron-audio-separation-receipt-v1';
  provider: 'fal-ai';
  model: 'fal-ai/demucs:mdx_extra';
  operation: 'preserve-non-vocal-background';
  stem: 'other';
  sourceAssetId: string;
  derivativeAssetId: string;
  jobId: string;
  createdAt: string;
  vendorRequestId?: string;
}

interface RenderAudioClaim {
  overlay: UnknownRecord;
  rights: AudioRightsContract;
  overlayAssetId: string;
  sourceAssetId: string;
  requiresStoredEvidence: boolean;
  expectedAssetType: 'audio' | 'video';
  expectedSourceAssetType: 'audio' | 'video';
  audioSeparationReceipt: AudioSeparationReceipt | null;
}

export interface RenderAudioRightsAuthorityDependencies {
  loadAssets(assetIds: string[]): Promise<StoredAudioAsset[]>;
}

export interface VerifyRenderAudioRightsAuthorityInput {
  userId: string;
  projectId: string;
  projectOwnerId?: string | null;
  overlays: unknown[];
}

export class RenderAudioRightsAuthorityError extends Error {
  readonly code = 'AUDIO_RIGHTS_EVIDENCE_UNVERIFIED';

  constructor(
    readonly overlayId: string | number | null,
    reason: string,
  ) {
    super(
      `Cannot verify render audio rights for overlay ${
        overlayId === null ? 'unknown' : String(overlayId)
      }: ${reason}`,
    );
    this.name = 'RenderAudioRightsAuthorityError';
  }
}

const defaultDependencies: RenderAudioRightsAuthorityDependencies = {
  async loadAssets(assetIds) {
    if (assetIds.length === 0) return [];
    const { COLLECTIONS, getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    return db.collection(COLLECTIONS.MEDIA_ASSETS)
      .find({ assetId: { $in: assetIds } })
      .toArray() as Promise<StoredAudioAsset[]>;
  },
};

/**
 * The synchronous render gate validates the receipt envelope. This verifier
 * proves that a licensed audio receipt is backed by the current stored asset
 * before any URL hydration, credit deduction, or Lambda invocation.
 */
export async function verifyRenderAudioRightsAuthority(
  input: VerifyRenderAudioRightsAuthorityInput,
  dependencyOverrides: Partial<RenderAudioRightsAuthorityDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const audioClaims = input.overlays
    .filter(isAudioRightsAuthorityCandidate)
    .map((overlay) => readAudioClaim(overlay));
  const renderableClaims = audioClaims.filter((claim) => claim.requiresStoredEvidence);
  if (renderableClaims.length === 0) return;

  const assetIds = Array.from(new Set(renderableClaims.flatMap((claim) => [
    claim.overlayAssetId,
    claim.sourceAssetId,
  ])));
  const assets = await dependencies.loadAssets(assetIds);
  const assetsById = new Map(
    assets.flatMap((asset) => {
      const assetId = nonEmptyString(asset.assetId);
      return assetId ? [[assetId, asset] as const] : [];
    }),
  );
  const allowedUserIds = new Set([
    input.userId,
    nonEmptyString(input.projectOwnerId),
  ].filter((value): value is string => Boolean(value)));

  for (const claim of renderableClaims) {
    const overlayAsset = assetsById.get(claim.overlayAssetId);
    if (!overlayAsset) {
      throw authorityError(claim.overlay, 'render asset evidence is missing');
    }
    assertAudioAssetScope(
      overlayAsset,
      input.projectId,
      allowedUserIds,
      claim.overlay,
      claim.expectedAssetType,
    );
    assertRightsMatch(overlayAsset, claim.rights, claim.overlay, 'render asset');
    assertGeneratedNativeVideoReceiptAuthority(overlayAsset, claim);
    assertAudioSeparationReceiptAuthority(overlayAsset, claim);

    const sourceAsset = assetsById.get(claim.sourceAssetId);
    if (!sourceAsset) {
      throw authorityError(claim.overlay, 'source asset evidence is missing');
    }
    assertAudioAssetScope(
      sourceAsset,
      input.projectId,
      allowedUserIds,
      claim.overlay,
      claim.expectedSourceAssetType,
    );
    assertNotRevoked(overlayAsset, claim.overlay);
    assertNotRevoked(sourceAsset, claim.overlay);

    if (claim.overlayAssetId !== claim.sourceAssetId) {
      if (
        nonEmptyString(overlayAsset.parentAssetId) !== claim.sourceAssetId
        || overlayAsset.assignmentStatus !== 'attached'
      ) {
        throw authorityError(
          claim.overlay,
          'conditioned render asset is not attached to the claimed source asset',
        );
      }
    }

    const sourceRights = claim.audioSeparationReceipt
      ? { ...claim.rights, mediaRole: 'native-video' as const }
      : claim.rights;
    if (claim.audioSeparationReceipt) {
      assertRightsMatch(
        sourceAsset,
        sourceRights,
        claim.overlay,
        'separated-audio source asset',
      );
      assertSeparatedNativeVideoSourceAuthority(sourceAsset, sourceRights, claim);
    }
    assertSourceAuthority({
      rights: sourceRights,
      sourceAsset,
      projectId: input.projectId,
      allowedUserIds,
      overlay: claim.overlay,
    });
  }
}

function readAudioClaim(overlay: unknown): RenderAudioClaim {
  const record = asRecord(overlay);
  if (!record) throw authorityError(overlay, 'audio overlay is malformed');
  const claim = resolveAudioRightsClaim(record);
  if (claim.issue) throw authorityError(record, claim.issue);
  if (!claim.rights) throw authorityError(record, 'audio rights metadata is missing');
  const rights = claim.rights;
  const nativeVideoOverlay =
    record.type === 'video' && record.hasNativeAudio === true;
  if (nativeVideoOverlay && rights.mediaRole !== 'native-video') {
    throw authorityError(
      record,
      `native video cannot use ${rights.mediaRole ?? 'unspecified'} rights evidence`,
    );
  }
  if (record.type === 'sound' && rights.mediaRole === 'native-video') {
    throw authorityError(record, 'sound overlay cannot use native-video rights evidence');
  }
  if (nativeVideoOverlay && rights.source === 'preview-only') {
    throw authorityError(record, 'preview-only audio cannot remain embedded in a rendered video');
  }

  if (
    rights.source === 'preview-only'
    && rights.licensed === false
    && (rights.userChoice === 'swap' || rights.userChoice === 'no-music')
  ) {
    return {
      overlay: record,
      rights,
      overlayAssetId: '',
      sourceAssetId: '',
      requiresStoredEvidence: false,
      expectedAssetType: 'audio',
      expectedSourceAssetType: 'audio',
      audioSeparationReceipt: null,
    };
  }
  if (!rights.licensed) {
    throw authorityError(record, `${rights.source} audio is not licensed for rendering`);
  }

  const overlayAssetId = nonEmptyString(record.assetId);
  const sourceAssetId = nonEmptyString(rights.evidence?.sourceAssetId);
  if (!overlayAssetId || !sourceAssetId) {
    throw authorityError(record, 'licensed audio requires stored render and source asset identities');
  }
  const audioSeparationReceipt = readAudioSeparationReceipt(
    record,
    overlayAssetId,
    sourceAssetId,
    rights,
  );
  if (
    nativeVideoOverlay
    && rights.source === 'generated'
    && sourceAssetId !== overlayAssetId
  ) {
    throw authorityError(record, 'generated native-video rights must identify the rendered video asset');
  }
  if (nativeVideoOverlay && rights.source === 'generated') {
    const receiptIssue = getGeneratedNativeVideoReceiptIssue(
      record.generatedVideoReceipt,
      {
        assetId: overlayAssetId,
        licenseId: rights.evidence?.licenseId,
      },
    );
    if (receiptIssue) {
      throw authorityError(
        record,
        `generated native audio requires a matching FFmpeg probe receipt: ${receiptIssue}`,
      );
    }
  }
  return {
    overlay: record,
    rights,
    overlayAssetId,
    sourceAssetId,
    requiresStoredEvidence: true,
    expectedAssetType: nativeVideoOverlay ? 'video' : 'audio',
    expectedSourceAssetType: audioSeparationReceipt
      ? 'video'
      : nativeVideoOverlay ? 'video' : 'audio',
    audioSeparationReceipt,
  };
}

function isAudioRightsAuthorityCandidate(overlay: unknown): boolean {
  const record = asRecord(overlay);
  return Boolean(
    record
    && (
      (record.type === 'video' && record.hasNativeAudio === true)
      || (
        record.type === 'sound'
        && (
          isCanonicalMusicOverlay(record)
          || record.audioRights !== undefined
          || record.musicRights !== undefined
        )
      )
    )
  );
}

function assertAudioAssetScope(
  asset: StoredAudioAsset,
  projectId: string,
  allowedUserIds: Set<string>,
  overlay: unknown,
  expectedAssetType: 'audio' | 'video',
): void {
  if (asset.type !== expectedAssetType) {
    throw authorityError(
      overlay,
      `stored rights evidence is not a ${expectedAssetType} asset`,
    );
  }
  const ownedByProject = nonEmptyString(asset.projectId) === projectId;
  const ownedByProjectUser = allowedUserIds.has(nonEmptyString(asset.userId) ?? '');
  if (!ownedByProject && !ownedByProjectUser) {
    throw authorityError(overlay, 'stored audio evidence is outside the project scope');
  }
}

function assertGeneratedNativeVideoReceiptAuthority(
  asset: StoredAudioAsset,
  claim: RenderAudioClaim,
): void {
  if (
    claim.expectedAssetType !== 'video'
    || claim.rights.source !== 'generated'
  ) {
    return;
  }
  const receiptIssue = getGeneratedNativeVideoReceiptIssue(
    asset.generatedVideoReceipt,
    {
      assetId: claim.overlayAssetId,
      licenseId: claim.rights.evidence?.licenseId,
    },
  );
  if (receiptIssue) {
    throw authorityError(
      claim.overlay,
      `stored generated-video receipt is invalid: ${receiptIssue}`,
    );
  }
  if (
    canonicalGeneratedVideoReceipt(asset.generatedVideoReceipt)
    !== canonicalGeneratedVideoReceipt(claim.overlay.generatedVideoReceipt)
  ) {
    throw authorityError(
      claim.overlay,
      'stored generated-video receipt does not match the render claim',
    );
  }
}

function assertAudioSeparationReceiptAuthority(
  asset: StoredAudioAsset,
  claim: RenderAudioClaim,
): void {
  if (!claim.audioSeparationReceipt) return;
  const storedReceipt = readAudioSeparationReceiptValue(asset.audioSeparationReceipt);
  if (
    !storedReceipt
    || canonicalAudioSeparationReceipt(storedReceipt)
      !== canonicalAudioSeparationReceipt(claim.audioSeparationReceipt)
  ) {
    throw authorityError(
      claim.overlay,
      'stored audio-separation receipt does not match the render claim',
    );
  }
}

function assertSeparatedNativeVideoSourceAuthority(
  sourceAsset: StoredAudioAsset,
  sourceRights: AudioRightsContract,
  claim: RenderAudioClaim,
): void {
  if (sourceRights.source !== 'generated') return;
  const receiptIssue = getGeneratedNativeVideoReceiptIssue(
    sourceAsset.generatedVideoReceipt,
    {
      assetId: claim.sourceAssetId,
      licenseId: sourceRights.evidence?.licenseId,
    },
  );
  if (receiptIssue) {
    throw authorityError(
      claim.overlay,
      `separated audio source has invalid generated-video provenance: ${receiptIssue}`,
    );
  }
}

function assertRightsMatch(
  asset: StoredAudioAsset,
  expected: AudioRightsContract,
  overlay: unknown,
  label: string,
): void {
  const storedClaim = resolveAudioRightsClaim(asset);
  if (
    storedClaim.issue
    || !storedClaim.rights
    || JSON.stringify(canonicalRights(storedClaim.rights))
      !== JSON.stringify(canonicalRights(expected))
  ) {
    throw authorityError(overlay, `${label} rights do not match the render claim`);
  }
}

function assertSourceAuthority(input: {
  rights: AudioRightsContract;
  sourceAsset: StoredAudioAsset;
  projectId: string;
  allowedUserIds: Set<string>;
  overlay: unknown;
}): void {
  const { rights, sourceAsset, overlay } = input;
  if (rights.source === 'library') {
    if (isFreesoundCc0SfxAuthority(sourceAsset, rights)) {
      assertRightsMatch(sourceAsset, rights, overlay, 'Freesound source asset');
      return;
    }
    if (sourceAsset.source !== 'library') {
      throw authorityError(overlay, 'library audio is not backed by a library asset');
    }
    assertRightsMatch(sourceAsset, rights, overlay, 'library source asset');
    assertLibraryReceipt(sourceAsset, rights, input.projectId, input.allowedUserIds, overlay);
    return;
  }
  if (rights.source === 'generated') {
    if (
      sourceAsset.source !== 'generated'
      && !isGeneratedSfxProviderAuthority(sourceAsset, rights)
    ) {
      throw authorityError(overlay, 'generated audio is not backed by a generated asset');
    }
    assertRightsMatch(sourceAsset, rights, overlay, 'generated source asset');
    return;
  }
  if (rights.source === 'user-upload') {
    if (
      sourceAsset.source !== 'user-upload'
      || rights.evidence?.kind !== 'user-attestation'
      || !input.allowedUserIds.has(nonEmptyString(rights.evidence.attestedBy) ?? '')
    ) {
      throw authorityError(overlay, 'user-upload audio lacks an owner-backed attestation');
    }
    return;
  }
  if (rights.source === 'preview-only') {
    if (sourceAsset.source !== 'preview-only') {
      throw authorityError(overlay, 'attested preview audio lacks quarantined source evidence');
    }
    assertRightsMatch(sourceAsset, rights, overlay, 'preview source asset');
  }
}

function isFreesoundCc0SfxAuthority(
  asset: StoredAudioAsset,
  rights: AudioRightsContract,
): boolean {
  if (rights.mediaRole !== 'sfx') return false;
  const licenseId = nonEmptyString(rights.evidence?.licenseId);
  const providerId = licenseId?.match(/^freesound:([^:]+):creative-commons-0$/i)?.[1];
  return Boolean(
    providerId
    && nonEmptyString(asset.source)?.toLowerCase() === 'sfx-provider-freesound'
    && nonEmptyString(asset.sfxLibrarySource)?.toLowerCase() === 'freesound'
    && nonEmptyString(asset.sfxProviderId) === providerId
  );
}

function isGeneratedSfxProviderAuthority(
  asset: StoredAudioAsset,
  rights: AudioRightsContract,
): boolean {
  if (rights.mediaRole !== 'sfx') return false;
  const provider = nonEmptyString(asset.source)?.toLowerCase();
  const licenseId = nonEmptyString(rights.evidence?.licenseId);
  const allowedSources = licenseId
    ? GENERATED_SFX_LICENSE_SOURCES.get(licenseId)
    : null;
  return Boolean(
    provider
    && allowedSources?.has(provider)
  );
}

function assertLibraryReceipt(
  asset: StoredAudioAsset,
  rights: AudioRightsContract,
  projectId: string,
  allowedUserIds: Set<string>,
  overlay: unknown,
): void {
  const receipt = asRecord(asset.libraryLicenseReceipt);
  const agreement = asRecord(receipt?.agreement);
  const ownership = asRecord(receipt?.ownership);
  const sourceObject = asRecord(receipt?.sourceObject);
  if (
    receipt?.version !== 'editron-library-license-receipt-v1'
    || receipt.provider !== 'epidemic-sound'
    || !nonEmptyString(receipt.providerTrackId)
    || nonEmptyString(receipt.licenseId) !== rights.evidence?.licenseId
    || agreement?.authority !== 'NEVER_AUTOMATED'
    || agreement.configuredBy !== 'deployment-operator'
    || !nonEmptyString(agreement.reference)
    || nonEmptyString(ownership?.projectId) !== projectId
    || !allowedUserIds.has(nonEmptyString(ownership?.userId) ?? '')
    || !nonEmptyString(sourceObject?.sha256)
    || !positiveNumber(sourceObject?.size)
  ) {
    throw authorityError(overlay, 'library music lacks a matching durable license receipt');
  }
}

function assertNotRevoked(asset: StoredAudioAsset, overlay: unknown): void {
  const status = nonEmptyString(asset.licenseStatus)?.toLowerCase();
  if (
    asset.revokedAt
    || asset.rightsRevokedAt
    || status === 'revoked'
    || status === 'disabled'
  ) {
    throw authorityError(overlay, 'stored audio rights have been revoked');
  }
}

function canonicalRights(rights: AudioRightsContract): UnknownRecord {
  return {
    mediaRole: rights.mediaRole ?? null,
    source: rights.source,
    userChoice: rights.userChoice,
    licensed: rights.licensed,
    evidence: rights.evidence
      ? {
          kind: rights.evidence.kind,
          sourceAssetId: rights.evidence.sourceAssetId,
          attestationVersion: rights.evidence.attestationVersion ?? null,
          attestedAt: rights.evidence.attestedAt ?? null,
          attestedBy: rights.evidence.attestedBy ?? null,
          licenseId: rights.evidence.licenseId ?? null,
        }
      : null,
  };
}

function canonicalGeneratedVideoReceipt(value: unknown): string {
  const receipt = asRecord(value);
  const nativeAudio = asRecord(receipt?.nativeAudio);
  return JSON.stringify({
    version: receipt?.version ?? null,
    provider: receipt?.provider ?? null,
    model: receipt?.model ?? null,
    assetId: receipt?.assetId ?? null,
    providerJobId: receipt?.providerJobId ?? null,
    generatedAt: receipt?.generatedAt ?? null,
    nativeAudio: {
      requestMode: nativeAudio?.requestMode ?? null,
      present: nativeAudio?.present ?? null,
      probe: nativeAudio?.probe ?? null,
      probedAt: nativeAudio?.probedAt ?? null,
      licenseId: nativeAudio?.licenseId ?? null,
    },
  });
}

function readAudioSeparationReceipt(
  overlay: UnknownRecord,
  overlayAssetId: string,
  sourceAssetId: string,
  rights: AudioRightsContract,
): AudioSeparationReceipt | null {
  const metadata = asRecord(overlay.metadata);
  const isDubbingBackgroundStem = metadata?.isDubbingBackgroundStem === true;
  const receipt = readAudioSeparationReceiptValue(metadata?.audioSeparationReceipt);
  if (!receipt) {
    if (isDubbingBackgroundStem) {
      throw authorityError(overlay, 'dubbing background stem lacks an audio-separation receipt');
    }
    return null;
  }
  if (
    overlay.type !== 'sound'
    || rights.mediaRole !== 'other'
    || receipt.sourceAssetId !== sourceAssetId
    || receipt.derivativeAssetId !== overlayAssetId
  ) {
    throw authorityError(overlay, 'audio-separation receipt does not match the render claim');
  }
  return receipt;
}

function readAudioSeparationReceiptValue(value: unknown): AudioSeparationReceipt | null {
  const receipt = asRecord(value);
  const createdAt = nonEmptyString(receipt?.createdAt);
  if (
    receipt?.version !== 'editron-audio-separation-receipt-v1'
    || receipt.provider !== 'fal-ai'
    || receipt.model !== 'fal-ai/demucs:mdx_extra'
    || receipt.operation !== 'preserve-non-vocal-background'
    || receipt.stem !== 'other'
    || !nonEmptyString(receipt.sourceAssetId)
    || !nonEmptyString(receipt.derivativeAssetId)
    || !nonEmptyString(receipt.jobId)
    || !createdAt
    || !Number.isFinite(Date.parse(createdAt))
    || (
      receipt.vendorRequestId !== undefined
      && !nonEmptyString(receipt.vendorRequestId)
    )
  ) {
    return null;
  }
  return receipt as AudioSeparationReceipt;
}

function canonicalAudioSeparationReceipt(receipt: AudioSeparationReceipt): string {
  return JSON.stringify({
    version: receipt.version,
    provider: receipt.provider,
    model: receipt.model,
    operation: receipt.operation,
    stem: receipt.stem,
    sourceAssetId: receipt.sourceAssetId,
    derivativeAssetId: receipt.derivativeAssetId,
    jobId: receipt.jobId,
    createdAt: receipt.createdAt,
    vendorRequestId: receipt.vendorRequestId ?? null,
  });
}

function authorityError(overlay: unknown, reason: string): RenderAudioRightsAuthorityError {
  const record = asRecord(overlay);
  const id = record?.id;
  return new RenderAudioRightsAuthorityError(
    typeof id === 'string' || typeof id === 'number' ? id : null,
    reason,
  );
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
