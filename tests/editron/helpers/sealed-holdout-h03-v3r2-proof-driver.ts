import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildGeneratedCompositionSandboxHostReceiptV1,
  type GeneratedCompositionSandboxWorkerResultV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-sandbox-contract-v1';
import type {
  ExecuteGeneratedCompositionSandboxOptionsV1,
  ExecuteGeneratedCompositionSandboxResultV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-sandbox-runner-v1';
import { executeGeneratedCompositionSandboxWorkerV1 }
  from '@/lib/editron/research/open-ended-planner/generated-composition-sandbox-worker-v1';
import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutCohortManifestV3R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r';
import {
  buildSealedHoldoutCohortManifestV3R2,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r2';
import { evaluateSealedHoldoutH03TraceV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-evaluator-v2r';
import { runSealedHoldoutH03ConnectedEpisodeV3R2 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-episode-v3r2';
import { SEALED_H03_GENERATED_SOURCE_V2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-generated-program-v2r';
import { SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-target-contract-v3r';
import { buildSealedHoldoutSelectedOperationTraceV3R2 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;
type RenderedWorkerResult = Extract<
  GeneratedCompositionSandboxWorkerResultV1,
  { status: 'RENDERED' }
>;

export const H03_TEST_SNAPSHOT_ID = 'snap_h03_contract_test';
export const H03_TEST_SNAPSHOT_COMMIT = 'c'.repeat(40);

export async function prepareSealedH03V3R2ProofFixture(root: string) {
  const manifest = await buildManifest();
  let turn = 0;
  const connected = await runSealedHoldoutH03ConnectedEpisodeV3R2({
    manifest,
    caseId: 'HOLD-03:C1',
    route: route(),
    apiImplementationHash: 'a'.repeat(64),
    generateSource: async (request) => ({
      source: SEALED_H03_GENERATED_SOURCE_V2R,
      modelId: 'contract-test-model',
      promptHash: 'b'.repeat(64),
      orchestratorSpecSha256: request.orchestratorSpecSha256,
      generationReceipt: {
        authority: 'RESEARCH_MODEL_GENERATED_SOURCE_NO_PROJECT_MUTATION',
        packetHash: request.packet.packetHash,
        stateEffects: [],
      },
    }),
    invoke: async () => {
      turn += 1;
      return response(turn, turn === 1
        ? call('visual', 'find_visual_moment', {
          projectId: 'oe-hold-03',
          query: 'resolve reference layout',
          evidenceIds: ['E1', 'E2'],
        })
        : turn === 2
          ? call('timeline', 'get_timeline_view', {
            projectId: 'oe-hold-03',
            expectedProjectRevision: 'R12',
          })
          : turn === 3
            ? call('generated', 'generated_composition_program', generatedArguments())
            : call('finish', 'finish_editron_research_episode', {
              disposition: 'READY_FOR_PROOF',
              reasonCodes: ['MODEL_READY'],
              evidenceIds: ['E1', 'E2', 'E3'],
              summary: 'Ready for proof',
            }));
    },
  });
  const trace = buildSealedHoldoutSelectedOperationTraceV3R2({
    manifest,
    caseId: 'HOLD-03:C1',
    providerEpisode: connected.providerEpisode,
  });
  const evaluation = evaluateSealedHoldoutH03TraceV3R3({
    manifest,
    caseId: 'HOLD-03:C1',
    trace,
    connectedEpisode: connected,
  });
  const mediaManifest = await materializeHoldoutMediaV2R(path.join(root, 'media'));
  return { manifest, connected, trace, evaluation, mediaManifest };
}

/**
 * Test adapter only. It runs the same worker and exact model-tagged source in
 * process, then normalizes Windows paths into the host-receipt wire format.
 * It is not evidence that a Vercel microVM ran; the live proof must use the
 * default sandbox executor.
 */
export async function executeLocalH03SandboxContractAdapter(
  options: ExecuteGeneratedCompositionSandboxOptionsV1,
): Promise<ExecuteGeneratedCompositionSandboxResultV1> {
  const raw = await executeGeneratedCompositionSandboxWorkerV1(options.request, {
    repoRoot: options.repoRoot,
    environment: {},
  });
  if (raw.status !== 'RENDERED') {
    throw new Error(`H03_TEST_SANDBOX_WORKER_FAILED:${raw.failure.code}`);
  }
  const receiptOutput = raw.outputs.find(({ kind }) => kind === 'PROXY_RECEIPT');
  if (!receiptOutput) throw new Error('H03_TEST_PROXY_RECEIPT_MISSING');
  const originalBytes = new Map<string, Buffer>();
  for (const output of raw.outputs) {
    originalBytes.set(output.path, await fs.readFile(output.path));
  }
  const proxy = JSON.parse(
    originalBytes.get(receiptOutput.path)?.toString('utf8') ?? '{}',
  ) as JsonRecord;
  const originalRoot = String(proxy.workspaceDir ?? '');
  const linuxRoot = `/tmp/editron-gcp/${options.request.requestId}/${path.basename(originalRoot)}`;
  const remapPath = (value: unknown): string => {
    const candidate = String(value ?? '');
    const relative = path.relative(originalRoot, candidate).split(path.sep).join('/');
    return `${linuxRoot}/${relative}`;
  };
  try {
    proxy.workspaceDir = linuxRoot;
    proxy.stills = records(proxy.stills).map((still) => ({
      ...still,
      path: remapPath(still.path),
    }));
    const contactSheet = record(proxy.contactSheet);
    proxy.contactSheet = { ...contactSheet, path: remapPath(contactSheet.path) };
    const playableProxy = record(proxy.playableProxy);
    proxy.playableProxy = { ...playableProxy, path: remapPath(playableProxy.path) };
    const { receiptHash: _oldReceiptHash, ...proxyMaterial } = proxy;
    proxy.receiptHash = hashCanonicalJsonV1(proxyMaterial);
    const outputBytes: Record<string, Uint8Array> = {};
    const outputs = raw.outputs.map((output) => {
      const outputPath = output.kind === 'PROXY_RECEIPT'
        ? `${linuxRoot}/receipt.json`
        : remapPath(output.path);
      const bytes = output.kind === 'PROXY_RECEIPT'
        ? Buffer.from(JSON.stringify(proxy), 'utf8')
        : originalBytes.get(output.path) ?? Buffer.alloc(0);
      outputBytes[outputPath] = bytes;
      return {
        ...output,
        path: outputPath,
        contentSha256: sha256(bytes),
        byteLength: bytes.byteLength,
      };
    });
    const result: RenderedWorkerResult = {
      ...raw,
      proxyReceiptHash: String(proxy.receiptHash),
      outputs,
    };
    const snapshotId = options.env?.MG_RENDER_SANDBOX_SNAPSHOT_ID
      ?? H03_TEST_SNAPSHOT_ID;
    const host = buildGeneratedCompositionSandboxHostReceiptV1({
      request: options.request,
      result,
      snapshotId,
      sandboxDeleted: true,
      networkPolicy: 'DENY_ALL',
      persistent: false,
      command: { exitCode: 0, stdout: '', stderr: '' },
      outputBytes,
    });
    return Object.freeze({
      receipt: host,
      workerResult: result,
      outputBytes: Object.freeze(outputBytes),
    });
  } finally {
    if (originalRoot) await fs.rm(originalRoot, { recursive: true, force: true });
  }
}

function generatedArguments(): JsonRecord {
  return {
    projectId: 'oe-hold-03',
    expectedProjectRevision: 'R12',
    assetIds: ['h03-a', 'h03-b'],
    targetRange: { startFrame: 90, endFrame: 270 },
    referenceBlueprintId: SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R,
    layoutSpec: {
      panelCount: 6,
      geometry: 'ASYMMETRIC_NORMALIZED_BOUNDS',
      gutters: true,
      titleSafeBand: { left: 0.15, top: 0.43, width: 0.70, height: 0.14 },
    },
    motionSpec: {
      entryFrames: [0, 24],
      stableFrames: [24, 150],
      exitFrames: [150, 180],
      relationship: 'OPPOSED_HORIZONTAL_SIDES_AND_VERTICAL_CENTRE',
    },
    typographySpec: {
      text: 'EVENT\nMOMENT',
      alignment: 'CENTER',
      fontAssetId: 'font-noto-sans-v27-regular',
    },
    constraints: {
      referencePixelsForbidden: true,
      preserveOutsideRange: true,
      returnBinding: { overlayId: 'ov-full', assetId: 'h03-a', sourceFrame: 270 },
      titleFaceOverlapMaximumPixels: 0,
    },
    evidenceIds: ['E1', 'E2', 'E3'],
  };
}
async function buildManifest() {
  const v2 = buildSealedHoldoutCohortManifestV2R(
    await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const v3 = buildSealedHoldoutCohortManifestV3R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R),
    baseManifest: v2,
  });
  return buildSealedHoldoutCohortManifestV3R2({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2),
    baseManifest: v3,
  });
}
function route() {
  return {
    routeId: 'OPENAI_LUNA' as const,
    provider: 'openai' as const,
    model: 'gpt-5.6-luna' as const,
    claimedModelIdentity: 'gpt-5.6-luna',
    reasoningMode: 'medium' as const,
  };
}
function call(callId: string, name: string, args: JsonRecord): JsonRecord {
  return { type: 'function_call', call_id: callId, name, arguments: JSON.stringify(args) };
}
function response(turn: number, output: JsonRecord) {
  return {
    status: 200,
    body: {
      id: `h03-proof-${turn}`,
      model: 'gpt-5.6-luna',
      status: 'completed',
      output: [output],
    },
  };
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Object.keys(record(entry)).length > 0)
    : [];
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}
function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await fs.readFile(path.resolve(filePath)))
    .digest('hex');
}
