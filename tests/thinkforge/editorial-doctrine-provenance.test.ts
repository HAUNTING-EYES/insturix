import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  THINKFORGE_EDITORIAL_PLAN_VERSION,
  ThinkForgeEditorialPlanError,
  buildThinkForgeEditorialPlan,
  requireThinkForgeEditorialPlanForWriter,
} from '@/lib/thinkforge/agents/editorial-plan';
import { buildPostEditorialPlan } from '@/lib/thinkforge/agents/post-editorial-plan';
import { PostWriterAgent } from '@/lib/thinkforge/agents/post-writer-agent';
import { buildScriptEditorialPlan } from '@/lib/thinkforge/agents/script-editorial-plan';
import { ScriptWriterAgent } from '@/lib/thinkforge/agents/script-writer-agent';
import {
  getWritingKnowledgeIdentity,
  selectTechniques,
} from '@/lib/thinkforge/data/writing-graph-query';
import {
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import { buildThinkForgeIdeaAngle } from '@/lib/thinkforge/schemas/idea-angle';
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

  it('binds a selected angle while rebuilding evidence from the current generation context', () => {
    const authoringRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('social_post'),
      platformSurface: { id: 'linkedin' },
      postControls: createDefaultThinkForgePostControls(),
    });
    const editorialAngle = buildThinkForgeIdeaAngle({
      ideaId: 'idea_quiet_cost',
      title: 'The Cost of Quiet Automation',
      strategicPurpose: 'Show operators the hidden review work behind apparently automatic systems.',
      creativeTreatment: 'An evidence-led teardown built around one approval trail.',
    });
    const first = buildThinkForgeEditorialPlan({
      userPrompt: 'Make a post about responsible AI.',
      authoringRequest,
      editorialAngle,
      authorizedFactIds: ['fact_old'],
      sourceLedgerEntryIds: ['brief_user', 'source_old'],
    });
    const refreshed = buildThinkForgeEditorialPlan({
      userPrompt: 'Make a post about responsible AI.',
      authoringRequest,
      editorialAngle,
      authorizedFactIds: ['fact_current'],
      sourceLedgerEntryIds: ['brief_user', 'source_current'],
    });

    expect(first.creativeIntent).toEqual({
      source: 'selected_angle',
      selectedAngle: editorialAngle,
      overridePolicy: 'explicit_current_instruction_only',
    });
    expect(refreshed.creativeIntent).toEqual(first.creativeIntent);
    expect(refreshed.evidence.authorizedFactIds).toEqual(['fact_current']);
    expect(refreshed.evidence.sourceLedgerEntryIds).toEqual(['brief_user', 'source_current']);
    expect(refreshed.doctrine).toMatchObject(getWritingKnowledgeIdentity());
    expect(refreshed).not.toBe(first);
  });

  it('rejects malformed angles and writer-family mismatches before generation', () => {
    const postRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('social_post'),
      platformSurface: { id: 'linkedin' },
      postControls: createDefaultThinkForgePostControls(),
    });

    expect(() => buildThinkForgeEditorialPlan({
      userPrompt: 'Write the selected angle.',
      authoringRequest: postRequest,
      editorialAngle: {
        version: 1,
        ideaId: 'idea_invalid',
        title: 'Incomplete angle',
        strategicPurpose: '',
        creativeTreatment: 'A treatment.',
      },
    })).toThrowError(expect.objectContaining<Partial<ThinkForgeEditorialPlanError>>({
      code: 'EDITORIAL_PLAN_ANGLE_INVALID',
    }));

    const postPlan = buildThinkForgeEditorialPlan({
      userPrompt: 'Write the selected angle.',
      authoringRequest: postRequest,
    });
    expect(() => requireThinkForgeEditorialPlanForWriter(
      postPlan,
      'script',
      postRequest,
    )).toThrowError(expect.objectContaining<Partial<ThinkForgeEditorialPlanError>>({
      code: 'EDITORIAL_PLAN_INPUT_CONFLICT',
    }));
  });

  it('feeds the same selected-angle artifact into post and script prompt construction', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const broadBrief = 'Make content about responsible AI.';
    const editorialAngle = buildThinkForgeIdeaAngle({
      ideaId: 'idea_quiet_cost',
      title: 'The Cost of Quiet Automation',
      strategicPurpose: 'Show operators the hidden review work behind apparently automatic systems.',
      creativeTreatment: 'An evidence-led teardown built around one approval trail.',
    });
    const postRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('social_post'),
      platformSurface: { id: 'linkedin' },
      postControls: createDefaultThinkForgePostControls(),
    });
    const scriptRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' },
    });
    const postPlan = buildThinkForgeEditorialPlan({
      userPrompt: broadBrief,
      authoringRequest: postRequest,
      editorialAngle,
    });
    const scriptPlan = buildThinkForgeEditorialPlan({
      userPrompt: broadBrief,
      authoringRequest: scriptRequest,
      editorialAngle,
    });
    const context = {
      projectSummary: broadBrief,
      systemBrief: 'Brand voice: precise, calm, and evidence-led.',
    };

    const postPrompt = new PostWriterAgent().buildPromptParts({
      context,
      userPrompt: broadBrief,
      authoringRequest: postRequest,
      editorialPlan: postPlan,
    });
    const scriptPrompt = new ScriptWriterAgent().buildPromptParts({
      context,
      userPrompt: broadBrief,
      authoringRequest: scriptRequest,
      editorialPlan: scriptPlan,
    });

    for (const parts of [postPrompt, scriptPrompt]) {
      expect(parts.systemInstruction).toContain('tf_untrusted_data.creativeIntent');
      expect(parts.systemInstruction).toContain('binding creative direction');
      expect(parts.prompt).toContain('"source": "selected_angle"');
      expect(parts.prompt).toContain('"title": "The Cost of Quiet Automation"');
      expect(parts.prompt).toContain('"strategicPurpose": "Show operators the hidden review work');
      expect(parts.prompt).toContain('"creativeTreatment": "An evidence-led teardown');
      expect(parts.prompt).toContain(broadBrief);
    }
  });

  it('builds the production writer artifact after current evidence resolution and before dispatch', () => {
    const service = readFileSync(
      join(process.cwd(), 'lib/thinkforge/services/chat-service.ts'),
      'utf8',
    );
    const sourceLedgerIndex = service.indexOf(
      'const sourceLedger = buildContinuedThinkForgeSourceLedger({',
    );
    const editorialPlanIndex = service.indexOf(
      'const editorialPlan = buildThinkForgeEditorialPlan({',
    );
    const baseInputIndex = service.indexOf('const baseInput = {', editorialPlanIndex);
    const postDispatchIndex = service.indexOf(
      'writer.runStructured(baseInput as PostWriterInput, undefined, abortSignal)',
      baseInputIndex,
    );
    const scriptDispatchIndex = service.indexOf(
      'writer.runStructured(baseInput as ScriptWriterInput, undefined, abortSignal)',
      baseInputIndex,
    );
    const planBuild = service.slice(editorialPlanIndex, baseInputIndex);
    const writerInput = service.slice(baseInputIndex, postDispatchIndex);

    expect(sourceLedgerIndex).toBeGreaterThan(-1);
    expect(editorialPlanIndex).toBeGreaterThan(sourceLedgerIndex);
    expect(baseInputIndex).toBeGreaterThan(editorialPlanIndex);
    expect(postDispatchIndex).toBeGreaterThan(baseInputIndex);
    expect(scriptDispatchIndex).toBeGreaterThan(postDispatchIndex);
    expect(planBuild).toContain('resolveProjectMetaEditorialAngle(sessionState.metadata)');
    expect(planBuild).toContain('authoringContextSnapshot.retrieval.projectFactIds');
    expect(planBuild).toContain('authoringContextSnapshot.retrieval.globalFactIds');
    expect(planBuild).toContain('sourceLedger.entries.map((entry) => entry.referenceId)');
    expect(writerInput).toContain('editorialPlan,');
  });
});
