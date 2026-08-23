import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildSaasReferenceAnalysisCacheKey,
  buildSaasReferenceAnalysisRedisKey,
  readSaasReferenceAnalysisCache,
  writeSaasReferenceAnalysisCache,
  type SaasReferenceAnalysisCacheStore,
} from '../../lib/editron/reference-video/saas-reference-analysis-cache';
import type {
  SaasGateDecision,
  SaasReferenceGate,
  SaasReferenceStyleAnalysis,
} from '../../lib/editron/reference-video/saas-reference-video-analyzer';

describe('SaaS reference analysis cache', () => {
  it('builds stable context-aware keys without signed URL inputs', () => {
    const base = {
      referenceAssetId: 'asset_ref_123',
      durationSec: 180,
      sourceFingerprint: 'asset_ref_123|r2-key|120',
      script: 'Show the reporting workflow.',
      brandContext: 'Quiet B2B analytics brand.',
    };

    const key = buildSaasReferenceAnalysisCacheKey(base);

    expect(key).toBe(buildSaasReferenceAnalysisCacheKey(base));
    expect(key).toContain('saas-reference-v1:result:');
    expect(buildSaasReferenceAnalysisRedisKey(key)).toBe(`editron:saas-reference-analysis:${key}`);
    expect(buildSaasReferenceAnalysisCacheKey({ ...base, script: 'Different script' })).not.toBe(key);
    expect(buildSaasReferenceAnalysisCacheKey({ ...base, sourceFingerprint: 'new-fingerprint' })).not.toBe(key);
  });

  it('stores accepted analysis and ignores entries inside the expiry guard window', async () => {
    const store = new MemoryCacheStore();
    const cacheKey = buildSaasReferenceAnalysisCacheKey({
      referenceAssetId: 'asset_ref_accepted',
      durationSec: 95,
      sourceFingerprint: 'fingerprint-a',
    });

    const written = await writeSaasReferenceAnalysisCache({
      status: 'accepted',
      cacheKey,
      analyzerCacheKey: 'saas-reference-v1:analysis:abc',
      referenceAssetId: 'asset_ref_accepted',
      sourceFingerprint: 'fingerprint-a',
      gateModel: 'glm-4.6v-flashx',
      analysisModel: 'glm-4.6v',
      gate: gatePayload(),
      gateDecision: gateDecisionPayload(),
      analysis: analysisPayload(),
      evaluationWindowSec: 95,
      model: 'glm-4.6v',
    }, { store, nowMs: 1_000, ttlSeconds: 120 });

    expect(written).toMatchObject({
      provider: 'glm-saas-reference',
      status: 'accepted',
      cacheKey,
      expiresAt: '1970-01-01T00:02:01.000Z',
    });
    await expect(readSaasReferenceAnalysisCache(cacheKey, { store, nowMs: 1_000 }))
      .resolves.toMatchObject({ status: 'accepted', analysis: { summary: 'Cached SaaS analysis.' } });
    await expect(readSaasReferenceAnalysisCache(cacheKey, { store, nowMs: 61_000 }))
      .resolves.toBeNull();
  });

  it('stores rejected SaaS gate decisions without caching transient GLM failures', async () => {
    const store = new MemoryCacheStore();
    const cacheKey = buildSaasReferenceAnalysisCacheKey({
      referenceAssetId: 'asset_ref_rejected',
      durationSec: 45,
      sourceFingerprint: 'fingerprint-r',
    });

    await writeSaasReferenceAnalysisCache({
      status: 'rejected',
      reason: 'not_a_saas_reference_video',
      diagnostics: ['Only 2/5 frames passed; required all frames.'],
      cacheKey,
      analyzerCacheKey: 'saas-reference-v1:gate:def',
      referenceAssetId: 'asset_ref_rejected',
      sourceFingerprint: 'fingerprint-r',
      gateModel: 'glm-4.6v-flashx',
      analysisModel: 'glm-4.6v',
      gate: { ...gatePayload(), isSaasVideo: false, confidence: 0.4, category: 'non_saas' },
      gateDecision: { ...gateDecisionPayload(), accepted: false, passedFrameCount: 2 },
    }, { store, nowMs: 10_000, ttlSeconds: 180 });

    await expect(readSaasReferenceAnalysisCache(cacheKey, { store, nowMs: 10_000 }))
      .resolves.toMatchObject({
        status: 'rejected',
        reason: 'not_a_saas_reference_video',
        diagnostics: ['Only 2/5 frames passed; required all frames.'],
      });
  });

  it('wires cache read before frame sampling in the video-analysis worker', () => {
    const workerSource = readFileSync(
      join(process.cwd(), 'app/api/internal/workers/video-analysis/route.ts'),
      'utf8',
    );

    const cacheReadIndex = workerSource.indexOf('readSaasReferenceAnalysisCache(referenceAnalysisCacheKey)');
    const frameSampleIndex = workerSource.indexOf('sampleReferenceVideoFrames({');
    const canonicalIdIndex = workerSource.indexOf('referenceId = canonical.referenceAssetId;');

    expect(workerSource).toContain("import('@/lib/editron/reference-video/saas-reference-analysis-cache')");
    expect(workerSource).toContain('resolveReferenceVideoSource');
    expect(workerSource).toContain('refUrl = canonical.videoUrl;');
    expect(workerSource).not.toContain('using URL fallback');
    expect(workerSource).toContain('sourceFingerprint: referenceSourceFingerprint');
    expect(workerSource).toContain("cacheStatus: 'hit'");
    expect(canonicalIdIndex).toBeGreaterThan(0);
    expect(cacheReadIndex).toBeGreaterThan(0);
    expect(cacheReadIndex).toBeGreaterThan(canonicalIdIndex);
    expect(frameSampleIndex).toBeGreaterThan(cacheReadIndex);
  });
});

