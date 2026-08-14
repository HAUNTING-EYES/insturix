import { createHash } from 'node:crypto';

import { z } from 'zod';

import { hashCanonicalJsonV1 } from './contracts-v1';
import type { GeneratedCompositionProgramV1, GeneratedCompositionSourceBundleV1 } from './generated-composition-program-v1';
import { verifyGeneratedCompositionProgramV1 } from './generated-composition-program-verifier-v1';

export const GENERATED_COMPOSITION_SANDBOX_CONTRACT_V1 = 'EDITRON_GENERATED_COMPOSITION_SANDBOX_V1' as const;
export const MAX_GENERATED_COMPOSITION_SANDBOX_REQUEST_BYTES_V1 = 12 * 1_024 * 1_024;
const SHA256 = /^[a-f0-9]{64}$/;
const APP_COMMIT = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface GeneratedCompositionSandboxInlineInputV1 {
  kind: 'SOURCE_MEDIA' | 'FONT';
  bindingId: string;
  fileName: string;
  contentSha256: string;
  byteLength: number;
  encoding: 'BASE64';
  data: string;
}

export interface GeneratedCompositionSandboxRequestV1 {
  version: typeof GENERATED_COMPOSITION_SANDBOX_CONTRACT_V1;
  authority: 'RESEARCH_ISOLATED_PROXY_NO_PROJECT_MUTATION';
  requestId: string;
  executionId: string;
  createdAt: string;
  appCommit: string;
  programHash: string;
  sourceBundleHash: string;
  apiImplementationHash: string;
  program: GeneratedCompositionProgramV1;
  sourceBundle: GeneratedCompositionSourceBundleV1;
  evidencePack: unknown;
  referenceBlueprint: unknown;
  supplementalFacts: unknown;
  proofFrames: readonly number[];
  inputs: readonly GeneratedCompositionSandboxInlineInputV1[];
  policy: { network: 'DENY_ALL'; environment: 'EMPTY'; secrets: 'NONE'; database: 'DENY'; projectMutation: 'DENY'; persistent: false };
  resources: { wallTimeMs: number; vcpus: number; memoryMiB: number; maxOutputBytes: number };
  stateEffects: readonly [];
}

export type GeneratedCompositionSandboxWorkerResultV1 = {
  version: typeof GENERATED_COMPOSITION_SANDBOX_CONTRACT_V1;
  requestId: string;
  executionId: string;
  appCommit: string;
  programHash: string;
  sourceBundleHash: string;
  completedAt: string;
  wallTimeMs: number;
  stateEffects: readonly [];
} & ({
  status: 'RENDERED';
  proxyReceiptHash: string;
  outputs: readonly { kind: 'STILL' | 'CONTACT_SHEET' | 'PROXY_RECEIPT'; path: string; contentSha256: string; byteLength: number }[];
} | {
  status: 'FAILED';
  failure: { code: string; message: string };
});

export interface GeneratedCompositionSandboxHostReceiptV1 {
  artifactType: 'GeneratedCompositionSandboxHostReceiptV1';
  requestId: string;
  requestHash: string;
  resultHash: string;
  executionId: string;
  provider: 'VERCEL_SANDBOX';
  snapshotId: string;
  appCommit: string;
  networkPolicy: 'DENY_ALL';
  persistent: false;
  sandboxDeleted: true;
  command: { exitCode: 0; stdoutSha256: string; stderrSha256: string };
  outputs: readonly { kind: 'STILL' | 'CONTACT_SHEET' | 'PROXY_RECEIPT'; path: string; contentSha256: string; byteLength: number }[];
  proof: { productionSandbox: 'PASS'; outputMaterialization: 'PASS'; projectMutation: 'NONE' };
  stateEffects: readonly [];
  receiptHash: string;
}

