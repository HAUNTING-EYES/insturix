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

export interface AudioRightsContract {
  mediaRole?: "music" | "sfx" | "voiceover" | "dubbing" | "other";
  source: "user-upload" | "library" | "generated" | "preview-only";
  userChoice: "swap" | "no-music" | "attested";
  licensed: boolean;
  evidence?: {
    kind: "user-attestation" | "library-license" | "generated-provider";
    sourceAssetId: string;
    attestationVersion?: typeof MUSIC_RIGHTS_ATTESTATION_VERSION;
    attestedAt?: string;
    attestedBy?: string;
    licenseId?: string;
  };
}

export interface MusicRightsContract extends AudioRightsContract {
  mediaRole?: "music";
}

export interface RenderAudioRightsNotice {
  code:
    | "PREVIEW_AUDIO_REMOVED_NO_MUSIC"
    | "PREVIEW_AUDIO_REMOVED_NO_CLEARED_SWAP";
  overlayId: string | number | null;
  action: "stripped";
  source: "preview-only";
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
  if (!isRecord(overlay) || overlay.type !== "sound") {
    return { overlay };
  }

  const knownPreviewSource = hasKnownStockPreviewSource(overlay);
  const rightsValue = overlay.audioRights ?? overlay.musicRights;
  if (rightsValue === undefined && !knownPreviewSource) {
    return { overlay };
  }
  if (!isAudioRightsContract(rightsValue)) {
    throw new UnlicensedAudioInRenderError(
      overlay,
      knownPreviewSource
        ? "bundled preview source has no resolved rights decision"
        : "audio rights metadata is missing or malformed"
    );
  }

  if (rightsValue.source === "preview-only" || knownPreviewSource) {
    if (rightsValue.userChoice === "no-music") {
      return {
        overlay: null,
        notice: buildRightsNotice(
          overlay,
          "PREVIEW_AUDIO_REMOVED_NO_MUSIC"
        ),
      };
    }
    if (rightsValue.userChoice === "swap") {
      return {
        overlay: null,
        notice: buildRightsNotice(
          overlay,
          "PREVIEW_AUDIO_REMOVED_NO_CLEARED_SWAP"
        ),
      };
    }
    if (rightsValue.userChoice === "attested" && rightsValue.licensed) {
      return { overlay };
    }
    throw new UnlicensedAudioInRenderError(
      overlay,
      "preview audio has no renderable license decision"
    );
  }

  if (!rightsValue.licensed) {
    throw new UnlicensedAudioInRenderError(
      overlay,
      `${rightsValue.source} audio is explicitly unlicensed`
    );
  }

  return { overlay };
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

function isAudioRightsContract(value: unknown): value is AudioRightsContract {
  return (
    isRecord(value) &&
    typeof value.source === "string" &&
    AUDIO_RIGHTS_SOURCES.has(value.source as AudioRightsContract["source"]) &&
    typeof value.userChoice === "string" &&
    AUDIO_RIGHTS_CHOICES.has(
      value.userChoice as AudioRightsContract["userChoice"]
    ) &&
    typeof value.licensed === "boolean"
  );
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

type ChapterRenderApiDataInput = {
  jobId: string;
  region: string;
  chapters: number;
};

export function buildChapterRenderApiData({
  jobId,
  region,
  chapters,
}: ChapterRenderApiDataInput) {
  return {
    renderId: jobId,
    bucketName: "chapter-render",
    region,
    isChapterRender: true,
    chapters,
    message: `Split into ${chapters} chapters for parallel rendering`,
  };
}
