import { createAuthenticatedMediaSourcePtsCadenceDurableWorkerV1 }
  from '@/lib/editron/services/media-source-pts-cadence-durable-worker-route-v1';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const POST = createAuthenticatedMediaSourcePtsCadenceDurableWorkerV1();
