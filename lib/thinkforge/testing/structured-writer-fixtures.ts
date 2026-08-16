import type { z } from 'zod';

export const THINKFORGE_E2E_WRITER_FIXTURES = ['post', 'carousel', 'script'] as const;
export type ThinkForgeE2EWriterFixture = typeof THINKFORGE_E2E_WRITER_FIXTURES[number];

interface ThinkForgeE2EStructuredFixtureResult<TOutput> {
  result: TOutput;
  cacheStatus: 'inline';
  modelName: 'thinkforge-e2e-stub';
}

const POST_CONTENT = `Make approval ownership visible before a campaign launch.

Approval ownership should be visible before a campaign launch.`;

const THINKFORGE_E2E_POST_FIXTURE = {
  content: POST_CONTENT,
  hashtags: [],
  contentAnalysis: {
    tone: 'Direct and practical',
    vibe: 'Calm operational clarity',
    theme: 'Make approval ownership visible before a launch stalls.',
    qualityScore: 92,
    violations: [],
    claimSupport: [
      {
        sentence: 'Make approval ownership visible before a campaign launch.',
        sourceRef: 'brief_user',
        relationship: 'paraphrase',
      },
      {
        sentence: 'Approval ownership should be visible before a campaign launch.',
        sourceRef: 'brief_user',
        relationship: 'paraphrase',
      },
    ],
  },
  clickatron: {
    singleImagePrompt: 'Text-free editorial scene about approval ownership before a campaign launch: one campaign card moving through a physical approval trail, restrained dark-and-amber visual system, soft directional light, and generous headline-safe negative space on the right, with no readable text or logos.',
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
          headline: 'Make approval ownership visible',
          body: 'Before a campaign launch.',
          sourceRefs: ['brief_user'],
          imagePrompt: 'Text-free overhead composition about approval ownership before a campaign launch, with one campaign card and one approval marker, dark-and-amber system, generous headline-safe negative space on the left, no readable text or logos.',
        },
        {
          role: 'problem',
          headline: 'Approval ownership',
          body: 'Name it before the campaign launch.',
          sourceRefs: ['brief_user'],
          imagePrompt: 'Text-free close view of an approval ownership marker beside a campaign launch card, restrained editorial photography, generous headline-safe negative space above, no readable text or logos.',
        },
        {
          role: 'process',
          headline: 'The campaign launch',
          body: 'Keep approval ownership visible.',
          sourceRefs: ['brief_user'],
          imagePrompt: 'Text-free campaign launch card moving along a visible approval ownership path, soft directional light, generous headline-safe negative space on the right, no readable text or logos.',
        },
        {
          role: 'insight',
          headline: 'Before launch',
          body: 'Show the approval owner.',
          sourceRefs: ['brief_user'],
          imagePrompt: 'Text-free approval owner token placed beside a campaign launch artifact, consistent dark-and-amber palette, generous headline-safe negative space above, no readable text or logos.',
        },
        {
          role: 'cta',
          headline: 'Approval ownership, visible',
          body: 'Before the campaign launch.',
          sourceRefs: ['brief_user'],
          imagePrompt: 'Text-free final campaign launch card beside a visible approval ownership marker, generous headline-safe negative space on the left, no readable text or logos.',
        },
      ],
    },
    carouselPrompts: [
      'Text-free overhead composition about approval ownership before a campaign launch, with one campaign card and one approval marker, dark-and-amber system, generous headline-safe negative space on the left, no readable text or logos.',
      'Text-free close view of an approval ownership marker beside a campaign launch card, restrained editorial photography, generous headline-safe negative space above, no readable text or logos.',
      'Text-free campaign launch card moving along a visible approval ownership path, soft directional light, generous headline-safe negative space on the right, no readable text or logos.',
      'Text-free approval owner token placed beside a campaign launch artifact, consistent dark-and-amber palette, generous headline-safe negative space above, no readable text or logos.',
      'Text-free final campaign launch card beside a visible approval ownership marker, generous headline-safe negative space on the left, no readable text or logos.',
    ],
  },
};

