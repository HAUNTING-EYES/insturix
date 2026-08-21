import { createHash } from 'node:crypto';
import { config as loadEnv, parse as parseEnv } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { HoldoutMediaManifestV2R }
  from '../lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import { preflightSealedHoldoutCredentialsV2R }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-credential-preflight-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import { preflightSealedHoldoutCohortV2R }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-preflight-v2r';

const repoRoot = process.cwd();
loadEnv({ path: path.join(repoRoot, '.env.local'), override: false, quiet: true });
loadEnv({ path: path.join(repoRoot, '.env.local.vercel'), override: false, quiet: true });

function option(name: string): string | null {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

async function main(): Promise<void> {
  if (process.argv.includes('--run')) {
    throw new Error('SEALED_CREDENTIAL_PREFLIGHT_INFERENCE_FLAG_FORBIDDEN');
  }
  const operatorId = option('--operator-id');
  if (!operatorId) throw new Error('SEALED_CREDENTIAL_PREFLIGHT_OPERATOR_ID_REQUIRED');
  await loadCredentialEnvironment(option('--credential-env-file'));
  const sourcePath = path.join(repoRoot, SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R);
  const mediaManifestPath = option('--media-manifest')
    ? path.resolve(option('--media-manifest') as string)
    : path.join(repoRoot, '.calibration-temp', 'open-ended-planner-v2',
      'holdout-media-v2r-r2-20260822', 'manifest.json');
  const [sourceBytes, mediaBytes] = await Promise.all([
    readFile(sourcePath), readFile(mediaManifestPath),
  ]);
  const manifest = buildSealedHoldoutCohortManifestV2R(
    createHash('sha256').update(sourceBytes).digest('hex'),
  );
  if (option('--confirm-manifest') !== manifest.manifestSha256) {
    throw new Error('SEALED_CREDENTIAL_PREFLIGHT_MANIFEST_CONFIRMATION_MISMATCH');
  }
  const mediaManifest = JSON.parse(mediaBytes.toString('utf8')) as HoldoutMediaManifestV2R;
  const localPreflight = preflightSealedHoldoutCohortV2R({ manifest, mediaManifest });
  const result = await preflightSealedHoldoutCredentialsV2R({
    manifest,
    localPreflight,
    authorization: {
      operatorId,
      manifestSha256: manifest.manifestSha256,
      permittedNetworkActions: ['MODEL_METADATA_GET', 'GOOGLE_COUNT_TOKENS'],
      inferenceCalls: 0,
    },
    environment: process.env,
  });
  const createdAt = new Date().toISOString();
  const outputRoot = option('--output-root')
    ? path.resolve(option('--output-root') as string)
    : path.join(repoRoot, '.calibration-temp', 'open-ended-planner-v2',
      `sealed-holdout-credential-preflight-${stamp(createdAt)}`);
  await mkdir(path.dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot, { recursive: false });
  await Promise.all([
    writeJson(path.join(outputRoot, 'local-preflight.json'), localPreflight),
    writeJson(path.join(outputRoot, 'credential-preflight.json'), result.receipt),
    writeJson(path.join(outputRoot, 'request-captures.json'), result.requestCaptures),
  ]);
  process.stdout.write(`${JSON.stringify({
    mode: 'ZERO_INFERENCE_CREDENTIAL_PREFLIGHT',
    outputRoot,
    manifestSha256: manifest.manifestSha256,
    localPreflightReceiptSha256: localPreflight.receiptSha256,
    credentialPreflightReceiptSha256: result.receipt.receiptSha256,
    requestCaptureSetSha256: result.receipt.requestCaptureSetSha256,
    assessment: result.receipt.assessment,
    requestCount: result.receipt.checks.length,
    models: result.receipt.modelMetadata.map((entry) => entry.requestedModel),
    googleCredentialSource: result.receipt.googleCredentialSource,
    networkCalls: result.receipt.networkCalls,
    dispatchAuthorized: result.receipt.dispatchAuthorized,
  }, null, 2)}\n`);
}

async function loadCredentialEnvironment(filePath: string | null): Promise<void> {
  if (!filePath) return;
  const parsed = parseEnv(await readFile(path.resolve(filePath)));
  // Import only recognized provider secrets; the path and values never enter a receipt.
  for (const name of [
    'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY',
  ] as const) {
    const value = parsed[name]?.trim();
    if (value) process.env[name] = value;
  }
}

function stamp(value: string): string {
  return value.replace(/[-:.TZ]/g, '').slice(0, 14);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx',
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
