type RenderInputProps = {
  overlays?: unknown[];
  audioRightsNotices?: RenderAudioRightsNotice[];
  durationInFrames?: unknown;
  fps?: unknown;
  width?: unknown;
  height?: unknown;
  src?: unknown;
  [key: string]: unknown;
};

type ProjectRenderSnapshot = {
  overlays?: unknown[];
  durationInFrames?: unknown;
  fps?: unknown;
  playerDimensions?: {
    width?: unknown;
    height?: unknown;
  };
};

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export const MUSIC_RIGHTS_ATTESTATION_VERSION =
  "music-rights-attestation-v1" as const;
export const AUDIO_RIGHTS_ATTESTATION_VERSION =
  "audio-rights-attestation-v1" as const;

type AudioRightsAttestationVersion =
  | typeof MUSIC_RIGHTS_ATTESTATION_VERSION
  | typeof AUDIO_RIGHTS_ATTESTATION_VERSION;

export interface AudioRightsContract {
  mediaRole?: "music" | "sfx" | "voiceover" | "dubbing" | "native-video" | "other";
  source: "user-upload" | "library" | "generated" | "preview-only";
  userChoice: "swap" | "no-music" | "attested";
  licensed: boolean;
  evidence?: {
    kind: "user-attestation" | "library-license" | "generated-provider";
    sourceAssetId: string;
    attestationVersion?: AudioRightsAttestationVersion;
    attestedAt?: string;
    attestedBy?: string;
    licenseId?: string;
  };
}

export interface MusicRightsContract extends AudioRightsContract {
  mediaRole?: "music";
}

export interface AudioRightsClaimResolution {
  rights: AudioRightsContract | null;
  issue: string | null;
}

export interface RenderAudioRightsNotice {
  code:
    | "PREVIEW_AUDIO_REMOVED_NO_MUSIC"
    | "PREVIEW_AUDIO_REMOVED_NO_CLEARED_SWAP";
  overlayId: string | number | null;
  action: "stripped";
  source: "preview-only";
}

export interface ProjectRenderEligibilityIssue {
  overlayId: string | number | null;
  overlayType: string;
  reason: string;
}

export interface ProjectRenderEligibilityAudit {
  version: "editron-project-render-eligibility-v1";
  status: "eligible" | "blocked" | "unknown";
  issueCount: number;
  issues: ProjectRenderEligibilityIssue[];
  strippedAudioNotices: RenderAudioRightsNotice[];
  truncated: boolean;
}

type RenderableAudioDecision = {
  overlay: unknown | null;
  notice?: RenderAudioRightsNotice;
};

type RenderableAudioInputProps<T extends RenderInputProps> = T & {
  audioRightsNotices?: RenderAudioRightsNotice[];
};

const AUDIO_RIGHTS_SOURCES = new Set<AudioRightsContract["source"]>([
  "user-upload",
  "library",
  "generated",
  "preview-only",
]);
const AUDIO_RIGHTS_CHOICES = new Set<AudioRightsContract["userChoice"]>([
  "swap",
  "no-music",
  "attested",
]);
const AUDIO_MEDIA_ROLES = new Set<NonNullable<AudioRightsContract["mediaRole"]>>([
  "music",
  "sfx",
  "voiceover",
  "dubbing",
  "native-video",
  "other",
]);
const GENERATED_VIDEO_RECEIPT_VERSION = "editron-generated-video-receipt-v1";
const GENERATED_VIDEO_PROVIDERS = new Set(["fal-ai", "kie-ai"]);
const NATIVE_AUDIO_REQUEST_MODES = new Set([
  "enabled",
  "disabled",
  "provider-fixed",
  "not-supported",
]);
const STOCK_PREVIEW_HOST = "rwxrdxvxndclnqvznxfj.supabase.co";
const STOCK_PREVIEW_PATH = "/storage/v1/object/public/sounds/";

export class UnlicensedAudioInRenderError extends Error {
  readonly code = "UNLICENSED_AUDIO_IN_RENDER";
  readonly overlayId: string | number | null;

