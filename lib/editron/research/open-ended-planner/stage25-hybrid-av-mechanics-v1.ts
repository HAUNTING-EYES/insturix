import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;

export const STAGE25_HYBRID_AV_MECHANICS_VERSION_V1 =
  'EDITRON_OE_STAGE25_HYBRID_AV_MECHANICS_V1' as const;

export interface Stage25HybridAvContractV1 {
  taskId: string;
  artifactPrefix: string;
  canvas: Readonly<{ width: number; height: number }>;
  frameRate: Readonly<{ numerator: number; denominator: number }>;
  nativeVisualFrameCount: number;
  proofWindow: Readonly<{ startFrame: number; endExclusiveFrame: number }>;
  targetRange: Readonly<{ startFrame: number; endExclusiveFrame: number }>;
  generatedLocalRange: Readonly<{ startFrame: number; endExclusiveFrame: number }>;
  audio: Readonly<{ sampleRate: number; channels: number }>;
}

export interface Stage25HybridAvMechanicsInputV1 {
  contract: Readonly<Stage25HybridAvContractV1>;
  nativeVisualPath: string;
  nativeVisualSha256: string;
  nativeAudioBaselinePath: string;
  nativeAudioBaselineFileSha256: string;
  nativeAudioBaselinePcmSha256: string;
  generatedVisualPath: string;
  generatedVisualSha256: string;
  outputDirectory: string;
  ffmpegPath?: string;
  ffprobePath?: string;
}

/**
 * Route-neutral decoded hybrid A/V measurement. The caller owns candidate
 * form and source meaning; this owner only splices the declared frame ranges
 * and proves decoded video and PCM equivalence.
 */
