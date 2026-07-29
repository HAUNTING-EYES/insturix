import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { COMP_NAME } from '../components/editron/editor/version-7.0.0/constants';
import type { Overlay } from '../components/editron/editor/version-7.0.0/types';
import { placeTransitionSFX } from '../lib/editron/services/transition-sfx-placer';
import { buildLambdaRenderInputProps } from '../lib/editron/shared/render-request-payload';
import {
  buildSfxRenderCanaryOverlays,
  measurePcmFrameWindow,
  parsePcm16Wav,
  SFX_RENDER_CANARY_DURATION_FRAMES,
  SFX_RENDER_CANARY_FPS,
  SFX_RENDER_CANARY_SILENCE_FRAME,
  SFX_RENDER_CANARY_VERSION,
  validateSfxRenderCanaryPlacements,
} from './sfx-render-canary-core';

const COMPOSITOR_FALLBACKS = {
  '@remotion/compositor': false,
  '@remotion/compositor-darwin-arm64': false,
  '@remotion/compositor-darwin-x64': false,
  '@remotion/compositor-linux-x64': false,
  '@remotion/compositor-linux-arm64': false,
  '@remotion/compositor-win32-x64-msvc': false,
  '@remotion/compositor-windows-x64': false,
} as const;

const PROVIDER_HOSTS = ['freesound.org', 'pixabay.com'];

interface SfxRenderCanaryReceipt {
  version: typeof SFX_RENDER_CANARY_VERSION;
  status: 'pass';
  generatedAt: string;
  controlFlow: {
    producers: string[];
    assembler: string;
    renderer: string;
  };
  zeroCredit: {
    paidGenerationCalls: 0;
    providerApiCalls: 0;
    trappedProviderUrls: string[];
    catalogOnly: true;
  };
  catalog: {
    manifestPath: string;
    manifestHashSha256: string;
  };
  placements: ReturnType<typeof validateSfxRenderCanaryPlacements>;
  render: {
    wavPath: string;
    wavFileHashSha256: string;
    pcmHashSha256: string;
    sampleRateHz: number;
    channelCount: number;
    sampleFrameCount: number;
    peakSample: number;
    nonZeroSamples: number;
    browserErrors: string[];
  };
  windows: {
    transition: ReturnType<typeof measurePcmFrameWindow>;
    motionGraphic: ReturnType<typeof measurePcmFrameWindow>;
    intentionalSilence: ReturnType<typeof measurePcmFrameWindow>;
  };
}

