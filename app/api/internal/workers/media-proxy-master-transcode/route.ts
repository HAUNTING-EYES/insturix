import { createAuthenticatedMediaProxyMasterTranscodeWorkerV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-worker-route-v1';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const POST = createAuthenticatedMediaProxyMasterTranscodeWorkerV1();
