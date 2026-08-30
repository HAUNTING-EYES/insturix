import { createAuthenticatedMediaSourceAudioEvidenceBackfillWorkerV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-worker-route-v1';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const POST = createAuthenticatedMediaSourceAudioEvidenceBackfillWorkerV1();