export async function runSfxRenderCanary(): Promise<{
  receiptPath: string;
  wavPath: string;
  receipt: SfxRenderCanaryReceipt;
}> {
  const generatedAt = new Date().toISOString();
  const outputDir = path.resolve(
    process.cwd(),
    '.calibration-temp',
    'sfx-render-canary',
    generatedAt.replace(/[:.]/g, '-'),
  );
  await mkdir(outputDir, { recursive: true });

  const overlays = buildSfxRenderCanaryOverlays();
  const providerUrls: string[] = [];
  const placementResult = await withProviderApisTrapped(providerUrls, () =>
    placeTransitionSFX(overlays, 'zero-credit-sfx-render-canary', null),
  );
  if (providerUrls.length > 0) {
    throw new Error(`Canary attempted ${providerUrls.length} provider API call(s)`);
  }
  const placements = validateSfxRenderCanaryPlacements(overlays, placementResult, {
    requireSemanticRetrieval:
      process.env.SFX_RENDER_CANARY_REQUIRE_SEMANTIC === '1',
  });

  const renderInput = buildLambdaRenderInputProps({
    overlays,
    durationInFrames: SFX_RENDER_CANARY_DURATION_FRAMES,
    fps: SFX_RENDER_CANARY_FPS,
    width: 320,
    height: 180,
    baseUrl: '',
    isRendering: true,
    renderMediaMode: 'audio-only',
  });
  const renderOverlays = renderInput.overlays as Overlay[];
  if (renderOverlays.filter((overlay) => overlay.type === 'sound').length !== 2) {
    throw new Error('Production render assembler did not retain exactly two licensed SFX overlays');
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
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...config.resolve,
          alias: { ...config.resolve?.alias, '@': path.resolve(process.cwd()) },
          fallback: { ...config.resolve?.fallback, ...COMPOSITOR_FALLBACKS },
        },
      }),
    },
  );

  const inputProps = {
    ...renderInput,
    overlays: renderOverlays,
  };
  const composition = await selectComposition({
    serveUrl,
    id: COMP_NAME,
    inputProps,
  });
  const wavPath = path.join(outputDir, 'transition-mg-silence.wav');
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
    onBrowserLog: (entry) => {
      if (entry.type === 'error') browserErrors.push(entry.text);
    },
  });
  if (browserErrors.length > 0) {
    throw new Error(`Production Remotion render emitted browser errors: ${browserErrors.join(' | ')}`);
  }

  const wavBuffer = await readFile(wavPath);
  const wav = parsePcm16Wav(wavBuffer);
  const transitionPlacement = placements.find((item) => item.surface === 'transition');
  const mgPlacement = placements.find((item) => item.surface === 'motion-graphic');
  if (!transitionPlacement || !mgPlacement) {
    throw new Error('Canary placement evidence is incomplete');
  }

  const transitionWindow = measurePcmFrameWindow(
    wav,
    transitionPlacement.from,
    transitionPlacement.from + transitionPlacement.durationInFrames,
    SFX_RENDER_CANARY_FPS,
  );
  const motionGraphicWindow = measurePcmFrameWindow(
    wav,
    mgPlacement.from,
    mgPlacement.from + mgPlacement.durationInFrames,
    SFX_RENDER_CANARY_FPS,
  );
  const intentionalSilenceWindow = measurePcmFrameWindow(
    wav,
    SFX_RENDER_CANARY_SILENCE_FRAME,
    SFX_RENDER_CANARY_SILENCE_FRAME + 18,
    SFX_RENDER_CANARY_FPS,
  );

  requireAudibleWindow(transitionWindow, 'transition');
  requireAudibleWindow(motionGraphicWindow, 'motion graphic');
  if (intentionalSilenceWindow.nonZeroSamples !== 0) {
    throw new Error(
      `Intentional silence window contains ${intentionalSilenceWindow.nonZeroSamples} nonzero PCM samples`,
    );
  }

  const manifestPath = path.resolve(process.cwd(), 'public', 'sfx', 'manifest.json');
  const manifestBuffer = await readFile(manifestPath);
  const receipt: SfxRenderCanaryReceipt = {
    version: SFX_RENDER_CANARY_VERSION,
    status: 'pass',
    generatedAt,
    controlFlow: {
      producers: [
        'lib/editron/services/transition-sfx-placer.ts',
        'lib/editron/services/kinetic-sfx-service.ts',
      ],
      assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps',
      renderer:
        'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx',
    },
    zeroCredit: {
      paidGenerationCalls: 0,
      providerApiCalls: 0,
      trappedProviderUrls: providerUrls,
      catalogOnly: true,
    },
    catalog: {
      manifestPath,
      manifestHashSha256: createHash('sha256').update(manifestBuffer).digest('hex'),
    },
    placements,
    render: {
      wavPath,
      wavFileHashSha256: createHash('sha256').update(wavBuffer).digest('hex'),
      pcmHashSha256: wav.pcmHashSha256,
      sampleRateHz: wav.sampleRateHz,
      channelCount: wav.channelCount,
      sampleFrameCount: wav.sampleFrameCount,
      peakSample: wav.peakSample,
      nonZeroSamples: wav.nonZeroSamples,
      browserErrors,
    },
    windows: {
      transition: transitionWindow,
      motionGraphic: motionGraphicWindow,
      intentionalSilence: intentionalSilenceWindow,
    },
  };
  const receiptPath = path.join(outputDir, 'receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  return { receiptPath, wavPath, receipt };
}

async function withProviderApisTrapped<T>(
  providerUrls: string[],
  action: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalFreesoundKey = process.env.FREESOUND_API_KEY;
  delete process.env.FREESOUND_API_KEY;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = requestUrl(input);
    if (PROVIDER_HOSTS.some((host) => new URL(url).hostname.endsWith(host))) {
      providerUrls.push(url);
      throw new Error(`Zero-credit canary blocked provider API call: ${url}`);
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    return await action();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalFreesoundKey === undefined) {
      delete process.env.FREESOUND_API_KEY;
    } else {
      process.env.FREESOUND_API_KEY = originalFreesoundKey;
    }
  }
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requireAudibleWindow(
  window: ReturnType<typeof measurePcmFrameWindow>,
  label: string,
): void {
  if (window.nonZeroSamples === 0 || window.peakSample === 0 || window.rms === 0) {
    throw new Error(`Rendered ${label} SFX window is digitally silent`);
  }
}

async function main(): Promise<void> {
  const result = await runSfxRenderCanary();
  console.log(JSON.stringify({
    status: result.receipt.status,
    receiptPath: result.receiptPath,
    wavPath: result.wavPath,
    providerApiCalls: result.receipt.zeroCredit.providerApiCalls,
    placements: result.receipt.placements.map((item) => ({
      surface: item.surface,
      assetId: item.assetId,
      licenseId: item.rights.licenseId,
      selectionLane: item.selectionLane,
    })),
    windows: result.receipt.windows,
    pcmHashSha256: result.receipt.render.pcmHashSha256,
  }, null, 2));
}

const invokedUrl = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
