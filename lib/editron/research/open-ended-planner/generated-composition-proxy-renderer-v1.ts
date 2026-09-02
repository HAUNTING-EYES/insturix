import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderStill, selectComposition } from '@remotion/renderer';
import type { VideoConfig } from 'remotion/no-react';
import sharp from 'sharp';

import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  renderGeneratedCompositionPlayableProxyV1,
  type GeneratedCompositionPlayableProxyV1,
} from './generated-composition-playable-proxy-v1';
import {
  GENERATED_COMPOSITION_API_ID_V1,
  type GeneratedCompositionProgramV1,
  type GeneratedCompositionSourceBundleV1,
} from './generated-composition-program-v1';
import {
  resolveGeneratedCompositionVisualSourceKindV1,
  verifyGeneratedCompositionProgramV1,
  type GeneratedCompositionVisualSourceKindV1,
} from './generated-composition-program-verifier-v1';

const COMPOSITION_ID = 'GeneratedCompositionProxyV1';
const ENTRY_SOURCE = `import { registerRoot } from 'remotion';\nimport { Root } from './Root';\nregisterRoot(Root);\n`;

interface MaterializedInputsV1 {
  assetPaths: Readonly<Record<string, string>>;
  fontPaths: Readonly<Record<string, string>>;
}

export interface RenderTrustedGeneratedCompositionProxyInputV1 {
  program: GeneratedCompositionProgramV1;
  sourceBundle: GeneratedCompositionSourceBundleV1;
  evidencePack: unknown;
  referenceBlueprint: unknown;
  supplementalFacts: unknown;
  expectedProgramHash: string;
  expectedSourceBundleHash: string;
  materializedInputs: MaterializedInputsV1;
}

interface RenderAdapterV1 {
  bundleWorkspace(input: { entryPoint: string; publicDir: string; bundleDir: string; apiImplementationPath: string }): Promise<string>;
  select(serveUrl: string, id: string): Promise<VideoConfig>;
  render(input: { serveUrl: string; composition: VideoConfig; frame: number; output: string; cancelSignal: ReturnType<typeof makeCancelSignal>['cancelSignal'] }): Promise<void>;
}

export interface GeneratedCompositionProxyRenderOptionsV1 {
  repoRoot?: string;
  workspaceRoot?: string;
  apiImplementationPath?: string;
  proofFrames?: readonly number[];
  includePlayableProxy?: boolean;
  playableRenderer?: typeof renderGeneratedCompositionPlayableProxyV1;
  adapter?: RenderAdapterV1;
}

export interface GeneratedCompositionProxyReceiptV1 {
  artifactType: 'GeneratedCompositionProxyReceiptV1';
  executionClass: 'TRUSTED_HUMAN_FIXTURE_LOCAL_PROCESS' | 'VERIFIED_PROGRAM_DENY_ALL_SANDBOX_PROCESS';
  securityDisposition: 'NOT_A_SECURITY_SANDBOX' | 'HOST_ATTESTATION_REQUIRED';
  programHash: string;
  sourceBundleHash: string;
  apiImplementationHash: string;
  composition: { width: number; height: number; fps: number; durationInFrames: number };
  stills: readonly { frame: number; path: string; sha256: string; width: number; height: number }[];
  contactSheet: { path: string; sha256: string; width: number; height: number };
  playableProxy?: GeneratedCompositionPlayableProxyV1;
  proof: {
    contract: 'PASS';
    materializedInputs: 'PASS';
    compile: 'PASS';
    renderedEvidence: 'CAPTURED_UNJUDGED';
    productionSandbox: 'UNVERIFIABLE_LOCAL_PROCESS' | 'HOST_ATTESTATION_REQUIRED';
  };
  stateEffects: readonly [];
  workspaceDir: string;
  receiptHash: string;
}

export function selectGeneratedCompositionProofFramesV1(durationInFrames: number): number[] {
  if (!Number.isSafeInteger(durationInFrames) || durationInFrames < 2) throw new Error('Generated composition proxy requires an integer duration of at least two frames');
  const last = durationInFrames - 1;
  return [...new Set([0, Math.min(24, last), Math.min(108, last), Math.min(144, last), Math.min(145, last), last])];
}