class MemoryCacheStore implements SaasReferenceAnalysisCacheStore {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

function gateDecisionPayload(): SaasGateDecision {
  return {
    accepted: true,
    threshold: 0.82,
    requireAllFrames: true,
    passedFrameCount: 5,
    totalFrameCount: 5,
  };
}

function gatePayload(): SaasReferenceGate {
  return {
    isSaasVideo: true,
    confidence: 0.94,
    category: 'saas_product_demo',
    evidence: ['dashboard UI', 'workflow labels', 'product CTA'],
    rejectionReasons: [],
    sampledFrameVerdicts: [0, 1, 2, 3, 4].map((frameIndex) => ({
      frameIndex,
      isSaasFrame: true,
      confidence: 0.94,
      evidence: ['visible SaaS dashboard UI'],
    })),
  };
}

function analysisPayload(): SaasReferenceStyleAnalysis {
  return {
    summary: 'Cached SaaS analysis.',
    saasCategory: 'saas_product_demo',
    evaluationWindowSec: 95,
    structure: {
      hook: 'Product value prop over UI.',
      demoFlow: ['claim', 'workflow', 'proof'],
      proofMoments: ['dashboard state change'],
      cta: 'Start trial',
    },
    styleSignals: {
      pacing: {
        speed: 'medium',
        cutRhythm: 'Short UI-led beats.',
        attentionPattern: 'Alternates claims and interface evidence.',
      },
      visualLanguage: ['clean app surfaces'],
      uiTreatment: {
        density: 'balanced',
        framing: 'Centered app surfaces.',
        screenshotTreatment: 'Subtle depth.',
      },
      typography: {
        weight: 'bold',
        hierarchy: 'Large claim and small UI labels.',
        motion: 'Soft fades.',
      },
      color: {
        palette: ['#111111', '#FAFAFA'],
        contrast: 'High contrast.',
        backgroundTreatment: 'Neutral canvas.',
      },
      motion: {
        transitionStyle: 'Clean cuts.',
        cameraMoves: ['slow push'],
        microInteractions: ['UI state changes'],
      },
      brandTransferBoundaries: ['Do not copy exact app layout.'],
    },
    decisionInputs: ['Use as reference evidence only.'],
    risks: [],
  };
}
