/**
 * S2-L1 PILOT RUNNER — dev probe (SFX-owned).
 *
 * Runs the 11-opportunity pilot with TWO INDEPENDENT reviewer personas using
 * the exact tool contract (buildLabellingCandidateSet -> per-reviewer
 * observation files -> adjudicateObservations -> frozen labels).
 *
 * HONESTY: this runner produces EVIDENCE-BASED PROXY labels from catalog
 * metadata (title/tags/acoustic/semantic/rights). It CANNOT listen to audio.
 * It exists to validate the labelling tooling end-to-end (schema, storage,
 * reviewer independence, adjudication) with real data flow. Real human
 * listening must replace these labels before the frozen ground-truth baseline.
 *
 * Reviewer personas (deterministic, independent decision rules):
 *   reviewer-a "strict": acceptable = role-match AND duration-ok AND
 *     roleAgreement AND no speech/music risk. absurd = speech/music risk or
 *     high-energy role mismatch. unacceptable = remaining role-matching.
 *   reviewer-b "lenient": acceptable = role-match OR topRole==role, duration
 *     <= 1.5x, no speech risk > 0.5. absurd = speech/music risk > 0.5 or
 *     voice/jingle title. unacceptable = high-energy role mismatch.
 *
 * Writes observations to .calibration-temp/sfx-eval-labelling/observations/
 * (same store the dev route writes), then runs adjudication.
 *
 * Run: npx tsx scripts/sfx-s2-pilot-run.ts
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { BUNDLED_SFX_CATALOG } from '../lib/pipeline/sfx-catalog';
import { buildLabellingCandidateSet } from '../lib/pipeline/sfx-labelling';
import { adjudicateObservations, type OpportunityObservationV1 } from '../lib/pipeline/sfx-labelling';

const OBS_ROOT = path.resolve(process.cwd(), '.calibration-temp', 'sfx-eval-labelling', 'observations');

interface PilotOpp {
  opportunityId: string;
  role: string;
  surface?: string;
  note?: string;
}

interface PilotSummaryRow {
  opportunityId: string;
  role: string;
  note: string | undefined;
  reviewerA: {
    acceptable: number;
    absurd: number;
    silenceRequired: boolean;
  };
  reviewerB: {
    acceptable: number;
    absurd: number;
    silenceRequired: boolean;
  };
  consensus: boolean;
  result: string;
}

function entryByAssetId(assetId: string) {
  return BUNDLED_SFX_CATALOG.entries.find((e) => e.assetId === assetId);
}

function speechMusicRisk(assetId: string): number {
  const entry = entryByAssetId(assetId);
  if (!entry?.semanticEvidence) return 0;
  const speech = entry.semanticEvidence.riskScores.find((r) => r.risk === 'speech')?.cosineSimilarity ?? 0;
  const music = entry.semanticEvidence.riskScores.find((r) => r.risk === 'music')?.cosineSimilarity ?? 0;
  return Math.max(speech, music);
}

function titleHasVoice(assetId: string): boolean {
  const title = entryByAssetId(assetId)?.title.toLowerCase() ?? '';
  return /voice|speech|jingle|vocal|sing|talk/.test(title);
}

/** Reviewer A — strict: role-match + duration + roleAgreement + no risk. */
function reviewStrict(opp: PilotOpp, candidates: ReturnType<typeof buildLabellingCandidateSet>['candidates']): OpportunityObservationV1 {
  const maxMs = 3000;
  const acceptable: string[] = [];
  const unacceptable: string[] = [];
  const absurd: string[] = [];
  for (const c of candidates) {
    if (c.isSilence) continue;
    const entry = entryByAssetId(c.assetId);
    const roleAgreement = entry?.semanticEvidence?.roleAgreement ?? false;
    const risk = speechMusicRisk(c.assetId);
    if (risk > 0.3 || titleHasVoice(c.assetId)) { absurd.push(c.assetId); continue; }
    if (c.matchesRole && c.durationMs <= maxMs && roleAgreement) { acceptable.push(c.assetId); continue; }
    if (c.matchesRole) { unacceptable.push(c.assetId); continue; }
    if (entry && entry.energy > 0.7) { absurd.push(c.assetId); continue; }
    unacceptable.push(c.assetId);
  }
  return {
    version: 'editron-sfx-observation-v1',
    opportunityId: opp.opportunityId,
    reviewerId: 'reviewer-a',
    reviewedAt: new Date().toISOString(),
    acceptableAssetIds: acceptable,
    unacceptableAssetIds: unacceptable,
    absurdAssetIds: absurd,
    silenceAcceptable: opp.note?.includes('silence') ? true : true,
    silenceRequired: opp.note?.includes('silence') ? true : false,
    roleState: 'reviewed',
    surfaceState: 'reviewed',
    directionState: 'not-perceptible',
    motionSpeedState: 'not-perceptible',
    materialState: 'not-meaningful',
    contextualNote: `strict proxy: ${opp.note ?? ''}`.trim(),
  };
}

