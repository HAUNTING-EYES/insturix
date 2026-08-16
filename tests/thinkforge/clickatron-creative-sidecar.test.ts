import { describe, expect, it } from 'vitest';
import {
  appendClickatronCreativeSidecarInstruction,
  applyContentSignalProfileToClickatronExportMeta,
  extractRequiredClickatronCreativeSidecar,
  shouldRequestClickatronCreativeSidecar,
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
  it('requests a Clickatron sidecar for a social post whose topic mentions video production', () => {
    const input: AgentInput = {
      context: {
        projectSummary: 'Platform: LinkedIn. Format: social post.',
        systemBrief: 'Brand DNA: direct and analytical.',
      },
      userPrompt: 'Write a LinkedIn post about scaling video production without burning out creative teams.',
    };

    expect(shouldRequestClickatronCreativeSidecar(input)).toBe(true);
  });

  it('does not request a static sidecar for explicit video production deliverables', () => {
    const input: AgentInput = {
      context: {
        projectSummary: 'Format: video script.',
        systemBrief: 'Create a shootable production plan.',
      },
      userPrompt: 'Write a video script and storyboard for a Reel about approval time.',
    };

    expect(shouldRequestClickatronCreativeSidecar(input)).toBe(false);
  });
  it('does not let Brand Vault social examples trigger a sidecar for SaaS explainer videos', () => {
    const input: AgentInput = {
      context: {
        projectSummary: [
          'Create a 45s SaaS explainer in 16:9.',
          'Product-demo moments should stay clear, readable, and high-intent.',
          '<voice_example index="1" type="linkedin">',
          'This post keeps the approval loop concrete for social audiences.',
          '</voice_example>',
        ].join('\n'),
        systemBrief: 'Brand DNA: bold, expert, social-native voice.',
      },
      project: {
        idea: 'SaaS explainer video',
        purpose: 'Create a clear SaaS explainer video.',
        style: 'clear product-led SaaS demo',
        format: 'video_script',
        platform: 'YouTube',
      },
      userPrompt: [
        'Create a 45s SaaS explainer in 16:9.',
        'Write a complete SaaS explainer script with scene-by-scene structure, narration, and concrete visual direction.',
      ].join('\n'),
    };
    const profile = resolveContentSignalProfile({
      userPrompt: input.userPrompt,
      project: input.project,
      context: input.context,
    });

    expect(profile.intent.outputFormat).toBe('video_script');
    expect(shouldRequestClickatronCreativeSidecar(input, profile)).toBe(false);
  });
  it('keeps an explicit video_script project off the image sidecar despite incidental brand vocabulary', () => {
    // Regression: production /plan built an enriched author prompt from real brand + director + product
    // evidence context that legitimately says "social proof", "captions", "social=ready". Those stray
    // NON_VIDEO keywords flipped promptRequestsCreative/contextRequestsCreative true, defeating the video
    // guard, so a video was forced to author a Clickatron image sidecar whose required JSON.parse threw a
    // 500. An explicit video_script project must stay off the still-image sidecar regardless.
    const input: AgentInput = {
      context: {
        projectSummary: [
          'Create a 45s SaaS explainer in 16:9.',
          'Product/social/preview images: dashboard | onboarding.',
          'Intake: website=ready; social=ready; uploads=ready.',
          'Typography: captions kept readable and separated from graphics.',
        ].join('\n'),
        systemBrief: 'Brand DNA: bold, expert, social-native voice.',
      },
      project: {
        idea: 'SaaS explainer video',
        purpose: 'Create a clear SaaS explainer video.',
        style: 'clear product-led SaaS demo',
        format: 'video_script',
        platform: 'YouTube',
      },
      userPrompt: [
        'Write a complete SaaS explainer script with scene-by-scene narration.',
        'Director beats include a social_proof family scene; keep captions readable.',
      ].join('\n'),
    };
    const profile = resolveContentSignalProfile({
      userPrompt: input.userPrompt,
      project: input.project,
      context: input.context,
    });

    // Sanity: the incidental keywords really are present (this is what used to defeat the guard).
    expect(shouldRequestClickatronCreativeSidecar(input, profile)).toBe(false);
    // …and without the profile arg too (generateScript always passes one, but the guard must not depend on it).
    expect(shouldRequestClickatronCreativeSidecar(input)).toBe(false);
  });
  it('ignores learned social voice examples when deciding hidden Clickatron export intent', () => {
    const input: AgentInput = {
      context: {
        projectSummary: 'Audience: agency founders.',
        systemBrief: [
          '## Brand DNA',
          'Voice: warm, expert, plainspoken',
          '<voice_fingerprint samples="4">',
          '  Characteristic phrases: "approval loop"',
          '</voice_fingerprint>',
          '<voice_example index="1" type="linkedin">',
          'Approval loops need one named owner and one next step.',
          '</voice_example>',
        ].join('\n'),
      },
      userPrompt: 'Write a case study about reducing approval time by 37%.',
    };

    expect(shouldRequestClickatronCreativeSidecar(input)).toBe(false);
  });

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
    expect(next.userPrompt).toContain('"calendar"');
    expect(next.userPrompt).toContain('only under clickatron.calendar');
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

  it('recovers empty carousel sidecar slides from visible draft copy before normalization', () => {
    const markdown = `Slide 1: Approval bottlenecks hide in comment threads.

Slide 2: One named owner moves feedback into a single lane.

Slide 3: The client sees the next step before the deadline slips.

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
      "coreMessage": "approval ownership prevents deadline slips",
      "audience": "agency founders"
    },
    "renderPlan": {
      "textPolicy": "editable_text_layers",
      "imagePrompt": "A clean LinkedIn carousel system with editorial diagrams, approval lanes, and generous safe zones.",
      "slides": []
    },
    "validation": {
      "status": "ready"
    }
  }
}
END_THINKFORGE_CLICKATRON_EXPORT -->`;

    const extracted = extractRequiredClickatronCreativeSidecar(markdown);
    const spec = extracted.exportMeta.clickatron;

    expect(spec?.kind).toBe('carousel');
    expect(spec?.validation.status).toBe('needs_user_input');
    expect(spec?.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'carousel_slides_recovered_at_authoring' }),
      ]),
    );
    expect(spec?.renderPlan.slides).toHaveLength(3);
    expect(spec?.renderPlan.slides?.[0].imagePrompt).toContain('Slide concept to interpret, not draw as text');
    expect(spec?.renderPlan.slides?.[0].textLayers?.[0]).toMatchObject({
      text: 'Approval bottlenecks hide in comment threads.',
      role: 'hook',
    });
    expect(spec?.renderPlan.slides?.[1].textLayers?.[0]?.text).toBe('One named owner moves feedback into a single lane.');
  });

  it('recovers all ten authored slides without applying the obsolete seven-slide cap', () => {
    const visibleSlides = Array.from(
      { length: 10 },
      (_, index) => `Slide ${index + 1}: Exact authored point ${index + 1}.`,
    ).join('\n\n');
    const markdown = `${visibleSlides}

<!-- THINKFORGE_CLICKATRON_EXPORT
{
  "clickatron": {
    "schemaVersion": 1,
    "kind": "carousel",
    "assetIntent": "carousel",
    "platform": "instagram",
    "aspectRatio": "1:1",
    "source": { "sourceService": "thinkforge", "sourceBlockIds": ["AUTO"] },
    "userIntent": { "visualMode": "text_forward_graphic", "wantsCarousel": true },
    "creativeBrief": { "objective": "teach", "coreMessage": "ten exact points" },
    "renderPlan": {
      "textPolicy": "editable_text_layers",
      "imagePrompt": "One shared visual system across the exact authored deck.",
      "slides": []
    },
    "validation": { "status": "ready" }
  }
}
END_THINKFORGE_CLICKATRON_EXPORT -->`;

    const extracted = extractRequiredClickatronCreativeSidecar(markdown);
    const slides = extracted.exportMeta.clickatron?.renderPlan.slides;

    expect(slides).toHaveLength(10);
    expect(slides?.[9].textLayers?.[0]?.text).toBe('Exact authored point 10.');
  });

  it('recovers misplaced calendar identifiers before normalization', () => {
    const markdown = `Visible Instagram copy.

<!-- THINKFORGE_CLICKATRON_EXPORT
{
  "clickatron": {
    "schemaVersion": 1,
    "kind": "single_post_visual",
    "assetIntent": "post_graphic",
    "platform": "instagram",
    "aspectRatio": "4:5",
    "campaignId": "campaign_top_level",
    "source": {
      "sourceService": "thinkforge",
      "sourceBlockIds": ["AUTO"]
    },
    "userIntent": {
      "visualMode": "text_forward_graphic",
      "wantsCarousel": false
    },
    "creativeBrief": {
      "objective": "repurpose a public trend",
      "coreMessage": "AI copilot noise becomes a Monday focus ritual"
    },
    "renderPlan": {
      "textPolicy": "editable_text_layers",
      "imagePrompt": "A calm 4:5 Instagram graphic with a calendar page and small AI copilot buttons around a focused desk.",
      "textLayers": [
        {
          "id": "headline",
          "text": "Monday focus ritual",
          "role": "headline",
          "priority": 90
        }
      ]
    },
    "metadata": {
      "contentCardId": "card_metadata",
      "calendarItemId": "item_metadata",
      "seriesId": "series_metadata"
    },
    "validation": {
      "status": "ready"
    }
  }
}
END_THINKFORGE_CLICKATRON_EXPORT -->`;

    const extracted = extractRequiredClickatronCreativeSidecar(markdown);

    expect(extracted.exportMeta.clickatron?.calendar).toEqual({
      contentCardId: 'card_metadata',
      campaignId: 'campaign_top_level',
      calendarItemId: 'item_metadata',
      seriesId: 'series_metadata',
    });
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

    const calendarInput: AgentInput = {
      ...agentInput(),
      userPrompt:
        'Make an Instagram text + image post about approval time. campaignId CampaignJuneA calendarItemId ItemLaunchA seriesId SeriesOpsA',
    };
    const calendarEnriched = applyContentSignalProfileToClickatronExportMeta(modelExport, calendarInput, profile);

    expect(calendarEnriched.clickatron?.calendar).toMatchObject({
      campaignId: 'CampaignJuneA',
      calendarItemId: 'ItemLaunchA',
      seriesId: 'SeriesOpsA',
    });
  });
});