export async function executeStage25HybridAvMechanicsV1(
  input: Readonly<Stage25HybridAvMechanicsInputV1>,
) {
  const contract = validateContract(input.contract);
  assertSha(input.nativeVisualSha256, 'NATIVE_VISUAL_SHA');
  assertSha(input.nativeAudioBaselineFileSha256, 'AUDIO_BASELINE_FILE_SHA');
  assertSha(input.nativeAudioBaselinePcmSha256, 'AUDIO_BASELINE_PCM_SHA');
  assertSha(input.generatedVisualSha256, 'GENERATED_VISUAL_SHA');
  const [nativeVisual, nativeAudio, generatedVisual] = await Promise.all([
    regularArtifact(input.nativeVisualPath),
    regularArtifact(input.nativeAudioBaselinePath),
    regularArtifact(input.generatedVisualPath),
  ]);
  if (nativeVisual.sha256 !== input.nativeVisualSha256) {
    fail('NATIVE_VISUAL_ARTIFACT_DRIFT');
  }
  if (nativeAudio.sha256 !== input.nativeAudioBaselineFileSha256) {
    fail('AUDIO_BASELINE_ARTIFACT_DRIFT');
  }
  if (generatedVisual.sha256 !== input.generatedVisualSha256) {
    fail('GENERATED_VISUAL_ARTIFACT_DRIFT');
  }

  const ffmpeg = input.ffmpegPath ?? getFFmpegPath();
  const ffprobe = input.ffprobePath ?? 'ffprobe';
  const outputRoot = await createNewOutputDirectory(input.outputDirectory);
  const masterFileName = `${contract.artifactPrefix}-hybrid-proof-master.mkv`;
  const reviewFileName = `${contract.artifactPrefix}-hybrid-review.mp4`;
  const masterPath = path.resolve(outputRoot, masterFileName);
  const reviewPath = path.resolve(outputRoot, reviewFileName);
  await renderLosslessMaster(ffmpeg, input, contract, masterPath);
  await renderReviewProxy(ffmpeg, masterPath, contract, reviewPath);

  const proofFrameCount = rangeLength(contract.proofWindow);
  const generatedFrameCount = rangeLength(contract.generatedLocalRange);
  const [nativeProbe, audioProbe, generatedProbe, masterProbe, reviewProbe] =
    await Promise.all([
      probeAv(ffprobe, input.nativeVisualPath),
      probeAv(ffprobe, input.nativeAudioBaselinePath),
      probeAv(ffprobe, input.generatedVisualPath),
      probeAv(ffprobe, masterPath),
      probeAv(ffprobe, reviewPath),
    ]);
  assertVideoProbe(nativeProbe, contract, contract.nativeVisualFrameCount, 1, undefined, 'NATIVE');
  assertStandaloneAudioProbe(audioProbe, contract, 'pcm_s16le', 'BASELINE');
  assertVideoProbe(generatedProbe, contract, generatedFrameCount, 0, 'h264', 'GENERATED');
  assertVideoProbe(masterProbe, contract, proofFrameCount, 1, 'ffv1', 'MASTER');
  assertVideoProbe(reviewProbe, contract, proofFrameCount, 1, 'h264', 'REVIEW');
  assertAudioProbe(masterProbe, contract, 'pcm_s16le', 'MASTER');
  assertAudioProbe(reviewProbe, contract, 'aac', 'REVIEW');

  const [baselinePcm, renderedPcm] = await Promise.all([
    decodePcm(ffmpeg, input.nativeAudioBaselinePath, contract),
    decodePcm(ffmpeg, masterPath, contract),
  ]);
  const bytesPerFrame = samplesPerFrame(contract) * contract.audio.channels * 2;
  const expectedBaselineBytes = contract.nativeVisualFrameCount * bytesPerFrame;
  const expectedRenderedBytes = proofFrameCount * bytesPerFrame;
  const baselinePcmSha256 = sha256(baselinePcm);
  const renderedPcmSha256 = sha256(renderedPcm);
  if (baselinePcmSha256 !== input.nativeAudioBaselinePcmSha256
    || baselinePcm.length !== expectedBaselineBytes
    || renderedPcm.length !== expectedRenderedBytes) {
    fail(`AUDIO_BASELINE_DRIFT:${JSON.stringify({
      expectedPcmSha256: input.nativeAudioBaselinePcmSha256,
      baselinePcmSha256,
      expectedBaselineBytes,
      baselineBytes: baselinePcm.length,
      expectedRenderedBytes,
      renderedBytes: renderedPcm.length,
    })}`);
  }

  const preFrameCount = contract.targetRange.startFrame
    - contract.proofWindow.startFrame;
  const postFrameCount = contract.proofWindow.endExclusiveFrame
    - contract.targetRange.endExclusiveFrame;
  const [pre, island, post] = await Promise.all([
    compareFrameRanges(ffmpeg, {
      expectedPath: input.nativeVisualPath,
      expectedStartFrame: contract.proofWindow.startFrame,
      actualPath: masterPath,
      actualStartFrame: 0,
      frameCount: preFrameCount,
      code: 'BEFORE_TARGET',
    }),
    compareFrameRanges(ffmpeg, {
      expectedPath: input.generatedVisualPath,
      expectedStartFrame: contract.generatedLocalRange.startFrame,
      actualPath: masterPath,
      actualStartFrame: preFrameCount,
      frameCount: generatedFrameCount,
      code: 'GENERATED_ISLAND',
    }),
    compareFrameRanges(ffmpeg, {
      expectedPath: input.nativeVisualPath,
      expectedStartFrame: contract.targetRange.endExclusiveFrame,
      actualPath: masterPath,
      actualStartFrame: preFrameCount + generatedFrameCount,
      frameCount: postFrameCount,
      code: 'AFTER_TARGET',
    }),
  ]);
  const proofWindowAudio = pcmRangeProof({
    baseline: baselinePcm,
    rendered: renderedPcm,
    baselineStartFrame: contract.proofWindow.startFrame,
    baselineEndExclusiveFrame: contract.proofWindow.endExclusiveFrame,
    renderedStartFrame: 0,
    renderedEndExclusiveFrame: proofFrameCount,
    bytesPerFrame,
  });
  const targetAudio = pcmRangeProof({
    baseline: baselinePcm,
    rendered: renderedPcm,
    baselineStartFrame: contract.targetRange.startFrame,
    baselineEndExclusiveFrame: contract.targetRange.endExclusiveFrame,
    renderedStartFrame: preFrameCount,
    renderedEndExclusiveFrame: preFrameCount + generatedFrameCount,
    bytesPerFrame,
  });
  const [master, review] = await Promise.all([
    regularArtifact(masterPath),
    regularArtifact(reviewPath),
  ]);
  const portable = {
    version: STAGE25_HYBRID_AV_MECHANICS_VERSION_V1,
    artifactType: 'Stage25HybridAvMechanicsReceiptV1' as const,
    authority: 'DECODED_HYBRID_AV_HANDOFF_MEASUREMENT_ONLY' as const,
    taskId: contract.taskId,
    contract,
    contractSha256: hashCanonicalJsonV1(contract),
    sourceArtifacts: {
      nativeVisualSha256: nativeVisual.sha256,
      nativeAudioBaselineFileSha256: nativeAudio.sha256,
      nativeAudioBaselinePcmSha256: baselinePcmSha256,
      generatedVisualSha256: generatedVisual.sha256,
    },
    timebaseHandoff: {
      rate: `${contract.frameRate.numerator}/${contract.frameRate.denominator}`,
      proofWindow: contract.proofWindow,
      targetRange: contract.targetRange,
      generatedLocalRange: contract.generatedLocalRange,
      segments: [
        {
          kind: 'NATIVE_VISUAL' as const,
          projectRange: [
            contract.proofWindow.startFrame,
            contract.targetRange.startFrame,
          ] as const,
          proofMasterRange: [0, preFrameCount] as const,
        },
        {
          kind: 'GENERATED_VISUAL' as const,
          projectRange: [
            contract.targetRange.startFrame,
            contract.targetRange.endExclusiveFrame,
          ] as const,
          generatedLocalRange: [
            contract.generatedLocalRange.startFrame,
            contract.generatedLocalRange.endExclusiveFrame,
          ] as const,
          proofMasterRange: [
            preFrameCount,
            preFrameCount + generatedFrameCount,
          ] as const,
        },
        {
          kind: 'NATIVE_VISUAL' as const,
          projectRange: [
            contract.targetRange.endExclusiveFrame,
            contract.proofWindow.endExclusiveFrame,
          ] as const,
          proofMasterRange: [
            preFrameCount + generatedFrameCount,
            proofFrameCount,
          ] as const,
        },
      ],
      decodedFrameSequenceProof: {
        beforeTarget: pre,
        generatedIsland: island,
        afterTarget: post,
      },
      entry: {
        projectFrame: contract.targetRange.startFrame,
        generatedLocalFrame: contract.generatedLocalRange.startFrame,
        decodedFrameSha256: island.firstFrameSha256,
        disposition: 'EXACT_DECODED_FRAME_MATCH' as const,
      },
      exit: {
        projectFrame: contract.targetRange.endExclusiveFrame - 1,
        generatedLocalFrame: contract.generatedLocalRange.endExclusiveFrame - 1,
        decodedFrameSha256: island.lastFrameSha256,
        disposition: 'EXACT_DECODED_FRAME_MATCH' as const,
      },
      return: {
        projectFrame: contract.targetRange.endExclusiveFrame,
        nativeVisualFrame: contract.targetRange.endExclusiveFrame,
        decodedFrameSha256: post.firstFrameSha256,
        disposition: 'EXACT_DECODED_FRAME_MATCH' as const,
      },
      outsideTarget: 'ALL_PROOF_WINDOW_NATIVE_FRAMES_EXACTLY_MATCH_BOUND_SOURCE' as const,
    },
    audioHandoff: {
      owner: 'NATIVE_TIMELINE_BASELINE' as const,
      codecInProofMaster: 'pcm_s16le' as const,
      sampleRate: contract.audio.sampleRate,
      channels: contract.audio.channels,
      samplesPerFrame: samplesPerFrame(contract),
      proofWindowSampleCountPerChannel:
        renderedPcm.length / (contract.audio.channels * 2),
      fullNativeBaselinePcmSha256: baselinePcmSha256,
      renderedProofWindowPcmSha256: renderedPcmSha256,
      proofWindow: proofWindowAudio,
      targetRange: targetAudio,
      generatedVisualAudioAuthority: 'NONE' as const,
    },
    outputs: {
      proofMaster: {
        fileName: masterFileName,
        sha256: master.sha256,
        bytes: master.bytes,
        video: masterProbe.video,
        audio: masterProbe.audio,
        purpose: 'LOSSLESS_VIDEO_AND_PCM_EQUIVALENCE_EVIDENCE' as const,
      },
      reviewProxy: {
        fileName: reviewFileName,
        sha256: review.sha256,
        bytes: review.bytes,
        video: reviewProbe.video,
        audio: reviewProbe.audio,
        purpose: 'STANDARD_H264_AAC_HUMAN_REVIEW_PLAYBACK' as const,
      },
    },
    proof: {
      timebase: 'PASS' as const,
      nativeAudioPcmEquivalence: 'PASS' as const,
      entryBoundary: 'PASS' as const,
      exitBoundary: 'PASS' as const,
      returnBoundary: 'PASS' as const,
      outsideTargetUnchanged: 'PASS' as const,
      playableAudioReviewProxy: 'PASS' as const,
      humanQuality: 'UNJUDGED' as const,
    },
    projectStateEffects: [] as const,
  };
  return deepFreezeV1({
    ...portable,
    receiptSha256: hashCanonicalJsonV1(portable),
    hostPaths: { masterPath, reviewPath },
  });
}