  constructor(overlay: unknown, reason: string) {
    const overlayId = readOverlayId(overlay);
    super(
      `Cannot render unlicensed audio overlay ${overlayId === null ? "unknown" : String(overlayId)}: ${reason}`
    );
    this.name = "UnlicensedAudioInRenderError";
    this.overlayId = overlayId;
  }
}

const RENDER_OWNED_METADATA_KEYS = new Set([
  "atomicOverlayDecision",
  "atomicOverlayForm",
  "atomicOverlayPlan",
  "atomicOverlayReceipt",
  "atomicTransitionForm",
  "nativeAudioEvidence",
]);

const RENDER_DROPPABLE_OVERLAY_KEYS = [
  "atomicMomentBundle",
  "atomicMomentBundles",
  "contentStructure",
  "decisionAuthority",
  "generatedVideoReceipt",
  "mgExpressionAuthority",
  "qualityReview",
  "semanticAtoms",
  "semanticMgCandidateLedger",
  "unifiedDecisionBundle",
  "visualExplanationContract",
] as const;

const RENDER_ELIGIBILITY_ONLY_OVERLAY_KEYS = [
  "_workerAdded",
  "audioRights",
  "musicRights",
] as const;

/**
 * Browser render requests must stay small enough for Vercel to accept them.
 * When a projectId is available, Mongo is the render source of truth.
 */
export function buildCompactProjectRenderInputProps<T extends RenderInputProps>(
  inputProps: T
): T {
  return {
    ...inputProps,
    overlays: [],
  };
}

export function shouldHydrateRenderInputFromProject(
  inputProps: RenderInputProps | null | undefined
): boolean {
  return !Array.isArray(inputProps?.overlays) || inputProps.overlays.length === 0;
}

export function buildLambdaRenderInputProps<T extends RenderInputProps>(
  inputProps: T
): T {
  const renderableProps = resolveRenderableAudioInputProps(inputProps);
  return {
    ...renderableProps,
    overlays: Array.isArray(renderableProps.overlays)
      ? renderableProps.overlays.map(compactOverlayForLambdaRender)
      : renderableProps.overlays,
  };
}

export function resolveRenderableAudioInputProps<T extends RenderInputProps>(
  inputProps: T
): RenderableAudioInputProps<T> {
  if (!Array.isArray(inputProps.overlays)) return inputProps;

  const notices = Array.isArray(inputProps.audioRightsNotices)
    ? [...inputProps.audioRightsNotices]
    : [];
  const overlays: unknown[] = [];

  for (const overlay of inputProps.overlays) {
    const decision = resolveRenderableAudio(overlay);
    if (decision.overlay !== null) overlays.push(decision.overlay);
    if (decision.notice) notices.push(decision.notice);
  }

  return {
    ...inputProps,
    overlays,
    ...(notices.length > 0 ? { audioRightsNotices: notices } : {}),
  };
}