const sha = z.string().regex(SHA256);
const inlineInputSchema = z.object({
  kind: z.enum(['SOURCE_MEDIA', 'FONT']), bindingId: z.string().regex(SAFE_ID), fileName: z.string().regex(SAFE_ID),
  contentSha256: sha, byteLength: z.number().int().positive().max(64 * 1_024 * 1_024), encoding: z.literal('BASE64'), data: z.string().max(90 * 1_024 * 1_024).regex(BASE64),
}).strict();
const requestSchema = z.object({
  version: z.literal(GENERATED_COMPOSITION_SANDBOX_CONTRACT_V1), authority: z.literal('RESEARCH_ISOLATED_PROXY_NO_PROJECT_MUTATION'),
  requestId: sha, executionId: z.string().regex(SAFE_ID), createdAt: z.string().datetime(), appCommit: z.string().regex(APP_COMMIT),
  programHash: sha, sourceBundleHash: sha, apiImplementationHash: sha, program: z.unknown(), sourceBundle: z.unknown(),
  evidencePack: z.unknown(), referenceBlueprint: z.unknown(), supplementalFacts: z.unknown(),
  proofFrames: z.array(z.number().int().nonnegative()).min(1).max(32), inputs: z.array(inlineInputSchema).min(1).max(64),
  policy: z.object({ network: z.literal('DENY_ALL'), environment: z.literal('EMPTY'), secrets: z.literal('NONE'), database: z.literal('DENY'), projectMutation: z.literal('DENY'), persistent: z.literal(false) }).strict(),
  resources: z.object({ wallTimeMs: z.number().int().positive(), vcpus: z.number().int().min(1).max(8), memoryMiB: z.number().int().positive(), maxOutputBytes: z.number().int().positive() }).strict(),
  stateEffects: z.tuple([]),
}).strict();
const outputSchema = z.object({ kind: z.enum(['STILL', 'CONTACT_SHEET', 'PROXY_RECEIPT']), path: z.string().min(1).max(500), contentSha256: sha, byteLength: z.number().int().positive() }).strict();
const resultBase = {
  version: z.literal(GENERATED_COMPOSITION_SANDBOX_CONTRACT_V1), requestId: sha, executionId: z.string().regex(SAFE_ID), appCommit: z.string().regex(APP_COMMIT),
  programHash: sha, sourceBundleHash: sha, completedAt: z.string().datetime(), wallTimeMs: z.number().int().nonnegative(), stateEffects: z.tuple([]),
};
const resultSchema = z.discriminatedUnion('status', [
  z.object({ ...resultBase, status: z.literal('RENDERED'), proxyReceiptHash: sha, outputs: z.array(outputSchema).min(3).max(64) }).strict(),
  z.object({ ...resultBase, status: z.literal('FAILED'), failure: z.object({ code: z.string().regex(SAFE_ID), message: z.string().min(1).max(8_000) }).strict() }).strict(),
]);

export function buildGeneratedCompositionSandboxRequestV1(input: {
  executionId: string; createdAt: string; appCommit: string; apiImplementationHash: string;
  program: GeneratedCompositionProgramV1; sourceBundle: GeneratedCompositionSourceBundleV1;
  evidencePack: unknown; referenceBlueprint: unknown; supplementalFacts: unknown; proofFrames: readonly number[];
  inputs: readonly { kind: 'SOURCE_MEDIA' | 'FONT'; bindingId: string; fileName: string; bytes: Uint8Array }[];
  resources: GeneratedCompositionSandboxRequestV1['resources'];
}): Readonly<GeneratedCompositionSandboxRequestV1> {
  const programHash = hashCanonicalJsonV1(input.program);
  const sourceBundleHash = input.program.sourceBundleHash;
  const inlineInputs = input.inputs.map(({ bytes, ...item }) => ({ ...item, contentSha256: sha256(bytes), byteLength: bytes.byteLength, encoding: 'BASE64' as const, data: Buffer.from(bytes).toString('base64') }));
  const base = {
    version: GENERATED_COMPOSITION_SANDBOX_CONTRACT_V1, authority: 'RESEARCH_ISOLATED_PROXY_NO_PROJECT_MUTATION' as const,
    executionId: input.executionId, createdAt: input.createdAt, appCommit: input.appCommit, programHash, sourceBundleHash,
    apiImplementationHash: input.apiImplementationHash, program: input.program, sourceBundle: input.sourceBundle,
    evidencePack: input.evidencePack, referenceBlueprint: input.referenceBlueprint, supplementalFacts: input.supplementalFacts,
    proofFrames: [...input.proofFrames], inputs: inlineInputs,
    policy: { network: 'DENY_ALL' as const, environment: 'EMPTY' as const, secrets: 'NONE' as const, database: 'DENY' as const, projectMutation: 'DENY' as const, persistent: false as const },
    resources: input.resources, stateEffects: [] as const,
  };
  return parseGeneratedCompositionSandboxRequestV1({ ...base, requestId: requestIdentity(base) });
}

