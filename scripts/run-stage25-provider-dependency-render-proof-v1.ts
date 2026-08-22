import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hashCanonicalJsonV1 }
  from '../lib/editron/research/open-ended-planner/contracts-v1';
import {
  executeStage25DependencyRenderProofV1,
  STAGE25_DEPENDENCY_RENDER_PROOF_VERSION_V1,
} from '../lib/editron/research/open-ended-planner/stage25-provider-dependency-render-proof-v1';

type JsonRecord = Record<string, unknown>;

const PORTABLE_VERSION = 'EDITRON_STAGE25_PROVIDER_DEPENDENCY_RENDER_PROOF_PORTABLE_V1';
const ROW_ID = 'openai_luna-p1';
const REPLAY_RECEIPT_PATH = path.resolve(
  'docs/editron/open-ended-editing/stage25-provider-dependency-v3r3-replay-receipt.json',
);
const CRITICAL_SOURCE_PATHS = [
  'lib/editron/research/open-ended-planner/stage25-provider-dependency-render-proof-v1.ts',
  'lib/editron/research/open-ended-planner/stage25-provider-dependency-owner-v1.ts',
  'lib/editron/research/open-ended-planner/dev03-native-proxy-fixture-v2.ts',
  'lib/editron/shared/render-request-payload.ts',
  'lib/editron/services/keyframe-mutation.ts',
  'lib/editron/agent/chat-visual-tools.ts',
  'lib/pipeline/scene-to-editron.ts',
  'components/editron/editor/version-7.0.0/components/core/layer.tsx',
  'components/editron/editor/version-7.0.0/components/overlays/video/video-layer-content.tsx',
] as const;

