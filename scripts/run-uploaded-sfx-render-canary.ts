import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { COMP_NAME } from '../components/editron/editor/version-7.0.0/constants';
import type { Overlay } from '../components/editron/editor/version-7.0.0/types';
import { ensureAtomicOverlayReceipt } from '../lib/editron/engine/overlay-atomic-receipts';
import { verifyRenderAudioRightsAuthority } from '../lib/editron/services/render-audio-rights-authority';
import {
  assignUploadedAudioToTimeline,
  type UploadedAudioTimelineAssignmentDependencies,
} from '../lib/editron/services/uploaded-audio-assignment';
import {
  AUDIO_RIGHTS_ATTESTATION_VERSION,
  buildLambdaRenderInputProps,
} from '../lib/editron/shared/render-request-payload';
import {
  UPLOADED_SFX_CANARY_DURATION_FRAMES,
  UPLOADED_SFX_CANARY_FPS,
  UPLOADED_SFX_CANARY_FROM,
  UPLOADED_SFX_CANARY_SOUND_FRAMES,
  UPLOADED_SFX_CANARY_VERSION,
  createUploadedSfxWav,
  validateUploadedSfxCanaryRender,
} from './uploaded-sfx-render-canary-core';
import { measurePcmFrameWindow, parsePcm16Wav } from './sfx-render-canary-core';

const USER_ID = 'uploaded_sfx_canary_user';
const PROJECT_ID = 'uploaded_sfx_canary_project';
const SOURCE_ASSET_ID = 'uploaded_sfx_canary_source';
const COMPOSITOR_FALLBACKS = {
  '@remotion/compositor': false,
  '@remotion/compositor-darwin-arm64': false,
  '@remotion/compositor-darwin-x64': false,
  '@remotion/compositor-linux-x64': false,
  '@remotion/compositor-linux-arm64': false,
  '@remotion/compositor-win32-x64-msvc': false,
  '@remotion/compositor-windows-x64': false,
} as const;

