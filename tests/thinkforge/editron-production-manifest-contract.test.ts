import { describe, expect, it } from 'vitest';
import {
  THINKFORGE_EDITRON_PRODUCTION_MANIFEST_MAX_BYTES,
  verifyThinkForgeEditronProductionManifest,
} from '@/lib/thinkforge/export/editron-production-manifest-contract';
import { THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS } from '@/lib/thinkforge/production/output-duration-capability';

function manifest(thinkforgeContext?: Record<string, unknown>) {
  return {
    version: 1,
    sourceService: 'thinkforge',
    sourceSessionId: 'session_1',
    sourceScriptId: 'script_1',
    targetDurationSeconds: 420,
    targetDurationSource: 'request',
    parsedDurationSeconds: 418,
    expectedSceneCount: 12,
    expectedStoryboardImages: 12,
    expectedVideoClips: 15,
    coveragePolicy: 'production-require-all-scenes',
    parser: {
      llmAvailable: true,
      fallbackUsed: false,
      inputLength: 18_000,
      maxInputChars: 24_000,
      source: 'stored-script',
      storedScriptRecovered: false,
      sidecarUsed: true,
      sidecarVersion: 2,
      sidecarSource: 'stored-script',
    },
    ...(thinkforgeContext ? { thinkforgeContext } : {}),
    warnings: [],
  };
}

describe('ThinkForge Editron production manifest contract', () => {
  it('accepts the producer shape and hashes nested objects canonically', () => {
    const left = verifyThinkForgeEditronProductionManifest(manifest({
      sourceLedger: { second: 2, first: 1 },
      version: 1,
    }));
    const right = verifyThinkForgeEditronProductionManifest(manifest({
      version: 1,
      sourceLedger: { first: 1, second: 2 },
    }));

    expect(left.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(left.sha256).toBe(right.sha256);
    expect(left.canonicalJson).toBe(right.canonicalJson);
  });

  it('rejects unsupported versions and Mongo-unsafe nested keys', () => {
    expect(() => verifyThinkForgeEditronProductionManifest({ ...manifest(), version: 2 }))
      .toThrow('Unsupported ThinkForge Editron production-manifest version');
    expect(() => verifyThinkForgeEditronProductionManifest(manifest({ '$where': 'unsafe' })))
      .toThrow('unsafe object key');
  });

  it('rejects contexts above the persisted evidence byte limit', () => {
    const oversized = 'x'.repeat(THINKFORGE_EDITRON_PRODUCTION_MANIFEST_MAX_BYTES + 1);

    expect(() => verifyThinkForgeEditronProductionManifest(manifest({ evidence: oversized })))
      .toThrow('exceeds the byte limit');
  });

  it('shares the video-duration capability with calendar planning', () => {
    expect(verifyThinkForgeEditronProductionManifest({
      ...manifest(),
      targetDurationSeconds: THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS,
      parsedDurationSeconds: THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS,
    }).manifest.targetDurationSeconds).toBe(THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS);

    expect(() => verifyThinkForgeEditronProductionManifest({
      ...manifest(),
      targetDurationSeconds: THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS + 1,
    })).toThrow('Invalid ThinkForge production manifest');
  });
});