export function resolveRenderableAudio(
  overlay: unknown
): RenderableAudioDecision {
  if (!isRecord(overlay)) {
    return { overlay };
  }
  const nativeVideoOverlay =
    overlay.type === "video" && overlay.hasNativeAudio === true;
  const nativeAudioBoundaryOverlay = isNativeAudioBoundarySoundOverlay(overlay);
  if (
    overlay.type === "sound" &&
    !isSoundOverlayWithRenderableSource(overlay) &&
    overlay.audioRights === undefined &&
    overlay.musicRights === undefined
  ) {
    return { overlay };
  }
  if (overlay.type !== "sound" && !nativeVideoOverlay) {
    return { overlay };
  }

  const knownPreviewSource =
    overlay.type === "sound" && hasKnownStockPreviewSource(overlay);
  const musicOverlay = isCanonicalMusicOverlay(overlay);
  const rightsClaim = resolveAudioRightsClaim(overlay);
  if (rightsClaim.issue) {
    throw new UnlicensedAudioInRenderError(overlay, rightsClaim.issue);
  }
  const rightsValue = rightsClaim.rights;
  if (rightsValue === null) {
    throw new UnlicensedAudioInRenderError(
      overlay,
      knownPreviewSource
        ? "bundled preview source has no resolved rights decision"
        : musicOverlay
          ? "background music has no durable rights receipt"
          : nativeVideoOverlay
            ? "embedded native audio has no durable rights receipt"
            : "audio rights metadata is missing"
    );
  }
  const audioRights = rightsValue;

  if (
    nativeVideoOverlay &&
    audioRights.mediaRole !== "native-video"
  ) {
    throw new UnlicensedAudioInRenderError(
      overlay,
      `native video cannot use ${audioRights.mediaRole ?? "unspecified"} rights evidence`
    );
  }
  if (
    nativeAudioBoundaryOverlay &&
    audioRights.mediaRole !== "native-video"
  ) {
    throw new UnlicensedAudioInRenderError(
      overlay,
      `native video audio boundary cannot use ${audioRights.mediaRole ?? "unspecified"} rights evidence`
    );
  }
  if (
    overlay.type === "sound" &&
    audioRights.mediaRole === "native-video" &&
    !nativeAudioBoundaryOverlay
  ) {
    throw new UnlicensedAudioInRenderError(
      overlay,
      "sound overlay cannot use native-video rights evidence"
    );
  }
  if (
    musicOverlay &&
    audioRights.mediaRole !== undefined &&
    audioRights.mediaRole !== "music"
  ) {
    throw new UnlicensedAudioInRenderError(
      overlay,
      `background music cannot use ${audioRights.mediaRole} rights evidence`
    );
  }

  if (knownPreviewSource && audioRights.source !== "preview-only") {
    throw new UnlicensedAudioInRenderError(
      overlay,
      `bundled preview source contradicts declared ${audioRights.source} provenance`
    );
  }

  if (
    (nativeVideoOverlay || nativeAudioBoundaryOverlay) &&
    audioRights.source === "preview-only"
  ) {
    throw new UnlicensedAudioInRenderError(
      overlay,
      "preview-only audio cannot remain embedded in a rendered video"
    );
  }
  if (
    (nativeVideoOverlay || nativeAudioBoundaryOverlay) &&
    audioRights.source === "generated"
  ) {
    const receiptIssue = getGeneratedNativeVideoReceiptIssue(
      overlay.generatedVideoReceipt,
      {
        assetId: overlay.assetId,
        licenseId: audioRights.evidence?.licenseId,
      }
    );
    if (receiptIssue) {
      throw new UnlicensedAudioInRenderError(
        overlay,
        `generated native audio requires a matching FFmpeg probe receipt: ${receiptIssue}`
      );
    }
  }

  if (audioRights.source === "preview-only" || knownPreviewSource) {
    if (audioRights.userChoice === "no-music") {
      return {
        overlay: null,
        notice: buildRightsNotice(
          overlay,
          "PREVIEW_AUDIO_REMOVED_NO_MUSIC"
        ),
      };
    }
    if (audioRights.userChoice === "swap") {
      return {
        overlay: null,
        notice: buildRightsNotice(
          overlay,
          "PREVIEW_AUDIO_REMOVED_NO_CLEARED_SWAP"
        ),
      };
    }
    if (audioRights.userChoice === "attested" && audioRights.licensed) {
      return { overlay };
    }
    throw new UnlicensedAudioInRenderError(
      overlay,
      "preview audio has no renderable license decision"
    );
  }

  if (!audioRights.licensed) {
    throw new UnlicensedAudioInRenderError(
      overlay,
      `${audioRights.source} audio is explicitly unlicensed`
    );
  }

  return { overlay };
}

