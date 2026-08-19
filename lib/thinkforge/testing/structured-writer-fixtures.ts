import type { z } from 'zod';

export const THINKFORGE_E2E_WRITER_FIXTURES = ['post', 'carousel', 'script', 'auto'] as const;
export type ThinkForgeE2EWriterFixture = typeof THINKFORGE_E2E_WRITER_FIXTURES[number];

export const THINKFORGE_E2E_BRAND_MARKERS = {
  formalPersonal: 'Formal evidence marker',
  warmOrganization: 'Warm invitation marker',
} as const;

type ThinkForgeE2EResolvedWriterFixture = Exclude<ThinkForgeE2EWriterFixture, 'auto'>;
type ThinkForgeE2EBrandFingerprint = 'formal-personal' | 'warm-organization';

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
    narration: 'Most launch delays do not begin with a bad idea. They begin when a decision has no visible owner. The brief sits in one document, feedback lands in several chats, and the release decision lives in someone\'s memory. The team keeps working, but nobody can tell which version is current or who can approve it. Before fixing the schedule, make that hidden queue visible.',
    visualDescription: 'A campaign card moves between disconnected desks while unanswered approval markers accumulate around it.',
  },
  {
    title: 'Name the Decision Owner',
    narrativePurpose: 'Establish one accountable owner before creative work begins.',
    durationSeconds: 68,
    narration: 'Name one decision owner before creative work starts. This person does not need to make every edit or attend every review. They do need authority to confirm the audience, the claim, the evidence, and the release moment. Write the owner\'s name beside the campaign outcome, then record who advises and who executes. Clear responsibility at the start keeps later feedback from becoming a second, unofficial approval system.',
    visualDescription: 'One owner card is placed at the head of a physical campaign board before any draft enters review.',
  },
  {
    title: 'Build One Review Lane',
    narrativePurpose: 'Show how a shared review record replaces scattered feedback.',
    durationSeconds: 74,
    narration: 'Next, build one review lane. Every comment should point to the same artifact, carry a reason, and end in a visible decision: accept, revise, or reject. When feedback arrives elsewhere, move the decision back to the shared record instead of copying fragments between tools. The goal is not more process. It is a reliable chain from the original brief to the version the team is actually preparing to publish.',
    visualDescription: 'Loose feedback notes converge into one ordered review lane with visible change, reason, and decision states.',
  },
  {
    title: 'Remove the Status Chase',
    narrativePurpose: 'Contrast visible decisions with deadline-driven status hunting.',
    durationSeconds: 63,
    narration: 'Once the lane exists, remove the status chase. A teammate should be able to open the record and see what changed, why it changed, what is still unresolved, and who owns the next move. That visibility protects the final hours before launch for craft rather than detective work. It also makes a delay diagnosable: the team can see whether the blocker is evidence, creative judgment, or release authority.',
    visualDescription: 'A clock advances while a clear approval record lets the team refine the work instead of opening more chat windows.',
  },
  {
    title: 'Create a Calmer Launch Rhythm',
    narrativePurpose: 'Demonstrate the operational payoff of visible approval ownership.',
    durationSeconds: 82,
    narration: 'Use the record to create a calmer launch rhythm. Review at defined moments, resolve one class of decision at a time, and preserve the accepted answer beside the work. The team can then refine the message without reopening settled questions or collecting duplicate comments. After launch, the same record becomes a practical history: what the campaign promised, what evidence supported it, and which decision rules should carry into the next brief.',
    visualDescription: 'The same campaign board now moves through review with fewer duplicate notes and a legible decision history.',
  },
  {
    title: 'Make the Next Decision Visible',
    narrativePurpose: 'Close with a practical action that preserves the approved angle.',
    durationSeconds: 78,
    narration: 'Before the next campaign begins, test the workflow with one simple question: can every contributor see the current artifact, the decision owner, and the next unresolved choice without asking for a status update? If the answer is no, fix the path before adding another tool or meeting. Visible approval ownership does not make creative judgment automatic. It makes the judgment inspectable, accountable, and easier for the whole team to act on.',
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
            movementMotivation: '',
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

const E2E_BRAND_FINGERPRINTS: Record<ThinkForgeE2EBrandFingerprint, {
  fragments: readonly string[];
  marker: string;
  tone: string;
  vibe: string;
}> = {
  'formal-personal': {
    fragments: [
      'Recurring phrases/structures to favor: State the evidence before the recommendation',
      'NEVER use these words/phrases: playful, whimsical, maybe',
    ],
    marker: THINKFORGE_E2E_BRAND_MARKERS.formalPersonal,
    tone: 'Formal, direct, and evidence-first',
    vibe: 'Measured operational precision',
  },
  'warm-organization': {
    fragments: [
      'Recurring phrases/structures to favor: Invite participation with a soft question',
      'NEVER use these words/phrases: enterprise-grade, urgent, guaranteed',
    ],
    marker: THINKFORGE_E2E_BRAND_MARKERS.warmOrganization,
    tone: 'Warm, casual, and gently invitational',
    vibe: 'Approachable community clarity',
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readUntrustedWriterData(prompt: string): Record<string, unknown> {
  const match = prompt.match(/<tf_untrusted_data\b[^>]*>\s*([\s\S]*?)\s*<\/tf_untrusted_data>/i);
  if (!match?.[1]) {
    throw new Error('ThinkForge E2E auto fixture requires the isolated tf_untrusted_data writer envelope.');
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(match[1]);
  } catch (error) {
    throw new Error('ThinkForge E2E auto fixture received malformed tf_untrusted_data JSON.', {
      cause: error,
    });
  }
  const data = asRecord(asRecord(envelope)?.data);
  if (!data) {
    throw new Error('ThinkForge E2E auto fixture requires tf_untrusted_data.data.');
  }
  return data;
}

function resolveAutoBrandFingerprint(data: Record<string, unknown>): ThinkForgeE2EBrandFingerprint {
  const brandContext = typeof data.brandContext === 'string' ? data.brandContext : '';
  const matches = (Object.entries(E2E_BRAND_FINGERPRINTS) as Array<[
    ThinkForgeE2EBrandFingerprint,
    typeof E2E_BRAND_FINGERPRINTS[ThinkForgeE2EBrandFingerprint],
  ]>).filter(([, fingerprint]) => (
    fingerprint.fragments.every((fragment) => brandContext.includes(fragment))
  ));

  if (matches.length !== 1) {
    throw new Error(
      `ThinkForge E2E auto fixture requires exactly one seeded brand voice fingerprint; found ${matches.length}.`,
    );
  }
  return matches[0][0];
}

function resolveAutoWriterFixture(
  systemInstruction: string,
  data: Record<string, unknown>,
): ThinkForgeE2EResolvedWriterFixture {
  const authoringDestination = asRecord(data.authoringDestination);
  const isScript = authoringDestination?.outputKind === 'video_script';
  const isCarousel = systemInstruction.includes('<carousel_contract>');
  const isPost = !isCarousel
    && systemInstruction.includes('<post_control_contract>')
    && asRecord(data.postEditorialPlan) !== null;
  const matches = [
    ...(isScript ? ['script' as const] : []),
    ...(isCarousel ? ['carousel' as const] : []),
    ...(isPost ? ['post' as const] : []),
  ];

  if (matches.length !== 1) {
    throw new Error(
      `ThinkForge E2E auto fixture requires exactly one trusted writer contract; found ${matches.length}.`,
    );
  }
  return matches[0];
}

function cloneFixture<T>(value: T): T {
  return structuredClone(value);
}

function applyPostBrandFingerprint(
  candidate: {
    content: string;
    contentAnalysis: {
      tone: string;
      vibe: string;
      claimSupport: Array<{ sentence: string }>;
    };
  },
  fingerprint: typeof E2E_BRAND_FINGERPRINTS[ThinkForgeE2EBrandFingerprint],
): void {
  const firstSentence = candidate.content.split('\n')[0]?.trim();
  const firstClaim = candidate.contentAnalysis.claimSupport[0];
  if (!firstSentence || firstClaim?.sentence !== firstSentence) {
    throw new Error('ThinkForge E2E post fixture requires its first sentence in claimSupport.');
  }

  const brandedFirstSentence = `${fingerprint.marker}: ${firstSentence}`;
  candidate.content = candidate.content.replace(firstSentence, brandedFirstSentence);
  firstClaim.sentence = brandedFirstSentence;
  candidate.contentAnalysis.tone = fingerprint.tone;
  candidate.contentAnalysis.vibe = fingerprint.vibe;
}

function buildAutoFixtureCandidate(
  fixture: ThinkForgeE2EResolvedWriterFixture,
  brand: ThinkForgeE2EBrandFingerprint,
): unknown {
  const fingerprint = E2E_BRAND_FINGERPRINTS[brand];

  if (fixture === 'script') {
    const candidate = cloneFixture(THINKFORGE_E2E_SCRIPT_FIXTURE);
    const firstScene = candidate.sidecar.acts[0]?.narrativeScenes[0] as { title: string } | undefined;
    if (!firstScene) throw new Error('ThinkForge E2E script fixture has no first scene.');
    firstScene.title = `${fingerprint.marker}: ${firstScene.title}`;
    candidate.contentAnalysis.theme = `${fingerprint.marker}. ${candidate.contentAnalysis.theme}`;
    return candidate;
  }

  if (fixture === 'carousel') {
    const candidate = cloneFixture(THINKFORGE_E2E_CAROUSEL_FIXTURE);
    applyPostBrandFingerprint(candidate, fingerprint);
    const firstSlide = candidate.clickatron.carouselDeck.slides[0];
    if (!firstSlide) throw new Error('ThinkForge E2E carousel fixture has no first slide.');
    firstSlide.headline = `${fingerprint.marker}: ${firstSlide.headline}`;
    return candidate;
  }

  const candidate = cloneFixture(THINKFORGE_E2E_POST_FIXTURE);
  applyPostBrandFingerprint(candidate, fingerprint);
  return candidate;
}

export function getThinkForgeE2EWriterFixture(): ThinkForgeE2EWriterFixture | null {
  const fixture = process.env.THINKFORGE_E2E_WRITER_FIXTURE?.trim();
  if (!fixture) return null;
  if (!THINKFORGE_E2E_WRITER_FIXTURES.includes(fixture as ThinkForgeE2EWriterFixture)) {
    throw new Error(`Unsupported THINKFORGE_E2E_WRITER_FIXTURE: ${fixture}`);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('THINKFORGE_E2E_WRITER_FIXTURE is forbidden when NODE_ENV is production.');
  }
  if (process.env.THINKFORGE_E2E_MODE !== '1') {
    throw new Error('THINKFORGE_E2E_WRITER_FIXTURE requires THINKFORGE_E2E_MODE=1.');
  }
  if (!/^[a-z0-9]{1,12}$/i.test(process.env.THINKFORGE_E2E_RUN_ID?.trim() ?? '')) {
    throw new Error('THINKFORGE_E2E_WRITER_FIXTURE requires a valid run-scoped THINKFORGE_E2E_RUN_ID.');
  }
  return fixture as ThinkForgeE2EWriterFixture;
}

export function resolveThinkForgeE2EStructuredFixture<TOutput>(input: {
  schema: z.ZodType<TOutput>;
  prompt: string;
  systemInstruction?: string;
}): ThinkForgeE2EStructuredFixtureResult<TOutput> | null {
  const fixture = getThinkForgeE2EWriterFixture();
  if (!fixture) return null;

  let resolvedFixture: ThinkForgeE2EResolvedWriterFixture;
  let candidate: unknown;
  if (fixture === 'auto') {
    const data = readUntrustedWriterData(input.prompt);
    const brand = resolveAutoBrandFingerprint(data);
    resolvedFixture = resolveAutoWriterFixture(input.systemInstruction ?? '', data);
    candidate = buildAutoFixtureCandidate(resolvedFixture, brand);
  } else {
    resolvedFixture = fixture;
    candidate = fixture === 'post'
      ? THINKFORGE_E2E_POST_FIXTURE
      : fixture === 'carousel'
        ? THINKFORGE_E2E_CAROUSEL_FIXTURE
        : THINKFORGE_E2E_SCRIPT_FIXTURE;
  }
  const parsed = input.schema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(`ThinkForge E2E ${resolvedFixture} fixture does not satisfy the requested writer schema: ${parsed.error.message}`);
  }

  return {
    result: parsed.data,
    cacheStatus: 'inline',
    modelName: 'thinkforge-e2e-stub',
  };
}