export type Stage25HybridAvMechanicsReceiptV1 = Awaited<
  ReturnType<typeof executeStage25HybridAvMechanicsV1>
>;

function validateContract(
  input: Readonly<Stage25HybridAvContractV1>,
): Readonly<Stage25HybridAvContractV1> {
  if (!/^[A-Z0-9][A-Z0-9-]{0,31}$/.test(input.taskId)
    || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.artifactPrefix)) {
    fail('CONTRACT_IDENTITY_INVALID');
  }
  const integers = [
    input.canvas.width,
    input.canvas.height,
    input.frameRate.numerator,
    input.frameRate.denominator,
    input.nativeVisualFrameCount,
    input.proofWindow.startFrame,
    input.proofWindow.endExclusiveFrame,
    input.targetRange.startFrame,
    input.targetRange.endExclusiveFrame,
    input.generatedLocalRange.startFrame,
    input.generatedLocalRange.endExclusiveFrame,
    input.audio.sampleRate,
    input.audio.channels,
  ];
  if (integers.some((value) => !Number.isSafeInteger(value))
    || integers.slice(0, 5).some((value) => value <= 0)
    || input.audio.sampleRate <= 0 || input.audio.channels <= 0
    || input.audio.channels > 8
    || input.proofWindow.startFrame < 0
    || input.targetRange.startFrame <= input.proofWindow.startFrame
    || input.targetRange.endExclusiveFrame >= input.proofWindow.endExclusiveFrame
    || input.proofWindow.endExclusiveFrame > input.nativeVisualFrameCount
    || input.generatedLocalRange.startFrame < 0
    || rangeLength(input.generatedLocalRange) !== rangeLength(input.targetRange)
    || (input.audio.sampleRate * input.frameRate.denominator)
      % input.frameRate.numerator !== 0) {
    fail('CONTRACT_RANGE_INVALID');
  }
  return deepFreezeV1(structuredClone(input));
}