export function auditProjectRenderEligibility(
  project: { overlays?: unknown[] } | null | undefined
): ProjectRenderEligibilityAudit {
  if (!Array.isArray(project?.overlays)) {
    return {
      version: "editron-project-render-eligibility-v1",
      status: "unknown",
      issueCount: 1,
      issues: [{
        overlayId: null,
        overlayType: "project",
        reason: "Project overlays are unavailable, so render eligibility could not be evaluated.",
      }],
      strippedAudioNotices: [],
      truncated: false,
    };
  }

  const allIssues: ProjectRenderEligibilityIssue[] = [];
  const allNotices: RenderAudioRightsNotice[] = [];
  for (const overlay of project.overlays) {
    try {
      const decision = resolveRenderableAudio(overlay);
      if (decision.notice) allNotices.push(decision.notice);
    } catch (error) {
      if (!(error instanceof UnlicensedAudioInRenderError)) throw error;
      allIssues.push({
        overlayId: error.overlayId,
        overlayType: isRecord(overlay) && typeof overlay.type === "string"
          ? overlay.type
          : "unknown",
        reason: error.message,
      });
    }
  }

  const maxEntries = 100;
  return {
    version: "editron-project-render-eligibility-v1",
    status: allIssues.length > 0 ? "blocked" : "eligible",
    issueCount: allIssues.length,
    issues: allIssues.slice(0, maxEntries),
    strippedAudioNotices: allNotices.slice(0, maxEntries),
    truncated: allIssues.length > maxEntries || allNotices.length > maxEntries,
  };
}

/**
 * Canonical overlay state that can affect rendered pixels or audio.
 * Rights metadata is evaluated before it is removed: a rights decision that
 * suppresses playback still changes this snapshot from an overlay to null,
 * while provenance-only refreshes do not masquerade as audible edits.
 */
export function buildOverlayRenderTruthSnapshot(overlay: unknown): unknown {
  const renderable = resolveRenderableAudio(overlay).overlay;
  if (renderable === null) return null;

  const compact = compactOverlayForLambdaRender(renderable);
  if (!isRecord(compact)) return compact;

  const snapshot: Record<string, unknown> = { ...compact };
  for (const key of RENDER_ELIGIBILITY_ONLY_OVERLAY_KEYS) {
    delete snapshot[key];
  }
  return snapshot;
}

export function buildProjectRenderInputProps(
  project: ProjectRenderSnapshot,
  inputProps: RenderInputProps | null | undefined
): RenderInputProps {
  const props = inputProps ?? {};
  const projectDimensions = project.playerDimensions ?? {};

  return {
    ...props,
    overlays: Array.isArray(project.overlays) ? project.overlays : [],
    durationInFrames:
      finiteNumber(project.durationInFrames) ??
      finiteNumber(props.durationInFrames) ??
      0,
    fps: finiteNumber(project.fps) ?? finiteNumber(props.fps) ?? 30,
    width:
      finiteNumber(projectDimensions.width) ??
      finiteNumber(props.width) ??
      1920,
    height:
      finiteNumber(projectDimensions.height) ??
      finiteNumber(props.height) ??
      1080,
    src: typeof props.src === "string" ? props.src : "",
  };
}
function compactOverlayForLambdaRender(overlay: unknown): unknown {
  if (!isRecord(overlay)) return overlay;
  const compact: Record<string, unknown> = { ...overlay };

  for (const key of RENDER_DROPPABLE_OVERLAY_KEYS) {
    delete compact[key];
  }

  if (isRecord(compact.metadata)) {
    const metadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(compact.metadata)) {
      if (RENDER_OWNED_METADATA_KEYS.has(key) && value !== undefined) {
        metadata[key] = value;
      }
    }
    if (Object.keys(metadata).length > 0) {
      compact.metadata = metadata;
    } else {
      delete compact.metadata;
    }
  }

  return compact;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getAudioRightsContractIssue(value: unknown): string | null {
  if (!isRecord(value)) return "audio rights metadata is missing or malformed";
  if (
    typeof value.source !== "string" ||
    !AUDIO_RIGHTS_SOURCES.has(value.source as AudioRightsContract["source"])
  ) {
    return "audio rights source is missing or unsupported";
  }
  if (
    typeof value.userChoice !== "string" ||
    !AUDIO_RIGHTS_CHOICES.has(
      value.userChoice as AudioRightsContract["userChoice"]
    )
  ) {
    return "audio rights choice is missing or unsupported";
  }
  if (typeof value.licensed !== "boolean") {
    return "audio licensed state is missing or malformed";
  }
  if (
    value.mediaRole !== undefined &&
    (
      typeof value.mediaRole !== "string" ||
      !AUDIO_MEDIA_ROLES.has(
        value.mediaRole as NonNullable<AudioRightsContract["mediaRole"]>
      )
    )
  ) {
    return "audio media role is unsupported";
  }
  if (!value.licensed) return null;
  if (value.userChoice !== "attested") {
    return "licensed audio requires an attested rights choice";
  }

  const evidence = value.evidence;
  if (!isRecord(evidence) || !nonEmptyString(evidence.sourceAssetId)) {
    return "licensed audio requires durable source-asset evidence";
  }
  if (value.source === "library") {
    return evidence.kind === "library-license" && nonEmptyString(evidence.licenseId)
      ? null
      : "library audio requires a durable library-license receipt";
  }
  if (value.source === "generated") {
    return evidence.kind === "generated-provider" && nonEmptyString(evidence.licenseId)
      ? null
      : "generated audio requires a durable provider-license receipt";
  }
  if (value.source === "user-upload" || value.source === "preview-only") {
    const expectedVersion =
      value.mediaRole !== undefined && value.mediaRole !== "music"
        ? AUDIO_RIGHTS_ATTESTATION_VERSION
        : MUSIC_RIGHTS_ATTESTATION_VERSION;
    return (
      evidence.kind === "user-attestation" &&
      evidence.attestationVersion === expectedVersion &&
      nonEmptyString(evidence.attestedBy) &&
      isValidDateString(evidence.attestedAt)
    )
      ? null
      : "user-attested audio requires a current durable attestation receipt";
  }
  return "audio rights source is unsupported";
}