export function parseGeneratedCompositionSandboxRequestV1(value: unknown): Readonly<GeneratedCompositionSandboxRequestV1> {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_GENERATED_COMPOSITION_SANDBOX_REQUEST_BYTES_V1) throw new Error('Generated composition sandbox request exceeds byte limit');
  const parsed = requestSchema.parse(value) as unknown as GeneratedCompositionSandboxRequestV1;
  const verification = verifyGeneratedCompositionProgramV1(parsed);
  if (verification.disposition !== 'CONTRACT_PASS' || verification.programHash !== parsed.programHash || verification.sourceBundleHash !== parsed.sourceBundleHash) throw new Error(`Generated composition sandbox program rejected: ${verification.diagnostics.join(',')}`);
  if (parsed.requestId !== requestIdentity(parsed)) throw new Error('Generated composition sandbox request identity drift');
  validateProofFrames(parsed);
  validateInlineInputs(parsed);
  if (parsed.resources.wallTimeMs > parsed.program.resourceBudget.maxWallTimeMs || parsed.resources.memoryMiB > parsed.program.resourceBudget.maxMemoryMiB || parsed.resources.maxOutputBytes > parsed.program.resourceBudget.maxOutputBytes) throw new Error('Generated composition sandbox resources exceed program budget');
  return Object.freeze(parsed);
}

export function parseGeneratedCompositionSandboxWorkerResultV1(value: unknown): Readonly<GeneratedCompositionSandboxWorkerResultV1> {
  return Object.freeze(resultSchema.parse(value) as GeneratedCompositionSandboxWorkerResultV1);
}

export function buildGeneratedCompositionSandboxHostReceiptV1(input: {
  request: unknown; result: unknown; snapshotId: string; sandboxDeleted: boolean; networkPolicy: 'DENY_ALL' | 'OTHER'; persistent: boolean;
  command: { exitCode: number; stdout: string; stderr: string }; outputBytes: Readonly<Record<string, Uint8Array>>;
}): Readonly<GeneratedCompositionSandboxHostReceiptV1> {
  const request = parseGeneratedCompositionSandboxRequestV1(input.request);
  const result = parseGeneratedCompositionSandboxWorkerResultV1(input.result);
  if (result.status !== 'RENDERED') throw new Error('Generated composition sandbox did not render');
  if (result.requestId !== request.requestId || result.executionId !== request.executionId || result.appCommit !== request.appCommit || result.programHash !== request.programHash || result.sourceBundleHash !== request.sourceBundleHash) throw new Error('Generated composition sandbox result identity drift');
  if (!input.sandboxDeleted || input.networkPolicy !== 'DENY_ALL' || input.persistent || input.command.exitCode !== 0) throw new Error('Generated composition sandbox host attestation failed');
  const expectedPaths = new Set(result.outputs.map(({ path }) => path));
  if (Object.keys(input.outputBytes).length !== expectedPaths.size || Object.keys(input.outputBytes).some((path) => !expectedPaths.has(path))) throw new Error('Generated composition sandbox output set drift');
  for (const output of result.outputs) {
    if (!output.path.startsWith(`/tmp/editron-gcp/${request.requestId}/`) || output.path.includes('..')) throw new Error('Generated composition sandbox output path escaped');
    const bytes = input.outputBytes[output.path];
    if (!bytes || bytes.byteLength !== output.byteLength || sha256(bytes) !== output.contentSha256) throw new Error(`Generated composition sandbox output hash drift: ${output.path}`);
  }
  if (result.outputs.reduce((sum, output) => sum + output.byteLength, 0) > request.resources.maxOutputBytes) throw new Error('Generated composition sandbox outputs exceed budget');
  const unsigned = {
    artifactType: 'GeneratedCompositionSandboxHostReceiptV1' as const, requestId: request.requestId,
    requestHash: hashCanonicalJsonV1(request), resultHash: hashCanonicalJsonV1(result), executionId: request.executionId,
    provider: 'VERCEL_SANDBOX' as const, snapshotId: input.snapshotId, appCommit: request.appCommit,
    networkPolicy: 'DENY_ALL' as const, persistent: false as const, sandboxDeleted: true as const,
    command: { exitCode: 0 as const, stdoutSha256: sha256(Buffer.from(input.command.stdout)), stderrSha256: sha256(Buffer.from(input.command.stderr)) },
    outputs: result.outputs, proof: { productionSandbox: 'PASS' as const, outputMaterialization: 'PASS' as const, projectMutation: 'NONE' as const }, stateEffects: [] as const,
  };
  return Object.freeze({ ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) });
}

