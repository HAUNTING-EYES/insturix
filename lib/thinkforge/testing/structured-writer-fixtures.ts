import type { z } from 'zod';

export const THINKFORGE_E2E_WRITER_FIXTURES = ['post', 'carousel', 'script'] as const;
export type ThinkForgeE2EWriterFixture = typeof THINKFORGE_E2E_WRITER_FIXTURES[number];

interface ThinkForgeE2EStructuredFixtureResult<TOutput> {
  result: TOutput;
  cacheStatus: 'inline';
  modelName: 'thinkforge-e2e-stub';
}

const POST_CONTENT = `Most LinkedIn content teams lose hours every week to scattered approval notes, duplicate feedback, and invisible ownership.

When a launch moves through five people, the real delay is rarely the draft. It is the missing record of who decides, what changed, and what can ship today.

A working review trail makes every approval visible before the next deadline arrives. The team spends less time chasing status and more time making the work useful.

Reply WORKFLOW if you want the operating checklist for your next campaign.

#ContentOperations #BrandSystems #MarketingWorkflow`;

const THINKFORGE_E2E_POST_FIXTURE = {
  content: POST_CONTENT,
  hashtags: ['#ContentOperations', '#BrandSystems', '#MarketingWorkflow'],
  contentAnalysis: {
    tone: 'Direct and practical',
    vibe: 'Calm operational clarity',
    theme: 'Make approval ownership visible before a launch stalls.',
    qualityScore: 92,
    violations: [],
  },
  clickatron: {
    singleImagePrompt: 'Overhead editorial desk scene with a simple paper approval trail, sticky notes as abstract shapes, a restrained dark-and-amber visual system, soft directional window light, generous empty space for later editable copy, no readable text or logos.',
  },
  metadata: {
    platform: 'linkedin',
    charCount: 0,
  },
};

const THINKFORGE_E2E_CAROUSEL_FIXTURE = {
  ...THINKFORGE_E2E_POST_FIXTURE,
  clickatron: {
    carouselDeck: {
      version: 1,
      slides: [
        {
          role: 'hook',
          headline: 'Approval drag starts before the deadline',
          body: 'Scattered notes hide who owns the final decision.',
          sourceRefs: ['brief_user'],
          imagePrompt: 'Editorial overhead of scattered approval notes around one clear decision card, dark-and-amber system, ample empty space, no readable text or logos.',
        },
        {
          role: 'problem',
          headline: 'Five reviewers do not create one owner',
          body: 'The delay lives in an invisible decision path, not the draft itself.',
          sourceRefs: ['brief_user'],
          imagePrompt: 'A content lead tracing a clean approval path across abstract cards on a desk, restrained editorial photography, no readable text or logos.',
        },
        {
          role: 'process',
          headline: 'Put feedback in one visible lane',
          body: 'Make each change, reason, and release decision inspectable.',
          sourceRefs: ['brief_user'],
          imagePrompt: 'Close detail of grouped feedback markers becoming one ordered review lane, soft directional light, no readable text or logos.',
        },
        {
          role: 'insight',
          headline: 'A named owner closes the status chase',
          body: 'The team can see what changed and whether the decision is complete.',
          sourceRefs: ['brief_user'],
          imagePrompt: 'A calm team handoff with one owner marking a completed decision, consistent dark-and-amber palette, no readable text or logos.',
        },
        {
          role: 'cta',
          headline: 'Make the next release decision visible',
          body: 'Reply WORKFLOW for the campaign operating checklist.',
          sourceRefs: ['brief_user'],
          imagePrompt: 'A tidy campaign workspace ready to publish, approval record visible only as abstract shapes, generous empty space, no readable text or logos.',
        },
      ],
    },
    carouselPrompts: [
      'Editorial overhead of scattered approval notes around one clear decision card, dark-and-amber system, ample empty space, no readable text or logos.',
      'A content lead tracing a clean approval path across abstract cards on a desk, restrained editorial photography, no readable text or logos.',
      'Close detail of grouped feedback markers becoming one ordered review lane, soft directional light, no readable text or logos.',
      'A calm team handoff with one owner marking a completed decision, consistent dark-and-amber palette, no readable text or logos.',
      'A tidy campaign workspace ready to publish, approval record visible only as abstract shapes, generous empty space, no readable text or logos.',
    ],
  },
};

const SCRIPT_NARRATION = [
  'Campaign work slows when approvals live in separate chats, documents, and private notes that no one can inspect at the moment a decision is needed.',
  'Start every launch with one named owner who can confirm the audience, the final claim, and the exact person allowed to release the work.',
  'Put feedback in one visible review lane so a teammate can see what changed, why it changed, and whether the decision is complete.',
  'That record removes the status chase that usually appears two hours before a deadline, when the team should be refining the message instead.',
  'The result is a calmer launch rhythm: fewer duplicate comments, clearer accountability, and a practical history for the next campaign.',
  'Use the checklist before your next launch, then let the work move because the decision path is visible to every person involved.',
];

