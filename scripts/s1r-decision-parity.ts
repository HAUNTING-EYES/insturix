/**
 * S1-R DECISION-PARITY HARNESS (dev probe, read-only; owned SFX paths only).
 *
 * The definitive audit's objection: surface/direction/motionSpeed/material already
 * participate in selectSfxCatalogEntry eligibility/scoring, so populating them CAN
 * change live selection even with unchanged weights. S1-R measures that.
 *
 * Model:
 *   BEFORE = request WITHOUT the evidence fields populated (exactly what pre-S1
 *            callers did — those fields were undefined).
 *   AFTER  = request WITH evidence derived by deriveSfxSelectionEvidence (what
 *            eb791a490 callers now populate).
 *
 * Compares, per corpus item:
 *   - decision (selected|silence|no-match)
 *   - selected assetId (null when no selection)
 *   - eligible candidate set (acceptedAssetIds, ordered)
 *   - rejected candidate set + reasons
 *   - deterministic score ordering (top-N ids in order)
 *
 * Pure + deterministic: uses selectSfxCatalogEntry + the bundled manifest only,
 * so it reproduces exactly the eligibility/scoring path the audit flagged.
 *
 * Run: npx tsx scripts/s1r-decision-parity.ts
 * Output: .calibration-temp/sfx-p0/p0-2026-08-08/s1r-decision-parity.json
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { BUNDLED_SFX_CATALOG, selectSfxCatalogEntry } from '../lib/pipeline/sfx-catalog';
import { deriveSfxSelectionEvidence, type SfxEvidenceSource } from '../lib/pipeline/sfx-selection-evidence';

interface CorpusItem {
  id: string;
  label: string;
  query: string;
  maxDurationSec: number;
  /** The REALIZED evidence source a caller would feed (pre-S1: none). */
  evidence: SfxEvidenceSource | null;
}

const CORPUS: CorpusItem[] = [
  { id: 'wipe-left', label: 'transition wipe-left', query: 'swoosh whoosh transition air sweep', maxDurationSec: 3, evidence: { surface: 'transition', transitionDirectionLabel: 'left', durationMs: 500, receiptKeys: ['atomic-transition-direction:left'] } },
  { id: 'wipe-right', label: 'transition wipe-right', query: 'swoosh whoosh transition air sweep', maxDurationSec: 3, evidence: { surface: 'transition', transitionDirectionLabel: 'right', durationMs: 500, receiptKeys: ['atomic-transition-direction:right'] } },
  { id: 'dissolve', label: 'transition dissolve', query: 'soft whoosh transition gentle', maxDurationSec: 3, evidence: { surface: 'transition', transitionDirectionLabel: 'center', durationMs: 800, receiptKeys: ['transition-surface'] } },
  { id: 'whip-pan', label: 'transition whip-pan', query: 'fast whip pan swoosh quick', maxDurationSec: 3, evidence: { surface: 'transition', motion: { axis: 'x', x: 1, magnitude: 0.6 }, durationMs: 120, receiptKeys: ['whip-pan'] } },
  { id: 'mg-swipe', label: 'MG kinetic directional-swipe', query: 'subtle directional slide whoosh motion graphic', maxDurationSec: 3, evidence: { surface: 'motion-graphic', motion: { axis: 'x', x: -0.5, magnitude: 0.5 }, durationMs: 300, receiptKeys: ['mg-kinetic-event:directional-swipe'] } },
  { id: 'mg-count-settle', label: 'MG static count-settle-tick', query: 'subtle clean stat settle ding tick', maxDurationSec: 3, evidence: { surface: 'motion-graphic', durationMs: 250, receiptKeys: ['mg-kinetic-event:count-settle-tick'] } },
  { id: 'mg-static-crop', label: 'MG static crop (no motion)', query: 'subtle clean stat settle ding tick', maxDurationSec: 3, evidence: { surface: 'motion-graphic' } },
  { id: 'impact', label: 'impact', query: 'impact hit punch thud', maxDurationSec: 3, evidence: { surface: 'transition', durationMs: 400, receiptKeys: ['impact'] } },
  { id: 'tick', label: 'UI tick', query: 'digital glitch tick ui click', maxDurationSec: 3, evidence: { surface: 'ui', durationMs: 120, receiptKeys: ['ui-tick'] } },
  { id: 'ambience', label: 'ambience/foley bed', query: 'ambience ocean waves calm scene', maxDurationSec: 8, evidence: { surface: 'scene', durationMs: 3000, material: 'environmental', receiptKeys: ['scene-ambience'] } },
  { id: 'foley', label: 'foley rustle', query: 'paper rustle handling foley', maxDurationSec: 3, evidence: { surface: 'scene', durationMs: 600, material: 'paper', receiptKeys: ['foley'] } },
];

interface DecisionSnapshot {
  decision: string;
  selectedAssetId: string | null;
  acceptedAssetIds: string[];
  rejected: Array<{ assetId: string; reasons: string[] }>;
  orderedTop: string[];
}

interface DecisionParityRow {
  id: string;
  label: string;
  requestedEvidence: unknown;
  before: DecisionSnapshot;
  after: DecisionSnapshot;
  selectionChanged: boolean;
  why: string;
  shadowSelectionEquivalent: boolean;
}

