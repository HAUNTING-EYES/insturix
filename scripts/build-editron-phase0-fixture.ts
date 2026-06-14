import 'dotenv/config';

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import { COLLECTIONS, connectToDatabase } from '../lib/editron/db/mongodb';
import { classifyPhase0Fixture } from '../lib/editron/services/phase0-failure-taxonomy';
import { buildPhase0FixtureManifest } from '../lib/editron/services/phase0-fixture-manifest';
import type { Phase0FixtureProject } from '../lib/editron/services/phase0-fixture-manifest';
import { buildPhase0RenderArtifactPack } from '../lib/editron/services/phase0-render-artifact-pack';

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
    const typedProject = project as unknown as Phase0FixtureProject;
    const manifest = buildPhase0FixtureManifest(project as unknown as Phase0FixtureProject, {
      capturedAt: new Date().toISOString(),
      source: `mongo:${db.databaseName}.${COLLECTIONS.PROJECTS}`,
      artifactDir: outputDir,
    });
    const artifactPack = buildPhase0RenderArtifactPack(typedProject, manifest, { artifactDir: outputDir });
    const failureTaxonomy = classifyPhase0Fixture(manifest, artifactPack);

    await mkdir(outputDir, { recursive: true });
    const manifestPath = path.join(outputDir, 'manifest.json');
    const renderInputPath = path.join(outputDir, 'render-input.json');
    const artifactPackPath = path.join(outputDir, 'render-artifact-pack.json');
    const failureTaxonomyPath = path.join(outputDir, 'failure-taxonomy.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await writeFile(renderInputPath, `${JSON.stringify(artifactPack.renderInput, null, 2)}\n`, 'utf8');
    await writeFile(artifactPackPath, `${JSON.stringify({
      ...artifactPack,
      renderInput: undefined,
    }, null, 2)}\n`, 'utf8');
    await writeFile(failureTaxonomyPath, `${JSON.stringify(failureTaxonomy, null, 2)}\n`, 'utf8');

    console.log(`Phase 0 fixture manifest written: ${manifestPath}`);
    console.log(`Phase 0 render input written: ${renderInputPath}`);
    console.log(`Phase 0 render artifact pack written: ${artifactPackPath}`);
    console.log(`Phase 0 failure taxonomy written: ${failureTaxonomyPath}`);
    console.log(JSON.stringify({
      projectId: manifest.projectId,
      durationSeconds: manifest.durationSeconds,
      overlayCounts: manifest.overlayCounts,
      canonicalTimeline: manifest.canonicalTimeline.status,
      vjepaCoverage: manifest.vjepaCoverage.status,
      renderArtifactPack: artifactPack.status,
      failureTaxonomy: failureTaxonomy.status,
      renderCommand: artifactPack.renderCommand,
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