async function renderLosslessMaster(
  ffmpeg: string,
  input: Readonly<Stage25HybridAvMechanicsInputV1>,
  contract: Readonly<Stage25HybridAvContractV1>,
  outputPath: string,
): Promise<void> {
  const generatedFrames = rangeLength(contract.generatedLocalRange);
  const proofFrames = rangeLength(contract.proofWindow);
  const startSample = contract.proofWindow.startFrame * samplesPerFrame(contract);
  const endSample = contract.proofWindow.endExclusiveFrame
    * samplesPerFrame(contract);
  const channelLayout = contract.audio.channels === 1
    ? 'mono'
    : contract.audio.channels === 2 ? 'stereo' : `${contract.audio.channels}c`;
  const filter = [
    `[0:v]trim=start_frame=${contract.proofWindow.startFrame}:end_frame=${contract.targetRange.startFrame},setpts=PTS-STARTPTS[v0]`,
    `[1:v]trim=start_frame=${contract.generatedLocalRange.startFrame}:end_frame=${contract.generatedLocalRange.endExclusiveFrame},setpts=PTS-STARTPTS[v1]`,
    `[0:v]trim=start_frame=${contract.targetRange.endExclusiveFrame}:end_frame=${contract.proofWindow.endExclusiveFrame},setpts=PTS-STARTPTS[v2]`,
    '[v0][v1][v2]concat=n=3:v=1:a=0,format=yuv420p[v]',
    `[2:a]atrim=start_sample=${startSample}:end_sample=${endSample},asetpts=N/SR/TB,aresample=${contract.audio.sampleRate}:async=0:first_pts=0,aformat=sample_fmts=s16:channel_layouts=${channelLayout}[a]`,
  ].join(';');
  if (generatedFrames + contract.targetRange.startFrame
    - contract.proofWindow.startFrame
    + contract.proofWindow.endExclusiveFrame
    - contract.targetRange.endExclusiveFrame !== proofFrames) {
    fail('CONCAT_FRAME_COUNT_INVALID');
  }
  await capture(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error',
    '-i', input.nativeVisualPath,
    '-i', input.generatedVisualPath,
    '-i', input.nativeAudioBaselinePath,
    '-filter_complex', filter,
    '-map', '[v]', '-map', '[a]',
    '-r', rateText(contract), '-c:v', 'ffv1', '-level', '3', '-g', '1',
    '-pix_fmt', 'yuv420p', '-threads', '1', '-color_primaries', 'bt709',
    '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-c:a', 'pcm_s16le', '-ar', String(contract.audio.sampleRate),
    '-ac', String(contract.audio.channels), '-fflags', '+bitexact',
    '-flags:v', '+bitexact', '-map_metadata', '-1', '-n', outputPath,
  ]);
}