/** Reviewer B — lenient: role OR topRole, 1.5x duration, only high speech risk absurd. */
function reviewLenient(opp: PilotOpp, candidates: ReturnType<typeof buildLabellingCandidateSet>['candidates']): OpportunityObservationV1 {
  const maxMs = 4500;
  const acceptable: string[] = [];
  const unacceptable: string[] = [];
  const absurd: string[] = [];
  for (const c of candidates) {
    if (c.isSilence) continue;
    const entry = entryByAssetId(c.assetId);
    const topRole = entry?.semanticEvidence?.topRole;
    const risk = speechMusicRisk(c.assetId);
    if (risk > 0.5 || titleHasVoice(c.assetId)) { absurd.push(c.assetId); continue; }
    const roleOk = c.matchesRole || topRole === opp.role;
    if (roleOk && c.durationMs <= maxMs) { acceptable.push(c.assetId); continue; }
    if (roleOk) { unacceptable.push(c.assetId); continue; }
    if (entry && entry.energy > 0.8) { absurd.push(c.assetId); continue; }
    unacceptable.push(c.assetId);
  }
  return {
    version: 'editron-sfx-observation-v1',
    opportunityId: opp.opportunityId,
    reviewerId: 'reviewer-b',
    reviewedAt: new Date().toISOString(),
    acceptableAssetIds: acceptable,
    unacceptableAssetIds: unacceptable,
    absurdAssetIds: absurd,
    silenceAcceptable: true,
    silenceRequired: opp.note?.includes('silence') ? true : false,
    roleState: 'reviewed',
    surfaceState: 'reviewed',
    directionState: 'not-perceptible',
    motionSpeedState: 'not-perceptible',
    materialState: 'not-meaningful',
    contextualNote: `lenient proxy: ${opp.note ?? ''}`.trim(),
  };
}

async function main() {
  const pilot = JSON.parse(
    await readFile(path.resolve(process.cwd(), '.calibration-temp', 'sfx-eval-labelling', 'pilot.json'), 'utf8'),
  ) as { opportunityIds: string[] };
  const corpus = JSON.parse(
    await readFile(path.resolve(process.cwd(), 'tests', 'fixtures', 'sfx-eval', 'isolated-opportunities.json'), 'utf8'),
  ) as { isolated: Array<{ context: { opportunityId: string; role: { value?: string }; surface?: { value?: string }; contextualNote?: string } }> };

  const opps: PilotOpp[] = pilot.opportunityIds.map((id) => {
    const item = corpus.isolated.find((i) => i.context.opportunityId === id);
    return {
      opportunityId: id,
      role: item?.context.role.value ?? 'whoosh',
      surface: item?.context.surface?.value,
      note: item?.context.contextualNote,
    };
  });

  const summary: PilotSummaryRow[] = [];
  for (const opp of opps) {
    const set = buildLabellingCandidateSet(opp.opportunityId, opp.role as never, opp.surface, { entries: BUNDLED_SFX_CATALOG.entries });
    const a = reviewStrict(opp, set.candidates);
    const b = reviewLenient(opp, set.candidates);

    const dir = path.join(OBS_ROOT, opp.opportunityId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'reviewer-a.json'), JSON.stringify(a, null, 2), 'utf8');
    await writeFile(path.join(dir, 'reviewer-b.json'), JSON.stringify(b, null, 2), 'utf8');

    const outcome = adjudicateObservations([a, b]);
    summary.push({
      opportunityId: opp.opportunityId,
      role: opp.role,
      note: opp.note,
      reviewerA: { acceptable: a.acceptableAssetIds.length, absurd: a.absurdAssetIds.length, silenceRequired: a.silenceRequired },
      reviewerB: { acceptable: b.acceptableAssetIds.length, absurd: b.absurdAssetIds.length, silenceRequired: b.silenceRequired },
      consensus: outcome?.consensus ?? false,
      result: outcome?.result ?? 'unresolved',
    });
  }

  const double = summary.length;
  const disagreements = summary.filter((s) => s.consensus === false).length;
  const silenceRequired = summary.filter((s) => s.reviewerA.silenceRequired === true).length;
  const absurdLabelled = summary.reduce((sum, s) => sum + Math.max(s.reviewerA.absurd, s.reviewerB.absurd), 0);

  const report = {
    generatedAt: new Date().toISOString(),
    pilotCount: summary.length,
    doubleReviewed: double,
    disagreementCount: disagreements,
    disagreementRate: double > 0 ? disagreements / double : 0,
    silenceRequiredCount: silenceRequired,
    absurdLabelledAssetCount: absurdLabelled,
    rows: summary,
  };
  await writeFile(
    path.resolve(process.cwd(), '.calibration-temp', 'sfx-eval-labelling', 'pilot-results.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );
  console.log(`pilot=${summary.length} double=${double} disagreements=${disagreements} rate=${(report.disagreementRate * 100).toFixed(0)}% silenceRequired=${silenceRequired} absurdAssets=${absurdLabelled}`);
  for (const row of summary) {
    console.log(`  ${String(row.opportunityId).padEnd(28)} ${String(row.role).padEnd(8)} consensus=${String(row.consensus).padEnd(5)} ${row.result}`);
  }
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
}
