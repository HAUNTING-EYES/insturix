import { describe, expect, it } from 'vitest';
import {
  evaluateContentProfileCompliance,
  formatContentProfileComplianceViolations,
  resolveContentSignalProfile,
  shouldAutoRepairContentProfileViolations,
} from '@/lib/thinkforge/signals';

function resolveLinkedInAgencyProfile() {
  return resolveContentSignalProfile({
    userPrompt: 'Write a warm LinkedIn post for agency founders about reducing content approval time by 37%. Ask readers to reply.',
    project: {
      projectName: 'Approval Ops',
      platform: 'LinkedIn',
      tone: 'warm expert',
      purpose: 'agency founders',
    },
    retrievedContext: {
      brandDNA: {
        voiceLock: 'warm, expert, plainspoken',
        nicheMap: 'B2B agencies and operators',
        killList: ['game-changing'],
        hookArchetypes: ['contrarian opener'],
        structuralHabits: ['short setup, concrete proof, soft CTA'],
      },
      projectFacts: [],
      globalFacts: [],
      semanticFacts: [],
      interactionPatterns: [],
    },
  });
}

describe('evaluateContentProfileCompliance', () => {
  it('flags generated copy that violates resolved brand, proof, and format constraints', () => {
    const profile = resolveLinkedInAgencyProfile();
    const content = [
      '## [0:00-0:05]',
      'VO: This game-changing workflow helps agency teams move faster.',
      'Scene: Founder checks the dashboard before standup.',
    ].join('\n');

    const result = evaluateContentProfileCompliance(content, profile);
    const violationIds = result.violations.map((violation) => violation.id);

    expect(result.score).toBeLessThan(70);
    expect(violationIds).toContain('profile_forbidden_term');
    expect(violationIds).toContain('profile_missing_metric_proof');
    expect(violationIds).toContain('profile_social_post_contains_script_labels');
    expect(formatContentProfileComplianceViolations(result.violations)[0]).toContain('Signal profile:');
  });

  it('passes publishable copy that follows the resolved profile', () => {
    const profile = resolveLinkedInAgencyProfile();
    const content = [
      'Approval delays rarely look expensive on day one.',
      '',
      "Then a two-day review loop quietly drains 37% of the team's momentum before the post even ships.",
      '',
      'One owner. One approval window. One final pass.',
      '',
      'Reply with "review" if you want the checklist.',
    ].join('\n');

    const result = evaluateContentProfileCompliance(content, profile);

    expect(result.score).toBe(100);
    expect(result.violations).toEqual([]);
  });

  it('auto-repairs only critical profile violations', () => {
    const profile = resolveLinkedInAgencyProfile();
    const warningOnly = evaluateContentProfileCompliance(
      'Approval delays rarely look expensive on day one. Reply if you want the checklist.',
      profile,
    );
    const critical = evaluateContentProfileCompliance(
      'VO: This game-changing workflow helps agency teams move faster.',
      profile,
    );

    expect(warningOnly.violations.map((violation) => violation.id)).toContain('profile_missing_metric_proof');
    expect(warningOnly.violations.every((violation) => violation.severity !== 'critical')).toBe(true);
    expect(shouldAutoRepairContentProfileViolations(warningOnly.violations)).toBe(false);
    expect(critical.violations.some((violation) => violation.severity === 'critical')).toBe(true);
    expect(shouldAutoRepairContentProfileViolations(critical.violations)).toBe(true);
  });

  it('treats explicit proof and audience directives as critical publication requirements', () => {
    const profile = resolveContentSignalProfile({
      userPrompt: 'Write a LinkedIn post for FlowLedger about SOC 2 readiness. Mention that the beta cut evidence-chasing time by 37% across 12 pilot teams. Target CFOs and RevOps leaders.',
      project: { platform: 'LinkedIn', format: 'post' },
    });

    const result = evaluateContentProfileCompliance(
      'FlowLedger cut evidence-chasing by 37%. Finance teams can prepare for audit season with more control.',
      profile,
    );
    const violationIds = result.violations.map((violation) => violation.id);

    expect(violationIds).toContain('profile_missing_required_brief_claim');
    expect(violationIds).toContain('profile_missing_required_audience_anchor');
    expect(shouldAutoRepairContentProfileViolations(result.violations)).toBe(true);
  });
});
