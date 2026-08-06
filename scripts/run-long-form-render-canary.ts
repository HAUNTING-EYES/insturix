import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { COMP_NAME } from '../components/editron/editor/version-7.0.0/constants';
import type { Overlay } from '../components/editron/editor/version-7.0.0/types';
import { conditionAudio } from '../lib/pipeline/audio-conditioning';
import { buildLambdaRenderInputProps } from '../lib/editron/shared/render-request-payload';
import { createSyntheticMusicWav } from './bgm-render-canary-core';
import {
  LONG_FORM_RENDER_CANARY_DURATION_FRAMES,
  LONG_FORM_RENDER_CANARY_FPS,
  LONG_FORM_RENDER_CANARY_VERSION,
  buildLongFormRenderOverlays,
  createLongFormDuckMarkerWav,
  validateLongFormRender,
} from './long-form-render-canary-core';
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

export async function runLongFormRenderCanary() {
  const generatedAt = new Date().toISOString();
  const outputDir = path.resolve(
    process.cwd(),
    '.calibration-temp',
    'long-form-render-canary',
    generatedAt.replace(/[:.]/g, '-'),
  );
  await mkdir(outputDir, { recursive: true });

  // Condition a short source to the full 300s timeline.
  const sourceBuffer = createSyntheticMusicWav();
  const conditioning = await conditionAudio({
    role: 'music',
    buffer: sourceBuffer,
    targetFrames: LONG_FORM_RENDER_CANARY_DURATION_FRAMES,
    fps: LONG_FORM_RENDER_CANARY_FPS,
  });
  if (conditioning.durationMs < 300_000) {
    throw new Error(`Long-form conditioning produced ${conditioning.durationMs}ms; expected 300s`);
  }
  const conditionedPath = path.join(outputDir, 'conditioned-300s.flac');
  await writeFile(conditionedPath, conditioning.buffer);

  // Build the 9000-frame overlays (music full span + mid duck marker).
  const overlays = buildLongFormRenderOverlays(
    toDataUrl(conditioning.contentType, conditioning.buffer),
    toDataUrl('audio/wav', createLongFormDuckMarkerWav()),
  );
  const renderInput = buildLambdaRenderInputProps({
    overlays,
    durationInFrames: LONG_FORM_RENDER_CANARY_DURATION_FRAMES,
    fps: LONG_FORM_RENDER_CANARY_FPS,
    width: 320,
    height: 180,
    baseUrl: '',
    isRendering: true,
    renderMediaMode: 'audio-only',
  });
  const renderOverlays = renderInput.overlays as Overlay[];
  const audioRightsNotices = readAudioRightsNotices(renderInput);
  if (renderOverlays.filter(overlay => overlay.type === 'sound').length !== 2) {
    throw new Error('Production render assembler did not retain both long-form canary audio overlays');
  }
  if (audioRightsNotices.length > 0) {
    throw new Error(`Long-form canary audio produced ${audioRightsNotices.length} rights notices`);
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
  const wavPath = path.join(outputDir, 'long-form.wav');
  const browserErrors: string[] = [];
  const memBefore = memoryReading();
  const renderStart = Date.now();
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
  const renderElapsedMs = Date.now() - renderStart;
  const memAfter = memoryReading();
  if (browserErrors.length > 0) {
    throw new Error(`Production Remotion render emitted browser errors: ${browserErrors.join(' | ')}`);
  }

  const wavBuffer = await readFile(wavPath);
  const wav = parsePcm16Wav(wavBuffer);
  const windows = {
    earlySolo: measurePcmFrameWindow(wav, 300, 900, LONG_FORM_RENDER_CANARY_FPS),
    ducked: measurePcmFrameWindow(wav, 4500, 4800, LONG_FORM_RENDER_CANARY_FPS),
    lateSolo: measurePcmFrameWindow(wav, 7800, 8400, LONG_FORM_RENDER_CANARY_FPS),
    tail: measurePcmFrameWindow(wav, 8820, 9000, LONG_FORM_RENDER_CANARY_FPS),
  };
  const measurement = validateLongFormRender(wav, windows);

  const receipt = {
    version: LONG_FORM_RENDER_CANARY_VERSION,
    status: 'pass' as const,
    generatedAt,
    controlFlow: {
      conditioner: 'lib/pipeline/audio-conditioning.ts#conditionAudio',
      assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps',
      renderer: 'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx',
    },
    zeroCredit: { paidGenerationCalls: 0, providerApiCalls: 0, cloudRenderCalls: 0 },
    conditioning: {
      conditionedPath,
      durationMs: conditioning.durationMs,
      measuredOutputLufs: conditioning.measuredOutputLufs,
      truePeakDbtp: conditioning.truePeakDbtp,
      loopsAdded: conditioning.loopsAdded,
      crossfadeMs: conditioning.crossfadeMs,
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
      renderElapsedMs,
      renderDurationSec: Math.round(renderElapsedMs / 100) / 10,
      browserErrors,
    },
    memory: {
      providerRssMb: memBefore.rssMb,
      afterRssMb: memAfter.rssMb,
      deltaRssMb: Math.round((memAfter.rssMb - memBefore.rssMb) * 10) / 10,
      providerHeapMb: memBefore.heapUsedMb,
      afterHeapMb: memAfter.heapUsedMb,
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

function memoryReading(): { rssMb: number; heapUsedMb: number } {
  const usage = process.memoryUsage();
  return {
    rssMb: Math.round((usage.rss / 1024 / 1024) * 10) / 10,
    heapUsedMb: Math.round((usage.heapUsed / 1024 / 1024) * 10) / 10,
  };
}

async function main(): Promise<void> {
  const result = await runLongFormRenderCanary();
  console.log(JSON.stringify({
    status: result.receipt.status,
    receiptPath: result.receiptPath,
    wavPath: result.wavPath,
    zeroCredit: result.receipt.zeroCredit,
    conditioning: result.receipt.conditioning,
    render: result.receipt.render,
    memory: result.receipt.memory,
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
