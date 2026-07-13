import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';

import { createProductionMgRuntime } from '@/lib/editron/motion-graphics/codegen/production-runtime';
import { makeR2FrameUploader } from '@/lib/editron/motion-graphics/codegen/render/sequence-ingest-r2';
import { renderMgMoment } from '@/lib/editron/motion-graphics/codegen/render/render-moment';
import {
  MG_RENDER_WORKER_CONTRACT_VERSION,
  parseMgRenderWorkerRequest,
  parseMgRenderWorkerResult,
  type MgRenderWorkerResult,
} from '@/lib/editron/motion-graphics/codegen/worker-contract';

type StorageAuthorizationResponse = {
  allowed?: unknown;
  reason?: unknown;
};

const execFileAsync = promisify(execFile);

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MG render worker: missing ${name}`);
  return value;
}

async function authorizeExactStorage(input: {
  url: string;
  token: string;
  jobId: string;
  idempotencyKey: string;
  projectId: string;
  userId: string;
  orgId: string | null;
  sizeBytes: number;
}): Promise<void> {
  const response = await fetch(input.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${input.token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `${input.jobId}:${input.sizeBytes}`,
    },
    body: JSON.stringify({
      jobId: input.jobId,
      idempotencyKey: input.idempotencyKey,
      projectId: input.projectId,
      userId: input.userId,
      orgId: input.orgId,
      sizeBytes: input.sizeBytes,
    }),
  });
  const body = await response.json().catch(() => null) as StorageAuthorizationResponse | null;
  if (!response.ok) {
    throw new Error(`MG storage authorization failed (${response.status}): ${String(body?.reason ?? 'invalid response')}`);
  }
  if (body?.allowed !== true) {
    throw new Error(`MG storage authorization denied: ${String(body?.reason ?? 'storage_full')}`);
  }
}

async function run(requestPath: string, resultPath: string): Promise<void> {
  const request = parseMgRenderWorkerRequest(JSON.parse(await fs.readFile(requestPath, 'utf8')));
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd() });
  const actualCommit = stdout.trim();
  if (!actualCommit.startsWith(request.appCommit) && !request.appCommit.startsWith(actualCommit)) {
    throw new Error(`MG render worker commit mismatch: request=${request.appCommit} worker=${actualCommit}`);
  }

  // Force all load-bearing worker credentials to fail before AI generation or Chromium starts.
  requiredEnv('GEMINI_API_KEY');
  requiredEnv('R2_ACCESS_KEY_ID');
  requiredEnv('R2_SECRET_ACCESS_KEY');
  requiredEnv('R2_ACCOUNT_ID');
  const authorizationUrl = requiredEnv('MG_STORAGE_AUTHORIZATION_URL');
  const authorizationToken = requiredEnv('MG_STORAGE_AUTHORIZATION_TOKEN');

  const runtime = createProductionMgRuntime(request.input, request.canvas);
  try {
    const rendered = await renderMgMoment(request.input, {
      codegen: runtime.codegen,
      canvas: request.canvas,
      uploadFrame: makeR2FrameUploader(request.userId),
      render: runtime.render,
      cleanup: runtime.cleanup,
      sequenceNamespace: request.sequenceNamespace,
      authorizeStorage: async (sizeBytes) => authorizeExactStorage({
        url: authorizationUrl,
        token: authorizationToken,
        jobId: request.jobId,
        idempotencyKey: request.idempotencyKey,
        projectId: request.projectId,
        userId: request.userId,
        orgId: request.orgId,
        sizeBytes,
      }),
    });

    const completedAt = new Date().toISOString();
    const result: MgRenderWorkerResult = rendered.status === 'generated'
      ? {
        version: MG_RENDER_WORKER_CONTRACT_VERSION,
        jobId: request.jobId,
        status: 'generated',
        completedAt,
        receipt: rendered.receipt,
        sequence: rendered.sequence,
      }
      : {
        version: MG_RENDER_WORKER_CONTRACT_VERSION,
        jobId: request.jobId,
        status: rendered.status,
        completedAt,
        receipt: rendered.receipt,
        reason: rendered.reason,
      };
    const resultTempPath = `${resultPath}.tmp`;
    await fs.writeFile(resultTempPath, JSON.stringify(parseMgRenderWorkerResult(result)), 'utf8');
    await fs.rename(resultTempPath, resultPath);
  } finally {
    await runtime.dispose();
  }
}

const [requestPath, resultPath] = process.argv.slice(2);
if (!requestPath || !resultPath) {
  console.error('Usage: tsx scripts/editron-mg-render-worker.ts <request.json> <result.json>');
  process.exitCode = 2;
} else {
  run(requestPath, resultPath).catch((error) => {
    console.error('[MGRenderWorker] fatal:', error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