export function getGeneratedNativeVideoReceiptIssue(
  value: unknown,
  expectation: {
    assetId: unknown;
    licenseId: unknown;
  }
): string | null {
  if (!isRecord(value)) return "generation receipt is missing or malformed";
  if (value.version !== GENERATED_VIDEO_RECEIPT_VERSION) {
    return "generation receipt version is missing or unsupported";
  }
  if (
    typeof value.provider !== "string" ||
    !GENERATED_VIDEO_PROVIDERS.has(value.provider)
  ) {
    return "generation provider is missing or unsupported";
  }
  if (!nonEmptyString(value.model)) return "generation model is missing";
  const expectedAssetId = nonEmptyString(expectation.assetId);
  if (
    !expectedAssetId ||
    nonEmptyString(value.assetId) !== expectedAssetId
  ) {
    return "generation receipt asset does not match the video overlay";
  }
  if (!isValidDateString(value.generatedAt)) {
    return "generation timestamp is missing or malformed";
  }
  if (
    value.providerJobId !== undefined &&
    !nonEmptyString(value.providerJobId)
  ) {
    return "provider job identity is malformed";
  }

  const nativeAudio = value.nativeAudio;
  if (!isRecord(nativeAudio)) return "native-audio probe evidence is missing";
  if (
    typeof nativeAudio.requestMode !== "string" ||
    !NATIVE_AUDIO_REQUEST_MODES.has(nativeAudio.requestMode)
  ) {
    return "native-audio request mode is missing or unsupported";
  }
  if (nativeAudio.present !== true) {
    return "native-audio probe did not confirm an embedded stream";
  }
  if (nativeAudio.probe !== "ffmpeg-audio-stream-decode") {
    return "native-audio stream was not verified by FFmpeg decode";
  }
  if (!isValidDateString(nativeAudio.probedAt)) {
    return "native-audio probe timestamp is missing or malformed";
  }
  const expectedLicenseId = nonEmptyString(expectation.licenseId);
  if (
    !expectedLicenseId ||
    nonEmptyString(nativeAudio.licenseId) !== expectedLicenseId
  ) {
    return "native-audio license does not match the rights receipt";
  }
  return null;
}

