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
