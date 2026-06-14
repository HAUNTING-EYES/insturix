import 'dotenv/config';

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import { COLLECTIONS, connectToDatabase } from '../lib/editron/db/mongodb';
import { buildPhase0FixtureManifest } from '../lib/editron/services/phase0-fixture-manifest';
import type { Phase0FixtureProject } from '../lib/editron/services/phase0-fixture-manifest';

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error('Usage: tsx scripts/build-editron-phase0-fixture.ts <projectId> [outputDir]');
    process.exit(1);
  }

  const outputRoot = process.argv[3]
    ?? process.env.EDITRON_PHASE0_FIXTURE_DIR
    ?? path.resolve(process.cwd(), '.calibration-temp', 'phase0-fixtures');

  const { client, db } = await connectToDatabase();
  try {
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId });
    if (!project) {
      console.error(`Project not found: ${projectId}`);
      process.exit(1);
    }

    const outputDir = path.join(outputRoot, projectId);
    const manifest = buildPhase0FixtureManifest(project as unknown as Phase0FixtureProject, {
      capturedAt: new Date().toISOString(),
      source: `mongo:${db.databaseName}.${COLLECTIONS.PROJECTS}`,
      artifactDir: outputDir,
    });

    await mkdir(outputDir, { recursive: true });
    const manifestPath = path.join(outputDir, 'manifest.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    console.log(`Phase 0 fixture manifest written: ${manifestPath}`);
    console.log(JSON.stringify({
      projectId: manifest.projectId,
      durationSeconds: manifest.durationSeconds,
      overlayCounts: manifest.overlayCounts,
      canonicalTimeline: manifest.canonicalTimeline.status,
      vjepaCoverage: manifest.vjepaCoverage.status,
      calibrationWritesAllowed: manifest.calibrationSafety.learningWritesAllowed,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
