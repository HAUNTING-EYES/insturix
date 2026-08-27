import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1, sha256TextV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { resolveGeneratedPanelGeometryV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-api-v1';
import { parseGeneratedCompositionAvcMetadataV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-avc-metadata-v1';
import { parseGeneratedCompositionPlayableProxyObservationV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-playable-proxy-v1';
import { hashGeneratedCompositionSourceBundleV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-program-v1';
import { verifyGeneratedCompositionProgramV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1';
import {
  renderGeneratedCompositionProxyInsideSandboxV1,
  renderTrustedGeneratedCompositionProxyV1,
  selectGeneratedCompositionProofFramesV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-proxy-renderer-v1';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

describe('open-ended planner V2 trusted generated-composition proxy', () => {
  it('selects the DEV-02 build, hold, release, and boundary proof frames', () => {
    expect(selectGeneratedCompositionProofFramesV1(180)).toEqual([0, 24, 108, 144, 145, 179]);
    expect(resolveGeneratedPanelGeometryV1({
      canvas: { width: 1080, height: 1920 }, gutter: 10, column: 'centre', row: 'centre', takeoverProgress: 0,
    })).toEqual({ left: 360, top: 640, width: 360, height: 640, padding: 5 });
    expect(resolveGeneratedPanelGeometryV1({
      canvas: { width: 1080, height: 1920 }, gutter: 10, column: 'centre', row: 'centre', takeoverProgress: 1,
    })).toEqual({ left: 0, top: 0, width: 1080, height: 1920, padding: 0 });
    const arbitrary = resolveGeneratedPanelGeometryV1({
      canvas: { width: 1080, height: 1920 }, gutter: 0,
      bounds: { left: 0.03, top: 0.03, width: 0.27, height: 0.39 }, takeoverProgress: 0,
    });
    expect(arbitrary.left).toBeCloseTo(32.4, 8);
    expect(arbitrary.top).toBeCloseTo(57.6, 8);
    expect(arbitrary.width).toBeCloseTo(291.6, 8);
    expect(arbitrary.height).toBeCloseTo(748.8, 8);
    expect(arbitrary.padding).toBe(0);
    expect(() => resolveGeneratedPanelGeometryV1({
      canvas: { width: 1080, height: 1920 }, gutter: 0,
      bounds: { left: 0.8, top: 0, width: 0.3, height: 1 }, takeoverProgress: 0,
    })).toThrow('must be contained inside [0,1]');
    expect(() => resolveGeneratedPanelGeometryV1({
      canvas: { width: 1080, height: 1920 }, gutter: 0, column: 'left', row: 'top',
      bounds: { left: 0, top: 0, width: 0.3, height: 0.3 }, takeoverProgress: 0,
    })).toThrow('must use bounds or grid position, not both');
  });

  it('renders only an exact human-authored fixture and keeps sandbox/creative proof unresolved', async () => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-gcp-v1-'));
    try {
      const fixture = await materializedFixture(scratch);
      const renderCalls: number[] = [];
      const adapter = {
        bundleWorkspace: async ({ entryPoint, publicDir, apiImplementationPath }: { entryPoint: string; publicDir: string; apiImplementationPath: string }) => {
          expect(await fs.stat(entryPoint)).toBeTruthy();
          expect(await fs.stat(publicDir)).toBeTruthy();
          expect(await fs.stat(apiImplementationPath)).toBeTruthy();
          return 'mock://generated-composition';
        },
        select: async () => ({
          width: 1080, height: 1920, fps: 30, durationInFrames: 180,
          id: 'GeneratedCompositionProxyV1', defaultProps: {}, props: {}, defaultCodec: null,
          defaultOutName: null, defaultVideoImageFormat: null, defaultPixelFormat: null, defaultProResProfile: null,
          defaultSampleRate: null,
        }),
        render: async ({ frame, output }: { frame: number; output: string }) => {
          renderCalls.push(frame);
          await sharp({ create: { width: 1080, height: 1920, channels: 3 as const, background: { r: frame, g: 20, b: 40 } } }).png().toFile(output);
        },
      };
      const receipt = await renderTrustedGeneratedCompositionProxyV1(fixture.input, {
        workspaceRoot: path.join(scratch, 'workspaces'),
        includePlayableProxy: true,
        playableRenderer: async ({ output, expected }) => {
          const bytes = Buffer.from('playable-proxy'); await fs.writeFile(output, bytes);
          return {
            path: output, sha256: hashBytes(bytes), container: 'MP4', codec: 'H264', pixelFormat: 'YUV420P',
            color: { space: 'BT709', transfer: 'BT709', primaries: 'BT709', range: 'LIMITED' }, audio: 'ABSENT',
            width: expected.width, height: expected.height, frameRate: expected.frameRate, durationInFrames: expected.durationInFrames,
          };
        },
        adapter,
      });
      expect(renderCalls).toEqual([0, 24, 108, 144, 145, 179]);
      expect(receipt).toMatchObject({
        executionClass: 'TRUSTED_HUMAN_FIXTURE_LOCAL_PROCESS',
        securityDisposition: 'NOT_A_SECURITY_SANDBOX',
        proof: { contract: 'PASS', materializedInputs: 'PASS', compile: 'PASS', renderedEvidence: 'CAPTURED_UNJUDGED', productionSandbox: 'UNVERIFIABLE_LOCAL_PROCESS' },
        stateEffects: [],
      });
      expect(receipt.stills).toHaveLength(6);
      expect(receipt.playableProxy).toMatchObject({ codec: 'H264', frameRate: { numerator: '30', denominator: '1' }, durationInFrames: 180, audio: 'ABSENT' });
      expect(await fs.readFile(path.join(receipt.workspaceDir, 'receipt.json'), 'utf8')).toContain(receipt.receiptHash);

      const modelProgram = {
        ...fixture.input.program,
        generator: { ...fixture.input.program.generator, kind: 'MODEL_GENERATED' as const, modelId: 'test-model' },
      };
      await expect(renderTrustedGeneratedCompositionProxyV1({
        ...fixture.input,
        program: modelProgram,
        expectedProgramHash: hashCanonicalJsonV1(modelProgram),
      }, { workspaceRoot: path.join(scratch, 'denied') })).rejects.toThrow('refuses model-generated source');
      const sandboxReceipt = await renderGeneratedCompositionProxyInsideSandboxV1({
        ...fixture.input,
        program: modelProgram,
        expectedProgramHash: hashCanonicalJsonV1(modelProgram),
      }, { workspaceRoot: path.join(scratch, 'sandbox'), adapter });
      expect(sandboxReceipt).toMatchObject({
        executionClass: 'VERIFIED_PROGRAM_DENY_ALL_SANDBOX_PROCESS',
        securityDisposition: 'HOST_ATTESTATION_REQUIRED',
        proof: { productionSandbox: 'HOST_ATTESTATION_REQUIRED', renderedEvidence: 'CAPTURED_UNJUDGED' },
      });
    } finally {
      await fs.rm(scratch, { recursive: true, force: true });
    }
  });

  it('renders a hash-bound still source and rejects unsafe visual-source substitutions', async () => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-gcp-still-v1-'));
    try {
      const fixture = await materializedStillFixture(scratch);
      expect(verifyGeneratedCompositionProgramV1(fixture.input)).toMatchObject({
        disposition: 'CONTRACT_PASS', diagnostics: [],
      });
      const receipt = await renderTrustedGeneratedCompositionProxyV1(fixture.input, {
        workspaceRoot: path.join(scratch, 'render'), proofFrames: [0],
      });
      expect(receipt).toMatchObject({
        composition: { width: 120, height: 80, fps: 30, durationInFrames: 180 },
        proof: { contract: 'PASS', materializedInputs: 'PASS', compile: 'PASS' },
      });
      expect(await fs.readFile(path.join(receipt.workspaceDir, 'Root.tsx'), 'utf8'))
        .toContain('"mediaKind":"STILL_IMAGE"');
      const stats = await sharp(receipt.stills[0].path).stats();
      expect(stats.channels[0].mean).toBeCloseTo(18, 0);
      expect(stats.channels[1].mean).toBeCloseTo(52, 0);
      expect(stats.channels[2].mean).toBeCloseTo(86, 0);

      const audio = structuredClone(fixture.input) as any;
      audio.evidencePack.facts.find((fact: any) => fact.assetId === 'dev02-wide').mediaKind = 'AUDIO';
      audio.program.projectBinding.evidencePackHash = hashCanonicalJsonV1(audio.evidencePack);
      expect(verifyGeneratedCompositionProgramV1(audio).diagnostics)
        .toContain('SOURCE_MEDIA_KIND_UNSUPPORTED:source-wide');

      const invalidRange = structuredClone(fixture.input) as any;
      invalidRange.program.sourceSlots[0].sourceRange.endExclusive = '2';
      expect(verifyGeneratedCompositionProgramV1(invalidRange).diagnostics)
        .toContain('STILL_IMAGE_SOURCE_RANGE_INVALID:source-wide');

      const disguisedPath = path.join(scratch, 'still.gif');
      await fs.copyFile(fixture.stillPath, disguisedPath);
      await expect(renderTrustedGeneratedCompositionProxyV1({
        ...fixture.input,
        materializedInputs: { assetPaths: { 'dev02-wide': disguisedPath }, fontPaths: {} },
      }, { workspaceRoot: path.join(scratch, 'bad-extension'), proofFrames: [0] }))
        .rejects.toThrow('input extension is unsupported');

      const driftPath = path.join(scratch, 'drift.png');
      await sharp({ create: { width: 120, height: 80, channels: 3, background: '#654321' } }).png().toFile(driftPath);
      await expect(renderTrustedGeneratedCompositionProxyV1({
        ...fixture.input,
        materializedInputs: { assetPaths: { 'dev02-wide': driftPath }, fontPaths: {} },
      }, { workspaceRoot: path.join(scratch, 'hash-drift'), proofFrames: [0] }))
        .rejects.toThrow('asset hash drift');
    } finally {
      await fs.rm(scratch, { recursive: true, force: true });
    }
  }, 180_000);

  it('accepts only an exact, silent, BT.709 H.264 media observation', () => {
    const expected = { width: 1080, height: 1920, frameRate: { numerator: '30', denominator: '1' }, durationInFrames: 180 };
    const observation = {
      formatName: 'MP4', mimeType: 'video/mp4; codecs="avc1.640028"', trackCount: 1, videoTrackCount: 1, audioTrackCount: 0,
      codec: 'avc', internalCodecId: 'avc1', decoderCodec: 'avc1.640028', codedWidth: 1080, codedHeight: 1920, rotation: 0,
      timeResolution: 90_000, firstTimestamp: 0, duration: 6, packetCount: 180, scannedPacketCount: 180,
      uniquePacketTimestampCount: 180, averagePacketRate: 30, constantFrameDurationTicks: 3_000,
      color: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false }, highDynamicRange: false, alpha: false,
      avcColor: { primaries: 1, transfer: 1, matrix: 1, fullRange: false },
      chromaFormatIdc: 1, bitDepthLumaMinus8: 0, bitDepthChromaMinus8: 0,
    };
    expect(parseGeneratedCompositionPlayableProxyObservationV1(observation, expected)).toMatchObject({ codec: 'H264', audio: 'ABSENT', frameRate: { numerator: '30', denominator: '1' } });
    expect(() => parseGeneratedCompositionPlayableProxyObservationV1({ ...observation, trackCount: 2, audioTrackCount: 1 }, expected)).toThrow(/exactly one video stream/);
    expect(() => parseGeneratedCompositionPlayableProxyObservationV1({ ...observation, averagePacketRate: 24 }, expected)).toThrow(/frame-rate drift/);
    expect(() => parseGeneratedCompositionPlayableProxyObservationV1({ ...observation, chromaFormatIdc: 2 }, expected)).toThrow(/pixel-format drift/);
    expect(() => parseGeneratedCompositionPlayableProxyObservationV1({ ...observation, color: { ...observation.color, primaries: 'smpte432' } }, expected)).toThrow(/color contract drift/);
    expect(() => parseGeneratedCompositionPlayableProxyObservationV1({ ...observation, avcColor: { ...observation.avcColor, primaries: null } }, expected)).toThrow(/color contract drift/);
  });

  it('reads explicit BT.709 limited-range VUI from AVC configuration bytes', () => {
    const untagged = Uint8Array.from([1,100,0,40,255,225,0,30,103,100,0,40,172,217,64,68,3,199,151,192,90,129,1,1,82,128,0,0,3,0,128,0,0,30,7,140,24,203,1,0,6,104,235,224,140,178,44]);
    const normalized = Uint8Array.from([1,100,0,40,255,225,0,30,103,100,0,40,172,217,64,68,3,199,151,192,90,128,128,128,210,128,0,0,3,0,128,0,0,30,7,140,24,203,1,0,6,104,235,224,140,178,44]);
    expect(parseGeneratedCompositionAvcMetadataV1(untagged)).toMatchObject({
      chromaFormatIdc: 1, bitDepthLumaMinus8: 0, bitDepthChromaMinus8: 0,
      colourPrimaries: 2, transferCharacteristics: 2, matrixCoefficients: 2,
    });
    expect(parseGeneratedCompositionAvcMetadataV1(normalized)).toEqual({
      chromaFormatIdc: 1, bitDepthLumaMinus8: 0, bitDepthChromaMinus8: 0, videoFullRangeFlag: false,
      colourPrimaries: 1, transferCharacteristics: 1, matrixCoefficients: 1,
    });
  });
});

async function materializedFixture(scratch: string) {
  const wideBytes = Buffer.from('trusted-fixture-wide-video');
  const closeBytes = Buffer.from('trusted-fixture-close-video');
  const fontBytes = Buffer.from('trusted-fixture-font');
  const wideHash = hashBytes(wideBytes); const closeHash = hashBytes(closeBytes); const fontHash = hashBytes(fontBytes);
  const widePath = path.join(scratch, 'wide.mp4'); const closePath = path.join(scratch, 'close.mp4'); const fontPath = path.join(scratch, 'font.ttf');
  await Promise.all([fs.writeFile(widePath, wideBytes), fs.writeFile(closePath, closeBytes), fs.writeFile(fontPath, fontBytes)]);
  const evidencePack = structuredClone(DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1) as any;
  for (const fact of evidencePack.facts) {
    if (fact.assetId === 'dev02-wide') fact.assetVersion = `sha256:${wideHash}`;
    if (fact.assetId === 'dev02-close') fact.assetVersion = `sha256:${closeHash}`;
  }
  const supplementalFacts = structuredClone(DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1) as any[];
  const fontFact = supplementalFacts.find((fact) => fact.kind === 'FONT_IDENTITY');
  fontFact.fileSha256 = fontHash; fontFact.fontAssetVersion = `sha256:${fontHash}`;
  const program = structuredClone(DEV02_GENERATED_COMPOSITION_PROGRAM_V1);
  program.projectBinding.evidencePackHash = hashCanonicalJsonV1(evidencePack);
  program.sourceSlots[0].assetVersion = `sha256:${wideHash}`;
  program.sourceSlots[1].assetVersion = `sha256:${closeHash}`;
  program.fontSlots[0].fileSha256 = fontHash;
  program.fontSlots[0].fontAssetVersion = `sha256:${fontHash}`;
  return {
    input: {
      program,
      sourceBundle: DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
      evidencePack,
      referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
      supplementalFacts,
      expectedProgramHash: hashCanonicalJsonV1(program),
      expectedSourceBundleHash: program.sourceBundleHash,
      materializedInputs: { assetPaths: { 'dev02-wide': widePath, 'dev02-close': closePath }, fontPaths: { 'font-noto-sans-v27-regular': fontPath } },
    },
  };
}

async function materializedStillFixture(scratch: string) {
  const stillPath = path.join(scratch, 'still.png');
  await sharp({ create: { width: 120, height: 80, channels: 3, background: '#123456' } }).png().toFile(stillPath);
  const stillHash = hashBytes(await fs.readFile(stillPath));
  const evidencePack = structuredClone(DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1) as any;
  const identity = evidencePack.facts.find((fact: any) => fact.assetId === 'dev02-wide');
  Object.assign(identity, { assetVersion: `sha256:${stillHash}`, mediaKind: 'STILL_IMAGE', extent: { start: '0', endExclusive: '1' } });
  const sourceWindows = evidencePack.facts.find((fact: any) => fact.kind === 'ALLOWED_SOURCE_WINDOWS');
  sourceWindows.windows.find((window: any) => window.assetId === 'dev02-wide').ranges = [{ start: '0', endExclusive: '1' }];
  const canvas = evidencePack.facts.find((fact: any) => fact.kind === 'CANVAS');
  Object.assign(canvas, { width: '120', height: '80' });
  const source = `import React from 'react';
import { AssetSlot, CompositionStage, Panel } from '@editron/generated-composition-api/v1';
export const GeneratedComposition = () => (
  <CompositionStage background="#000000" gutter={0}>
    <Panel layerId="panel-still" bounds={{ left: 0, top: 0, width: 1, height: 1 }} translateY={0}>
      <AssetSlot slotId="source-wide" sourceFrame={0} crop="centre" />
    </Panel>
  </CompositionStage>
);`;
  const sourceBundle = structuredClone(DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1) as any;
  sourceBundle.files = [{ path: 'GeneratedComposition.tsx', source, sha256: sha256TextV1(source) }];
  const program = structuredClone(DEV02_GENERATED_COMPOSITION_PROGRAM_V1) as any;
  Object.assign(program.canvas, { width: 120, height: 80 });
  program.sourceSlots = [{ ...program.sourceSlots[0], assetVersion: `sha256:${stillHash}`, sourceRange: { start: '0', endExclusive: '1' } }];
  program.fontSlots = []; program.textSlots = []; program.exposedParameters = [];
  program.declaredLayers = [{ layerId: 'panel-still', kind: 'SOURCE_PANEL', sourceSlotId: 'source-wide', zIndex: 10 }];
  program.projectBinding.evidencePackHash = hashCanonicalJsonV1(evidencePack);
  program.sourceBundleHash = hashGeneratedCompositionSourceBundleV1(sourceBundle);
  return {
    stillPath,
    input: {
      program, sourceBundle, evidencePack,
      referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
      supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
      expectedProgramHash: hashCanonicalJsonV1(program),
      expectedSourceBundleHash: program.sourceBundleHash,
      materializedInputs: { assetPaths: { 'dev02-wide': stillPath }, fontPaths: {} },
    },
  };
}

function hashBytes(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
