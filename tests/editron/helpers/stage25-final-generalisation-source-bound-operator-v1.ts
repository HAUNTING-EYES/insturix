import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { hashCanonicalJsonV1 }
  from '../../../lib/editron/research/open-ended-planner/contracts-v1';
import { runStage25DependencyDiversityOwnerSentinelsV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-dependency-diversity-owner-sentinel-runner-v1';
import {
  STAGE25_FINAL_GENERALISATION_CREDENTIAL_NAMES_V1,
  STAGE25_FINAL_GENERALISATION_SOURCE_BOUND_TEST_FILES_V1,
  finalizeStage25FinalGeneralisationSourceBoundGateV1,
  type Stage25SourceBoundArtifactV1,
} from '../../../lib/editron/research/open-ended-planner/stage25-final-generalisation-source-bound-gate-v1';
import { runStage25FinalGeneralisationZeroSpendPreflightV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-final-generalisation-zero-spend-preflight-v1';
import { runStage25GeneralisationScorecardSentinelsV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-generalisation-scorecard-sentinels-v1';
import { STAGE25_HELDOUT_ROUTE_ARMS_V1, STAGE25_HELDOUT_ROUTE_FREEZE_V1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-heldout-route-freeze-v1';
import { executeStage25HeldoutRouteOwnerMaterializationV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-heldout-route-owner-materialization-v1';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const VITEST_CLI = require.resolve('vitest/vitest.mjs');
const VITEST_PACKAGE = require.resolve('vitest/package.json');
const SOURCE_SCOPES = [
  'lib/editron', 'tests/editron', 'components/editron', 'package.json', 'pnpm-lock.yaml',
] as const;
const ARTIFACTS: readonly Omit<Stage25SourceBoundArtifactV1, 'fileSha256' | 'receipt'>[] = [
  {
    artifactId: 'HREF01_REVIEW',
    relativePath: '.calibration-temp/open-ended-planner-v2/provider-native-href01-review-pack-20260822/reviewer/qualified-review-receipt.json',
    receiptHashField: 'receiptSha256',
  },
  {
    artifactId: 'RHC01_PREVIEW',
    relativePath: '.calibration-temp/open-ended-planner-v2/stage25-rhc01-preview/rhc01-preview-0dcbe01c4-v1/execution-receipt.json',
    receiptHashField: 'receiptHash',
  },
  {
    artifactId: 'RESUME_GATE',
    relativePath: '.calibration-temp/open-ended-planner-v2/stage25-resume/stage25-resume-zero-spend-a1a09d481-v1/readiness-receipt.json',
    receiptHashField: 'receiptSha256',
  },
  {
    artifactId: 'LONG_FORM_TRIAL',
    relativePath: '.calibration-temp/open-ended-planner-v2/stage25-long-form-real-media/stage25-long-form-real-media-a9c93a084-v1/readiness-receipt.json',
    receiptHashField: 'receiptSha256',
  },
] as const;

export async function runStage25FinalGeneralisationSourceBoundOperatorV1(input: {
  workspaceRoot: string;
  artifactParent: string;
}) {
  const source = await sourceIdentity(input.workspaceRoot);
  const executionId = `stage25-final-generalisation-${source.commitSha.slice(0, 9)}-v1`;
  const executionRoot = path.resolve(input.artifactParent, executionId);
  await mkdir(input.artifactParent, { recursive: true });
  await mkdir(executionRoot);
  const reportPath = path.join(executionRoot, 'vitest-report.json');
  const receiptPath = path.join(executionRoot, 'readiness-receipt.json');
  const environment: NodeJS.ProcessEnv = { ...process.env, CI: '1' };
  for (const name of STAGE25_FINAL_GENERALISATION_CREDENTIAL_NAMES_V1) {
    delete environment[name];
  }
  const startedAt = new Date().toISOString();
  await execFileAsync(process.execPath, [
    VITEST_CLI, 'run', ...STAGE25_FINAL_GENERALISATION_SOURCE_BOUND_TEST_FILES_V1,
    '--reporter=json', `--outputFile=${reportPath}`,
  ], {
    cwd: input.workspaceRoot, env: environment, windowsHide: true,
    timeout: 240_000, maxBuffer: 12 * 1024 * 1024,
  });
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as unknown;
  const [zeroSpendPreflight, dependencyOwnerSentinels] = await Promise.all([
    runStage25FinalGeneralisationZeroSpendPreflightV1(),
    runStage25DependencyDiversityOwnerSentinelsV1(),
  ]);
  const scorecardSentinels = runStage25GeneralisationScorecardSentinelsV1();
  const routeOwnerReceipts = [];
  for (const task of STAGE25_HELDOUT_ROUTE_FREEZE_V1.tasks) {
    for (const arm of STAGE25_HELDOUT_ROUTE_ARMS_V1) {
      routeOwnerReceipts.push(await executeStage25HeldoutRouteOwnerMaterializationV1({
        taskId: String(task.taskId), arm,
      }));
    }
  }
  const supportingArtifacts = await Promise.all(ARTIFACTS.map((artifact) =>
    readArtifact(input.workspaceRoot, artifact)));
  const vitestPackage = JSON.parse(await readFile(VITEST_PACKAGE, 'utf8')) as {
    version?: unknown;
  };
  if (typeof vitestPackage.version !== 'string') fail('VITEST_VERSION_INVALID');
  const receipt = finalizeStage25FinalGeneralisationSourceBoundGateV1({
    source,
    toolchain: { nodeVersion: process.version, vitestVersion: vitestPackage.version },
    testRun: {
      startedAt, completedAt: new Date().toISOString(), report, runnerExitCode: 0,
      automaticRetryCount: 0,
      credentialNamesScrubbed: [...STAGE25_FINAL_GENERALISATION_CREDENTIAL_NAMES_V1],
      providerTransportMode: 'LOCAL_STUBS_AND_OWNER_PROBES_ONLY',
      paidProviderDispatchAuthorized: false,
    },
    zeroSpendPreflight,
    scorecardSentinels,
    dependencyOwnerSentinels,
    routeOwnerReceipts,
    supportingArtifacts,
  });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx',
  });
  return {
    executionId, executionRoot, reportPath, receiptPath,
    receiptSha256: receipt.receiptSha256,
  };
}

async function sourceIdentity(workspaceRoot: string) {
  const commitSha = await git(workspaceRoot, ['rev-parse', 'HEAD']);
  const treeSha = await git(workspaceRoot, ['rev-parse', 'HEAD^{tree}']);
  const relevantStatusEntries = lines(await git(workspaceRoot, [
    'status', '--porcelain=v1', '--untracked-files=all', '--', ...SOURCE_SCOPES,
  ]));
  const tracked = lines(await git(workspaceRoot, ['ls-files', '-s', '--', ...SOURCE_SCOPES]));
  if (!tracked.length) fail('SOURCE_SCOPE_EMPTY');
  return {
    commitSha, treeSha, relevantScopeSha256: hashCanonicalJsonV1(tracked),
    relevantTrackedFileCount: tracked.length, relevantStatusEntries,
  };
}
async function readArtifact(
  workspaceRoot: string,
  artifact: Omit<Stage25SourceBoundArtifactV1, 'fileSha256' | 'receipt'>,
): Promise<Stage25SourceBoundArtifactV1> {
  const root = path.resolve(workspaceRoot);
  const absolute = path.resolve(root, artifact.relativePath);
  if (!absolute.startsWith(`${root}${path.sep}`)) fail(`ARTIFACT_PATH_ESCAPE:${artifact.artifactId}`);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    fail(`ARTIFACT_FILE_INVALID:${artifact.artifactId}`);
  }
  const bytes = await readFile(absolute);
  const receipt = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
  return {
    ...artifact,
    fileSha256: createHash('sha256').update(bytes).digest('hex'),
    receipt,
  };
}
async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: root, windowsHide: true, timeout: 30_000, maxBuffer: 12 * 1024 * 1024,
  });
  return result.stdout.trim();
}
function lines(value: string): string[] { return value ? value.split(/\r?\n/).filter(Boolean) : []; }
function fail(code: string): never { throw new Error(`STAGE25_FINAL_GENERALISATION_OPERATOR_${code}`); }
async function main(): Promise<void> {
  const artifactParent = process.argv[2];
  if (!artifactParent) fail('USAGE_ARTIFACT_PARENT_REQUIRED');
  const result = await runStage25FinalGeneralisationSourceBoundOperatorV1({
    workspaceRoot: process.cwd(), artifactParent: path.resolve(artifactParent),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked && invoked === path.resolve(fileURLToPath(import.meta.url))) await main();
