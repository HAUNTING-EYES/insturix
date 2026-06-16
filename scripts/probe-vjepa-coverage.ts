// Read-only V-JEPA coverage preflight for calibration.
// Checks V-JEPA segment coverage and overlay frame hits after mapping cut timeline -> original source time.
// Run: pnpm calibrate:vjepa -- <projectId>
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import {
  auditVjepaCoverage,
  type SegmentCoverageSummary,
} from '../lib/editron/services/vjepa-coverage-audit';

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

function fmtMs(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtPct(value: number | null): string {
  return value == null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function printCoverage(label: string, summary: SegmentCoverageSummary): void {
  console.log(`\n=== ${label} ===`);
  console.log(`segments:        ${summary.segmentCount}`);
  console.log(`span:            ${summary.spanStartMs == null ? 'n/a' : fmtMs(summary.spanStartMs)} .. ${summary.spanEndMs == null ? 'n/a' : fmtMs(summary.spanEndMs)}`);
  console.log(`covered:         ${fmtMs(summary.coveredMs)} (${fmtPct(summary.coverageRatio)} of original duration)`);
  console.log(`gaps:            count=${summary.gapCount} total=${fmtMs(summary.gapTotalMs)} max=${fmtMs(summary.maxGapMs)}`);
  console.log(`field coverage:  sig=${fmtPct(summary.fieldCoverage.visualSignificance)} motion=${fmtPct(summary.fieldCoverage.motionIntensity)} action=${fmtPct(summary.fieldCoverage.actionType)} motionType=${fmtPct(summary.fieldCoverage.motionType)} face=${fmtPct(summary.fieldCoverage.faceEmotion)} gaze=${fmtPct(summary.fieldCoverage.eyeContact)}`);
  console.log(`primitive cov:   motionVector=${fmtPct(summary.fieldCoverage.motionVector)} mainSubject=${fmtPct(summary.fieldCoverage.mainSubject)} textBoxes=${fmtPct(summary.fieldCoverage.textBoxes)} textCoverage=${fmtPct(summary.fieldCoverage.textCoverage)} negativeSpace=${fmtPct(summary.fieldCoverage.negativeSpace)} objects=${fmtPct(summary.fieldCoverage.objectCount)} faces=${fmtPct(summary.fieldCoverage.faceCount)}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
V-JEPA coverage preflight

Usage:
  pnpm calibrate:vjepa -- <projectId>
  pnpm calibrate:vjepa -- proj_OzG2qgoYudFa

Checks:
  - V-JEPA segment duration/gap coverage
  - V-JEPA field coverage for visual atoms
  - overlay frame hits after cut timeline -> original source-time mapping
`);
    return;
  }

  loadEnvLocal();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  const projectId = args[0] || 'proj_OzG2qgoYudFa';
  const dbName = process.env.EDITRON_MONGODB_DB_NAME || 'editron_prev';

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
    const rawFootage = project.rawFootageAnalysis || {};
    const vjepa = project.vjepaAnalysis || {};
    const vjepaSegments: any[] = vjepa.segments || [];
    const rawFootageSegments: any[] = rawFootage.segments || [];
    const audit = auditVjepaCoverage({
      fps,
      originalDurationMs: rawFootage.originalDurationMs,
      cleanDurationMs: rawFootage.estimatedCleanDurationMs,
      vjepaSegments,
      rawFootageSegments,
      overlays: project.overlays || [],
    });

    console.log(`=== ${projectId} (db=${dbName}) fps=${fps} ===`);
    console.log(`originalDurationMs:        ${rawFootage.originalDurationMs ?? 'n/a'} (${fmtMs(rawFootage.originalDurationMs || 0)})`);
    console.log(`estimatedCleanDurationMs:  ${rawFootage.estimatedCleanDurationMs ?? 'n/a'} (${fmtMs(rawFootage.estimatedCleanDurationMs || 0)})`);
    console.log(`vjepaAnalysis present:     ${project.vjepaAnalysis ? 'YES' : 'NO'}  modelVersion=${vjepa.modelVersion ?? 'n/a'} procMs=${vjepa.processingTimeMs ?? 'n/a'}`);
    console.log(`audit status:              ${audit.status.toUpperCase()}${audit.issues.length ? ` (${audit.issues.join(', ')})` : ''}`);

    printCoverage('V-JEPA COVERAGE', audit.segmentCoverage);
    if (audit.rawFootageCoverage) {
      printCoverage('rawFootage SEGMENT COVERAGE (source of V-JEPA inputs)', audit.rawFootageCoverage);
    }

    if (vjepaSegments.length) {
      const sorted = [...vjepaSegments].sort((a, b) => a.startMs - b.startMs);
      console.log('\nfirst 6 vjepa segs (startMs..endMs):');
      sorted.slice(0, 6).forEach((s, i) => console.log(`  [${i}] ${s.startMs}..${s.endMs} (${fmtMs(s.startMs)}..${fmtMs(s.endMs)}) sig=${(s.visualSignificance ?? 0).toFixed(2)} motion=${(s.motionIntensity ?? 0).toFixed(2)}`));
      console.log('last 3 vjepa segs:');
      sorted.slice(-3).forEach((s, i) => console.log(`  [..${sorted.length - 3 + i}] ${s.startMs}..${s.endMs} (${fmtMs(s.startMs)}..${fmtMs(s.endMs)})`));
    } else {
      console.log('\n!!! vjepaAnalysis.segments EMPTY/ABSENT: per-moment visual atoms fall back to coarse defaults.');
    }

    console.log(`\n=== ${audit.overlayHits.length} OVERLAY FRAMES vs V-JEPA SEGMENTS (cut timeline -> original source time) ===`);
    for (const hit of audit.overlayHits) {
      const seg = hit.segment ?? hit.nearestSegment;
      console.log(
        `  OV[${String(hit.index).padStart(2)}] ${String(hit.overlayType ?? '?').padEnd(14)} ` +
        `cut=${String(hit.cutFrame).padStart(6)} (${fmtMs(hit.cutTimeMs)}) ` +
        `src=${hit.sourceFrame == null ? 'NO_CLIP' : `${String(hit.sourceFrame).padStart(6)} (${fmtMs(hit.sourceTimeMs ?? 0)})`} ` +
        `${hit.exactHit ? 'INSIDE ' : 'OUTSIDE'} ` +
        `${seg ? `seg(${seg.startMs}..${seg.endMs}) gap=${fmtMs(hit.nearestGapMs ?? 0)}` : 'seg(none)'}`,
      );
    }

    const outsideList = audit.overlayHits.filter((hit) => !hit.exactHit).map((hit) => hit.index);
    console.log(`\nOVERLAY HIT RATE: ${fmtPct(audit.overlayHitRate)}  OUTSIDE indexes [${outsideList.join(', ')}]`);
    process.exitCode = audit.status === 'fail' ? 2 : audit.status === 'warn' ? 1 : 0;
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error('ERROR:', e instanceof Error ? e.message : e);
  process.exit(1);
});
