/**
 * S2 frozen pre-tuning baseline — dev probe (SFX-owned).
 *
 * Runs computeS2Baseline over the seeded corpus using the SHIPPED selector
 * (searchAndDownloadSFX, S1-R report-only shadow => identical to pre-S1).
 * Labels are still unlabelled, so aggregate key rates are null/unavailable
 * until human review — but decision inventory (decision/role/surface counts,
 * per-opportunity rows) is frozen NOW as the pre-tuning baseline.
 *
 * Run: npx tsx scripts/sfx-s2-baseline.ts
 * Output: .calibration-temp/sfx-p0/p0-2026-08-08/s2-baseline-pretuning.json
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { computeS2Baseline } from '../lib/pipeline/sfx-s2-baseline';
import { BUNDLED_SFX_CATALOG } from '../lib/pipeline/sfx-catalog';
import { searchAndDownloadSFX } from '../lib/pipeline/sfx-library-service';

const NO_SEMANTICS = { retrieveCatalogSemantics: async () => undefined };

async function main() {
  const isolated = JSON.parse(
    await readFile(path.resolve(process.cwd(), 'tests', 'fixtures', 'sfx-eval', 'isolated-opportunities.json'), 'utf8'),
  );
  const corpus = isolated; // version + isolated + sequences shape

  const report = await computeS2Baseline(
    corpus,
    async (_id, query, maxDurationSec) => {
      let catalog: { selectedAssetId?: string; decision?: string } | undefined;
      await searchAndDownloadSFX(
        query, 's2-baseline-probe', maxDurationSec, undefined,
        (r) => { catalog = r.catalog; },
        BUNDLED_SFX_CATALOG, NO_SEMANTICS,
      );
      const decision = (catalog?.decision ?? 'no-match') as 'selected' | 'silence' | 'no-match';
      return { decision, selectedAssetId: catalog?.selectedAssetId ?? null };
    },
  );

  const outDir = path.resolve(process.cwd(), '.calibration-temp', 'sfx-p0', 'p0-2026-08-08');
  const outPath = path.join(outDir, 's2-baseline-pretuning.json');
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`corpusSize=${report.corpusSize} labelled=${report.labelledCount}`);
  console.log(`decisions=${JSON.stringify(report.aggregate.decisionCounts)}`);
  console.log(`roles=${JSON.stringify(report.aggregate.roleCounts)}`);
  console.log(`surfaces=${JSON.stringify(report.aggregate.surfaceCounts)}`);
  console.log(`recallAt1=${report.aggregate.recallAt1} absurdRate=${report.aggregate.absurdRate} silenceRetention=${report.aggregate.silenceRetention} unwantedSilence=${report.aggregate.unwantedSilenceRate}`);
  console.log(`output: ${outPath}`);
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
}