function requestIdentity(value: Omit<GeneratedCompositionSandboxRequestV1, 'requestId'> | GeneratedCompositionSandboxRequestV1): string {
  return hashCanonicalJsonV1({ executionId: value.executionId, appCommit: value.appCommit, programHash: value.programHash, sourceBundleHash: value.sourceBundleHash, apiImplementationHash: value.apiImplementationHash, proofFrames: [...value.proofFrames], inputs: value.inputs.map(({ kind, bindingId, fileName, contentSha256, byteLength }) => ({ kind, bindingId, fileName, contentSha256, byteLength })).sort((left, right) => left.bindingId < right.bindingId ? -1 : left.bindingId > right.bindingId ? 1 : 0), resources: value.resources });
}

function validateProofFrames(request: GeneratedCompositionSandboxRequestV1): void {
  const duration = Number(request.program.duration.compositionEndExclusiveTick);
  if (!Number.isSafeInteger(duration) || new Set(request.proofFrames).size !== request.proofFrames.length || request.proofFrames.some((frame) => frame < 0 || frame >= duration)) throw new Error('Generated composition sandbox proof frames are invalid');
}

function validateInlineInputs(request: GeneratedCompositionSandboxRequestV1): void {
  const expected = new Map<string, { kind: 'SOURCE_MEDIA' | 'FONT'; hash: string }>();
  for (const source of request.program.sourceSlots) expected.set(source.assetId, { kind: 'SOURCE_MEDIA', hash: source.assetVersion.replace(/^sha256:/, '') });
  for (const font of request.program.fontSlots) expected.set(font.fontAssetId, { kind: 'FONT', hash: font.fileSha256 });
  if (request.inputs.length !== expected.size || new Set(request.inputs.map(({ bindingId }) => bindingId)).size !== request.inputs.length) throw new Error('Generated composition sandbox input set drift');
  let bytes = 0;
  for (const input of request.inputs) {
    const decoded = Buffer.from(input.data, 'base64'); const binding = expected.get(input.bindingId);
    if (!binding || binding.kind !== input.kind || decoded.toString('base64') !== input.data || decoded.byteLength !== input.byteLength || sha256(decoded) !== input.contentSha256 || input.contentSha256 !== binding.hash) throw new Error(`Generated composition sandbox inline input drift: ${input.bindingId}`);
    bytes += decoded.byteLength;
  }
  if (bytes > request.program.resourceBudget.maxInputBytes) throw new Error('Generated composition sandbox inputs exceed budget');
}

function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
