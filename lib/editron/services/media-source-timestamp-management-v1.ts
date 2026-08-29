export type MediaSourceTimestampManagementV1 =
  | 'NONE'
  | 'EARLIER'
  | 'V3'
  | 'CONFLICTING';

/**
 * Classifies which persisted timestamp-map generation claims ownership of an
 * asset. This deliberately checks presence only: the selected generation's
 * owner remains responsible for validating its complete state and hashes.
 */
export function classifyMediaSourceTimestampManagementV1(
  asset: unknown,
): MediaSourceTimestampManagementV1 {
  const state = record(asset);
  if (!state) return 'NONE';

  const earlier = present(state.sourcePtsCadenceMapV1)
    || present(state.sourcePtsCadenceMapStateSha256V1)
    || present(state.sourcePtsCadenceMapV2)
    || present(state.sourcePtsCadenceMapStateSha256V2);
  const v3 = present(state.sourcePtsCadenceMapV3)
    || present(state.sourcePtsCadenceMapStateSha256V3);

  if (earlier && v3) return 'CONFLICTING';
  if (v3) return 'V3';
  if (earlier) return 'EARLIER';
  return 'NONE';
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}
