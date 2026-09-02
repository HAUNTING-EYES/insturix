import { isInternalQStashWorkerAuthConfigured } from '@/lib/editron/security/internal-worker-auth';

type DispatchEnvironment = Readonly<Record<string, string | undefined>>;

export type PipelineVideoWorkerDispatchPolicyV1 =
  | { kind: 'DEVELOPMENT_FETCH' }
  | { kind: 'QSTASH'; qstashToken: string }
  | {
    kind: 'NOT_CONFIGURED';
    code: 'QSTASH_TOKEN_REQUIRED' | 'QSTASH_SIGNING_KEYS_REQUIRED';
    message: string;
  };

/**
 * Production may claim a queued video job only when the publisher and the
 * worker's signature verifier are both configured. Development remains the
 * only direct-fetch environment.
 */
export function resolvePipelineVideoWorkerDispatchPolicyV1(
  env: DispatchEnvironment = process.env,
): PipelineVideoWorkerDispatchPolicyV1 {
  const isDevelopment = env.APP_ENV === 'development' || env.NODE_ENV === 'development';
  if (isDevelopment) return { kind: 'DEVELOPMENT_FETCH' };

  const qstashToken = env.QSTASH_TOKEN?.trim();
  if (!qstashToken) {
    return {
      kind: 'NOT_CONFIGURED',
      code: 'QSTASH_TOKEN_REQUIRED',
      message: 'QSTASH_TOKEN is required to enqueue pipeline video generation outside development.',
    };
  }
  if (!isInternalQStashWorkerAuthConfigured(env)) {
    return {
      kind: 'NOT_CONFIGURED',
      code: 'QSTASH_SIGNING_KEYS_REQUIRED',
      message: 'QStash signing keys are required to enqueue pipeline video generation outside development.',
    };
  }
  return { kind: 'QSTASH', qstashToken };
}
