import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { resolveGeneratedPanelGeometryV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-api-v1';
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

function hashBytes(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