async function main(): Promise<void> {
  const runRoot = path.resolve(requiredOption('--source-run-root'));
  const outputDir = path.resolve(requiredOption('--artifact-output-dir'));
  const portablePath = path.resolve(requiredOption('--portable-receipt'));
  const executionId = requiredOption('--execution-id');
  const createdAt = requiredOption('--created-at');
  assertCriticalSourcesAtHead();

  const replay = record(await readJson(REPLAY_RECEIPT_PATH));
  assertSelfHash(replay, 'receiptSha256', 'REPLAY_RECEIPT');
  const replayRow = records(replay.rows).find(({ rowId }) => rowId === ROW_ID)
    ?? fail('REPLAY_ROW_MISSING');
  if (replayRow.replayAssessment !== 'PASS'
    || replayRow.terminalDisposition !== 'READY_FOR_PROOF') fail('REPLAY_ROW_NOT_PROOF_ELIGIBLE');
  const sourceRowPath = path.join(runRoot, 'cohort', 'rows', ROW_ID, 'row.json');
  const sourceRow = await readJson(sourceRowPath);
  const expectedRowHash = text(replayRow.sourceRowSha256);
  if (!expectedRowHash || hashCanonicalJsonV1(sourceRow) !== expectedRowHash) {
    fail('SOURCE_ROW_HASH_DRIFT');
  }

  const renderReceipt = await executeStage25DependencyRenderProofV1({
    sourceRow, expectedSourceRowSha256: expectedRowHash,
    outputDir, executionId, createdAt,
  });
  if (renderReceipt.schemaVersion !== STAGE25_DEPENDENCY_RENDER_PROOF_VERSION_V1
    || record(renderReceipt.proof).isolatedOwnerReplay !== 'PASS'
    || record(renderReceipt.proof).renderedVisual !== 'PASS'
    || record(renderReceipt.proof).projectMutation !== 'NONE') {
    fail('RENDER_RECEIPT_NOT_PORTABLE');
  }
  const sourceCodeCommit = git(['rev-parse', 'HEAD']).trim();
  const output = record(renderReceipt.output);
  const material = {
    schemaVersion: PORTABLE_VERSION,
    authority: 'PORTABLE_RESEARCH_PROOF_NO_PROJECT_MUTATION' as const,
    sourceCodeCommit,
    criticalSourceBlobSha256: Object.fromEntries(CRITICAL_SOURCE_PATHS.map((sourcePath) => [
      sourcePath, git(['hash-object', sourcePath]).trim(),
    ])),
    sourceRunRoot: portableRelative(runRoot),
    sourceRowPath: portableRelative(sourceRowPath),
    sourceReplayReceiptPath: portableRelative(REPLAY_RECEIPT_PATH),
    sourceReplayReceiptSha256: text(replay.receiptSha256),
    sourceRowSha256: expectedRowHash,
    sourceEpisodeReceiptSha256: text(renderReceipt.sourceEpisodeReceiptSha256),
    renderProofReceiptHash: text(renderReceipt.receiptHash),
    executionId, createdAt,
    renderArtifact: {
      localPath: portableRelative(text(output.path)),
      sha256: text(output.sha256), bytes: integer(output.bytes),
      codec: text(output.codec), width: integer(output.width), height: integer(output.height),
      averageFrameRate: text(output.averageFrameRate),
      decodedFrameCount: integer(output.decodedFrameCount),
      audioStreamCount: integer(output.audioStreamCount),
      committedMediaBytes: false,
    },
    ownerBeforeStateHash: text(renderReceipt.ownerBeforeStateHash),
    ownerAfterStateHash: text(renderReceipt.ownerAfterStateHash),
    sourceBinding: renderReceipt.sourceBinding,
    visualMeasurements: renderReceipt.visualMeasurements,
    visualEvaluation: renderReceipt.visualEvaluation,
    proof: renderReceipt.proof,
    browserErrors: renderReceipt.browserErrors,
    externalCalls: renderReceipt.externalCalls,
    whatHasNotBeenChecked: [
      'RENDERED_AUDIO_NO_AUDIO_OVERLAY_IN_SOURCE_EPISODE',
      'PROJECT_SERVICE_RELOAD_RESEARCH_CLONE_ONLY',
      'PRODUCT_AUTHORITY_INTEGRATION',
      'GENERAL_OPERATION_OR_CONTENT_COVERAGE',
    ] as const,
    stateEffects: [] as const,
  };
  const portable = { ...material, receiptSha256: hashCanonicalJsonV1(material) };
  await mkdir(path.dirname(portablePath), { recursive: true });
  await writeFile(portablePath, `${JSON.stringify(portable, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx',
  });
  process.stdout.write(`${JSON.stringify({ portableReceiptPath: portablePath,
    receiptSha256: portable.receiptSha256, renderArtifact: portable.renderArtifact,
    proof: portable.proof, stateEffects: portable.stateEffects }, null, 2)}\n`);
}

function assertCriticalSourcesAtHead(): void {
  const status = git(['status', '--porcelain=v1', '--untracked-files=all', '--',
    ...CRITICAL_SOURCE_PATHS]).trim();
  if (status) fail(`CRITICAL_SOURCE_NOT_AT_HEAD:${status.replace(/\r?\n/g, '|')}`);
}
function portableRelative(value: string): string {
  const absolute = path.resolve(value);
  const relative = path.relative(process.cwd(), absolute).replace(/\\/g, '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) fail('PORTABLE_PATH_OUTSIDE_WORKTREE');
  return relative;
}
async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}
function requiredOption(name: string): string {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length).trim();
  return value || fail(`REQUIRED_OPTION_MISSING:${name}`);
}
function assertSelfHash(value: JsonRecord, field: string, label: string): void {
  const unsigned = { ...value }; delete unsigned[field];
  if (value[field] !== hashCanonicalJsonV1(unsigned)) fail(`${label}_HASH_INVALID`);
}
function git(arguments_: readonly string[]): string {
  return execFileSync('git', arguments_, {
    cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => (
    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))) : [];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number { return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0; }
function fail(code: string): never { throw new Error(`STAGE25_DEPENDENCY_RENDER_RUNNER_${code}`); }

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