async function renderReviewProxy(
  ffmpeg: string,
  masterPath: string,
  contract: Readonly<Stage25HybridAvContractV1>,
  outputPath: string,
): Promise<void> {
  await capture(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', masterPath,
    '-map', '0:v:0', '-map', '0:a:0',
    '-frames:v', String(rangeLength(contract.proofWindow)),
    '-r', rateText(contract), '-c:v', 'libx264', '-preset', 'veryfast',
    '-crf', '18', '-pix_fmt', 'yuv420p', '-threads', '1',
    '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-colorspace', 'bt709', '-color_range', 'tv', '-c:a', 'aac',
    '-b:a', '192k', '-ar', String(contract.audio.sampleRate),
    '-ac', String(contract.audio.channels), '-map_metadata', '-1',
    '-movflags', '+faststart', '-n', outputPath,
  ]);
}

async function compareFrameRanges(ffmpeg: string, input: {
  expectedPath: string;
  expectedStartFrame: number;
  actualPath: string;
  actualStartFrame: number;
  frameCount: number;
  code: string;
}) {
  const [expected, actual] = await Promise.all([
    decodedFrameHashes(
      ffmpeg,
      input.expectedPath,
      input.expectedStartFrame,
      input.frameCount,
    ),
    decodedFrameHashes(
      ffmpeg,
      input.actualPath,
      input.actualStartFrame,
      input.frameCount,
    ),
  ]);
  const mismatch = expected.findIndex((value, index) => value !== actual[index]);
  if (expected.length !== input.frameCount
    || actual.length !== input.frameCount
    || mismatch >= 0) {
    fail(`${input.code}_DECODED_FRAME_DRIFT:${mismatch}`);
  }
  return {
    frameCount: input.frameCount,
    expectedStartFrame: input.expectedStartFrame,
    actualStartFrame: input.actualStartFrame,
    sequenceSha256: hashCanonicalJsonV1(expected),
    firstFrameSha256: expected[0]!,
    lastFrameSha256: expected[expected.length - 1]!,
    equivalence: 'EXACT' as const,
  };
}

