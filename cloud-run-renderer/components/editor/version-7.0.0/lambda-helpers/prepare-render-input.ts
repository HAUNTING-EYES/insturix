import { z } from "zod";

import { CompositionProps } from "../types";
import { assetResolver } from "@/lib/services/asset-resolver";

type CompositionInputProps = z.infer<typeof CompositionProps>;

const hasAssetIds = (overlays: CompositionInputProps["overlays"]) =>
  overlays?.some((overlay) => "assetId" in overlay && Boolean(overlay.assetId)) ??
  false;

/**
 * Ensures every overlay that references an assetId has a fresh, signed URL before rendering.
 * Falls back to the original props if asset resolution fails so Lambda renders still run.
 */
export const prepareRenderInputProps = async (
  inputProps: CompositionInputProps
): Promise<CompositionInputProps> => {
  if (!inputProps?.overlays?.length || !hasAssetIds(inputProps.overlays)) {
    return inputProps;
  }

  try {
    const overlaysWithUrls = await assetResolver.resolveProjectAssets(
      inputProps.overlays
    );

    return {
      ...inputProps,
      overlays: overlaysWithUrls,
    };
  } catch (error) {
    console.error(
      "Failed to refresh overlay asset URLs before Lambda render:",
      error
    );
    return inputProps;
  }
};
