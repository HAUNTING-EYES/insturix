import { z } from "zod";

import { CompositionProps } from "../types";
import { assetResolver } from "@/lib/editron/services/asset-resolver";
import { getDatabase, COLLECTIONS } from "@/lib/editron/db/mongodb";

type CompositionInputProps = z.infer<typeof CompositionProps>;

const hasAssetIds = (overlays: CompositionInputProps["overlays"]) =>
  overlays?.some((overlay) => "assetId" in overlay && Boolean(overlay.assetId)) ??
  false;

/**
 * Ensures every overlay that references an assetId has a fresh, signed URL before rendering.
 * Blocks render if any asset is still a proxy (original still uploading).
 * Falls back to the original props if asset resolution fails so Lambda renders still run.
 */
export const prepareRenderInputProps = async (
  inputProps: CompositionInputProps
): Promise<CompositionInputProps> => {
  if (!inputProps?.overlays?.length || !hasAssetIds(inputProps.overlays)) {
    return inputProps;
  }

  // Block render if any overlay references a proxy asset
  const assetIds = inputProps.overlays
    .filter((o) => "assetId" in o && Boolean(o.assetId))
    .map((o) => (o as { assetId: string }).assetId);

  if (assetIds.length > 0) {
    const db = await getDatabase();
    const proxyAsset = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne({
      assetId: { $in: assetIds },
      isProxy: true,
    });
    if (proxyAsset) {
      throw new Error(
        `Cannot render: asset "${proxyAsset.filename}" is still uploading in full quality. Please wait for the upload to complete.`
      );
    }
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
