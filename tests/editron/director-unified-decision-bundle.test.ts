import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shouldRunPostEdlUtilityScoring } from '../../lib/editron/agent/post-edl-action-policy';

const directorSource = () => readFileSync(
  join(process.cwd(), 'lib/editron/agent/director-agent.ts'),
  'utf8',
);

describe('director unified decision bundle control flow', () => {
  it('keeps Path E and Path D as producers and executes one shared decision bundle', () => {
    const source = directorSource();

    expect(source).toContain('let unifiedDecisionBundle');
    expect(source).toContain('const unifiedDecisionCandidates');
    expect(source).toContain('if (canRunPathD)');
    expect(source).toContain('planUnifiedDecisionBundleFromCandidates(unifiedDecisionCandidates)');
    expect(source).toContain('await executeEDL(');
    expect(source).toContain('unifiedDecisionBundle.edl');
    expect(source).toContain('Unified decision bundle execution COMPLETE');

    expect(source).not.toContain('createUnifiedDecisionBundle({');
    expect(source).not.toContain('planUnifiedDecisionBundle(unifiedDecisionBundle');
    expect(source).not.toContain('mergeSignalDrivenBundle(unifiedDecisionBundle');
    expect(source).not.toContain('if (canRunPathD && !unifiedDecisionBundle)');
    expect(source).not.toContain('executeEDLPathE');
    expect(source).not.toContain('executeEDLPathD');
    expect(source).not.toContain('await executeEDLPathE');
    expect(source).not.toContain('await executeEDLPathD');
  });

  it('refuses raw-timeline overlay decisions when canonical edited timeline is unsafe', () => {
    const source = directorSource();

    expect(source).toContain('Canonical edited timeline unavailable; refusing raw-timeline overlay decisions');
    expect(source).toContain('Unsafe canonical edited timeline');
    expect(source).toContain('requiresSourceMapping');
    expect(source).toContain('isCanonicalDecisionTimeline');
  });

  it('does not let post-EDL utility scoring override a handled unified bundle', () => {
    expect(shouldRunPostEdlUtilityScoring({
      unifiedDecisionBundleExecuted: true,
      hasSpeechCoverage: true,
      utilityEngineEnabled: true,
    })).toEqual({
      run: false,
      reason: 'unified-bundle-already-executed',
    });

    expect(shouldRunPostEdlUtilityScoring({
      unifiedDecisionBundleExecuted: false,
      hasSpeechCoverage: true,
      utilityEngineEnabled: true,
    })).toEqual({
      run: true,
      reason: 'eligible',
    });
  });
});
