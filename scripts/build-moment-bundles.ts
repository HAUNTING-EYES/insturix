// Build deterministic moment-bundle rows for calibration.
// Run: pnpm calibrate:bundles -- <projectId>
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import { buildSignalTimeline } from '../lib/editron/services/signal-registry';
import { buildMomentBundles, evaluateMomentBundles } from '../lib/editron/services/moment-bundle-calibration';
import { getOverlayDefinitions } from '../lib/editron/engine/overlay-definitions-loader';

function loadEnvLocal(): void {
  if (process.env.MONGODB_URI) return;
  for (const name of ['.env.local', '.env']) {
    try {
      const txt = fs.readFileSync(path.resolve(process.cwd(), name), 'utf8');
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[m[1]] === undefined) process.env[m[1]] = v;
      }
    } catch {
      // Try the next env file.
    }
  }
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function printHelp(): void {
  console.log(`
Moment bundle calibration dataset

Usage:
  pnpm calibrate:bundles -- <projectId>
  pnpm calibrate:bundles -- proj_OzG2qgoYudFa --stride 30

Output:
  .calibration-temp/<projectId>-moment-bundles.json with bundles + deterministic evaluation summary
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  loadEnvLocal();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  const projectId = args.find((arg) => !arg.startsWith('--')) || 'proj_OzG2qgoYudFa';
  const dbName = process.env.EDITRON_MONGODB_DB_NAME || 'editron_prev';
  const stride = Number(argValue(args, '--stride') ?? 30);
  if (!Number.isFinite(stride) || stride <= 0) throw new Error(`Invalid --stride value: ${stride}`);

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const project = await db.collection('projects').findOne({ projectId }) as Record<string, any> | null;
    if (!project) {
      console.error('NOT FOUND', projectId, 'in', dbName);
      process.exitCode = 2;
      return;
    }

    const fps = project.fps || 30;
    const overlays = (project.overlays || []) as any[];
    const overlayInfos = overlays.map((overlay) => ({
      id: String(overlay.id ?? ''),
      type: String(overlay.type ?? ''),
      from: Number(overlay.from ?? 0),
      durationInFrames: Number(overlay.durationInFrames ?? 0),
      row: overlay.row,
      assetId: overlay.assetId,
    }));

    const timeline = buildSignalTimeline(
      [],
      project.rawFootageAnalysis ?? null,
      overlayInfos,
      fps,
      project.vjepaAnalysis ?? null,
      project.wav2vecAnalysis ?? null,
      project.essentiaAnalysis ?? null,
    );

    const bundles = buildMomentBundles({
      timeline,
      overlays,
      overlayDefinitions: getOverlayDefinitions(),
      frameStride: stride,
      includeOverlayFrames: true,
      topCandidatesPerCategory: 2,
    });
    const evaluation = evaluateMomentBundles(bundles);

    const outDir = path.resolve(process.cwd(), '.calibration-temp');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${projectId}-moment-bundles.json`);
    fs.writeFileSync(outFile, JSON.stringify({
      projectId,
      dbName,
      fps,
      createdAt: new Date().toISOString(),
      rowCount: bundles.length,
      bundles,
      evaluation,
    }, null, 2));

    const withVisual = bundles.filter((bundle) => bundle.atoms.some((atom) => atom.channel === 'visual')).length;
    const withCandidates = bundles.filter((bundle) => bundle.systemCandidates.length > 0).length;
    const withOverlays = bundles.filter((bundle) => bundle.activeOverlays.length > 0).length;
    console.log(`Wrote ${bundles.length} moment bundles -> ${outFile}`);
    console.log(`coverage: visualAtoms=${withVisual}/${bundles.length}, systemCandidates=${withCandidates}/${bundles.length}, activeOverlays=${withOverlays}/${bundles.length}`);
    console.log(`evaluation: observedRows=${evaluation.summary.observedRows}/${bundles.length}, averageObservedScore=${evaluation.summary.averageObservedScore}, matched=${evaluation.summary.matchedRows}, partial=${evaluation.summary.partialRows}, missed=${evaluation.summary.missedRows}`);
    console.log(`primitive influence: rows=${evaluation.summary.primitiveInfluenceRows}/${bundles.length}, changed=${evaluation.summary.primitiveChangedRows}, placementChanged=${evaluation.summary.primitivePlacementChangedRows}, categories=${JSON.stringify(evaluation.summary.primitiveChangedCategories)}`);
    console.log(`aesthetic: rows=${evaluation.summary.aestheticRows}/${bundles.length}, averageScore=${evaluation.summary.averageAestheticScore}, statuses=${JSON.stringify(evaluation.summary.aestheticStatusCounts)}, issues=${JSON.stringify(evaluation.summary.aestheticIssueCounts)}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('ERROR:', error instanceof Error ? error.message : error);
  process.exit(1);
});
