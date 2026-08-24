import { parse as parseEnv } from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { auditSealedHoldoutPilotLiveArtifactsV4R3 }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-pilot-live-audit-v4r3';

const rootDir = process.cwd();

async function main(): Promise<void> {
  const runRoot = path.resolve(required('--run-root'));
  await loadCredentialFile(path.join(rootDir, '.env.local'));
  await loadCredentialFile(path.join(rootDir, '.env.local.prod'));
  const receipt = await auditSealedHoldoutPilotLiveArtifactsV4R3({
    rootDir, runRoot, environment: process.env,
  });
  process.stdout.write(`${JSON.stringify({
    mode: 'V4R3_ZERO_NETWORK_POST_RUN_AUDIT', runRoot,
    executionCommitSha: receipt.executionCommitSha,
    availableRouteIds: receipt.availableRouteIds,
    unavailableRouteIds: receipt.unavailableRouteIds,
    validRawAttemptCount: receipt.validRawAttemptCount,
    terminalCounts: receipt.terminalCounts,
    providerInfrastructureNonEvaluationCount: receipt.providerInfrastructureNonEvaluationCount,
    accountedCostUsd: Number(receipt.accountedCostNanoUsd) / 1_000_000_000,
    receiptSha256: receipt.receiptSha256, assessment: receipt.assessment,
  }, null, 2)}\n`);
}
async function loadCredentialFile(file: string): Promise<void> {
  try {
    const parsed = parseEnv(await readFile(file));
    for (const name of ['OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY',
      'GEMINI_API_KEY', 'GOOGLE_API_KEY'] as const) {
      const value = parsed[name]?.trim(); if (value) process.env[name] = value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
function option(name: string): string | null {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}
function required(name: string): string {
  const value = option(name)?.trim();
  if (!value) throw new Error(`SEALED_V4R3_PILOT_AUDIT_OPTION_REQUIRED:${name}`);
  return value;
}
main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
