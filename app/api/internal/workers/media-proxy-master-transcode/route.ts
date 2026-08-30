import { createAuthenticatedMediaProxyMasterTranscodeWorkerV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-worker-route-v1';
import { runMediaProxyMasterTranscodeProductRuntimeDispatchV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-product-runtime-dispatch-v2';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const POST = createAuthenticatedMediaProxyMasterTranscodeWorkerV1({
  run: runMediaProxyMasterTranscodeProductRuntimeDispatchV2,
});
