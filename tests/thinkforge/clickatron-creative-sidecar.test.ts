import { describe, expect, it } from 'vitest';
import {
  appendClickatronCreativeSidecarInstruction,
  applyContentSignalProfileToClickatronExportMeta,
} from '@/lib/thinkforge/utils/clickatron-creative-sidecar';
import { resolveContentSignalProfile } from '@/lib/thinkforge/signals';
import type { AgentInput } from '@/lib/thinkforge/agents/types';
import type { ThinkForgeBlockExportMeta } from '@/lib/thinkforge/schemas/clickatron-creative-contract';

function resolveInstagramImagePostProfile() {
  return resolveContentSignalProfile({
    userPrompt: 'Make an Instagram text + image post for agency founders about reducing content approval time by 37%.',
    brandId: 'brand_1',
    sessionId: 'tf_session_1',
    project: {
      projectName: 'Approval Ops',
      platform: 'Instagram',
      format: 'post',
      purpose: 'agency founders',
      tone: 'warm expert',
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

function agentInput(): AgentInput {
  return {
    context: {
      projectSummary: 'Platform: Instagram. Audience: agency founders. Format: text + image post.',
      systemBrief: 'Brand DNA: warm expert. Never mention: game-changing.',
    },
    brandId: 'brand_1',
    sessionId: 'tf_session_1',
    userPrompt: 'Make an Instagram text + image post about approval time.',
  };
}

describe('Clickatron creative sidecar signal profile', () => {
  it('adds the resolved profile to the hidden sidecar instruction', () => {
    const profile = resolveInstagramImagePostProfile();
    const next = appendClickatronCreativeSidecarInstruction(agentInput(), profile);

    expect(next.userPrompt).toContain('<clickatron_resolved_profile>');
    expect(next.userPrompt).toContain('"platform": "instagram"');
    expect(next.userPrompt).toContain('"aspectRatio": "4:5"');
    expect(next.userPrompt).toContain('"brandId": "brand_1"');
    expect(next.userPrompt).toContain('Do not use visible text');
  });

  it('overlays profile-derived platform, brand, proof, and text policy onto extracted exports', () => {
    const profile = resolveInstagramImagePostProfile();
    const modelExport: ThinkForgeBlockExportMeta = {
      clickatron: {
        schemaVersion: 1,
        kind: 'single_post_visual',
        assetIntent: 'post_graphic',
        platform: 'generic',
        aspectRatio: '1:1',
        source: {
          sourceBlockIds: ['AUTO'],
        },
        userIntent: {
          visualMode: 'text_forward_graphic',
        },
        creativeBrief: {
          objective: 'awareness',
          coreMessage: 'Approval drag hurts agency momentum.',
        },
        renderPlan: {
          textPolicy: 'minimal_generated_text',
          imagePrompt: 'A clean agency dashboard with approval bottlenecks highlighted.',
          textLayers: [
            {
              id: 'headline',
              text: 'Approval lag costs momentum',
              role: 'headline',
              priority: 90,
            },
          ],
        },
        validation: {
          status: 'ready',
        },
      },
    };

    const enriched = applyContentSignalProfileToClickatronExportMeta(modelExport, agentInput(), profile);

    expect(enriched.clickatron?.platform).toBe('instagram');
    expect(enriched.clickatron?.aspectRatio).toBe('4:5');
    expect(enriched.clickatron?.renderPlan.textPolicy).toBe('editable_text_layers');
    expect(enriched.clickatron?.brand?.brandId).toBe('brand_1');
    expect(enriched.clickatron?.brand?.hardConstraints).toContain('Do not use visible text "game-changing".');
    expect(enriched.clickatron?.creativeBrief.audience).toBe('agency founders');
    expect(enriched.clickatron?.creativeBrief.keyClaims).toContain('37%');
  });
});
