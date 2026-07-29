import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import {
  createFilesystemSfxCatalogSemanticWorker,
  SFX_SEMANTIC_WORKER_HEALTH_PATH,
  SFX_SEMANTIC_WORKER_MANIFEST_PATH_ENV,
  SFX_SEMANTIC_WORKER_MAX_BODY_BYTES,
  type SfxCatalogSemanticWorkerResponse,
} from '../lib/pipeline/sfx-catalog-semantic-worker';
import {
  SFX_CATALOG_SEMANTIC_RELEASE_DIR_ENV,
  SFX_CLAP_MODEL_CACHE_DIR_ENV,
} from '../lib/pipeline/sfx-catalog-semantic-index';
import { SFX_SEMANTIC_RETRIEVAL_TOKEN_ENV } from '../lib/pipeline/sfx-catalog-semantic-client';

const DEFAULT_PORT = 8080;

export async function runSfxSemanticWorker(): Promise<void> {
  const worker = await createFilesystemSfxCatalogSemanticWorker({
    token: requiredEnv(SFX_SEMANTIC_RETRIEVAL_TOKEN_ENV),
    manifestPath: requiredEnv(SFX_SEMANTIC_WORKER_MANIFEST_PATH_ENV),
    releaseDirectory: requiredEnv(SFX_CATALOG_SEMANTIC_RELEASE_DIR_ENV),
    modelCacheDirectory: requiredEnv(SFX_CLAP_MODEL_CACHE_DIR_ENV),
    onError: error => {
      console.error('[sfx-semantic-worker] retrieval failed', safeError(error));
    },
  });
  const port = configuredPort();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://semantic-worker.local');
      const body = url.pathname === SFX_SEMANTIC_WORKER_HEALTH_PATH
        ? ''
        : await readBoundedBody(request);
      const result = await worker.handle({
        method: request.method ?? 'GET',
        path: url.pathname,
        headers: normalizedHeaders(request),
        body,
      });
      writeResponse(response, result);
    } catch (error) {
      const tooLarge = error instanceof RequestBodyTooLargeError;
      writeResponse(response, {
        status: tooLarge ? 413 : 500,
        headers: {
          'cache-control': 'no-store',
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          error: tooLarge ? 'request_too_large' : 'semantic_worker_failed',
        }),
      });
      if (!tooLarge) {
        console.error('[sfx-semantic-worker] request failed', safeError(error));
      }
    }
  });

  const shutdown = async (signal: string) => {
    console.log(`[sfx-semantic-worker] received ${signal}`);
    server.close();
    await worker.dispose();
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      console.log(`[sfx-semantic-worker] ready on port ${port}`);
      resolve();
    });
  });
}

class RequestBodyTooLargeError extends Error {}

async function readBoundedBody(request: IncomingMessage): Promise<string> {
  const declaredLength = Number(request.headers['content-length'] ?? 0);
  if (
    Number.isFinite(declaredLength)
    && declaredLength > SFX_SEMANTIC_WORKER_MAX_BODY_BYTES
  ) {
    request.resume();
    throw new RequestBodyTooLargeError();
  }
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > SFX_SEMANTIC_WORKER_MAX_BODY_BYTES) {
      throw new RequestBodyTooLargeError();
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, totalBytes).toString('utf8');
}

function normalizedHeaders(
  request: IncomingMessage,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(request.headers).map(([name, value]) => [
      name.toLowerCase(),
      Array.isArray(value) ? value.join(',') : value,
    ]),
  );
}

function writeResponse(
  response: ServerResponse,
  result: SfxCatalogSemanticWorkerResponse,
): void {
  response.writeHead(result.status, result.headers);
  response.end(result.body);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function configuredPort(): number {
  const value = Number(process.env.PORT ?? DEFAULT_PORT);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return value;
}

function safeError(error: unknown): { name: string; code?: string } {
  if (!(error instanceof Error)) return { name: 'UnknownError' };
  const code = 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
  return {
    name: error.name,
    ...(code ? { code } : {}),
  };
}

async function main(): Promise<void> {
  await runSfxSemanticWorker();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error('[sfx-semantic-worker] startup failed', safeError(error));
    process.exitCode = 1;
  });
}
