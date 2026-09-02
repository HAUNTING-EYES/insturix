import { createAuthenticatedMediaSourcePtsCadenceVersionEvidenceBackfillWorkerV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-worker-route-v1';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const POST =
  createAuthenticatedMediaSourcePtsCadenceVersionEvidenceBackfillWorkerV1();
