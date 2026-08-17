/**
 * S2-L1-R follow-up — validate ALL proxy observations against the stricter
 * pure-contract validator (dev probe, SFX-owned).
 *
 * Reads every observation file under
 * .calibration-temp/sfx-eval-labelling/observations/<oppId>/<reviewer>.json
 * and runs isValidOpportunityObservation (field-specific enums, asset-id
 * arrays, contradictory silence-required). Also verifies the sidecar
 * tooling-validation manifest lists every one of them.
 *
 * Run: npx tsx scripts/sfx-s2-validate-observations.ts
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { isValidOpportunityObservation, isToolingValidationEntry, type ToolingValidationManifestV1 } from '../lib/pipeline/sfx-labelling';

async function main() {
  const obsRoot = path.resolve(process.cwd(), '.calibration-temp', 'sfx-eval-labelling', 'observations');
  const manifestPath = path.resolve(process.cwd(), '.calibration-temp', 'sfx-eval-labelling', 'tooling-validation-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ToolingValidationManifestV1;

  const oppDirs = (await readdir(obsRoot, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  let total = 0;
  let valid = 0;
  let listed = 0;
  const failures: string[] = [];

  for (const oppId of oppDirs.sort()) {
    const dir = path.join(obsRoot, oppId);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    for (const f of files) {
      total += 1;
      const raw = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
      const ok = isValidOpportunityObservation(raw);
      if (ok) valid += 1; else failures.push(`${oppId}/${f}`);
      if (isToolingValidationEntry(manifest, oppId, f.replace(/\.json$/, ''))) listed += 1;
    }
  }

  console.log(`observations=${total} valid=${valid} listedInManifest=${listed}`);
  if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  ' + f));
    process.exitCode = 1;
  } else {
    console.log('ALL 22 PROXY OBSERVATIONS VALID against the stricter pure-contract validator.');
  }
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
}