export async function renderTrustedGeneratedCompositionProxyV1(
  input: RenderTrustedGeneratedCompositionProxyInputV1,
  options: GeneratedCompositionProxyRenderOptionsV1 = {},
): Promise<Readonly<GeneratedCompositionProxyReceiptV1>> {
  return renderVerifiedGeneratedCompositionProxyV1(input, options, {
    executionClass: 'TRUSTED_HUMAN_FIXTURE_LOCAL_PROCESS',
    securityDisposition: 'NOT_A_SECURITY_SANDBOX',
    productionSandbox: 'UNVERIFIABLE_LOCAL_PROCESS',
    allowedGeneratorKinds: ['HUMAN_AUTHORED_FIXTURE'],
  });
}

export async function renderGeneratedCompositionProxyInsideSandboxV1(
  input: RenderTrustedGeneratedCompositionProxyInputV1,
  options: GeneratedCompositionProxyRenderOptionsV1 = {},
): Promise<Readonly<GeneratedCompositionProxyReceiptV1>> {
  return renderVerifiedGeneratedCompositionProxyV1(input, options, {
    executionClass: 'VERIFIED_PROGRAM_DENY_ALL_SANDBOX_PROCESS',
    securityDisposition: 'HOST_ATTESTATION_REQUIRED',
    productionSandbox: 'HOST_ATTESTATION_REQUIRED',
    allowedGeneratorKinds: ['HUMAN_AUTHORED_FIXTURE', 'MODEL_GENERATED'],
  });
}

interface ProxyExecutionContextV1 {
  executionClass: GeneratedCompositionProxyReceiptV1['executionClass'];
  securityDisposition: GeneratedCompositionProxyReceiptV1['securityDisposition'];
  productionSandbox: GeneratedCompositionProxyReceiptV1['proof']['productionSandbox'];
  allowedGeneratorKinds: readonly GeneratedCompositionProgramV1['generator']['kind'][];
}