async function decodedFrameHashes(
  ffmpeg: string,
  filePath: string,
  startFrame: number,
  frameCount: number,
): Promise<string[]> {
  const output = (await capture(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', filePath,
    '-map', '0:v:0', '-vf',
    `trim=start_frame=${startFrame}:end_frame=${startFrame + frameCount},setpts=PTS-STARTPTS`,
    '-an', '-pix_fmt', 'yuv420p', '-f', 'framemd5', '-hash', 'sha256',
    'pipe:1',
  ])).toString('utf8');
  return output.split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => line.split(',').at(-1)?.trim() ?? '')
    .map((value) => /^[a-f0-9]{64}$/.test(value)
      ? value
      : fail('FRAME_HASH_INVALID'));
}

function pcmRangeProof(input: {
  baseline: Buffer;
  rendered: Buffer;
  baselineStartFrame: number;
  baselineEndExclusiveFrame: number;
  renderedStartFrame: number;
  renderedEndExclusiveFrame: number;
  bytesPerFrame: number;
}) {
  const baselineBytes = input.baseline.subarray(
    input.baselineStartFrame * input.bytesPerFrame,
    input.baselineEndExclusiveFrame * input.bytesPerFrame,
  );
  const renderedBytes = input.rendered.subarray(
    input.renderedStartFrame * input.bytesPerFrame,
    input.renderedEndExclusiveFrame * input.bytesPerFrame,
  );
  const baselinePcmSha256 = sha256(baselineBytes);
  const renderedPcmSha256 = sha256(renderedBytes);
  if (baselineBytes.length !== renderedBytes.length
    || baselinePcmSha256 !== renderedPcmSha256) {
    fail('AUDIO_RANGE_PCM_DRIFT');
  }
  return {
    baselineStartFrame: input.baselineStartFrame,
    baselineEndExclusiveFrame: input.baselineEndExclusiveFrame,
    renderedStartFrame: input.renderedStartFrame,
    renderedEndExclusiveFrame: input.renderedEndExclusiveFrame,
    byteLength: baselineBytes.length,
    baselinePcmSha256,
    renderedPcmSha256,
    equivalence: 'EXACT' as const,
  };
}

async function probeAv(command: string, filePath: string) {
  const parsed = JSON.parse((await capture(command, [
    '-v', 'error', '-count_frames', '-show_entries',
    'format=duration:stream=codec_type,codec_name,pix_fmt,width,height,'
      + 'avg_frame_rate,nb_read_frames,sample_rate,channels',
    '-of', 'json', filePath,
  ])).toString('utf8')) as JsonRecord;
  const streams = records(parsed.streams);
  const video = streams.find(({ codec_type }) => codec_type === 'video');
  const audio = streams.find(({ codec_type }) => codec_type === 'audio');
  return {
    durationSeconds: Number(record(parsed.format).duration),
    video: video ? {
      codec: text(video.codec_name),
      pixelFormat: text(video.pix_fmt),
      width: integer(video.width),
      height: integer(video.height),
      averageFrameRate: text(video.avg_frame_rate),
      decodedFrameCount: integer(video.nb_read_frames),
    } : null,
    audioStreamCount: streams.filter(({ codec_type }) => codec_type === 'audio').length,
    audio: audio ? {
      codec: text(audio.codec_name),
      sampleRate: integer(audio.sample_rate),
      channels: integer(audio.channels),
    } : null,
  };
}

