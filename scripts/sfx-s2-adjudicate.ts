/**
 * S2-L1 adjudication — dev probe (SFX-owned).
 *
 * Reads all per-reviewer observation files under
 * .calibration-temp/sfx-eval-labelling/observations/<opportunityId>/<reviewer>.json
 * and produces the FROZEN adjudicated ground-truth labels:
 *   - one reviewer  -> accepted-consensus (single)
 *   - two+ agree    -> accepted-consensus
 *   - two+ disagree -> UNRESOLVED (requires human adjudicator choice, never
 *                      auto-merged)
 *
 * Writes: .calibration-temp/sfx-eval-labelling/frozen-labels.json
 *
 * Run: npx tsx scripts/sfx-s2-adjudicate.ts
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  adjudicateObservations,
  toFrozenOpportunityLabel,
  type OpportunityObservationV1,
  type ToolingValidationManifestV1,
} from '../lib/pipeline/sfx-labelling';

async function main() {
  const obsRoot = path.resolve(process.cwd(), '.calibration-temp', 'sfx-eval-labelling', 'observations');
  const outDir = path.resolve(process.cwd(), '.calibration-temp', 'sfx-eval-labelling');
  await mkdir(outDir, { recursive: true });

  // Sidecar manifest: tooling-validation observations are excluded BY
  // CONSTRUCTION from adjudication and frozen labels.
  let toolingManifest: ToolingValidationManifestV1 | null = null;
  try {
    toolingManifest = JSON.parse(
      await readFile(path.join(outDir, 'tooling-validation-manifest.json'), 'utf8'),
    ) as ToolingValidationManifestV1;
  } catch {
    toolingManifest = null;
  }

  let opportunityDirs: string[] = [];
  try {
    opportunityDirs = (await readdir(obsRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    opportunityDirs = [];
  }

  const frozen: Array<Record<string, unknown>> = [];
  let doubleReviewed = 0;
  let disagreement = 0;
  let adjudicated = 0;

  for (const oppId of opportunityDirs.sort()) {
    const dir = path.join(obsRoot, oppId);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    const observations: OpportunityObservationV1[] = [];
    for (const f of files) {
      const raw = JSON.parse(await readFile(path.join(dir, f), 'utf8')) as OpportunityObservationV1;
      observations.push(raw);
    }
    const outcome = adjudicateObservations(observations, toolingManifest);
    if (!outcome) continue;
    if (observations.length >= 2) doubleReviewed += 1;
    if (outcome.consensus === false) disagreement += 1;
    if (outcome.resolved) {
      adjudicated += 1;
      const other = observations.length > 1 ? observations.slice(1).map((o) => o.reviewerId) : [];
      const label = toFrozenOpportunityLabel(outcome, observations[0], other, toolingManifest);
      if (label) frozen.push({ ...label, reviewers: observations.map((o) => o.reviewerId) });
    } else {
      frozen.push({
        opportunityId: oppId,
        status: 'unresolved',
        reviewers: observations.map((o) => o.reviewerId),
        note: 'requires human adjudicated choice',
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    opportunitiesWithObservations: opportunityDirs.length,
    doubleReviewed,
    disagreement,
    adjudicated,
    unresolved: opportunityDirs.length - adjudicated,
    frozen,
  };
  const out = path.join(outDir, 'frozen-labels.json');
  await writeFile(out, JSON.stringify(report, null, 2), 'utf8');
  console.log(`opportunities=${opportunityDirs.length} double=${doubleReviewed} disagreement=${disagreement} adjudicated=${adjudicated} unresolved=${opportunityDirs.length - adjudicated}`);
  console.log(`frozen labels: ${out}`);
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
}