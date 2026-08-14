import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import sharp, { type OverlayOptions } from 'sharp';
import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { evaluateDev02GeneratedCompositionRenderedProofV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-dev02-rendered-proof-v1';
import type { GeneratedCompositionProxyReceiptV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-proxy-renderer-v1';
import { DEV02_GENERATED_COMPOSITION_PROGRAM_V1 } from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

describe('open-ended planner V2 DEV-02 rendered proof policy', () => {
  it('passes objective filmstrip gates while keeping flash safety and creative taste unverifiable', async () => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-dev02-proof-'));
    try {
      const fixture = await proofFixture(scratch);
      const proof = await evaluateDev02GeneratedCompositionRenderedProofV1(fixture);
      expect(Object.fromEntries(proof.checks.map(({ checkId, status }) => [checkId, status])), JSON.stringify(proof.checks, null, 2)).toMatchObject({
        FRAME_INTEGRITY: 'PASS', SETTLED_PANEL_GEOMETRY: 'PASS', TITLE_FORM: 'PASS', OPPOSED_PANEL_MOTION: 'PASS',
        PHASE_STRUCTURE: 'PASS', FULL_CANVAS_RELEASE: 'PASS', BOUNDARY_CONTINUITY: 'PASS', FLASH_SAFETY: 'UNVERIFIABLE',
      });
      expect(proof).toMatchObject({ hardGateDisposition: 'PASS', technicalDisposition: 'UNVERIFIABLE', creativeDisposition: 'UNVERIFIABLE', stateEffects: [] });
    } finally { await fs.rm(scratch, { recursive: true, force: true }); }
  });

  it('fails a same-direction build, missing gutter, and broken boundary instead of accepting a plausible contact sheet', async () => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-dev02-proof-fail-'));
    try {
      const fixture = await proofFixture(scratch, true);
      const proof = await evaluateDev02GeneratedCompositionRenderedProofV1(fixture);
      expect(proof.hardGateDisposition).toBe('FAIL');
      expect(proof.technicalDisposition).toBe('FAIL');
      expect(proof.checks.filter(({ status }) => status === 'FAIL').map(({ checkId }) => checkId)).toEqual(expect.arrayContaining(['SETTLED_PANEL_GEOMETRY', 'OPPOSED_PANEL_MOTION', 'BOUNDARY_CONTINUITY']));
    } finally { await fs.rm(scratch, { recursive: true, force: true }); }
  });
});

async function proofFixture(root: string, adversarial = false) {
  const canvas = { width: 1080, height: 1920 };
  const framePaths = new Map<number, string>();
  const early = await renderPanels(path.join(root, 'frame-0000.png'), canvas, { centreY: 1740, sidesY: -600, settled: false });
  const frame24 = await renderPanels(path.join(root, 'frame-0024.png'), canvas, { centreY: adversarial ? 850 : 1450, sidesY: adversarial ? 0 : -400, settled: false });
  const settled = await renderPanels(path.join(root, 'frame-0108.png'), canvas, { centreY: 640, sidesY: adversarial ? -200 : 0, settled: true, eraseGutter: adversarial });
  const hold = path.join(root, 'frame-0144.png'); const releaseStart = path.join(root, 'frame-0145.png'); const final = path.join(root, 'frame-0179.png');
  await fs.copyFile(settled, hold);
  await sharp(settled).composite([{ input: await solid(40, 40, '#FFFFFF'), left: 500, top: 500 }]).png().toFile(releaseStart);
  await renderFinalFrame(final, canvas, adversarial ? '#205080' : '#553366');
  const paths = [early, frame24, settled, hold, releaseStart, final];
  [0, 24, 108, 144, 145, 179].forEach((frame, index) => framePaths.set(frame, paths[index]));
  const boundaryReferencePath = path.join(root, 'boundary.png');
  await renderFinalFrame(boundaryReferencePath, canvas, '#553366');
  const program = structuredClone(DEV02_GENERATED_COMPOSITION_PROGRAM_V1);
  const stills = await Promise.all([...framePaths].map(async ([frame, filePath]) => ({ frame, path: filePath, sha256: sha(await fs.readFile(filePath)), width: canvas.width, height: canvas.height })));
  const unsignedReceipt = {
    artifactType: 'GeneratedCompositionProxyReceiptV1' as const,
    executionClass: 'VERIFIED_PROGRAM_DENY_ALL_SANDBOX_PROCESS' as const,
    securityDisposition: 'HOST_ATTESTATION_REQUIRED' as const,
    programHash: hashCanonicalJsonV1(program), sourceBundleHash: program.sourceBundleHash, apiImplementationHash: '1'.repeat(64),
    composition: { ...canvas, fps: 30, durationInFrames: 180 }, stills,
    contactSheet: { path: path.join(root, 'sheet.png'), sha256: '2'.repeat(64), width: 810, height: 960 },
    proof: { contract: 'PASS' as const, materializedInputs: 'PASS' as const, compile: 'PASS' as const, renderedEvidence: 'CAPTURED_UNJUDGED' as const, productionSandbox: 'HOST_ATTESTATION_REQUIRED' as const },
    stateEffects: [] as const, workspaceDir: root,
  };
  const proxyReceipt = { ...unsignedReceipt, receiptHash: hashCanonicalJsonV1(unsignedReceipt) } satisfies GeneratedCompositionProxyReceiptV1;
  return { program, proxyReceipt, boundaryReferencePath };
}

async function renderPanels(output: string, canvas: { width: number; height: number }, input: { centreY: number; sidesY: number; settled: boolean; eraseGutter?: boolean }): Promise<string> {
  const gutter = input.eraseGutter ? 0 : 10; const halfGutter = gutter / 2; const column = canvas.width / 3;
  const composites: OverlayOptions[] = [];
  const panel = async (left: number, top: number, width: number, height: number, color: string) => composites.push({ input: await solid(width - gutter, height - gutter, color), left: Math.round(left + halfGutter), top: Math.round(top + halfGutter) });
  await panel(0, input.sidesY, column, canvas.height / 2, '#304060');
  await panel(0, input.sidesY + canvas.height / 2, column, canvas.height / 2, '#704060');
  await panel(column, input.centreY, column, canvas.height / 3, '#503060');
  await panel(column * 2, input.sidesY, column, canvas.height / 2, '#304060');
  await panel(column * 2, input.sidesY + canvas.height / 2, column, canvas.height / 2, '#704060');
  if (input.settled) {
    composites.push({ input: await solid(650, 70, '#F7E300'), left: 215, top: 875 });
    composites.push({ input: await solid(360, 70, '#F7E300'), left: 360, top: 975 });
  }
  await sharp({ create: { ...canvas, channels: 3, background: '#000000' } }).composite(composites).png().toFile(output);
  return output;
}

async function solid(width: number, height: number, background: string): Promise<Buffer> {
  return sharp({ create: { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)), channels: 3, background } }).png().toBuffer();
}

async function renderFinalFrame(output: string, canvas: { width: number; height: number }, centreColor: string): Promise<void> {
  await sharp({ create: { ...canvas, channels: 3, background: '#203040' } }).composite([
    { input: await solid(900, 1_600, centreColor), left: 90, top: 160 },
    { input: await solid(180, 180, '#F7E300'), left: 450, top: 870 },
  ]).png().toFile(output);
}

function sha(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
