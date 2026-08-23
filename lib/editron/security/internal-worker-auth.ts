import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextRequest, NextResponse } from 'next/server';

export const INTERNAL_WORKER_AUTH_NOT_CONFIGURED = 'INTERNAL_WORKER_AUTH_NOT_CONFIGURED';

type InternalQStashSigningEnvironment = Record<string, string | undefined>;

type InternalWorkerHandler = (
  request: NextRequest,
  context?: unknown,
) => Response | Promise<Response>;

function configuredSigningKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * A missing rotation key is a deployment failure, never permission to invoke
 * an internal QStash worker without signature verification.
 */
export function isInternalQStashWorkerAuthConfigured(
  env: InternalQStashSigningEnvironment = process.env,
): boolean {
  return Boolean(
    configuredSigningKey(env.QSTASH_CURRENT_SIGNING_KEY)
    && configuredSigningKey(env.QSTASH_NEXT_SIGNING_KEY),
  );
}

/**
 * Applies QStash verification at request time so an import made while a
 * deployment is misconfigured cannot permanently expose the raw handler.
 */
export function withInternalQStashWorkerAuth(
  handler: InternalWorkerHandler,
  routeId: string,
): InternalWorkerHandler {
  return async (request, context) => {
    const currentSigningKey = configuredSigningKey(process.env.QSTASH_CURRENT_SIGNING_KEY);
    const nextSigningKey = configuredSigningKey(process.env.QSTASH_NEXT_SIGNING_KEY);
    if (!currentSigningKey || !nextSigningKey) {
      console.error(`[InternalWorkerAuth] ${routeId} rejected because QStash signing keys are not configured.`);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: INTERNAL_WORKER_AUTH_NOT_CONFIGURED,
            routeId,
          },
        },
        { status: 503 },
      );
    }

    const verifiedHandler = verifySignatureAppRouter(handler, {
      currentSigningKey,
      nextSigningKey,
    });
    return verifiedHandler(request, context);
  };
}
