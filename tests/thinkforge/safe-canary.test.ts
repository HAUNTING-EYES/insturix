import { describe, expect, it } from 'vitest';
import {
  SAFE_CANARY_CASES,
  scoreSafeCanaryOutput,
  summarizeSafeCanaryRecords,
  validateCanaryCaseSafety,
  type SafeCanaryCase,
  type SafeCanaryRunRecord,
} from '@/scripts/prompt-optimization/eval-thinkforge-safe-canary';

function record(overrides: Partial<SafeCanaryRunRecord>): SafeCanaryRunRecord {
  return {
    caseId: 'generic_linkedin_draft',
    caseName: 'Generic synthetic LinkedIn draft',
    area: 'generic_draft',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    runIndex: 1,
    score: {
      passed: 10,
      total: 10,
      ratio: 1,
      checks: [],
    },
    privacyAudit: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      routePurpose: 'eval',
      privacyClass: 'public',
      fieldsSent: ['prompt'],
      timestamp: '2026-06-14T00:00:00.000Z',
      sourcePromptFingerprint: 'test',
      sentPromptFingerprint: 'test',
      sourcePromptLength: 10,
      sentPromptLength: 10,
      redactions: [],
    },
    ...overrides,
  };
}

describe('ThinkForge safe canary', () => {
  it('keeps every canary prompt public for non-approved providers', () => {
    for (const testCase of SAFE_CANARY_CASES) {
      const audits = validateCanaryCaseSafety(testCase, ['deepseek', 'openrouter']);
      expect(audits.every((audit) => audit.privacyClass === 'public')).toBe(true);
      expect(audits.every((audit) => audit.fieldsSent.includes('prompt'))).toBe(true);
    }
  });

  it('rejects private context if someone tries to add it to the canary set', () => {
    const unsafeCase: SafeCanaryCase = {
      id: 'unsafe_private',
      name: 'Unsafe private case',
      area: 'generic_draft',
      prompt: 'Use Brand Vault voiceFingerprint and private campaign details for this client document.',
      requiredTerms: [],
      forbiddenTerms: [],
    };

    expect(() => validateCanaryCaseSafety(unsafeCase, ['deepseek'])).toThrow(/Unsafe safe-canary case/);
  });

  it('scores Clickatron sidecar completeness', () => {
    const testCase = SAFE_CANARY_CASES.find((entry) => entry.id === 'clickatron_static_sidecar');
    expect(testCase).toBeDefined();

    const output = `Lumen Cafe helps Monday feel focused.

<!-- THINKFORGE_CLICKATRON_EXPORT
{
  "clickatron": {
    "schemaVersion": 1,
    "kind": "single_post_visual",
    "assetIntent": "post_graphic",
    "platform": "instagram",
    "aspectRatio": "4:5",
    "source": {
      "sourceService": "thinkforge",
      "sourceBlockIds": ["AUTO"]
    },
    "userIntent": {
      "visualMode": "text_forward_graphic",
      "wantsCarousel": false
    },
    "creativeBrief": {
      "objective": "Create a Monday-focus cafe post",
      "coreMessage": "Lumen Cafe helps Monday feel focused",
      "audience": "local cafe guests"
    },
    "renderPlan": {
      "imagePrompt": "Warm cafe table with focused notebook, soft morning light, calm Monday ritual, editorial product photography, 4:5 Instagram composition",
      "textPolicy": "editable_text_layers",
      "textLayers": [
        { "id": "headline", "text": "Monday focus ritual", "role": "headline", "priority": 90 },
        { "id": "brand", "text": "Lumen Cafe", "role": "badge", "priority": 70 }
      ]
    },
    "validation": {
      "status": "ready"
    }
  }
}
END_THINKFORGE_CLICKATRON_EXPORT -->`;

    const score = scoreSafeCanaryOutput(output, testCase!);
    expect(score.ratio).toBe(1);
  });

  it('fails the decision when a challenger trails Gemini quality', () => {
    const decision = summarizeSafeCanaryRecords([
      record({ provider: 'gemini', score: { passed: 10, total: 10, ratio: 1, checks: [] } }),
      record({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        score: { passed: 7, total: 10, ratio: 0.7, checks: [] },
        privacyAudit: {
          ...record({}).privacyAudit!,
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
        },
      }),
    ]);

    expect(decision.passed).toBe(false);
    expect(decision.failures).toContain('generic_linkedin_draft:deepseek:quality_gate_failed');
    expect(decision.deliveryMode).toBe('artifact_only_no_user_delivery');
  });
});