async function renderVerifiedGeneratedCompositionProxyV1(
  input: RenderTrustedGeneratedCompositionProxyInputV1,
  options: GeneratedCompositionProxyRenderOptionsV1,
  execution: ProxyExecutionContextV1,
): Promise<Readonly<GeneratedCompositionProxyReceiptV1>> {
  const verification = verifyGeneratedCompositionProgramV1(input);
  if (verification.disposition !== 'CONTRACT_PASS' || !verification.programHash || !verification.sourceBundleHash) {
    throw new Error(`Generated composition proxy contract rejected: ${verification.diagnostics.join(',')}`);
  }
  if (!execution.allowedGeneratorKinds.includes(input.program.generator.kind)) throw new Error('Generated composition local proxy refuses model-generated source');
  if (verification.programHash !== input.expectedProgramHash || verification.sourceBundleHash !== input.expectedSourceBundleHash) {
    throw new Error('Generated composition proxy expected identity drift');
  }

  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const workspaceRoot = path.resolve(options.workspaceRoot ?? path.join(repoRoot, '.calibration-temp', 'open-ended-planner-v2', 'generated-composition-proxy'));
  const apiPath = path.resolve(options.apiImplementationPath ?? path.join(repoRoot, 'lib', 'editron', 'research', 'open-ended-planner', 'generated-composition-api-v1.tsx'));
  const apiHash = await sha256File(apiPath);
  const duration = positiveInteger(input.program.duration.compositionEndExclusiveTick, 'composition duration');
  const fps = rationalIntegerRate(input.program.compositionTimebase.rate.numerator, input.program.compositionTimebase.rate.denominator);
  const proofFrames = options.proofFrames ? validateProofFrames(options.proofFrames, duration) : selectGeneratedCompositionProofFramesV1(duration);
  const workspaceId = hashCanonicalJsonV1({ programHash: verification.programHash, sourceBundleHash: verification.sourceBundleHash, apiHash, proofFrames, includePlayableProxy: options.includePlayableProxy === true }).slice(0, 20);
  const workspaceDir = safeWorkspacePath(workspaceRoot, workspaceId);
  const publicDir = path.join(workspaceDir, 'public');
  const stillDir = path.join(workspaceDir, 'stills');
  const bundleDir = path.join(workspaceDir, 'bundle');
  await fs.rm(workspaceDir, { recursive: true, force: true });
  await Promise.all([fs.mkdir(publicDir, { recursive: true }), fs.mkdir(stillDir, { recursive: true })]);

  const sourceManifest = await materializeSources(input.program, input.evidencePack, input.materializedInputs, publicDir);
  const fontManifest = await materializeFonts(input.program, input.materializedInputs, publicDir);
  const inputBytes = [...sourceManifest, ...fontManifest].reduce((sum, item) => sum + item.bytes, 0);
  if (inputBytes > input.program.resourceBudget.maxInputBytes) throw new Error(`Generated composition materialized inputs exceed budget: ${inputBytes}`);
  for (const file of input.sourceBundle.files) await fs.writeFile(path.join(workspaceDir, file.path), file.source, 'utf8');
  await fs.copyFile(apiPath, path.join(workspaceDir, 'GeneratedCompositionApiV1.tsx'));
  await fs.writeFile(path.join(workspaceDir, 'Root.tsx'), buildRootSource(input.program, sourceManifest, fontManifest, duration, fps), 'utf8');
  await fs.writeFile(path.join(workspaceDir, 'index.ts'), ENTRY_SOURCE, 'utf8');

  const adapter = options.adapter ?? defaultAdapter();
  const serveUrl = await adapter.bundleWorkspace({ entryPoint: path.join(workspaceDir, 'index.ts'), publicDir, bundleDir, apiImplementationPath: path.join(workspaceDir, 'GeneratedCompositionApiV1.tsx') });
  const selectedComposition = await adapter.select(serveUrl, COMPOSITION_ID);
  const expectedComposition = { width: input.program.canvas.width, height: input.program.canvas.height, fps, durationInFrames: duration };
  const probedComposition = {
    width: selectedComposition.width,
    height: selectedComposition.height,
    fps: selectedComposition.fps,
    durationInFrames: selectedComposition.durationInFrames,
  };
  if (JSON.stringify(probedComposition) !== JSON.stringify(expectedComposition)) throw new Error(`Generated composition metadata drift: ${JSON.stringify(probedComposition)}`);

  const { cancelSignal, cancel } = makeCancelSignal();
  let budgetExceeded = false;
  const timer = setTimeout(() => { budgetExceeded = true; cancel(); }, input.program.resourceBudget.maxWallTimeMs);
  const stills: Array<{ frame: number; path: string; sha256: string; width: number; height: number }> = [];
  let playableProxy: GeneratedCompositionPlayableProxyV1 | undefined;
  try {
    for (const frame of proofFrames) {
      const output = path.join(stillDir, `frame-${String(frame).padStart(4, '0')}.png`);
      await adapter.render({ serveUrl, composition: selectedComposition, frame, output, cancelSignal });
      const metadata = await sharp(output).metadata();
      if (metadata.width !== selectedComposition.width || metadata.height !== selectedComposition.height) throw new Error(`Generated composition still dimensions drift at frame ${frame}`);
      stills.push({ frame, path: output, sha256: await sha256File(output), width: metadata.width, height: metadata.height });
    }
    if (options.includePlayableProxy) playableProxy = await (options.playableRenderer ?? renderGeneratedCompositionPlayableProxyV1)({
      serveUrl, composition: selectedComposition, output: path.join(workspaceDir, 'playable-proxy.mp4'), cancelSignal,
      expected: { width: expectedComposition.width, height: expectedComposition.height, frameRate: input.program.compositionTimebase.rate, durationInFrames: duration },
    });
  } catch (error) {
    try { cancel(); } catch { /* best-effort browser teardown */ }
    if (budgetExceeded) throw new Error(`Generated composition proxy exceeded ${input.program.resourceBudget.maxWallTimeMs}ms wall budget`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const contactSheet = await createContactSheet(stills, path.join(workspaceDir, 'contact-sheet.png'));
  const unsigned = {
    artifactType: 'GeneratedCompositionProxyReceiptV1' as const,
    executionClass: execution.executionClass,
    securityDisposition: execution.securityDisposition,
    programHash: verification.programHash,
    sourceBundleHash: verification.sourceBundleHash,
    apiImplementationHash: apiHash,
    composition: probedComposition,
    stills,
    contactSheet,
    ...(playableProxy ? { playableProxy } : {}),
    proof: { contract: 'PASS' as const, materializedInputs: 'PASS' as const, compile: 'PASS' as const, renderedEvidence: 'CAPTURED_UNJUDGED' as const, productionSandbox: execution.productionSandbox },
    stateEffects: [] as const,
    workspaceDir,
  };
  const receipt = { ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) };
  await fs.writeFile(path.join(workspaceDir, 'receipt.json'), JSON.stringify(receipt, null, 2), 'utf8');
  return Object.freeze(receipt);
}

function defaultAdapter(): RenderAdapterV1 {
  return {
    bundleWorkspace: async ({ entryPoint, publicDir, bundleDir, apiImplementationPath }) => bundle({
      entryPoint, publicDir, outDir: bundleDir, enableCaching: false,
      webpackOverride: (configuration) => ({
        ...configuration,
        resolve: { ...configuration.resolve, alias: { ...(Array.isArray(configuration.resolve?.alias) ? {} : configuration.resolve?.alias), [`${GENERATED_COMPOSITION_API_ID_V1}$`]: apiImplementationPath } },
      }),
    }),
    select: async (serveUrl, id) => selectComposition({ serveUrl, id, inputProps: {} }),
    render: async ({ serveUrl, composition, frame, output, cancelSignal }) => { await renderStill({ serveUrl, composition, frame, output, imageFormat: 'png', overwrite: true, cancelSignal, logLevel: 'error' }); },
  };
}

function buildRootSource(program: GeneratedCompositionProgramV1, sources: MaterializedSource[], fonts: MaterializedFont[], duration: number, fps: number): string {
  const manifest = {
    canvas: program.canvas,
    parameters: Object.fromEntries(program.exposedParameters.map(({ parameterId, defaultValue }) => [parameterId, defaultValue])),
    sources: sources.map(({ slotId, publicFileName, mediaKind, startFrame, endExclusiveFrame }) => ({ slotId, publicFileName, mediaKind, startFrame, endExclusiveFrame })),
    fonts: fonts.map(({ slotId, publicFileName, family, weight }) => ({ slotId, publicFileName, family, weight })),
    textSlots: program.textSlots,
    layers: program.declaredLayers.map(({ layerId, kind, zIndex }) => ({ layerId, kind, zIndex })),
  };
  return `import React from 'react';\nimport { Composition } from 'remotion';\nimport { GeneratedComposition } from './GeneratedComposition';\nimport { GeneratedCompositionProvider } from '${GENERATED_COMPOSITION_API_ID_V1}';\nconst manifest=${JSON.stringify(manifest)};\nconst Scene=()=> <GeneratedCompositionProvider manifest={manifest}><GeneratedComposition /></GeneratedCompositionProvider>;\nexport const Root=()=> <Composition id="${COMPOSITION_ID}" component={Scene} durationInFrames={${duration}} fps={${fps}} width={${program.canvas.width}} height={${program.canvas.height}} />;\n`;
}

interface MaterializedSource { slotId: string; publicFileName: string; mediaKind: GeneratedCompositionVisualSourceKindV1; startFrame: number; endExclusiveFrame: number; bytes: number }
interface MaterializedFont { slotId: string; publicFileName: string; family: string; weight: number; bytes: number }

async function materializeSources(program: GeneratedCompositionProgramV1, evidencePack: unknown, inputs: MaterializedInputsV1, publicDir: string): Promise<MaterializedSource[]> {
  const identities = sourceMediaIdentities(evidencePack);
  return Promise.all(program.sourceSlots.map(async (slot) => {
    const identity = identities.find((candidate) => candidate.assetId === slot.assetId);
    const mediaKind = resolveGeneratedCompositionVisualSourceKindV1(identity, slot.sourceRange);
    if (!mediaKind) throw new Error(`Generated composition visual source kind is unsupported: ${slot.assetId}`);
    const sourcePath = inputs.assetPaths[slot.assetId];
    if (!sourcePath) throw new Error(`Generated composition materialized asset is missing: ${slot.assetId}`);
    const { bytes, sha256 } = await verifiedInput(sourcePath);
    if (`sha256:${sha256}` !== slot.assetVersion) throw new Error(`Generated composition asset hash drift: ${slot.assetId}`);
    const startFrame = positiveOrZeroInteger(slot.sourceRange.start, 'source start');
    const endExclusiveFrame = positiveInteger(slot.sourceRange.endExclusive, 'source end');
    if (mediaKind === 'STILL_IMAGE' && (startFrame !== 0 || endExclusiveFrame !== 1)) {
      throw new Error(`Generated composition still image range must be [0,1): ${slot.assetId}`);
    }
    const extension = safeExtension(sourcePath, mediaKind === 'STILL_IMAGE' ? ['.png', '.jpg', '.jpeg', '.webp'] : ['.mp4']);
    if (mediaKind === 'STILL_IMAGE') await assertStaticImageInput(sourcePath, extension);
    const publicFileName = `asset-${slot.slotId}${extension}`;
    await fs.copyFile(sourcePath, path.join(publicDir, publicFileName));
    return { slotId: slot.slotId, publicFileName, mediaKind, startFrame, endExclusiveFrame, bytes };
  }));
}

function sourceMediaIdentities(evidencePack: unknown): Record<string, unknown>[] {
  if (!evidencePack || typeof evidencePack !== 'object' || Array.isArray(evidencePack)) return [];
  const facts = (evidencePack as { facts?: unknown }).facts;
  return Array.isArray(facts)
    ? facts.filter((fact): fact is Record<string, unknown> => Boolean(fact) && typeof fact === 'object' && !Array.isArray(fact) && fact.kind === 'SOURCE_MEDIA_IDENTITY')
    : [];
}

async function assertStaticImageInput(filePath: string, extension: string): Promise<void> {
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    metadata = await sharp(filePath, { animated: true }).metadata();
  } catch {
    throw new Error(`Generated composition still image cannot be decoded: ${filePath}`);
  }
  const expectedFormat = extension === '.png' ? 'png' : extension === '.webp' ? 'webp' : 'jpeg';
  if (metadata.format !== expectedFormat || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) {
    throw new Error(`Generated composition still image format or frame count is invalid: ${filePath}`);
  }
}