function snapshot(assetId: string | null, report: Awaited<ReturnType<typeof selectSfxCatalogEntry>>['report']): DecisionSnapshot {
  return {
    decision: report.decision,
    selectedAssetId: assetId,
    acceptedAssetIds: report.candidates.filter((c) => c.accepted).map((c) => c.assetId),
    rejected: report.candidates.filter((c) => !c.accepted).map((c) => ({ assetId: c.assetId, reasons: c.reasons })),
    orderedTop: report.candidates.map((c) => c.assetId),
  };
}

async function main() {
  const rows: DecisionParityRow[] = [];
  let changes = 0;
  let shadowBreaks = 0;
  for (const item of CORPUS) {
    // BEFORE: evidence fields absent (pre-S1 caller behavior).
    const beforeRequest = {
      query: item.query,
      maxDurationSec: item.maxDurationSec,
    };
    // AFTER: evidence derived + fields populated (eb791a490 caller behavior).
    const evidence = item.evidence ? deriveSfxSelectionEvidence(item.evidence) : null;
    const afterRequest = {
      query: item.query,
      maxDurationSec: item.maxDurationSec,
      ...(evidence && {
        surface: evidence.surface,
        direction: evidence.direction,
        motionSpeed: evidence.motionSpeed,
        material: evidence.material,
        evidence,
      }),
    };
    // SHADOW: evidence reaches the REPORT only (request.evidence), never the
    // live scored fields (surface/direction/motionSpeed/material stay absent).
    const shadowRequest = {
      query: item.query,
      maxDurationSec: item.maxDurationSec,
      ...(evidence && { evidence }),
    };

    const beforeSel = selectSfxCatalogEntry(BUNDLED_SFX_CATALOG, beforeRequest);
    const afterSel = selectSfxCatalogEntry(BUNDLED_SFX_CATALOG, afterRequest);
    const shadowSel = selectSfxCatalogEntry(BUNDLED_SFX_CATALOG, shadowRequest);
    const before = snapshot(beforeSel.entry?.assetId ?? null, beforeSel.report);
    const after = snapshot(afterSel.entry?.assetId ?? null, afterSel.report);
    const shadow = snapshot(shadowSel.entry?.assetId ?? null, shadowSel.report);

    const changed = JSON.stringify(before) !== JSON.stringify(after);
    const shadowEquivalent = JSON.stringify(before) === JSON.stringify(shadow);
    if (changed) changes += 1;
    if (!shadowEquivalent) shadowBreaks += 1;

    rows.push({
      id: item.id,
      label: item.label,
      requestedEvidence: afterRequest.evidence ?? null,
      before,
      after,
      selectionChanged: changed,
      why: changed ? describeDelta(before, after) : 'identical',
      shadowSelectionEquivalent: shadowEquivalent,
    });
  }

  const parity = {
    baseline: {
      preS1Sha: process.env.S1R_PRE_S1_SHA ?? '15c40951',
      s1CandidateSha: process.env.S1R_S1_SHA ?? 'eb791a490',
      headSha: process.env.S1R_HEAD_SHA ?? 'e463e026',
    },
    model: {
      before: 'request evidence fields ABSENT (pre-S1 caller behavior)',
      after: 'request evidence fields POPULATED from deriveSfxSelectionEvidence (eb791a490)',
      shadow: 'evidence in request.evidence ONLY (report) - scored fields absent',
      compared: ['decision', 'selectedAssetId', 'acceptedAssetIds', 'rejected+reasons', 'orderedTop'],
    },
    corpusCount: CORPUS.length,
    changedCount: changes,
    shadowEquivalentCount: CORPUS.length - shadowBreaks,
    verdict: changes === 0 ? 'PASS — selection-equivalent' : 'NEEDS-SHADOW-FOLLOWUP — decisions changed',
    shadowVerdict: shadowBreaks === 0 ? 'SHADOW-REPORT-ONLY IS SELECTION-EQUIVALENT' : 'shadow still differs',
    rows,
  };

  const outPath = path.resolve(process.cwd(), '.calibration-temp', 'sfx-p0', 'p0-2026-08-08', 's1r-decision-parity.json');
  await writeFile(outPath, JSON.stringify(parity, null, 2), 'utf8');
  console.log(`corpus=${CORPUS.length} changed=${changes}`);
  for (const row of rows) {
    console.log(`  ${String(row.id).padEnd(16)} changed=${String(row.selectionChanged).padEnd(5)} shadowEquiv=${String(row.shadowSelectionEquivalent).padEnd(5)} decision=${row.after.decision} selected=${row.after.selectedAssetId ?? '-'}`);
  }
  console.log(`verdict: ${parity.verdict}`);
  console.log(`shadow verdict: ${parity.shadowVerdict}`);
  console.log(`output: ${outPath}`);
}

function describeDelta(before: DecisionSnapshot, after: DecisionSnapshot): string {
  const parts: string[] = [];
  if (before.selectedAssetId !== after.selectedAssetId) parts.push(`selected ${before.selectedAssetId ?? '∅'} → ${after.selectedAssetId ?? '∅'}`);
  if (before.decision !== after.decision) parts.push(`decision ${before.decision} → ${after.decision}`);
  if (JSON.stringify(before.acceptedAssetIds) !== JSON.stringify(after.acceptedAssetIds)) parts.push(`accepted set ${before.acceptedAssetIds.length} → ${after.acceptedAssetIds.length} items`);
  if (JSON.stringify(before.orderedTop) !== JSON.stringify(after.orderedTop)) parts.push('ordering changed');
  return parts.join('; ') || 'set-level change';
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