const SCRIPT_SCENES = [
  {
    title: 'The Invisible Queue',
    narrativePurpose: 'Reveal that the launch delay lives in an unseen decision path.',
    durationSeconds: 55,
    narration: 'Campaign work slows when approvals live in separate chats, documents, and private notes that no one can inspect at the moment a decision is needed.',
    visualDescription: 'A campaign card moves between disconnected desks while unanswered approval markers accumulate around it.',
  },
  {
    title: 'Name the Decision Owner',
    narrativePurpose: 'Establish one accountable owner before creative work begins.',
    durationSeconds: 68,
    narration: 'Start every launch with one named owner who can confirm the audience, the final claim, and the exact person allowed to release the work.',
    visualDescription: 'One owner card is placed at the head of a physical campaign board before any draft enters review.',
  },
  {
    title: 'Build One Review Lane',
    narrativePurpose: 'Show how a shared review record replaces scattered feedback.',
    durationSeconds: 74,
    narration: 'Put feedback in one visible review lane so a teammate can see what changed, why it changed, and whether the decision is complete.',
    visualDescription: 'Loose feedback notes converge into one ordered review lane with visible change, reason, and decision states.',
  },
  {
    title: 'Remove the Status Chase',
    narrativePurpose: 'Contrast visible decisions with deadline-driven status hunting.',
    durationSeconds: 63,
    narration: 'That record removes the status chase that usually appears two hours before a deadline, when the team should be refining the message instead.',
    visualDescription: 'A clock advances while a clear approval record lets the team refine the work instead of opening more chat windows.',
  },
  {
    title: 'Create a Calmer Launch Rhythm',
    narrativePurpose: 'Demonstrate the operational payoff of visible approval ownership.',
    durationSeconds: 82,
    narration: 'The result is a calmer launch rhythm: fewer duplicate comments, clearer accountability, and a practical history for the next campaign.',
    visualDescription: 'The same campaign board now moves through review with fewer duplicate notes and a legible decision history.',
  },
  {
    title: 'Make the Next Decision Visible',
    narrativePurpose: 'Close with a practical action that preserves the approved angle.',
    durationSeconds: 78,
    narration: 'Use the checklist before your next launch, then let the work move because the decision path is visible to every person involved.',
    visualDescription: 'The completed approval record is filed beside the next campaign brief, ready to guide the following launch.',
  },
] as const;

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
    platform: 'youtube',
  },
  sidecar: {
    sidecarVersion: 2,
    spokenTextSource: 'beat-lines',
    characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }],
    acts: [{
      id: 'act_1',
      title: 'Make the decision path visible',
      narrativePurpose: 'Move from hidden approval friction to one inspectable launch process.',
      narrativeScenes: SCRIPT_SCENES.map((scene, index) => ({
        id: `scene_${index + 1}`,
        title: scene.title,
        narrativePurpose: scene.narrativePurpose,
        durationIntentSeconds: scene.durationSeconds,
        mood: 'serious',
        charactersPresent: [],
        sourceRefs: ['brief_user'],
        beats: [{
          id: `beat_${index + 1}`,
          kind: 'voiceover',
          narrativePurpose: scene.narrativePurpose,
          durationIntentSeconds: scene.durationSeconds,
          lines: [{
            id: `line_${index + 1}`,
            text: scene.narration,
            speakerId: 'narrator',
            languageCode: 'en',
            onCamera: false,
            delivery: 'voiceover',
            sourceRefs: ['brief_user'],
          }],
          visualIntent: {
            description: scene.visualDescription,
            motion: 'A restrained push-in or lateral reveal motivated by the next decision.',
            onScreenText: [],
            imageQualityTokens: 'editorial detail, controlled contrast, natural materials',
            videoQualityTokens: 'stable camera, clean cadence, production-ready composition',
            assetRecommendation: 'ai-video',
          },
          audioIntent: {
            ambience: 'Quiet campaign operations workspace with a low room tone.',
            music: 'Measured percussive underscore that supports clear instruction.',
            sfx: ['Subtle paper movement', 'Restrained keyboard accents'],
          },
          shotIntent: {
            narrativePurpose: scene.narrativePurpose,
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
            continuity: {
              wardrobe: [],
              props: ['approval artifact'],
              previousSceneIds: index === 0 ? [] : [`scene_${index}`],
            },
          },
          sourceRefs: ['brief_user'],
        }],
      })),
    }],
    creativeDirection: {
      overallMusicPrompt: 'Precise editorial rhythm with a restrained optimistic finish.',
      characterDescriptions: { narrator: 'A calm, exact voiceover narrator. No on-camera performer.' },
      colorPalette: ['#0F172A', '#D97706', '#F8FAFC'],
      environmentNotes: 'A practical campaign operations workspace with natural daylight and no visible brand marks.',
      globalEditDirections: {},
      suggestedProfileCategory: 'production-mode',
    },
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
