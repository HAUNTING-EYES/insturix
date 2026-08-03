import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { COMP_NAME } from '../components/editron/editor/version-7.0.0/constants';
import type { Overlay } from '../components/editron/editor/version-7.0.0/types';
import { conditionAudio, inspectEncodedMusicAudio } from '../lib/pipeline/audio-conditioning';
import { buildLambdaRenderInputProps } from '../lib/editron/shared/render-request-payload';
import {
  BGM_RENDER_CANARY_DURATION_FRAMES,
  BGM_RENDER_CANARY_FPS,
  BGM_RENDER_CANARY_VERSION,
  buildBgmRenderCanaryOverlays,
  createSilentVoiceoverWav,
  createSyntheticMusicWav,
  validateBgmCanaryMeasurements,
} from './bgm-render-canary-core';
import { measurePcmFrameWindow, parsePcm16Wav } from './sfx-render-canary-core';

const COMPOSITOR_FALLBACKS = {
  '@remotion/compositor': false,
  '@remotion/compositor-darwin-arm64': false,
  '@remotion/compositor-darwin-x64': false,
  '@remotion/compositor-linux-x64': false,
  '@remotion/compositor-linux-arm64': false,
  '@remotion/compositor-win32-x64-msvc': false,
  '@remotion/compositor-windows-x64': false,
} as const;

