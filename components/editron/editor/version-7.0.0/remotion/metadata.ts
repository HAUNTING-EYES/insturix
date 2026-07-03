import type { CalculateMetadataFunction } from "remotion";

import { DURATION_IN_FRAMES, FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from "../constants";
import type { MainProps } from "./main";

export type EditronCompositionProps = MainProps & {
  readonly src?: string;
};

export const defaultEditronCompositionProps: EditronCompositionProps = {
  overlays: [],
  setSelectedOverlayId: () => {},
  selectedOverlayId: null,
  changeOverlay: () => {},
  durationInFrames: DURATION_IN_FRAMES,
  fps: FPS,
  width: VIDEO_WIDTH,
  height: VIDEO_HEIGHT,
  src: "",
};

export type EditronRenderMetadata = Pick<
  EditronCompositionProps,
  "durationInFrames" | "fps" | "width" | "height"
>;

export function resolveEditronRenderMetadata(
  props: Partial<EditronRenderMetadata> | undefined,
): EditronRenderMetadata {
  return {
    durationInFrames: positiveInteger(props?.durationInFrames, DURATION_IN_FRAMES),
    fps: positiveInteger(props?.fps, FPS),
    width: positiveInteger(props?.width, VIDEO_WIDTH),
    height: positiveInteger(props?.height, VIDEO_HEIGHT),
  };
}

export const calculateEditronMetadata: CalculateMetadataFunction<EditronCompositionProps> = ({ props }) => {
  const metadata = resolveEditronRenderMetadata(props);

  return {
    ...metadata,
    props: {
      ...props,
      ...metadata,
    },
  };
};

function positiveInteger(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback;
}