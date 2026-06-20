import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createBrandVaultBrowserFallbackFetchFromEnvironment,
  type BrandVaultBrowserRenderEnvironment,
  type BrandVaultBrowserRenderFetch,
} from '../lib/shared/brand-vault-browser-fallback';
import {
  createBrandVaultRefineryJobFromWebsite,
  createInMemoryBrandVaultRefineryStore,
} from '../lib/shared/brand-vault-refinery-api';
import type { FetchWebsiteBrandSnapshotOptions } from '../lib/shared/brand-website-refinery-types';

type OldScanFile = {
  results?: OldScanTarget[];
};

type OldScanTarget = {
  symbol?: string;
  security?: string;
  name?: string;
  website?: string;
  subIndustry?: string;
  expectedBucket?: string;
  quality?: {
    expectedBucket?: string;
  };
};

type ScanTarget = {
  id: string;
  name: string;
  website: string;
  expectedBucket: string;
  sourceFile: string;
  crawlMaxPages: number;
};

type ScanStatus = 'ok' | 'job_failed' | 'exception';
type ScanQualityStatus = 'pass' | 'warn' | 'fail';
type FailureBucket = 'none' | 'blocked' | 'timeout' | 'dns' | 'fetch' | 'server' | 'empty' | 'extraction';

type ScanResult = {
  id: string;
  name: string;
  website: string;
  expectedBucket: string;
  status: ScanQualityStatus;
  scanStatus: ScanStatus;
  failureBucket: FailureBucket;
  industry?: string;
  category?: string;
  audience: string[];
  recurringPhrases: string[];
  primary?: string;
  accent?: string;
  logoCandidateCount: number;
  crawledPageCount: number;
  candidateCount: number;
  evidenceCount: number;
  warnings: string[];
  reasons: string[];
};

type CliOptions = {
  inputs: string[];
  outDir: string;
  limit?: number;
  concurrency: number;
  targetTimeoutMs: number;
};

const DEFAULT_INPUTS = [
  'C:\\tmp\\brand-vault-sp500-tech-job-scan-results-complete.json',
  'C:\\tmp\\brand-vault-india-d2c-b2c-200-job-scan-results.json',
];

const DEFAULT_TARGET_TIMEOUT_MS = 150_000;
const TARGET_TIMEOUT_REASON = 'target timeout';

const GENERIC_INDUSTRIES = new Set(['commerce', 'software', 'analytics', 'creative services', 'health']);
const AUDIENCE_JUNK_PATTERN =
  /\b(?:shop now|add to cart|wishlist|no reviews?|mrp|sale|discount|first three months|local content|online store members?|please use a different browser|please visit the site|working of basic functionalities|nvidia|vera rubin|intel core|new arrivals?|best sellers?|current product information)\b/i;

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const targets = await loadTargets(options.inputs);
  const selected = typeof options.limit === 'number' ? targets.slice(0, options.limit) : targets;
  const generatedAt = new Date().toISOString();
  console.log(`[BrandVaultBroadScan] targets=${selected.length} concurrency=${options.concurrency} targetTimeoutMs=${options.targetTimeoutMs}`);

  const results = await runPool(selected, options.concurrency, (target) => scanTargetWithTimeout(target, options.targetTimeoutMs));
  const summary = summarize(results);
  await mkdir(options.outDir, { recursive: true });

  const stamp = generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(options.outDir, `brand-vault-broad-scan-${stamp}.json`);
  const mdPath = path.join(options.outDir, `brand-vault-broad-scan-${stamp}.md`);
  await writeFile(jsonPath, JSON.stringify({ generatedAt, count: results.length, summary, results }, null, 2));
  await writeFile(mdPath, renderMarkdown(generatedAt, summary, results));

  console.log(`[BrandVaultBroadScan] wrote ${jsonPath}`);
  console.log(`[BrandVaultBroadScan] wrote ${mdPath}`);
  console.log(`[BrandVaultBroadScan] pass=${summary.pass} warn=${summary.warn} fail=${summary.fail}`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    inputs: DEFAULT_INPUTS,
    outDir: 'C:\\tmp',
    concurrency: 3,
    targetTimeoutMs: DEFAULT_TARGET_TIMEOUT_MS,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === '--input' && next) {
      options.inputs = next.split(',').map((item) => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--out-dir' && next) {
      options.outDir = next;
      index += 1;
    } else if (arg === '--limit' && next) {
      options.limit = parsePositiveInteger(next, '--limit');
      index += 1;
    } else if (arg === '--concurrency' && next) {
      options.concurrency = parsePositiveInteger(next, '--concurrency');
      index += 1;
    } else if (arg === '--target-timeout-ms' && next) {
      options.targetTimeoutMs = parsePositiveInteger(next, '--target-timeout-ms');
      index += 1;
    }
  }

  return options;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

