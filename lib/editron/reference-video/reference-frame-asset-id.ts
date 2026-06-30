import { SAAS_REFERENCE_RUBRIC_VERSION } from './saas-reference-video-analyzer';

export function buildReferenceFrameAssetId(input: {
  referenceAssetId: string;
  index: number;
  timestampSec: number;
}): string {
  const safeReferenceId = sanitizeAssetIdPart(input.referenceAssetId).slice(0, 36) || 'reference';
  const centisec = Math.max(0, Math.round(input.timestampSec * 100));
  return `ref_${SAAS_REFERENCE_RUBRIC_VERSION.replace(/[^a-z0-9]/gi, '_')}_${safeReferenceId}_${input.index}_${centisec}`;
}

function sanitizeAssetIdPart(value: string): string {
  return value.trim().replace(/[^a-z0-9_-]/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}
