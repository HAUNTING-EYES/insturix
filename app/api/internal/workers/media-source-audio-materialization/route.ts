import { createAuthenticatedMediaSourceAudioDurableWorkerV1 }
  from '@/lib/editron/services/media-source-audio-durable-worker-route-v1';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const POST = createAuthenticatedMediaSourceAudioDurableWorkerV1();