export function resolveAudioRightsClaim(
  record: unknown
): AudioRightsClaimResolution {
  if (!isRecord(record)) {
    return {
      rights: null,
      issue: "audio rights container is malformed",
    };
  }

  const audioRights = record.audioRights;
  const musicRights = record.musicRights;
  const hasAudioRights = audioRights !== undefined;
  const hasMusicRights = musicRights !== undefined;
  if (!hasAudioRights && !hasMusicRights) {
    return { rights: null, issue: null };
  }

  if (hasAudioRights) {
    const issue = getAudioRightsContractIssue(audioRights);
    if (issue) return { rights: null, issue: `audioRights ${issue}` };
  }
  if (hasMusicRights) {
    const issue = getAudioRightsContractIssue(musicRights);
    if (issue) return { rights: null, issue: `musicRights ${issue}` };
  }

  const resolvedAudioRights = hasAudioRights
    ? audioRights as AudioRightsContract
    : null;
  const resolvedMusicRights = hasMusicRights
    ? musicRights as AudioRightsContract
    : null;
  if (
    resolvedAudioRights
    && resolvedMusicRights
    && canonicalAudioRightsSignature(resolvedAudioRights)
      !== canonicalAudioRightsSignature(resolvedMusicRights)
  ) {
    return {
      rights: null,
      issue: "audioRights and musicRights conflict",
    };
  }

  return {
    rights: resolvedAudioRights ?? resolvedMusicRights,
    issue: null,
  };
}

export function isCanonicalMusicOverlay(overlay: unknown): boolean {
  if (!isRecord(overlay) || overlay.type !== "sound") return false;
  const assetId = nonEmptyString(overlay.assetId);
  return (
    overlay.row === 1 ||
    overlay.row === "1" ||
    overlay.mediaRole === "music" ||
    overlay.audioRole === "music" ||
    Boolean(assetId?.toLowerCase().startsWith("bgm_"))
  );
}

export function isNativeAudioBoundarySoundOverlay(overlay: unknown): boolean {
  if (!isRecord(overlay) || overlay.type !== "sound") return false;
  const metadata = isRecord(overlay.metadata) ? overlay.metadata : null;
  return (
    metadata?.source === "edl-native-audio-boundary" &&
    nonEmptyString(metadata.sourceClipId) !== null &&
    (
      metadata.audioBoundaryKind === "j-cut" ||
      metadata.audioBoundaryKind === "l-cut"
    )
  );
}

export function isSoundOverlayWithRenderableSource(overlay: unknown): boolean {
  if (!isRecord(overlay) || overlay.type !== "sound") return false;
  return [overlay.assetId, overlay.src, overlay.content]
    .some((value) => nonEmptyString(value) !== null);
}

function canonicalAudioRightsSignature(rights: AudioRightsContract): string {
  return JSON.stringify({
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
  });
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isValidDateString(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function hasKnownStockPreviewSource(overlay: Record<string, unknown>): boolean {
  return [overlay.src, overlay.content].some((value) => {
    if (typeof value !== "string") return false;
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.hostname.toLowerCase() === STOCK_PREVIEW_HOST &&
        url.pathname.startsWith(STOCK_PREVIEW_PATH)
      );
    } catch {
      return false;
    }
  });
}

function readOverlayId(overlay: unknown): string | number | null {
  if (!isRecord(overlay)) return null;
  return typeof overlay.id === "string" || typeof overlay.id === "number"
    ? overlay.id
    : null;
}

function buildRightsNotice(
  overlay: unknown,
  code: RenderAudioRightsNotice["code"]
): RenderAudioRightsNotice {
  return {
    code,
    overlayId: readOverlayId(overlay),
    action: "stripped",
    source: "preview-only",
  };
}

export const CHAPTER_ORCHESTRATION_EXECUTION_KIND =
  "CHAPTER_ORCHESTRATION" as const;

export type ChapterRenderApiData = {
  executionKind: typeof CHAPTER_ORCHESTRATION_EXECUTION_KIND;
  orchestrationId: string;
  /** Generic UI identity; chapter progress uses orchestrationId instead. */
  renderId: string;
  region: string;
  chapters: number;
  message: string;
};

type ChapterRenderApiDataInput = {
  jobId: string;
  region: string;
  chapters: number;
};

export function buildChapterRenderApiData({
  jobId,
  region,
  chapters,
}: ChapterRenderApiDataInput): ChapterRenderApiData {
  return {
    executionKind: CHAPTER_ORCHESTRATION_EXECUTION_KIND,
    orchestrationId: jobId,
    renderId: jobId,
    region,
    chapters,
    message: `Split into ${chapters} chapters for parallel rendering`,
  };
}
