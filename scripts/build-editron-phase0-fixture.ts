import { mkdir, readdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { config as loadEnv } from 'dotenv';
import { execFileSync } from 'child_process';

import {
  DEFAULT_PHASE0_KEEP_RUNS,
  buildPhase0ArtifactPaths,
  makePhase0RunId,
  selectPhase0RunDirsToPrune,
} from '../lib/editron/services/phase0-artifact-paths';
import { classifyPhase0Fixture } from '../lib/editron/services/phase0-failure-taxonomy';
import { buildPhase0FixtureManifest, withPhase0RenderArtifactPack } from '../lib/editron/services/phase0-fixture-manifest';
import type { Phase0FixtureProject } from '../lib/editron/services/phase0-fixture-manifest';
import { buildPhase0RenderArtifactPack } from '../lib/editron/services/phase0-render-artifact-pack';

async function main() {
  loadPhase0Env();
  const projectId = process.argv[2];
  if (!projectId) {
    console.error('Usage: tsx scripts/build-editron-phase0-fixture.ts <projectId> [outputDir]');
    process.exit(1);
  }

  const outputRoot = process.argv[3]
    ?? process.env.EDITRON_PHASE0_FIXTURE_DIR
    ?? path.resolve(process.cwd(), '.calibration-temp', 'phase0-fixtures');
  const capturedAt = new Date();
  const runId = process.env.EDITRON_PHASE0_RUN_ID || makePhase0RunId(capturedAt);
  const keepRuns = parseKeepRuns(process.env.EDITRON_PHASE0_KEEP_RUNS);
  const paths = buildPhase0ArtifactPaths(projectId, { rootDir: outputRoot, runId });

  const { COLLECTIONS, connectToDatabase } = await import('../lib/editron/db/mongodb');
  const { client, db } = await connectToDatabase();
  try {
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId });
    if (!project) {
      console.error(`Project not found: ${projectId}`);
      process.exit(1);
    }

    const typedProject = project as unknown as Phase0FixtureProject;
    const baseManifest = buildPhase0FixtureManifest(project as unknown as Phase0FixtureProject, {
      capturedAt: capturedAt.toISOString(),
      source: `mongo:${db.databaseName}.${COLLECTIONS.PROJECTS}`,
      artifactDir: paths.runDir,
      codeProvenance: readCodeProvenance(),
    });
    const artifactPack = buildPhase0RenderArtifactPack(typedProject, baseManifest, { artifactDir: paths.runDir });
    const manifest = withPhase0RenderArtifactPack(baseManifest, artifactPack);
    const failureTaxonomy = classifyPhase0Fixture(manifest, artifactPack);

    await mkdir(paths.runDir, { recursive: true });
    await writeFile(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await writeFile(paths.renderInputPath, `${JSON.stringify(artifactPack.renderInput, null, 2)}\n`, 'utf8');
    await writeFile(paths.artifactPackPath, `${JSON.stringify({
      ...artifactPack,
      renderInput: undefined,
    }, null, 2)}\n`, 'utf8');
    await writeFile(paths.failureTaxonomyPath, `${JSON.stringify(failureTaxonomy, null, 2)}\n`, 'utf8');
    const prunedRuns = await pruneOldPhase0Runs(paths.projectDir, paths.runId, keepRuns);

    console.log(`Phase 0 fixture manifest written: ${paths.manifestPath}`);
    console.log(`Phase 0 render input written: ${paths.renderInputPath}`);
    console.log(`Phase 0 render artifact pack written: ${paths.artifactPackPath}`);
    console.log(`Phase 0 failure taxonomy written: ${paths.failureTaxonomyPath}`);
    if (prunedRuns.length > 0) {
      console.log(`Phase 0 old runs pruned: ${prunedRuns.join(', ')}`);
    }
    console.log(JSON.stringify({
      projectId: manifest.projectId,
      runId: paths.runId,
      artifactDir: paths.runDir,
      durationSeconds: manifest.durationSeconds,
      overlayCounts: manifest.overlayCounts,
      canonicalTimeline: manifest.canonicalTimeline.status,
      vjepaCoverage: manifest.vjepaCoverage.status,
      renderArtifactPack: artifactPack.status,
      failureTaxonomy: failureTaxonomy.status,
      renderCommand: artifactPack.renderCommand,
      calibrationWritesAllowed: manifest.calibrationSafety.learningWritesAllowed,
      codeProvenance: manifest.codeProvenance,
    }, null, 2));
  } finally {
    await client.close();
  }
}

function loadPhase0Env(): void {
  loadEnv({ path: '.env.local', override: false });
  loadEnv({ path: '.env', override: false });
}

function parseKeepRuns(value: string | undefined): number {
  const parsed = value ? Number(value) : DEFAULT_PHASE0_KEEP_RUNS;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PHASE0_KEEP_RUNS;
}

async function pruneOldPhase0Runs(
  projectDir: string,
  currentRunId: string,
  keepRuns: number,
): Promise<string[]> {
  const entries = await readdir(projectDir, { withFileTypes: true }).catch(() => []);
  const runDirNames = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const prunedRuns = selectPhase0RunDirsToPrune(runDirNames, {
    keepRuns,
    protectedRunId: currentRunId,
  });

  for (const runId of prunedRuns) {
    await rm(path.join(projectDir, runId), { recursive: true, force: true });
  }

  return prunedRuns;
}

function readCodeProvenance() {
  const statusLines = gitOutput(['status', '--porcelain=v1'])
    ?.split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean) ?? [];
  const dirtyPaths = statusLines.map(readPorcelainPath).filter(Boolean).slice(0, 80);
  const untrackedPaths = statusLines
    .filter((line) => line.startsWith('??'))
    .map(readPorcelainPath)
    .filter(Boolean)
    .slice(0, 40);

  return {
    branch: gitOutput(['branch', '--show-current']),
    head: gitOutput(['rev-parse', 'HEAD']),
    upstreamHead: gitOutput(['rev-parse', '@{u}']),
    dirty: statusLines.length > 0,
    dirtyPaths,
    untrackedPaths,
    capturedBy: 'scripts/build-editron-phase0-fixture.ts',
  };
}

function readPorcelainPath(line: string): string {
  return line.replace(/^.. ?/, '').trim();
}

function gitOutput(args: string[]): string | null {
  try {
    const value = execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return value || null;
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