export async function runBgmRenderCanary() {
  const generatedAt = new Date().toISOString();
  const outputDir = path.resolve(
    process.cwd(),
    '.calibration-temp',
    'bgm-render-canary',
    generatedAt.replace(/[:.]/g, '-'),
  );
  await mkdir(outputDir, { recursive: true });

  const sourceBuffer = createSyntheticMusicWav();
  const conditioning = await conditionAudio({
    role: 'music',
    buffer: sourceBuffer,
    targetFrames: BGM_RENDER_CANARY_DURATION_FRAMES,
    fps: BGM_RENDER_CANARY_FPS,
  });
  const inspection = await inspectEncodedMusicAudio(conditioning.buffer);
  assertConditioningEvidence(conditioning, inspection);

  const conditionedPath = path.join(outputDir, 'conditioned-bgm.flac');
  await writeFile(conditionedPath, conditioning.buffer);
  const overlays = buildBgmRenderCanaryOverlays(
    toDataUrl(conditioning.contentType, conditioning.buffer),
    toDataUrl('audio/wav', createSilentVoiceoverWav()),
  );
  const renderInput = buildLambdaRenderInputProps({
    overlays,
    durationInFrames: BGM_RENDER_CANARY_DURATION_FRAMES,
    fps: BGM_RENDER_CANARY_FPS,
    width: 320,
    height: 180,
    baseUrl: '',
    isRendering: true,
    renderMediaMode: 'audio-only',
  });
  const renderOverlays = renderInput.overlays as Overlay[];
  const audioRightsNotices = readAudioRightsNotices(renderInput);
  if (renderOverlays.filter(overlay => overlay.type === 'sound').length !== 2) {
    throw new Error('Production render assembler did not retain both licensed canary audio overlays');
  }
  if (audioRightsNotices.length > 0) {
    throw new Error(`Licensed canary audio unexpectedly produced ${audioRightsNotices.length} rights notices`);
  }

  const serveUrl = await bundle(
    path.resolve(
      process.cwd(),
      'components',
      'editron',
      'editor',
      'version-7.0.0',
      'remotion',
      'index.ts',
    ),
    undefined,
    {
      webpackOverride: config => ({
        ...config,
        resolve: {
          ...config.resolve,
          alias: { ...config.resolve?.alias, '@': path.resolve(process.cwd()) },
          fallback: { ...config.resolve?.fallback, ...COMPOSITOR_FALLBACKS },
        },
      }),
    },
  );
  const inputProps = { ...renderInput, overlays: renderOverlays };
  const composition = await selectComposition({ serveUrl, id: COMP_NAME, inputProps });
  const wavPath = path.join(outputDir, 'bgm-ducking.wav');
  const browserErrors: string[] = [];
  await renderMedia({
    composition,
    serveUrl,
    codec: 'wav',
    audioCodec: 'pcm-16',
    outputLocation: wavPath,
    inputProps,
    chromiumOptions: { headless: true },
    concurrency: 1,
    overwrite: true,
    onBrowserLog: entry => {
      if (entry.type === 'error') browserErrors.push(entry.text);
    },
  });
  if (browserErrors.length > 0) {
    throw new Error(`Production Remotion render emitted browser errors: ${browserErrors.join(' | ')}`);
  }

  const wavBuffer = await readFile(wavPath);
  const wav = parsePcm16Wav(wavBuffer);
  const windows = {
    soloBefore: measurePcmFrameWindow(wav, 30, 90, BGM_RENDER_CANARY_FPS),
    ducked: measurePcmFrameWindow(wav, 150, 210, BGM_RENDER_CANARY_FPS),
    soloAfter: measurePcmFrameWindow(wav, 270, 330, BGM_RENDER_CANARY_FPS),
    tail: measurePcmFrameWindow(wav, 345, 360, BGM_RENDER_CANARY_FPS),
  };
  const measurement = validateBgmCanaryMeasurements(wav, windows);
  const receipt = {
    version: BGM_RENDER_CANARY_VERSION,
    status: 'pass' as const,
    generatedAt,
    controlFlow: {
      conditioner: 'lib/pipeline/audio-conditioning.ts#conditionAudio',
      assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps',
      renderer: 'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx',
    },
    zeroCredit: { paidGenerationCalls: 0, providerApiCalls: 0, cloudRenderCalls: 0 },
    conditioning: {
      sourceHashSha256: sha256(sourceBuffer),
      conditionedPath,
      conditionedHashSha256: sha256(conditioning.buffer),
      ...conditioning,
      buffer: undefined,
      independentInspection: inspection,
    },
    rights: {
      inputLicensedOverlayCount: 2,
      assembledSoundOverlayCount: renderOverlays.filter(overlay => overlay.type === 'sound').length,
      notices: audioRightsNotices,
    },
    render: {
      wavPath,
      wavFileHashSha256: sha256(wavBuffer),
      pcmHashSha256: wav.pcmHashSha256,
      sampleRateHz: wav.sampleRateHz,
      channelCount: wav.channelCount,
      sampleFrameCount: wav.sampleFrameCount,
      expectedSampleFrameCount: measurement.expectedSampleFrameCount,
      peakSample: wav.peakSample,
      browserErrors,
    },
    ducking: {
      measuredReductionDb: measurement.duckReductionDb,
      windows,
    },
  };
  const receiptPath = path.join(outputDir, 'receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { receiptPath, wavPath, receipt };
}

function assertConditioningEvidence(
  conditioning: Awaited<ReturnType<typeof conditionAudio>>,
  inspection: Awaited<ReturnType<typeof inspectEncodedMusicAudio>>,
): void {
  const expectedDurationMs = BGM_RENDER_CANARY_DURATION_FRAMES / BGM_RENDER_CANARY_FPS * 1000;
  if (!conditioning.wasLooped || conditioning.loopsAdded < 1 || conditioning.crossfadeMs <= 0) {
    throw new Error('BGM canary source was not looped with a crossfade');
  }
  if (Math.abs(conditioning.durationMs - expectedDurationMs) > 0.5) {
    throw new Error(`Conditioned BGM duration drifted to ${conditioning.durationMs}ms`);
  }
  if (Math.abs(inspection.durationMs - expectedDurationMs) > 1) {
    throw new Error(`Independent BGM inspection measured ${inspection.durationMs}ms`);
  }
  if (Math.abs(inspection.measuredLufs - conditioning.targetLufs) > 1) {
    throw new Error(`Conditioned BGM measured ${inspection.measuredLufs} LUFS, target ${conditioning.targetLufs}`);
  }
  if (inspection.clippingRisk || inspection.truePeakDbtp > conditioning.targetTruePeakDbtp + 0.1) {
    throw new Error(`Conditioned BGM true peak is unsafe at ${inspection.truePeakDbtp} dBTP`);
  }
}

function toDataUrl(contentType: string, buffer: Buffer): string {
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function readAudioRightsNotices(value: object): unknown[] {
  if (!('audioRightsNotices' in value)) return [];
  if (!Array.isArray(value.audioRightsNotices)) {
    throw new Error('Production render assembler returned malformed audio rights notices');
  }
  return value.audioRightsNotices;
}

async function main(): Promise<void> {
  const result = await runBgmRenderCanary();
  console.log(JSON.stringify({
    status: result.receipt.status,
    receiptPath: result.receiptPath,
    wavPath: result.wavPath,
    zeroCredit: result.receipt.zeroCredit,
    conditioning: {
      measuredOutputLufs: result.receipt.conditioning.measuredOutputLufs,
      truePeakDbtp: result.receipt.conditioning.truePeakDbtp,
      durationMs: result.receipt.conditioning.durationMs,
      wasLooped: result.receipt.conditioning.wasLooped,
      loopsAdded: result.receipt.conditioning.loopsAdded,
      crossfadeMs: result.receipt.conditioning.crossfadeMs,
    },
    render: result.receipt.render,
    ducking: result.receipt.ducking,
  }, null, 2));
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
