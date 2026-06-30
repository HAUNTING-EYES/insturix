import {
  DEFAULT_GLM_ANALYSIS_MODEL,
  DEFAULT_GLM_GATE_MODEL,
  getReferenceEvaluationWindowSec,
  SAAS_REFERENCE_RUBRIC_VERSION,
  type SaasGateDecision,
  type SaasReferenceGate,
  type SaasReferenceStyleAnalysis,
} from './saas-reference-video-analyzer';

export const SAAS_REFERENCE_ANALYSIS_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

const REDIS_KEY_PREFIX = 'editron:saas-reference-analysis';
const EXPIRY_SKEW_MS = 60_000;

export interface SaasReferenceAnalysisCacheKeyInput {
  referenceAssetId: string;
  durationSec?: number;
  sourceFingerprint?: string;
  script?: string;
  brandContext?: string;
  gateModel?: string;
  analysisModel?: string;
}

interface CachedSaasReferenceBase {
  provider: 'glm-saas-reference';
  cacheKey: string;
  analyzerCacheKey?: string;
  rubricVersion: string;
  referenceAssetId: string;
  sourceFingerprint?: string;
  gateModel: string;
  analysisModel: string;
  createdAt: string;
  expiresAt: string;
}

export interface CachedAcceptedSaasReferenceAnalysis extends CachedSaasReferenceBase {
  status: 'accepted';
  gate: SaasReferenceGate;
  gateDecision: SaasGateDecision;
  analysis: SaasReferenceStyleAnalysis;
  evaluationWindowSec: number;
  model?: string;
  usage?: unknown;
}

export interface CachedRejectedSaasReferenceAnalysis extends CachedSaasReferenceBase {
  status: 'rejected';
  reason: 'not_a_saas_reference_video';
  diagnostics: string[];
  gate?: SaasReferenceGate;
  gateDecision?: SaasGateDecision;
}

export type CachedSaasReferenceAnalysis =
  | CachedAcceptedSaasReferenceAnalysis
  | CachedRejectedSaasReferenceAnalysis;

export type WritableSaasReferenceAnalysisCacheEntry =
  CachedSaasReferenceAnalysis extends infer Entry
    ? Entry extends CachedSaasReferenceAnalysis
      ? Omit<Entry, 'provider' | 'rubricVersion' | 'createdAt' | 'expiresAt'>
      : never
    : never;

export interface SaasReferenceAnalysisCacheStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options: { ex: number }): Promise<unknown>;
}

export interface SaasReferenceAnalysisCacheOptions {
  store?: SaasReferenceAnalysisCacheStore | null;
  nowMs?: number;
  ttlSeconds?: number;
}

export function buildSaasReferenceAnalysisCacheKey(
  input: SaasReferenceAnalysisCacheKeyInput,
): string {
  const payload = JSON.stringify({
    rubricVersion: SAAS_REFERENCE_RUBRIC_VERSION,
    referenceAssetId: input.referenceAssetId,
    sourceFingerprint: input.sourceFingerprint ?? '',
    durationSec: getReferenceEvaluationWindowSec(input.durationSec),
    script: input.script ?? '',
    brandContext: input.brandContext ?? '',
    gateModel: input.gateModel ?? DEFAULT_GLM_GATE_MODEL,
    analysisModel: input.analysisModel ?? DEFAULT_GLM_ANALYSIS_MODEL,
  });
  return `${SAAS_REFERENCE_RUBRIC_VERSION}:result:${stableHash(payload)}`;
}

export function buildSaasReferenceAnalysisRedisKey(cacheKey: string): string {
  return `${REDIS_KEY_PREFIX}:${cacheKey}`;
}

export async function readSaasReferenceAnalysisCache(
  cacheKey: string,
  options: SaasReferenceAnalysisCacheOptions = {},
): Promise<CachedSaasReferenceAnalysis | null> {
  try {
    const store = options.store ?? await getRedis();
    if (!store) return null;

    const entry = await store.get<CachedSaasReferenceAnalysis>(
      buildSaasReferenceAnalysisRedisKey(cacheKey),
    );
    if (!isUsableEntry(entry, cacheKey, options.nowMs ?? Date.now())) return null;
    return entry;
  } catch (error) {
    console.warn('[SaasReferenceAnalysisCache] Redis read failed:', error);
    return null;
  }
}

export async function writeSaasReferenceAnalysisCache(
  entry: WritableSaasReferenceAnalysisCacheEntry,
  options: SaasReferenceAnalysisCacheOptions = {},
): Promise<CachedSaasReferenceAnalysis | null> {
  try {
    const store = options.store ?? await getRedis();
    if (!store) return null;

    const nowMs = options.nowMs ?? Date.now();
    const ttlSeconds = options.ttlSeconds ?? readCacheTtlSeconds();
    const common = {
      provider: 'glm-saas-reference' as const,
      rubricVersion: SAAS_REFERENCE_RUBRIC_VERSION,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + ttlSeconds * 1000).toISOString(),
    };
    const fullEntry: CachedSaasReferenceAnalysis = entry.status === 'accepted'
      ? { ...entry, ...common }
      : { ...entry, ...common };

    await store.set(buildSaasReferenceAnalysisRedisKey(entry.cacheKey), fullEntry, { ex: ttlSeconds });
    return fullEntry;
  } catch (error) {
    console.warn('[SaasReferenceAnalysisCache] Redis write failed:', error);
    return null;
  }
}

async function getRedis(): Promise<SaasReferenceAnalysisCacheStore | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const { Redis } = await import('@upstash/redis');
  return new Redis({ url, token });
}

function isUsableEntry(
  entry: CachedSaasReferenceAnalysis | null,
  cacheKey: string,
  nowMs: number,
): entry is CachedSaasReferenceAnalysis {
  if (!entry || entry.provider !== 'glm-saas-reference') return false;
  if (entry.cacheKey !== cacheKey) return false;
  if (entry.rubricVersion !== SAAS_REFERENCE_RUBRIC_VERSION) return false;
  if (entry.status !== 'accepted' && entry.status !== 'rejected') return false;
  const expiresAtMs = Date.parse(entry.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs + EXPIRY_SKEW_MS;
}

function readCacheTtlSeconds(): number {
  const value = process.env.EDITRON_SAAS_REFERENCE_CACHE_TTL_SECONDS;
  if (!value) return SAAS_REFERENCE_ANALYSIS_CACHE_TTL_SECONDS;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 60
    ? parsed
    : SAAS_REFERENCE_ANALYSIS_CACHE_TTL_SECONDS;
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 33) ^ value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
