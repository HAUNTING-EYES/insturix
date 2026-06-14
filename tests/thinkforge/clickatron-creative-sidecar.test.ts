import { describe, expect, it } from 'vitest';
import {
  appendClickatronCreativeSidecarInstruction,
  applyContentSignalProfileToClickatronExportMeta,
  extractRequiredClickatronCreativeSidecar,
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
    expect(next.userPrompt).toContain('"renderPlan"');
    expect(next.userPrompt).toContain('"textPolicy": "editable_text_layers"');
    expect(next.userPrompt).toContain('"id": "headline"');
    expect(next.userPrompt).toContain('Never emit clickatron.textPolicy');
    expect(next.userPrompt).toContain('Never use content, position, or style as substitutes');
    expect(next.userPrompt).toContain('Use "subheadline", never "subhead"');
    expect(next.userPrompt).toContain('Do not invent visible-copy or sidecar claims');
    expect(next.userPrompt).toContain('Treat clickatron_resolved_profile as a lock file');
    expect(next.userPrompt).toContain('Do not describe the composition as 9:16');
    expect(next.userPrompt).toContain('Grounded means exact');
    expect(next.userPrompt).toContain('This hidden JSON is mandatory');
    expect(next.userPrompt).toContain('renderPlan.imagePrompt is always required');
  });

  it('recovers carousel root imagePrompt from slide prompts before normalization', () => {
    const markdown = `Visible LinkedIn copy.

<!-- THINKFORGE_CLICKATRON_EXPORT
{
  "clickatron": {
    "schemaVersion": 1,
    "kind": "carousel",
    "assetIntent": "carousel",
    "platform": "linkedin",
    "aspectRatio": "1.91:1",
    "source": {
      "sourceService": "thinkforge",
      "sourceBlockIds": ["AUTO"]
    },
    "userIntent": {
      "visualMode": "text_forward_graphic",
      "wantsCarousel": true
    },
    "creativeBrief": {
      "objective": "educate agency founders",
      "coreMessage": "one approval owner reduces approval time",
      "audience": "agency founders",
      "keyClaims": ["37%"]
    },
    "renderPlan": {
      "textPolicy": "editable_text_layers",
      "slides": [
        {
          "id": "slide_1",
          "index": 0,
          "imagePrompt": "A clean workflow map showing three approval paths collapsing into one owner lane.",
          "sourceBlockIds": ["AUTO"],
          "textLayers": [
            {
              "id": "slide_1_headline",
              "text": "One owner cuts approval drag",
              "role": "headline",
              "priority": 90
            }
          ]
        },
        {
          "id": "slide_2",
          "index": 1,
          "imagePrompt": "A horizontal LinkedIn carousel frame with a simple 37 percent reduction chart.",
          "sourceBlockIds": ["AUTO"],
          "textLayers": [
            {
              "id": "slide_2_badge",
              "text": "-37%",
              "role": "badge",
              "priority": 90
            }
          ]
        }
      ]
    },
    "validation": {
      "status": "ready"
    }
  }
}
END_THINKFORGE_CLICKATRON_EXPORT -->`;

    const extracted = extractRequiredClickatronCreativeSidecar(markdown);

    expect(extracted.exportMeta.clickatron?.renderPlan.imagePrompt).toContain('Carousel overview for Clickatron');
    expect(extracted.exportMeta.clickatron?.renderPlan.imagePrompt).toContain('Slide 1:');
    expect(extracted.exportMeta.clickatron?.renderPlan.slides).toHaveLength(2);
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
