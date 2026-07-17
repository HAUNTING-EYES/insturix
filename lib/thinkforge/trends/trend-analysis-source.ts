import { validateReferenceVideoUrlForAutoEditIntake } from '@/lib/editron/reference-video/reference-video-source';

type TrendEvidenceWithSource = { sourceUrl?: string };

/** Uses the same capability contract as the worker that will ingest the source. */
export function isAnalyzableTrendVideoUrl(sourceUrl: unknown): sourceUrl is string {
  if (typeof sourceUrl !== 'string' || sourceUrl.trim().length === 0) return false;
  return validateReferenceVideoUrlForAutoEditIntake(sourceUrl).ok;
}

export function firstAnalyzableTrendVideoUrl(
  evidence: readonly TrendEvidenceWithSource[],
): string | undefined {
  return evidence.find((item) => isAnalyzableTrendVideoUrl(item.sourceUrl))?.sourceUrl;
}

export function prioritizeAnalyzableTrendEvidence<T extends TrendEvidenceWithSource>(
  evidence: readonly T[],
): T[] {
  const analyzable: T[] = [];
  const unsupported: T[] = [];
  for (const item of evidence) {
    (isAnalyzableTrendVideoUrl(item.sourceUrl) ? analyzable : unsupported).push(item);
  }
  return [...analyzable, ...unsupported];
}
