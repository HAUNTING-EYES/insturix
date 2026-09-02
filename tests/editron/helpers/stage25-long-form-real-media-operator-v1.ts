import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { finalizeStage25LongFormRealMediaTrialV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-long-form-real-media-trial-v1';

import { hydrateStage25LongFormWindowV1, materializeStage25LongFormSourceV1 }
  from './stage25-long-form-real-media-codec-v1';
import { buildStage25LongFormPtsEvidenceV1 }
  from './stage25-long-form-real-media-pts-v1';

const execFileAsync = promisify(execFile);
const SOURCE_SCOPES = [
  'lib/editron', 'tests/editron', 'components/editron',
  'modal/media_source_pts_scan_core.py', 'package.json', 'pnpm-lock.yaml',
] as const;

export async function runStage25LongFormRealMediaOperatorV1(input: Readonly<{
  workspaceRoot: string;
  artifactParent: string;
}>) {
  const commitSha = await git(input.workspaceRoot, ['rev-parse', 'HEAD']);
  const treeSha = await git(input.workspaceRoot, ['rev-parse', 'HEAD^{tree}']);
  const relevantStatusEntries = lines(await git(input.workspaceRoot, [
    'status', '--porcelain=v1', '--untracked-files=all', '--', ...SOURCE_SCOPES,
  ]));
  const tracked = lines(await git(input.workspaceRoot, [
    'ls-files', '-s', '--', ...SOURCE_SCOPES,
  ]));
  if (!tracked.length) throw new Error('STAGE25_LONG_FORM_OPERATOR_SOURCE_SCOPE_EMPTY');
  const executionId = `stage25-long-form-real-media-${commitSha.slice(0, 9)}-v1`;
  const executionRoot = path.resolve(input.artifactParent, executionId);
  await mkdir(input.artifactParent, { recursive: true });
  await mkdir(executionRoot);
  const now = new Date().toISOString();
  const source = await materializeStage25LongFormSourceV1(
    path.join(executionRoot, 'long-form-source.mp4'),
  );
  const pts = await buildStage25LongFormPtsEvidenceV1({
    sourcePath: source.sourcePath,
    artifact: source.artifact,
    rawProbe: source.rawProbe,
    ffprobeIdentity: source.ffprobeIdentity,
    outputDirectory: executionRoot,
    now,
  });
  const cadence = pts.cadence;
  if (cadence !== 'CFR') throw new Error('STAGE25_LONG_FORM_OPERATOR_NON_CFR_SOURCE');
  const hydrateStarted = performance.now();
  const windows = [];
  for (const window of pts.windows) {
    const evidence = await hydrateStage25LongFormWindowV1({
      sourcePath: source.sourcePath,
      outputDirectory: executionRoot,
      windowId: window.windowId,
      startPts: window.startPts,
      endExclusivePts: window.endExclusivePts,
    });
    windows.push({ ...window, ...evidence });
  }
  const receipt = finalizeStage25LongFormRealMediaTrialV1({
    source: {
      commitSha,
      treeSha,
      relevantScopeSha256: hashCanonicalJsonV1(tracked),
      relevantTrackedFileCount: tracked.length,
      relevantStatusEntries,
    },
    toolchain: {
      ffmpegIdentity: source.ffmpegIdentity,
      ffprobeIdentity: source.ffprobeIdentity,
    },
    media: {
      artifact: source.artifact,
      sourceVersionSha256: pts.sourceVersionSha256,
      technicalObservationSha256: pts.technicalObservationSha256,
      mapBindingSha256: pts.mapBindingSha256,
      width: Number(pts.video.codedWidth),
      height: Number(pts.video.codedHeight),
      videoCodec: String(pts.video.codec),
      audioCodec: String(pts.audio.codec),
      averageFrameRate: `${pts.video.averageFrameRate?.numerator}/${pts.video.averageFrameRate?.denominator}`,
      sourceTimebase: `${pts.video.sourceTimebase?.numerator}/${pts.video.sourceTimebase?.denominator}`,
      sourceStartPts: String(pts.video.sourceStartPts),
      sourceEndExclusivePts: pts.endExclusivePts,
      frameCount: Number(pts.video.frameCount),
      uniformFrameDurationTicks: '1001',
      sampleRate: Number(pts.audio.sampleRate),
      channelCount: Number(pts.audio.channelCount),
    },
    ptsIndex: {
      manifestContentSha256: pts.manifestContentSha256,
      verificationSha256: pts.verificationSha256,
      coverageSha256: pts.coverageSha256,
      batchCount: pts.batchCount,
      verifiedFrameCount: pts.verifiedFrameCount,
      startPts: pts.startPts,
      endExclusivePts: pts.endExclusivePts,
      cadence,
      peakRssBytes: pts.peakRssBytes,
    },
    windows,
    timings: {
      materializeMs: source.materializeMs,
      ptsScanAndVerifyMs: pts.ptsScanAndVerifyMs,
      hydrateMs: Math.max(1, Math.round(performance.now() - hydrateStarted)),
    },
    localFixtureCodecCalls: 10,
    localArtifactCount: pts.batchCount + 11,
  });
  const receiptPath = path.join(executionRoot, 'readiness-receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx',
  });
  return { executionId, executionRoot, receiptPath, receiptSha256: receipt.receiptSha256 };
}

async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: root, windowsHide: true, timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
  });
  return result.stdout.trim();
}
function lines(value: string): string[] { return value ? value.split(/\r?\n/).filter(Boolean) : []; }
async function main() {
  const artifactParent = process.argv[2];
  if (!artifactParent) throw new Error('USAGE: stage25-long-form-real-media-operator-v1 <artifact-parent>');
  const result = await runStage25LongFormRealMediaOperatorV1({
    workspaceRoot: process.cwd(), artifactParent: path.resolve(artifactParent),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked && invoked === path.resolve(fileURLToPath(import.meta.url))) await main();