const THINKFORGE_E2E_SCRIPT_FIXTURE = {
  contentAnalysis: {
    hooks: ['Approval ownership is a launch constraint.'],
    theme: 'Make approval ownership visible before a campaign launch.',
    emphasisPoints: ['One named owner', 'One visible review lane', 'A usable release record'],
    qualityScore: 92,
  },
  visualMetadata: {
    motionInfo: 'Measured editorial pacing with restrained cuts between practical workflow details.',
  },
  metadata: {
    estimatedTimeSeconds: 60,
    platform: 'youtube-shorts',
    voiceLanguage: 'en',
  },
  sidecar: {
    sidecarVersion: 1,
    characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }],
    scenes: SCRIPT_NARRATION.map((narration, index) => ({
      title: `Approval workflow beat ${index + 1}`,
      narration,
      visualDescription: `Editorial workflow detail ${index + 1}: a calm operations workspace with one concrete approval artifact, soft directional light, and clear visual hierarchy.`,
      videoMotionPrompt: 'Static composition with a restrained push-in motivated by the next decision.',
      audioDescription: 'Clean voiceover with a low room tone.',
      musicDescription: 'Measured percussive underscore that supports clear instruction.',
      sfxDescription: 'Subtle paper and keyboard accents.',
      durationSeconds: 10,
      mood: 'serious',
      imageQualityTokens: 'editorial detail, controlled contrast, natural materials',
      videoQualityTokens: 'stable camera, clean cadence, production-ready composition',
      generationUnitId: `approval_workflow_${index + 1}`,
      primaryVisualForUnit: true,
      sceneType: 'continuous',
      assetRecommendation: 'ai-video',
      lines: [{ text: narration, speakerId: 'narrator', onCamera: false, delivery: 'voiceover', sourceRefs: ['brief_user'] }],
      sourceRefs: ['brief_user'],
      charactersPresent: [],
      shotIntent: {
        narrativePurpose: 'Advance the practical approval workflow.',
        emotionalBeat: 'Calm clarity replaces deadline anxiety.',
        energy: 0.45,
        visualPriority: 'The decision artifact and its owner.',
        action: 'still',
        desiredFraming: 'medium-close-up',
        desiredAngle: 'eye-level',
        desiredMovement: 'static',
        simultaneousPerformers: 0,
        spokenAudio: false,
        performance: [],
        continuity: { wardrobe: [], props: ['approval artifact'], previousSceneIds: [] },
      },
    })),
    overallMusicPrompt: 'Precise editorial rhythm with a restrained optimistic finish.',
    characterDescriptions: { narrator: 'A calm, exact voiceover narrator. No on-camera performer.' },
    colorPalette: ['#0F172A', '#D97706', '#F8FAFC'],
    environmentNotes: 'A practical campaign operations workspace with natural daylight and no visible brand marks.',
    globalEditDirections: {},
    suggestedProfileCategory: 'production-mode',
    sourceRefs: ['brief_user'],
  },
};

export function getThinkForgeE2EWriterFixture(): ThinkForgeE2EWriterFixture | null {
  const fixture = process.env.THINKFORGE_E2E_WRITER_FIXTURE?.trim();
  if (!fixture) return null;
  if (!THINKFORGE_E2E_WRITER_FIXTURES.includes(fixture as ThinkForgeE2EWriterFixture)) {
    throw new Error(`Unsupported THINKFORGE_E2E_WRITER_FIXTURE: ${fixture}`);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('THINKFORGE_E2E_WRITER_FIXTURE is forbidden when NODE_ENV is production.');
  }
  if (!process.env.THINKFORGE_E2E_RUN_ID?.trim()) {
    throw new Error('THINKFORGE_E2E_WRITER_FIXTURE requires THINKFORGE_E2E_RUN_ID.');
  }
  return fixture as ThinkForgeE2EWriterFixture;
}

export function resolveThinkForgeE2EStructuredFixture<TOutput>(input: {
  schema: z.ZodType<TOutput>;
}): ThinkForgeE2EStructuredFixtureResult<TOutput> | null {
  const fixture = getThinkForgeE2EWriterFixture();
  if (!fixture) return null;

  const candidate = fixture === 'post'
    ? THINKFORGE_E2E_POST_FIXTURE
    : fixture === 'carousel'
      ? THINKFORGE_E2E_CAROUSEL_FIXTURE
      : THINKFORGE_E2E_SCRIPT_FIXTURE;
  const parsed = input.schema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(`ThinkForge E2E ${fixture} fixture does not satisfy the requested writer schema: ${parsed.error.message}`);
  }

  return {
    result: parsed.data,
    cacheStatus: 'inline',
    modelName: 'thinkforge-e2e-stub',
  };
}