async function materializeFonts(program: GeneratedCompositionProgramV1, inputs: MaterializedInputsV1, publicDir: string): Promise<MaterializedFont[]> {
  return Promise.all(program.fontSlots.map(async (slot) => {
    const fontPath = inputs.fontPaths[slot.fontAssetId];
    if (!fontPath) throw new Error(`Generated composition materialized font is missing: ${slot.fontAssetId}`);
    const { bytes, sha256 } = await verifiedInput(fontPath);
    if (sha256 !== slot.fileSha256) throw new Error(`Generated composition font hash drift: ${slot.fontAssetId}`);
    const publicFileName = `font-${slot.slotId}${safeExtension(fontPath, ['.ttf', '.otf', '.woff', '.woff2'])}`;
    await fs.copyFile(fontPath, path.join(publicDir, publicFileName));
    return { slotId: slot.slotId, publicFileName, family: slot.family, weight: slot.weight, bytes };
  }));
}

async function verifiedInput(filePath: string): Promise<{ bytes: number; sha256: string }> {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Generated composition input is not a regular file: ${filePath}`);
  return { bytes: stat.size, sha256: await sha256File(filePath) };
}

async function createContactSheet(stills: readonly { path: string }[], output: string): Promise<{ path: string; sha256: string; width: number; height: number }> {
  const tileWidth = 270; const tileHeight = 480; const columns = 3; const rows = Math.ceil(stills.length / columns);
  const composites = await Promise.all(stills.map(async (still, index) => ({ input: await sharp(still.path).resize(tileWidth, tileHeight).png().toBuffer(), left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight })));
  await sharp({ create: { width: columns * tileWidth, height: rows * tileHeight, channels: 3, background: '#111111' } }).composite(composites).png().toFile(output);
  return { path: output, sha256: await sha256File(output), width: columns * tileWidth, height: rows * tileHeight };
}

function validateProofFrames(frames: readonly number[], duration: number): number[] {
  if (!frames.length || frames.some((frame) => !Number.isSafeInteger(frame) || frame < 0 || frame >= duration) || new Set(frames).size !== frames.length) throw new Error('Generated composition proof frames are invalid');
  return [...frames].sort((left, right) => left - right);
}

function safeWorkspacePath(root: string, id: string): string {
  if (!/^[a-f0-9]{20}$/.test(id)) throw new Error('Generated composition workspace identity is invalid');
  const target = path.resolve(root, id);
  if (target === root || !target.startsWith(root + path.sep)) throw new Error('Generated composition workspace escaped its root');
  return target;
}

function safeExtension(filePath: string, allowed: string[]): string {
  const extension = path.extname(filePath).toLowerCase();
  if (!allowed.includes(extension)) throw new Error(`Generated composition input extension is unsupported: ${extension}`);
  return extension;
}

function positiveInteger(value: string, label: string): number { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Generated composition ${label} is invalid`); return parsed; }
function positiveOrZeroInteger(value: string, label: string): number { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Generated composition ${label} is invalid`); return parsed; }
function rationalIntegerRate(numerator: string, denominator: string): number { const n = positiveInteger(numerator, 'rate numerator'); const d = positiveInteger(denominator, 'rate denominator'); if (n % d !== 0) throw new Error('Generated composition local proxy supports integer rates only'); return n / d; }

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => { const stream = createReadStream(filePath); stream.on('data', (chunk) => hash.update(chunk)); stream.on('error', reject); stream.on('end', resolve); });
  return hash.digest('hex');
}