export async function runUploadedSfxRenderCanary() {
  const generatedAt = new Date().toISOString();
  const outputDir = path.resolve(
    process.cwd(),
    '.calibration-temp',
    'uploaded-sfx-render-canary',
    generatedAt.replace(/[:.]/g, '-'),
  );
  await mkdir(outputDir, { recursive: true });
  const sourceBuffer = createUploadedSfxWav();
  const mediaServer = await startMediaServer(sourceBuffer);

  try {
    const project: Record<string, unknown> = {
      projectId: PROJECT_ID,
      userId: USER_ID,
      overlays: [],
    };
    const sourceAsset = {
      assetId: SOURCE_ASSET_ID,
      userId: USER_ID,
      projectId: 'uploaded_sfx_source_library',
      type: 'audio',
      source: 'user-upload',
      filename: 'uploaded-impact.wav',
      contentType: 'audio/wav',
      r2Key: `users/${USER_ID}/${SOURCE_ASSET_ID}.wav`,
      size: sourceBuffer.length,
      duration: 1,
    };
    const documents = new Map<string, Record<string, unknown>>([
      [SOURCE_ASSET_ID, sourceAsset],
    ]);
    let appendCount = 0;
    const dependencies: UploadedAudioTimelineAssignmentDependencies = {
      loadProject: async () => project,
      findAsset: async assetId => documents.get(assetId) ?? null,
      insertDerivativeAsset: async document => {
        const assetId = String(document.assetId);
        if (documents.has(assetId)) return false;
        documents.set(assetId, { ...document });
        return true;
      },
      resolveReadUrl: async () => ({
        url: mediaServer.url,
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
      }),
      now: () => new Date('2026-08-03T00:00:00.000Z'),
      loadProjectForTimelineMutation: async () => ({
        project,
        revision: {
          schemaVersion: 1 as const,
          value: 7,
          compatibilityUpdatedAt: '2026-08-03T00:00:00.000Z',
        },
      }),
      commitTimelineOverlayThroughProjectService: async (
        _userId,
        _projectId,
        expectedRevision,
        overlay,
      ) => {
        const overlays = project.overlays as Array<Record<string, unknown>>;
        if (overlays.some(candidate => candidate.id === overlay.id)) {
          return {
            disposition: 'ALREADY_ATTACHED' as const,
            currentRevision: expectedRevision,
            mutationReceipt: null,
            timelineChangeReceipt: null,
          };
        }
        overlays.push(ensureAtomicOverlayReceipt(overlay as never, {
          source: 'uploaded-audio-assignment',
          intent: 'persist-uploaded-sfx',
          reason: 'uploaded audio was rights-attested and attached by the server',
        }) as unknown as Record<string, unknown>);
        appendCount++;
        return {
          disposition: 'APPLIED' as const,
          mutationReceipt: {
            schemaVersion: 1 as const,
            projectId: PROJECT_ID,
            revision: {
              schemaVersion: 1 as const,
              value: expectedRevision.value + 1,
              compatibilityUpdatedAt: '2026-08-03T00:00:00.000Z',
            },
            committedAt: '2026-08-03T00:00:00.000Z',
          },
          timelineChangeReceipt: {} as never,
        };
      },
    };
    const input = {
      userId: USER_ID,
      projectId: PROJECT_ID,
      sourceAssetId: SOURCE_ASSET_ID,
      displayName: 'Uploaded impact',
      mediaRole: 'sfx' as const,
      idempotencyKey: 'uploaded_sfx_canary_001',
      rightsAttestation: {
        accepted: true as const,
        version: AUDIO_RIGHTS_ATTESTATION_VERSION,
      },
      placement: {
        from: UPLOADED_SFX_CANARY_FROM,
        durationInFrames: UPLOADED_SFX_CANARY_SOUND_FRAMES,
        requestedRow: 12,
        startFromSound: 0,
      },
    };
    const assignment = await assignUploadedAudioToTimeline(input, dependencies);
    const replay = await assignUploadedAudioToTimeline(input, dependencies);
    if (assignment.replayed || !replay.replayed || appendCount !== 1) {
      throw new Error('Uploaded SFX assignment was not exactly-once and replayable');
    }
    const assignedOverlay = assignment.overlays.find(overlay => overlay.id === assignment.overlayId);
    if (!assignedOverlay || assignedOverlay.row !== 0 || assignedOverlay.assetId !== assignment.derivativeAssetId) {
      throw new Error('Uploaded SFX did not persist on the canonical SFX row with its derivative asset');
    }
    const assignedMetadata = assignedOverlay.metadata;
    if (
      !assignedMetadata
      || typeof assignedMetadata !== 'object'
      || Array.isArray(assignedMetadata)
      || !('atomicOverlayReceipt' in assignedMetadata)
    ) {
      throw new Error('Uploaded SFX persistence omitted the atomic overlay receipt');
    }

    await verifyRenderAudioRightsAuthority({
      userId: USER_ID,
      projectId: PROJECT_ID,
      overlays: assignment.overlays,
    }, {
      loadAssets: async assetIds => assetIds.flatMap(assetId => {
        const asset = documents.get(assetId);
        return asset ? [asset] : [];
      }),
    });
    const renderInput = buildLambdaRenderInputProps({
      overlays: assignment.overlays,
      durationInFrames: UPLOADED_SFX_CANARY_DURATION_FRAMES,
      fps: UPLOADED_SFX_CANARY_FPS,
      width: 320,
      height: 180,
      baseUrl: '',
      isRendering: true,
      renderMediaMode: 'audio-only',
    });
    const renderOverlays = renderInput.overlays as Overlay[];
    if (renderOverlays.filter(overlay => overlay.type === 'sound').length !== 1) {
      throw new Error('Production render assembler did not retain the uploaded SFX overlay');
    }

    const serveUrl = await bundle(
      path.resolve(process.cwd(), 'components', 'editron', 'editor', 'version-7.0.0', 'remotion', 'index.ts'),
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
    const wavPath = path.join(outputDir, 'uploaded-sfx.wav');
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
      before: measurePcmFrameWindow(wav, 0, 30, UPLOADED_SFX_CANARY_FPS),
      assigned: measurePcmFrameWindow(wav, 30, 60, UPLOADED_SFX_CANARY_FPS),
      after: measurePcmFrameWindow(wav, 60, 90, UPLOADED_SFX_CANARY_FPS),
    };
    const expectedSampleFrameCount = validateUploadedSfxCanaryRender(wav, windows);
    const derivative = documents.get(assignment.derivativeAssetId);
    const receipt = {
      version: UPLOADED_SFX_CANARY_VERSION,
      status: 'pass' as const,
      generatedAt,
      controlFlow: {
        producer: 'lib/editron/services/uploaded-audio-assignment.ts#assignUploadedAudioToTimeline',
        authority: 'lib/editron/services/render-audio-rights-authority.ts#verifyRenderAudioRightsAuthority',
        assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps',
        renderer: 'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx',
      },
      zeroCredit: { paidGenerationCalls: 0, providerApiCalls: 0, cloudRenderCalls: 0 },
      assignment: {
        sourceAssetId: assignment.sourceAssetId,
        derivativeAssetId: assignment.derivativeAssetId,
        overlayId: assignment.overlayId,
        mediaRole: assignment.mediaRole,
        row: assignedOverlay.row,
        appendCount,
        replayed: replay.replayed,
        audioRights: assignment.audioRights,
        derivativeReceipt: derivative?.audioAssignmentReceipt,
        atomicOverlayReceipt: assignedMetadata.atomicOverlayReceipt,
      },
      render: {
        wavPath,
        wavFileHashSha256: sha256(wavBuffer),
        pcmHashSha256: wav.pcmHashSha256,
        sampleRateHz: wav.sampleRateHz,
        channelCount: wav.channelCount,
        sampleFrameCount: wav.sampleFrameCount,
        expectedSampleFrameCount,
        peakSample: wav.peakSample,
        browserErrors,
        sourceRequestCount: mediaServer.requestCount(),
      },
      windows,
    };
    const receiptPath = path.join(outputDir, 'receipt.json');
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    return { receiptPath, wavPath, receipt };
  } finally {
    await mediaServer.close();
  }
}

async function startMediaServer(buffer: Buffer): Promise<{
  url: string;
  requestCount(): number;
  close(): Promise<void>;
}> {
  let requests = 0;
  const server = createServer((request, response) => {
    if (request.url !== '/uploaded-sfx.wav') {
      response.writeHead(404).end();
      return;
    }
    requests++;
    response.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': buffer.length,
      'Accept-Ranges': 'bytes',
    });
    response.end(buffer);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/uploaded-sfx.wav`,
    requestCount: () => requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    }),
  };
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function main(): Promise<void> {
  const result = await runUploadedSfxRenderCanary();
  console.log(JSON.stringify({
    status: result.receipt.status,
    receiptPath: result.receiptPath,
    wavPath: result.wavPath,
    zeroCredit: result.receipt.zeroCredit,
    assignment: result.receipt.assignment,
    render: result.receipt.render,
    windows: result.receipt.windows,
  }, null, 2));
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
