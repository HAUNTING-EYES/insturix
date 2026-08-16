import { describe, expect, it } from 'vitest';
import {
  THINKFORGE_EDITORIAL_PLAN_VERSION,
  ThinkForgeEditorialPlanError,
  buildThinkForgeEditorialPlan,
} from '@/lib/thinkforge/agents/editorial-plan';
import { buildPostEditorialPlan } from '@/lib/thinkforge/agents/post-editorial-plan';
import { buildScriptEditorialPlan } from '@/lib/thinkforge/agents/script-editorial-plan';
import {
  getWritingKnowledgeIdentity,
  selectTechniques,
} from '@/lib/thinkforge/data/writing-graph-query';
import {
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import { resolveContentSignalProfile } from '@/lib/thinkforge/signals/content-signal-resolver';
import type { ThinkForgeContentSignalProfile } from '@/lib/thinkforge/signals';

const SOURCE_LINES = [expect.any(Number), expect.any(Number)];

describe('ThinkForge editorial doctrine provenance', () => {
  it('retains source lines on every selected graph result', () => {
    const techniques = selectTechniques({
      logos_load: 0.9,
      pathos_load: 0.2,
      ethos_load: 0.6,
      audience_awareness: 'solution_aware',
      pacing_velocity: 0.5,
    }, 'structure', 10);

    expect(techniques.length).toBeGreaterThan(0);
    expect(techniques.every((technique) => (
      Number.isInteger(technique.sourceLines[0])
      && Number.isInteger(technique.sourceLines[1])
      && technique.sourceLines[0] <= technique.sourceLines[1]
    ))).toBe(true);
    expect(getWritingKnowledgeIdentity()).toMatchObject({
      version: expect.any(String),
      source: expect.any(String),
    });
  });

  it('carries graph evidence into post hook and structure directives', () => {
    const prompt = 'Write a LinkedIn post for finance teams. The beta cut evidence-chasing time by 37% across 12 pilot teams.';
    const authoringRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('social_post'),
      platformSurface: { id: 'linkedin' },
      postControls: createDefaultThinkForgePostControls(),
    });
    const contentSignalProfile = resolveContentSignalProfile({
      userPrompt: prompt,
      authoringRequest,
      contentContract: authoringRequest.contentContract,
      documentType: 'post',
    });
    const plan = buildPostEditorialPlan({
      userPrompt: prompt,
      authoringRequest,
      contentSignalProfile,
    });

    expect(plan.selectedHook?.sourceLines).toEqual(SOURCE_LINES);
    expect(plan.selectedStructure?.sourceLines).toEqual(SOURCE_LINES);
  });

  it('carries graph evidence into script narration and structure directives', () => {
    const contentSignalProfile = {
      profile: {
        constraints: {},
        signals: {
          visual_dependency: 0.5,
          show_tell_ratio: 0.5,
          multimodal_counterpoint: 0.1,
          behavioral_utility: 0.8,
          kairos_pressure: 0.7,
          pathos_load: 0.6,
          audience_awareness: 'problem_aware',
        },
      },
    } as ThinkForgeContentSignalProfile;
    const plan = buildScriptEditorialPlan({ contentSignalProfile });

    expect(plan.narration.selectedTechnique?.sourceLines).toEqual(SOURCE_LINES);
    expect(plan.structure.recommendedTechniques.length).toBeGreaterThan(0);
    expect(plan.structure.recommendedTechniques.every((technique) => (
      Number.isInteger(technique.sourceLines[0])
      && Number.isInteger(technique.sourceLines[1])
    ))).toBe(true);
  });

  it('builds one versioned post artifact from canonical intent, evidence, and specialist decisions', () => {
    const prompt = 'Write a LinkedIn post for finance teams. The beta cut evidence-chasing time by 37% across 12 pilot teams.';
    const authoringRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('social_post'),
      platformSurface: { id: 'linkedin' },
      publishingSurface: 'linkedin_post',
      postControls: createDefaultThinkForgePostControls(),
    });
    const contentSignalProfile = resolveContentSignalProfile({
      userPrompt: prompt,
      authoringRequest,
      contentContract: authoringRequest.contentContract,
      documentType: 'post',
    });
    const plan = buildThinkForgeEditorialPlan({
      userPrompt: prompt,
      authoringRequest,
      contentSignalProfile,
      authorizedFactIds: ['fact-beta', 'fact-beta', 'fact-pilot'],
      sourceLedgerEntryIds: ['source-brief'],
    });

    expect(plan).toMatchObject({
      version: THINKFORGE_EDITORIAL_PLAN_VERSION,
      writerKind: 'post',
      authoringRequest,
      evidence: {
        authorizedFactIds: ['fact-beta', 'fact-pilot'],
        sourceLedgerEntryIds: ['source-brief'],
        boundary: 'bounded_implication',
        factualClaimPolicy: 'authorized_sources_only',
        unsupportedClaimPolicy: 'reject',
      },
      execution: {
        kind: 'post',
        plan: {
          platform: 'LinkedIn post',
          hookProofMarkers: ['37%'],
        },
      },
    });
    expect(plan.doctrine).toMatchObject(getWritingKnowledgeIdentity());
    expect(plan.doctrine.selectedSections.length).toBeGreaterThan(0);
    expect(plan.doctrine.selectedSections.every((item) => (
      item.source.document === plan.doctrine.source
      && Number.isInteger(item.source.lines[0])
      && Number.isInteger(item.source.lines[1])
    ))).toBe(true);
  });

  it('preserves a seven-minute runtime without inventing hierarchy from duration', () => {
    const authoringRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' },
      publishingSurface: 'youtube_video',
      targetDurationSec: 420,
    });
    const plan = buildThinkForgeEditorialPlan({
      userPrompt: 'Create a seven-minute evidence-led documentary.',
      authoringRequest,
      productionBrief: { output: { targetDurationSec: 420 } },
      sourceLedgerEntryIds: ['source-documentary-brief'],
    });

    expect(plan).toMatchObject({
      version: THINKFORGE_EDITORIAL_PLAN_VERSION,
      writerKind: 'script',
      resolvedProduction: { targetDurationSec: 420 },
      execution: {
        kind: 'script',
        plan: {
          runtime: {
            policy: 'exact',
            targetDurationSeconds: 420,
            minimumDurationSeconds: 420,
            maximumDurationSeconds: 420,
          },
          structure: { hierarchyPolicy: 'content_led' },
        },
      },
    });
    expect(plan.execution.plan).not.toHaveProperty('targetSceneCount');
  });

  it('fails loudly when canonical intent and production runtime disagree', () => {
    const authoringRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' },
      publishingSurface: 'youtube_video',
      targetDurationSec: 420,
    });

    expect(() => buildThinkForgeEditorialPlan({
      userPrompt: 'Create a seven-minute documentary.',
      authoringRequest,
      productionBrief: { output: { targetDurationSec: 60 } },
    })).toThrowError(expect.objectContaining<Partial<ThinkForgeEditorialPlanError>>({
      code: 'EDITORIAL_PLAN_INPUT_CONFLICT',
    }));
  });

  it('rejects blank evidence identifiers instead of silently weakening provenance', () => {
    const authoringRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('social_post'),
      platformSurface: { id: 'linkedin' },
      postControls: createDefaultThinkForgePostControls(),
    });

    expect(() => buildThinkForgeEditorialPlan({
      userPrompt: 'Write the approved post.',
      authoringRequest,
      authorizedFactIds: ['   '],
    })).toThrowError(expect.objectContaining<Partial<ThinkForgeEditorialPlanError>>({
      code: 'EDITORIAL_PLAN_EVIDENCE_INVALID',
    }));
  });
});
