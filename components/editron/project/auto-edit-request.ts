import type { AutoEditOptions } from '@/components/editron/project/auto-edit-dialog';
import { normalizeEditorialPreferences } from '@/lib/editron/production-brief/editorial-preferences';

const AUTO_EDIT_OPTION_KEYS: Array<keyof AutoEditOptions> = [
  'platform',
  'aspectRatio',
  'userIntent',
  'script',
  'referenceAssetId',
  'referenceVideoUrl',
];

export interface BuildAutoEditFromAssetPayloadInput {
  assetId: string;
  title: string;
  brandId?: string | null;
  options?: AutoEditOptions;
}

export function buildAutoEditFromAssetPayload({
  assetId,
  title,
  brandId,
  options = {},
}: BuildAutoEditFromAssetPayloadInput) {
  const payload: Record<string, unknown> = {
    assetId,
    title,
  };

  const normalizedBrandId = brandId?.trim();
  if (normalizedBrandId) {
    payload.brandId = normalizedBrandId;
  }

  for (const key of AUTO_EDIT_OPTION_KEYS) {
    const value = options[key];
    if (!value) continue;

    const normalizedValue = typeof value === 'string' ? value.trim() : value;
    if (normalizedValue) {
      payload[key] = normalizedValue;
    }
  }

  const editorialPreferences = normalizeEditorialPreferences(options.editorialPreferences);
  if (editorialPreferences) payload.editorialPreferences = editorialPreferences;

  return payload;
}
