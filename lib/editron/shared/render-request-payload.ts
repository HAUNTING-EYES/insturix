type RenderInputProps = {
  overlays?: unknown[];
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
  return {
    ...inputProps,
    overlays: Array.isArray(inputProps.overlays)
      ? inputProps.overlays.map(compactOverlayForLambdaRender)
      : inputProps.overlays,
  };
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
