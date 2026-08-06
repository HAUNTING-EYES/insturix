import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

import {
  BUNDLED_SFX_CATALOG,
  selectSfxCatalogEntry,
  type SfxCatalogSelection,
} from '../lib/pipeline/sfx-catalog';
import {
  retrieveConfiguredSfxCatalogSemantics,
  type SfxCatalogSemanticRetrieval,
} from '../lib/pipeline/sfx-catalog-semantic-client';
import { searchAndDownloadSFX } from '../lib/pipeline/sfx-library-service';

const AUDIT_VERSION = 'editron-sfx-semantic-rollout-audit-v1' as const;
const DEFAULT_TIMEOUT_MS = 10_000;
const QUERIES = [
  'subtle interface confirmation tick',
  'bright glass count settle tick',
  'soft keyboard typing foley',
  'city traffic environmental ambience',
  'paper rustle handling foley',
  'short warm logo resolution sting',
] as const;

interface SelectionSummary {
  assetId: string | null;
  title: string | null;
  eventRoles: string[];
  tags: string[];
  score: number | null;
  semanticQuerySimilarity: number | null;
}

interface QueryAudit {
  query: string;
  elapsedMs: number;
  deterministic: SelectionSummary;
  semantic: SelectionSummary;
  changedSelection: boolean;
  indexedAssetCount: number;
  candidateCount: number;
  releaseReceiptDigestSha256: string;
  promotedManifestDigestSha256: string;
}

export async function runSfxSemanticRolloutAudit(): Promise<{
  receiptPath: string;
  receipt: Record<string, unknown>;
}> {
  const generatedAt = new Date().toISOString();
  const configuredTimeoutMs = parseTimeoutMs();
  const semanticEntryCount = BUNDLED_SFX_CATALOG.entries.filter(
    entry => Boolean(entry.semanticEvidence),
  ).length;
  const queryAudits: QueryAudit[] = [];

  for (const query of QUERIES) {
    const deterministic = selectSfxCatalogEntry(BUNDLED_SFX_CATALOG, { query });
    const startedAt = performance.now();
    const retrieval = await retrieveConfiguredSfxCatalogSemantics(
      query,
      BUNDLED_SFX_CATALOG,
    );
    const elapsedMs = round1(performance.now() - startedAt);
    if (!retrieval) {
      throw new Error('Semantic retrieval is not configured for the rollout audit');
    }
    const semantic = selectSfxCatalogEntry(BUNDLED_SFX_CATALOG, {
      query,
      semanticSimilarityByAssetId: retrieval.similarityByAssetId,
    });
    queryAudits.push(buildQueryAudit(
      query,
      elapsedMs,
      deterministic,
      semantic,
      retrieval,
    ));
  }

  const outage = await runForcedOutageProbe();
  const digests = new Set(queryAudits.map(item =>
    `${item.releaseReceiptDigestSha256}:${item.promotedManifestDigestSha256}`,
  ));
  const releaseBindingPassed = digests.size === 1
    && queryAudits.every(item => item.indexedAssetCount === semanticEntryCount);
  const latencyPassed = queryAudits.every(
    item => item.elapsedMs < configuredTimeoutMs,
  );
  const reliabilityPassed = latencyPassed && outage.ordinaryEditSurvives;
  const gateDecision = releaseBindingPassed && reliabilityPassed
    ? 'eligible-for-human-quality-review'
    : 'disable-semantic-retrieval';
  const receipt = {
    version: AUDIT_VERSION,
    generatedAt,
    catalog: {
      entryCount: BUNDLED_SFX_CATALOG.entries.length,
      semanticEntryCount,
    },
    liveClient: {
      configuredTimeoutMs,
      firstCallWasIdleProbe:
        process.env.SFX_SEMANTIC_AUDIT_FIRST_CALL_IDLE === '1',
      releaseBindingPassed,
      threeConsecutiveCallsWithinTimeout: queryAudits
        .slice(0, 3)
        .every(item => item.elapsedMs < configuredTimeoutMs),
      allCallsWithinTimeout: latencyPassed,
      calls: queryAudits,
    },
    forcedOutage: outage,
    zeroCredit: {
      paidGenerationCalls: 0,
      providerApiCalls: 0,
      catalogQueriesOnly: true,
    },
    gates: {
      releaseBindingPassed,
      latencyPassed,
      outageIsolationPassed: outage.ordinaryEditSurvives,
      reliabilityPassed,
      gateDecision,
    },
  };
  const outputDirectory = path.resolve(
    process.cwd(),
    '.calibration-temp',
    'sfx-semantic-rollout',
    generatedAt.replace(/[:.]/g, '-'),
  );
  await mkdir(outputDirectory, { recursive: true });
  const receiptPath = path.join(outputDirectory, 'receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { receiptPath, receipt };
}

function buildQueryAudit(
  query: string,
  elapsedMs: number,
  deterministic: SfxCatalogSelection,
  semantic: SfxCatalogSelection,
  retrieval: SfxCatalogSemanticRetrieval,
): QueryAudit {
  return {
    query,
    elapsedMs,
    deterministic: summarizeSelection(deterministic),
    semantic: summarizeSelection(semantic),
    changedSelection:
      deterministic.entry?.assetId !== semantic.entry?.assetId,
    indexedAssetCount: retrieval.report.indexedAssetCount,
    candidateCount: retrieval.report.candidates.length,
    releaseReceiptDigestSha256:
      retrieval.report.releaseReceiptDigestSha256,
    promotedManifestDigestSha256:
      retrieval.report.promotedManifestDigestSha256,
  };
}

function summarizeSelection(selection: SfxCatalogSelection): SelectionSummary {
  const entry = selection.entry;
  const selectedReport = selection.report.candidates.find(
    candidate => candidate.assetId === entry?.assetId,
  );
  return {
    assetId: entry?.assetId ?? null,
    title: entry?.title ?? null,
    eventRoles: entry?.eventRoles ?? [],
    tags: entry?.tags ?? [],
    score: selectedReport?.score ?? null,
    semanticQuerySimilarity:
      selectedReport?.semanticQuerySimilarity ?? null,
  };
}

async function runForcedOutageProbe(): Promise<{
  ordinaryEditSurvives: boolean;
  rejectedBeforeDeterministicSelection: boolean;
  errorName: string | null;
  errorMessage: string | null;
}> {
  const forcedFailure = new Error('forced-semantic-retrieval-outage');
  try {
    await searchAndDownloadSFX(
      'subtle interface confirmation tick',
      'semantic-rollout-audit',
      2,
      undefined,
      undefined,
      BUNDLED_SFX_CATALOG,
      {
        retrieveCatalogSemantics: async () => {
          throw forcedFailure;
        },
      },
    );
    return {
      ordinaryEditSurvives: true,
      rejectedBeforeDeterministicSelection: false,
      errorName: null,
      errorMessage: null,
    };
  } catch (error) {
    return {
      ordinaryEditSurvives: false,
      rejectedBeforeDeterministicSelection: error === forcedFailure,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseTimeoutMs(): number {
  const raw = process.env.SFX_SEMANTIC_RETRIEVAL_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('SFX_SEMANTIC_RETRIEVAL_TIMEOUT_MS must be a positive integer');
  }
  return value;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

async function main(): Promise<void> {
  const { receiptPath, receipt } = await runSfxSemanticRolloutAudit();
  console.log(JSON.stringify({ receiptPath, ...receipt }, null, 2));
}

const invokedUrl = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
