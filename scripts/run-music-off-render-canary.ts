import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { COMP_NAME } from '../components/editron/editor/version-7.0.0/constants';
import type { Overlay } from '../components/editron/editor/version-7.0.0/types';
import { buildLambdaRenderInputProps } from '../lib/editron/shared/render-request-payload';
import {
  MUSIC_OFF_CANARY_DURATION_FRAMES,
  MUSIC_OFF_CANARY_FPS,
  MUSIC_OFF_CANARY_VERSION,
  buildMusicOffRenderOverlays,
  createSilentVoiceoverWav,
  resolveMusicOffPolicyEvidence,
  validateMusicOffRender,
} from './music-off-render-canary-core';
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

export async function runMusicOffRenderCanary() {
  const generatedAt = new Date().toISOString();
  const outputDir = path.resolve(
    process.cwd(),
    '.calibration-temp',
    'music-off-render-canary',
    generatedAt.replace(/[:.]/g, '-'),
  );
  await mkdir(outputDir, { recursive: true });

  // 1. Music:off policy: the real production owner must refuse music.
  const policy = resolveMusicOffPolicyEvidence();
  if (policy.allowed || policy.reason !== 'music-preference-none') {
    throw new Error(
      `music:off policy did NOT refuse music: allowed=${policy.allowed}, reason=${policy.reason}`,
    );
  }

  // 2. Assemble a project with zero music overlays through the production assembler.
  const overlays = buildMusicOffRenderOverlays(
    toDataUrl('audio/wav', createSilentVoiceoverWav()),
  );
  const renderInput = buildLambdaRenderInputProps({
    overlays,
    durationInFrames: MUSIC_OFF_CANARY_DURATION_FRAMES,
    fps: MUSIC_OFF_CANARY_FPS,
    width: 320,
    height: 180,
    baseUrl: '',
    isRendering: true,
    renderMediaMode: 'audio-only',
  });
  const renderOverlays = renderInput.overlays as Overlay[];
  const audioRightsNotices = readAudioRightsNotices(renderInput);
  const musicOverlays = renderOverlays.filter(
    overlay => overlay.type === 'sound' && overlay.row === 1,
  );
  if (musicOverlays.length !== 0) {
    throw new Error('music:off assembled input unexpectedly contains music overlays');
  }
  if (renderOverlays.filter(overlay => overlay.type === 'sound').length !== 1) {
    throw new Error('music:off assembler did not retain the voiceover marker');
  }
  if (audioRightsNotices.length > 0) {
    throw new Error(`music:off render produced ${audioRightsNotices.length} unexpected rights notices`);
  }

  // 3. Render the assembled project to audio-only WAV through real Remotion.
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
  const wavPath = path.join(outputDir, 'music-off.wav');
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

  // 4. Prove the delivered audio contains ZERO non-silent samples.
  const wavBuffer = await readFile(wavPath);
  const wav = parsePcm16Wav(wavBuffer);
  const windows = {
    firstThird: measurePcmFrameWindow(wav, 0, 60, MUSIC_OFF_CANARY_FPS),
    secondThird: measurePcmFrameWindow(wav, 60, 120, MUSIC_OFF_CANARY_FPS),
    finalThird: measurePcmFrameWindow(wav, 120, 180, MUSIC_OFF_CANARY_FPS),
    full: measurePcmFrameWindow(wav, 0, 180, MUSIC_OFF_CANARY_FPS),
  };
  const measurement = validateMusicOffRender(wav, windows);

  const receipt = {
    version: MUSIC_OFF_CANARY_VERSION,
    status: 'pass' as const,
    generatedAt,
    controlFlow: {
      policy: 'lib/pipeline/bgm-conditioning-contract.ts#resolveMusicGenerationPolicy',
      assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps',
      renderer: 'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx',
    },
    zeroCredit: { paidGenerationCalls: 0, providerApiCalls: 0, cloudRenderCalls: 0 },
    policy,
    musicOverlays: {
      inputCount: 0,
      assembledCount: musicOverlays.length,
      voiceoverMarkerCount: renderOverlays.filter(overlay => overlay.type === 'sound').length,
    },
    rights: { notices: audioRightsNotices },
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
    silence: {
      nonSilentSamples: windows.full.nonZeroSamples,
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

async function main(): Promise<void> {
  const result = await runMusicOffRenderCanary();
  console.log(JSON.stringify({
    status: result.receipt.status,
    receiptPath: result.receiptPath,
    wavPath: result.wavPath,
    zeroCredit: result.receipt.zeroCredit,
    policy: result.receipt.policy,
    musicOverlays: result.receipt.musicOverlays,
    render: result.receipt.render,
    silence: result.receipt.silence,
  }, null, 2));
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
