import { config } from 'dotenv';
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

import {
  evaluateRealProjectMgTasteGate,
  type RealProjectMgTasteGateInput,
} from '../lib/editron/motion-graphics/engine/eval/real-project-mg-taste-gate';

config({ path: '.env.local' });

interface Args {
  projectId?: string;
  outDir: string;
  failOnGate: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    outDir: path.resolve(process.cwd(), '.calibration-temp', 'real-project-mg-taste'),
    failOnGate: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--out=')) args.outDir = path.resolve(process.cwd(), arg.slice('--out='.length));
    else if (arg === '--fail-on-gate') args.failOnGate = true;
    else if (!args.projectId) args.projectId = arg;
  }
  return args;
}

function usage(): never {
  console.error('Usage: npx tsx scripts/audit-real-project-mg.ts <projectId> [--out=.calibration-temp/real-project-mg-taste] [--fail-on-gate]');
  process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.projectId) usage();
  const uri = process.env.MONGODB_URI ?? '';
  if (!uri) {
    console.error('MONGODB_URI missing. Put it in .env.local or the process environment.');
    process.exit(1);
  }

  console.log(`Loading project ${args.projectId} for MG taste audit...`);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  try {
    const db = client.db('editron_prev');
    console.log('Connected to MongoDB; fetching project...');
    const project = await db.collection('projects').findOne({ projectId: args.projectId });
    if (!project) {
      console.error(`Project not found: ${args.projectId}`);
      process.exit(1);
    }

    const overlays = Array.isArray(project.overlays) ? project.overlays as Array<Record<string, unknown>> : [];
    const input: RealProjectMgTasteGateInput = {
      projectId: String(project.projectId ?? args.projectId),
      fps: numeric(project.fps) ?? 30,
      durationInFrames: numeric(project.durationInFrames),
      width: numeric(project.width) ?? inferCanvas(overlays).width,
      height: numeric(project.height) ?? inferCanvas(overlays).height,
      genreParameters: objectRecord(project.genreParameters) ?? objectRecord(project.genreParametersSignalComputed) ?? {},
      overlays,
    };
    console.log(`Fetched ${overlays.length} overlays; evaluating gate...`);
    const report = evaluateRealProjectMgTasteGate(input);
    const motionGraphics = overlays
      .filter((overlay) => overlay.type === 'motion-graphic')
      .sort((a, b) => (numeric(a.from) ?? 0) - (numeric(b.from) ?? 0));
    const canvas = inferCanvas(overlays, input.width, input.height);
    const projectOutDir = path.join(args.outDir, input.projectId);
    fs.mkdirSync(projectOutDir, { recursive: true });

    const reportPath = path.join(projectOutDir, 'mg-taste-gate.json');
    console.log('Writing audit artifacts...');
    fs.writeFileSync(reportPath, JSON.stringify({
      report,
      artifacts: {
        stillInput: path.resolve(process.cwd(), '.calibration-temp', `${input.projectId}-mgs.json`),
      },
    }, null, 2));

    const stillInputPath = path.resolve(process.cwd(), '.calibration-temp', `${input.projectId}-mgs.json`);
    fs.mkdirSync(path.dirname(stillInputPath), { recursive: true });
    fs.writeFileSync(stillInputPath, JSON.stringify({
      projectId: input.projectId,
      width: canvas.width,
      height: canvas.height,
      mgs: motionGraphics.map((overlay) => ({
        ...overlay,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      })),
    }, null, 2));

    console.log(`MG taste gate: ${report.status} score=${report.score}`);
    console.log(JSON.stringify(report.summary, null, 2));
    for (const finding of report.findings) {
      console.log(`${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`);
      console.log(JSON.stringify(finding.evidence, null, 2));
    }
    console.log(`Report -> ${reportPath}`);
    console.log(`Still input -> ${stillInputPath}`);
    console.log(`Render stills -> npx tsx scripts/render-mg-stills.ts ${input.projectId}`);

    if (args.failOnGate && report.status === 'fail') process.exitCode = 1;
  } finally {
    await client.close();
  }
}

function inferCanvas(
  overlays: Array<Record<string, unknown>>,
  width?: number,
  height?: number,
): { width: number; height: number } {
  const firstMg = overlays.find((overlay) => overlay.type === 'motion-graphic');
  return {
    width: width ?? numeric(firstMg?.width) ?? 1920,
    height: height ?? numeric(firstMg?.height) ?? 1080,
  };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

main().catch((error) => {
  console.error('ERROR:', error instanceof Error ? error.stack : error);
  process.exit(1);
});