async function loadTargets(inputs: string[]): Promise<ScanTarget[]> {
  const files = await Promise.all(inputs.map(loadTargetsFromFile));
  const seen = new Set<string>();
  return files.flat().filter((target) => {
    const key = target.website.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadTargetsFromFile(filePath: string): Promise<ScanTarget[]> {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as OldScanFile;
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  const sourceFile = path.basename(filePath);
  const crawlMaxPages = sourceFile.includes('india-d2c') ? 2 : 4;

  return results
    .map((item, index): ScanTarget | null => {
      const website = cleanString(item.website);
      if (!website) return null;
      const name = cleanString(item.security) || cleanString(item.name) || cleanString(item.symbol) || website;
      return {
        id: cleanString(item.symbol) || slug(name) || `target_${index + 1}`,
        name,
        website,
        expectedBucket: normalizeExpectedBucket(item.expectedBucket ?? item.quality?.expectedBucket ?? item.subIndustry),
        sourceFile,
        crawlMaxPages,
      };
    })
    .filter((item): item is ScanTarget => Boolean(item));
}

async function scanTargetWithTimeout(target: ScanTarget, targetTimeoutMs: number): Promise<ScanResult> {
  return withTimeout(
    scanTarget(target),
    targetTimeoutMs,
    () => failedTarget(
      target,
      'exception',
      [`Brand Vault broad scan target exceeded ${targetTimeoutMs}ms and was marked failed.`],
      TARGET_TIMEOUT_REASON,
    ),
  );
}

export async function withTimeout<T>(task: Promise<T>, timeoutMs: number, onTimeout: () => T): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutTask = new Promise<T>((resolve) => {
    timeout = setTimeout(() => resolve(onTimeout()), timeoutMs);
    timeout.unref?.();
  });
  try {
    return await Promise.race([task, timeoutTask]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function scanTarget(target: ScanTarget): Promise<ScanResult> {
  const store = createInMemoryBrandVaultRefineryStore();
  try {
    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'brand_vault_broad_scan',
        body: {
          websiteUrl: target.website,
          brandId: `scan_${slug(target.id)}`,
          companyName: target.name,
          sourceEvidence: [
            {
              kind: 'crawl_seed',
              url: target.website,
              platform: 'website',
              crawl: { maxPages: target.crawlMaxPages, maxDepth: 2 },
            },
          ],
        },
      },
      {
        store,
        clock: () => new Date().toISOString(),
        fetchOptions: createBroadScanFetchOptions(),
      },
    );

    if (!created.body.ok) {
      return failedTarget(target, 'job_failed', [created.body.error.message], created.body.error.message);
    }

    const profile = created.body.record.profile as any;
    const candidates = created.body.candidates;
    const warnings = created.body.job.warnings ?? [];
    const audience = stringArray(profile.identity?.audience?.value);
    const industry = cleanString(profile.identity?.industry?.value) || undefined;
    const category = cleanString(profile.identity?.category?.value) || undefined;
    const recurringPhrases = stringArray(profile.voice?.recurringPhrases?.value);
    const logoCandidateCount = candidates.filter((candidate) => candidate.signalPath === 'assets.logoCandidates').length;
    const crawledPageCount = candidates.filter((candidate) => candidate.sourceField === 'crawl.page').length;
    const reasons = qualityReasons({
      expectedBucket: target.expectedBucket,
      industry,
      category,
      audience,
      primary: cleanString(profile.palette?.primary?.value) || undefined,
      logoCandidateCount,
      crawledPageCount,
    });

    const status: ScanQualityStatus =
      reasons.length === 0 ? 'pass' : reasons.some((reason) => reason.includes('junk') || reason.includes('missing industry')) ? 'fail' : 'warn';

    return {
      id: target.id,
      name: target.name,
      website: target.website,
      expectedBucket: target.expectedBucket,
      status,
      scanStatus: 'ok',
      failureBucket: classifyFailureBucket({
        status,
        scanStatus: 'ok',
        reasons,
        warnings,
        crawledPageCount,
        candidateCount: candidates.length,
      }),
      industry,
      category,
      audience,
      recurringPhrases,
      primary: cleanString(profile.palette?.primary?.value) || undefined,
      accent: cleanString(profile.palette?.accent?.value) || undefined,
      logoCandidateCount,
      crawledPageCount,
      candidateCount: candidates.length,
      evidenceCount: Array.isArray(profile.evidence) ? profile.evidence.length : 0,
      warnings,
      reasons,
    };
  } catch (error) {
    return failedTarget(target, 'exception', [errorMessage(error)], errorMessage(error));
  }
}

export function createBroadScanFetchOptions(
  env: BrandVaultBrowserRenderEnvironment = process.env,
  renderFetchFn: BrandVaultBrowserRenderFetch = fetch,
): FetchWebsiteBrandSnapshotOptions {
  const browserFallbackFetchFn = createBrandVaultBrowserFallbackFetchFromEnvironment(env, renderFetchFn);
  return {
    timeoutMs: 12_000,
    stylesheetTimeoutMs: 4_000,
    maxStylesheetBytes: 120_000,
    maxLinkedStylesheets: 8,
    ...(browserFallbackFetchFn ? { browserFallbackFetchFn } : {}),
  };
}

function failedTarget(
  target: ScanTarget,
  scanStatus: Exclude<ScanStatus, 'ok'>,
  warnings: string[],
  reason: string,
): ScanResult {
  const reasons = [reason, 'missing industry', 'missing audience', 'missing palette', 'missing logo candidates', 'no crawled pages'];
  return {
    id: target.id,
    name: target.name,
    website: target.website,
    expectedBucket: target.expectedBucket,
    status: 'fail',
    scanStatus,
    failureBucket: classifyFailureBucket({
      status: 'fail',
      scanStatus,
      reasons,
      warnings,
      crawledPageCount: 0,
      candidateCount: 0,
    }),
    audience: [],
    recurringPhrases: [],
    logoCandidateCount: 0,
    crawledPageCount: 0,
    candidateCount: 0,
    evidenceCount: 0,
    warnings,
    reasons,
  };
}

export function classifyFailureBucket(args: {
  status: ScanQualityStatus;
  scanStatus: ScanStatus;
  reasons: string[];
  warnings?: string[];
  crawledPageCount?: number;
  candidateCount?: number;
}): FailureBucket {
  if (args.status === 'pass') return 'none';
  const text = [...args.reasons, ...(args.warnings ?? [])].join(' ').toLowerCase();

  if (text.includes(TARGET_TIMEOUT_REASON) || /\b(?:timed out|timeout|exceeded \d+ms)\b/.test(text)) return 'timeout';
  if (/\b(?:enotfound|eai_again|getaddrinfo|dns)\b/.test(text)) return 'dns';
  if (/\b(?:http 5\d\d|server error|internal server error|bad gateway|service unavailable|gateway timeout)\b/.test(text)) return 'server';
  if (
    /\b(?:blocked|challenge|captcha|access denied|forbidden|rate limit|rate-limited|security checkpoint|verifying your browser|bot protection|http_blocked)\b/.test(
      text,
    ) ||
    /\bhttp (?:401|402|403|406|409|418|429|451)\b/.test(text)
  ) {
    return 'blocked';
  }
  if (/\b(?:fetch failed|aborted|network error|connection refused|econnreset|etimedout)\b/.test(text)) return 'fetch';
  if (args.scanStatus !== 'ok') return 'fetch';
  if ((args.candidateCount ?? 0) === 0 || ((args.crawledPageCount ?? 0) === 0 && text.includes('no crawled pages'))) return 'empty';
  return 'extraction';
}

function qualityReasons(args: {
  expectedBucket: string;
  industry?: string;
  category?: string;
  audience: string[];
  primary?: string;
  logoCandidateCount: number;
  crawledPageCount: number;
}): string[] {
  const reasons: string[] = [];
  if (!args.industry) reasons.push('missing industry');
  if (args.industry && GENERIC_INDUSTRIES.has(args.industry.toLowerCase()) && !bucketMatches(args.expectedBucket, args.industry, args.category)) {
    reasons.push(`generic industry: ${args.industry}`);
  }
  if (args.expectedBucket !== 'unknown' && !bucketMatches(args.expectedBucket, args.industry, args.category)) {
    reasons.push(`domain mismatch vs ${args.expectedBucket}`);
  }
  if (args.audience.length === 0) reasons.push('missing audience');
  const audienceJunk = args.audience.filter((item) => AUDIENCE_JUNK_PATTERN.test(item));
  if (audienceJunk.length > 0) reasons.push(`audience junk: ${audienceJunk.join('; ')}`);
  if (!args.primary) reasons.push('missing palette');
  if (args.logoCandidateCount === 0) reasons.push('missing logo candidates');
  if (args.crawledPageCount === 0) reasons.push('no crawled pages');
  return reasons;
}

function bucketMatches(expected: string, industry?: string, category?: string): boolean {
  if (expected === 'unknown') return true;
  const values = [industry, category].map((value) => normalizeExpectedBucket(value)).filter(Boolean);
  return values.some((value) => {
    if (value === expected) return true;
    if (expected === 'software' && ['product management software', 'content production software', 'b2b analytics', 'cloud/data infrastructure', 'cybersecurity'].includes(value)) return true;
    if (expected === 'it services' && ['cloud/data infrastructure', 'cybersecurity'].includes(value)) return true;
    if (expected === 'semiconductor' && value === 'semiconductors') return true;
    if (expected === 'hardware/electronics' && ['electronics/appliances', 'networking/communications equipment'].includes(value)) return true;
    if (expected === 'beauty/personal care' && value === 'health') return true;
    if (expected === 'marketplace/retail' && value === 'commerce') return true;
    if (expected === 'food/beverage' && value === 'specialty coffee') return true;
    return false;
  });
}

function normalizeExpectedBucket(value: unknown): string {
  const raw = cleanString(value).toLowerCase();
  if (!raw) return 'unknown';
  if (/semiconductor/.test(raw)) return 'semiconductor';
  if (/hardware|storage|peripherals|electronic|equipment|instruments|manufacturing services/.test(raw)) return 'hardware/electronics';
  if (/communications equipment|networking/.test(raw)) return 'networking/communications equipment';
  if (/consulting|it services|distributors|internet services|infrastructure/.test(raw)) return 'it services';
  if (/application software|systems software|software/.test(raw)) return 'software';
  return raw;
}

function summarize(results: ScanResult[]): Record<string, number> {
  const summary: Record<string, number> = { pass: 0, warn: 0, fail: 0 };
  for (const result of results) {
    summary[result.status] += 1;
    if (result.failureBucket !== 'none') {
      summary[`bucket:${result.failureBucket}`] = (summary[`bucket:${result.failureBucket}`] ?? 0) + 1;
    }
    for (const reason of result.reasons) {
      summary[`reason:${reason}`] = (summary[`reason:${reason}`] ?? 0) + 1;
    }
  }
  return summary;
}

function renderMarkdown(generatedAt: string, summary: Record<string, number>, results: ScanResult[]): string {
  const bucketRows = Object.entries(summary)
    .filter(([key]) => key.startsWith('bucket:'))
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `- ${key.replace(/^bucket:/, '')}: ${value}`)
    .join('\n');
  const reasonRows = Object.entries(summary)
    .filter(([key]) => key.startsWith('reason:'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([key, value]) => `- ${key.replace(/^reason:/, '')}: ${value}`)
    .join('\n');

  const rows = results
    .map((result) =>
      `| ${escapeMd(result.name)} | ${escapeMd(result.expectedBucket)} | ${escapeMd(result.website)} | ${result.status} | ${result.failureBucket} | ${escapeMd(result.industry ?? '')} | ${escapeMd(result.category ?? '')} | ${result.crawledPageCount} | ${result.logoCandidateCount} | ${escapeMd(result.audience.slice(0, 3).join(', '))} | ${escapeMd(result.reasons.join('; ') || 'none')} |`,
    )
    .join('\n');

  return [
    '# Brand Vault Broad Scan',
    '',
    `Generated: ${generatedAt}`,
    `Scanned: ${results.length}`,
    `Pass: ${summary.pass}`,
    `Warn: ${summary.warn}`,
    `Fail: ${summary.fail}`,
    '',
    '## Failure Buckets',
    bucketRows || 'none',
    '',
    '## Failure Points',
    reasonRows || 'none',
    '',
    '## Results',
    '| Brand | Expected bucket | Website | Status | Bucket | Industry | Category | Crawled pages | Logo candidates | Audience sample | Reasons |',
    '|---|---|---|---|---|---|---|---:|---:|---|---|',
    rows,
    '',
  ].join('\n');
}

async function runPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const item = items[currentIndex];
      if (typeof item === 'undefined') continue;
      results[currentIndex] = await worker(item);
      const result = results[currentIndex] as ScanResult;
      if (result?.name) console.log(`[BrandVaultBroadScan] ${currentIndex + 1}/${items.length} ${result.status} ${result.name}`);
    }
  });
  await Promise.all(runners);
  return results;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(cleanString).filter(Boolean) : [];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function escapeMd(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (isDirectCliRun()) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

function isDirectCliRun(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href);
}