function assertVideoProbe(
  value: Awaited<ReturnType<typeof probeAv>>,
  contract: Readonly<Stage25HybridAvContractV1>,
  frames: number,
  audioStreams: number,
  codec: string | undefined,
  code: string,
): void {
  if (!value.video
    || (codec !== undefined && value.video.codec !== codec)
    || value.video.pixelFormat !== 'yuv420p'
    || value.video.width !== contract.canvas.width
    || value.video.height !== contract.canvas.height
    || value.video.averageFrameRate !== rateText(contract)
    || value.video.decodedFrameCount !== frames
    || value.audioStreamCount !== audioStreams
    || Math.abs(value.durationSeconds - frames / framesPerSecond(contract)) > 0.05) {
    fail(`${code}_VIDEO_CONTRACT_INVALID`);
  }
}

function assertStandaloneAudioProbe(
  value: Awaited<ReturnType<typeof probeAv>>,
  contract: Readonly<Stage25HybridAvContractV1>,
  codec: string,
  code: string,
): void {
  if (value.video || value.audioStreamCount !== 1
    || value.audio?.codec !== codec
    || value.audio.sampleRate !== contract.audio.sampleRate
    || value.audio.channels !== contract.audio.channels
    || Math.abs(value.durationSeconds
      - contract.nativeVisualFrameCount / framesPerSecond(contract)) > 0.001) {
    fail(`${code}_AUDIO_CONTRACT_INVALID`);
  }
}

function assertAudioProbe(
  value: Awaited<ReturnType<typeof probeAv>>,
  contract: Readonly<Stage25HybridAvContractV1>,
  codec: string,
  code: string,
): void {
  if (value.audio?.codec !== codec
    || value.audio.sampleRate !== contract.audio.sampleRate
    || value.audio.channels !== contract.audio.channels) {
    fail(`${code}_AUDIO_CONTRACT_INVALID`);
  }
}

async function decodePcm(
  ffmpeg: string,
  filePath: string,
  contract: Readonly<Stage25HybridAvContractV1>,
): Promise<Buffer> {
  const bytes = await capture(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', filePath,
    '-map', '0:a:0', '-vn', '-ac', String(contract.audio.channels),
    '-ar', String(contract.audio.sampleRate), '-f', 's16le', 'pipe:1',
  ]);
  if (!bytes.length || bytes.length % (contract.audio.channels * 2) !== 0) {
    fail('PCM_DECODE_INVALID');
  }
  return bytes;
}

async function createNewOutputDirectory(value: string): Promise<string> {
  const root = path.resolve(value);
  if (root === path.parse(root).root || root === path.resolve(process.cwd())) {
    fail('OUTPUT_DIRECTORY_UNSAFE');
  }
  await mkdir(path.dirname(root), { recursive: true });
  await mkdir(root);
  return root;
}

async function regularArtifact(filePath: string) {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    fail('ARTIFACT_INVALID');
  }
  return { sha256: sha256(await readFile(filePath)), bytes: stat.size };
}

async function capture(command: string, args: string[]): Promise<Buffer> {
  const child = spawn(command, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout: Buffer[] = [];
  let stderr = '';
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0
      ? resolve()
      : reject(new Error(
        `STAGE25_HYBRID_AV_PROCESS_FAILED:${path.basename(command)}:${code}:${stderr.slice(-2_000)}`,
      )));
  });
  return Buffer.concat(stdout);
}

function samplesPerFrame(contract: Readonly<Stage25HybridAvContractV1>): number {
  return contract.audio.sampleRate * contract.frameRate.denominator
    / contract.frameRate.numerator;
}
function framesPerSecond(contract: Readonly<Stage25HybridAvContractV1>): number {
  return contract.frameRate.numerator / contract.frameRate.denominator;
}
function rateText(contract: Readonly<Stage25HybridAvContractV1>): string {
  return `${contract.frameRate.numerator}/${contract.frameRate.denominator}`;
}
function rangeLength(range: Readonly<{
  startFrame: number;
  endExclusiveFrame: number;
}>): number {
  return range.endExclusiveFrame - range.startFrame;
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}
function assertSha(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) fail(`${code}_INVALID`);
}
function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
function fail(code: string): never {
  throw new Error(`STAGE25_HYBRID_AV_${code}`);
}
