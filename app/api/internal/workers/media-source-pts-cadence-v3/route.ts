import { createAuthenticatedMediaSourcePtsCadenceDurableEpochWorkerV3 }
  from '@/lib/editron/services/media-source-pts-cadence-durable-worker-route-v3';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const POST = createAuthenticatedMediaSourcePtsCadenceDurableEpochWorkerV3();
