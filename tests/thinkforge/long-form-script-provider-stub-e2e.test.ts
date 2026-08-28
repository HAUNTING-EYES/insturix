import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalGeminiApiKey = process.env.GEMINI_API_KEY;

const persistence = vi.hoisted(() => ({
  applyCommand: vi.fn(),
  claimGenerationCommit: vi.fn(),
  generateStructuredWithWritingContextCache: vi.fn(),
  getActiveGeneration: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/command-service', () => ({
  applyCommand: persistence.applyCommand,
}));
vi.mock('@/lib/thinkforge/services/db', () => ({
  claimGenerationCommit: persistence.claimGenerationCommit,
  getActiveGeneration: persistence.getActiveGeneration,
  getScript: persistence.getScript,
  getSession: persistence.getSession,
}));
vi.mock('@/lib/thinkforge/services/gemini-writing-context-cache', () => ({
  generateStructuredWithWritingContextCache: persistence.generateStructuredWithWritingContextCache,
}));

import {
  ScriptChapterPlanAgent,
} from '@/lib/thinkforge/agents/script-chapter-plan-agent';
import {
  ScriptWriterAgent,
  isScriptWriterV3Result,
  materializeScriptWriterV3Result,
  materializeScriptWriterResult,
  type ScriptWriterModelOutput,
  type ScriptWriterV3ModelOutput,
} from '@/lib/thinkforge/agents/script-writer-agent';
import {
  buildThinkForgeEditorialPlan,
  type ThinkForgeScriptEditorialPlanArtifact,
} from '@/lib/thinkforge/agents/editorial-plan';
import { mapScriptSidecarToEditronExport } from '@/lib/thinkforge/export/script-sidecar-to-editron';
import {
  executeLongFormScriptAction,
  isRetryableLongFormScriptActionError,
} from '@/lib/thinkforge/long-form/script-generation-execution';
import { diagnoseThinkForgeDocumentEvidence } from '@/lib/thinkforge/operations/operational-diagnostics';
import {
  LONG_FORM_SCRIPT_JOB_VERSION,
  createLongFormScriptJobDedupeKey,
  normalizeLongFormScriptJobError,
  type LongFormScriptGenerationJobSnapshot,
} from '@/lib/thinkforge/long-form/script-generation-job-contract';
import { buildScriptShotPlan } from '@/lib/thinkforge/production/build-script-shot-plan';
import {
  buildThinkForgeWriterInvocationTrace,
  hashThinkForgeTraceValue,
} from '@/lib/thinkforge/provenance/generation-trace';
import {
  buildThinkForgeSourceLedger,
  type SourceLedger,
} from '@/lib/thinkforge/provenance/source-ledger';
import {
  materializeScriptChapterPlan,
  type ScriptChapterPlan,
} from '@/lib/thinkforge/schemas/script-chapter-plan';
import { createThinkForgeAuthoringRequest } from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import { longFormTreatment } from '@/tests/fixtures/thinkforge-video-treatment';

function masterPlan(): ScriptChapterPlan {
  return materializeScriptChapterPlan({
    title: 'The practice that survives',
    narrativeThesis: 'A practice survives when its ordinary rigor becomes visible and shareable.',
    targetDurationSeconds: 420,
    audienceJourney: {
      openingState: 'The audience sees only the finished outcome.',
      closingState: 'The audience understands the patient practice behind the outcome.',
    },
    continuityBible: {
      pointOfView: 'A specific, observant narrator follows the work without romanticizing it.',
      temporalFrame: 'One working day that moves from private preparation to public meaning.',
      toneProgression: ['curiosity', 'attention', 'earned confidence'],
      recurringMotifs: ['hands', 'marks of revision'],
      terminologyInvariants: ['practice', 'record'],
    },
    characters: [{
      id: 'narrator',
      name: 'Narrator',
      narrativeRole: 'Guides the audience through the observed practice.',
      voice: 'Measured, exact, and humane.',
      openingState: 'Asks what the finished outcome conceals.',
      closingState: 'Shows the practice as a repeatable act of care.',
      invariantTraits: ['specific', 'unhurried'],
    }],
    continuityThreads: [{
      id: 'revision_mark',
      promise: 'An early mark of revision will gain meaning when the finished work is shown.',
      intendedPayoff: 'The final work preserves the mark as evidence of practice rather than a flaw.',
      introducedInSceneId: 'scene_preparation',
      resolution: { policy: 'resolved', resolvedInSceneId: 'scene_public_meaning' },
    }],
    acts: [{
      id: 'act_attention',
      title: 'What the finished outcome hides',
      narrativePurpose: 'Make the unseen work legible before explaining its consequence.',
      chapters: [{
        id: 'chapter_preparation',
        title: 'The repeated preparation',
        narrativePurpose: 'Observe the practice and introduce the revision mark as an unresolved detail.',
        audienceStateBefore: 'The finished outcome appears effortless.',
        audienceStateAfter: 'The audience sees the deliberate work inside it.',
        sceneBlueprints: [{
          id: 'scene_preparation',
          title: 'The work before the work',
          narrativePurpose: 'Show preparation as a sequence of deliberate choices.',
          openingState: 'The tools and working surface are quiet.',
          development: ['Observe repeated adjustments', 'Notice one retained revision mark'],
          closingState: 'The mark becomes a question the audience carries forward.',
          durationIntentSeconds: 180,
          requiredSourceRefs: [],
          requiredCharacterIds: ['narrator'],
          continuityThreadIds: ['revision_mark'],
        }],
      }],
    }, {
      id: 'act_meaning',
      title: 'Why the practice matters',
      narrativePurpose: 'Return to the revision mark and turn observation into a grounded conclusion.',
      chapters: [{
        id: 'chapter_public_meaning',
        title: 'The visible record',
        narrativePurpose: 'Resolve the mark as evidence of continued care rather than imperfection.',
        audienceStateBefore: 'The audience understands the effort but not its significance.',
        audienceStateAfter: 'The audience can recognize the practice in the finished work.',
        sceneBlueprints: [{
          id: 'scene_public_meaning',
          title: 'The mark remains',
          narrativePurpose: 'Connect the visible revision mark to the public meaning of the work.',
          openingState: 'The revised outcome is presented to others.',
          development: ['Return to the retained mark', 'Show the mark as a record of care'],
          closingState: 'The audience sees practice as something that can be noticed and valued.',
          durationIntentSeconds: 240,
          requiredSourceRefs: [],
          requiredCharacterIds: ['narrator'],
          continuityThreadIds: ['revision_mark'],
        }],
      }],
    }],
  });
}

function productionBrief(): ProductionBrief {
  return {
    entryPoint: 'thinkforge',
    output: {
      format: 'auto-edit',
      platform: 'youtube',
      aspectRatio: '16:9',
      targetDurationSec: 420,
      count: 1,
      voiceLanguages: ['en'],
    },
    resolution: { fieldConfidence: {}, inferred: [], confirmed: [] },
  };
}

function sustainedNarration(sceneId: string, durationSeconds: number): string {
  return Array.from(
    { length: durationSeconds * 2 },
    (_unused, index) => `observation${sceneId.replaceAll('_', '')}word${index + 1}`,
  ).join(' ');
}

function chapterResult(input: {
  actId: string;
  sceneId: string;
  durationSeconds: number;
}) {
  const output: ScriptWriterModelOutput = {
    contentAnalysis: {
      hooks: [`A specific opening for ${input.sceneId}.`],
      theme: 'Visible practice.',
      emphasisPoints: [input.sceneId],
      qualityScore: 92,
    },
    visualMetadata: { motionInfo: 'Patient documentary movement that follows the work.' },
    metadata: { platform: 'youtube' },
    sidecar: {
      sidecarVersion: 2,
      spokenTextSource: 'beat-lines',
      characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }],
      acts: [{
        id: input.actId,
        title: input.actId === 'act_attention' ? 'What the finished outcome hides' : 'Why the practice matters',
        narrativePurpose: 'Serve the approved master narrative.',
        narrativeScenes: [{
          id: input.sceneId,
          title: input.sceneId === 'scene_preparation' ? 'The work before the work' : 'The mark remains',
          narrativePurpose: 'Advance the planned audience transition.',
          durationIntentSeconds: input.durationSeconds,
          charactersPresent: ['narrator'],
          sourceRefs: [],
          beats: [{
            id: `beat_${input.sceneId}`,
            kind: 'voiceover',
            narrativePurpose: 'Carry the approved narrative development in spoken form.',
            durationIntentSeconds: input.durationSeconds,
            lines: [{
              id: `line_${input.sceneId}`,
              text: sustainedNarration(input.sceneId, input.durationSeconds),
              speakerId: 'narrator',
              languageCode: 'en',
              onCamera: false,
              delivery: 'voiceover',
              sourceRefs: [],
            }],
            visualIntent: {
              description: 'Natural light follows hands, tools, material, and the retained revision mark.',
              onScreenText: [],
            },
            shotIntent: {
              narrativePurpose: 'Keep the work and its revision mark readable without manufacturing spectacle.',
              emotionalBeat: 'Attentive clarity.',
              energy: 0.35,
              visualPriority: 'The hands, material changes, and retained revision mark.',
              action: 'demonstrating',
              desiredFraming: 'medium',
              desiredAngle: 'eye-level',
              desiredMovement: 'static',
              movementMotivation: '',
              simultaneousPerformers: 1,
              spokenAudio: false,
              performance: [{
                characterId: 'narrator',
                stance: 'standing',
                emotion: 'attentive clarity',
                intensity: 0.35,
                gaze: 'toward the material and revision mark',
                posture: 'upright beside the confirmed work surface',
                gesture: 'indicate the current revision detail',
                movement: 'remain on the confirmed subject mark',
              }],
              continuity: { wardrobe: [], props: ['tools', 'revision mark'], previousSceneIds: [] },
            },
            sourceRefs: [],
          }],
        }],
      }],
      creativeDirection: {
        overallMusicPrompt: 'Restrained acoustic documentary bed with room tone.',
        colorPalette: ['warm material', 'natural white'],
      },
      briefId: 'brief_long_form_e2e',
      sourceRefs: [],
    },
  };
  return materializeScriptWriterResult(output);
}

function chapterResultV3(input: {
  actId: string;
  chapterId: string;
  sceneId: string;
  durationSeconds: number;
  treatmentEventIds: string[];
  treatment: typeof longFormTreatment;
}) {
  const output: ScriptWriterV3ModelOutput = {
    contentAnalysis: {
      hooks: [`A specific opening for ${input.sceneId}.`],
      theme: 'Visible practice.',
      emphasisPoints: [input.sceneId],
      qualityScore: 92,
    },
    visualMetadata: { motionInfo: 'Patient documentary movement that follows the argument.' },
    metadata: { platform: 'youtube' },
    sidecar: {
      sidecarVersion: 3,
      spokenTextSource: 'beat-lines',
      characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }],
      acts: [{
        id: input.actId,
        title: input.actId === 'act_attention' ? 'What the finished outcome hides' : 'Why the practice matters',
        narrativePurpose: 'Serve the approved master narrative.',
        narrativeScenes: [{
          id: input.sceneId,
          title: input.sceneId === 'scene_preparation' ? 'The work before the work' : 'The mark remains',
          narrativePurpose: 'Advance the planned audience transition.',
          durationIntentSeconds: input.durationSeconds,
          charactersPresent: ['narrator'],
          sourceRefs: [],
          beats: [{
            id: `beat_${input.sceneId}`,
            kind: 'voiceover',
            narrativePurpose: 'Carry the approved narrative development in spoken form.',
            durationIntentSeconds: input.durationSeconds,
            lines: [{
              id: `line_${input.sceneId}`,
              text: sustainedNarration(input.sceneId, input.durationSeconds),
              speakerId: 'narrator',
              languageCode: 'en',
              onCamera: false,
              delivery: 'voiceover',
              sourceRefs: [],
            }],
            treatmentVisualEvents: input.treatmentEventIds.map((treatmentEventId) => ({ treatmentEventId })),
            sourceRefs: [],
          }],
        }],
      }],
      sourceRefs: [],
    },
  };
  return materializeScriptWriterV3Result(
    output,
    input.treatment,
    { mode: 'chapter', chapterId: input.chapterId },
    undefined,
    input.treatmentEventIds,
  );
}

function jobFixture(): {
  job: LongFormScriptGenerationJobSnapshot;
  editorialPlan: ThinkForgeScriptEditorialPlanArtifact;
  sourceLedger: SourceLedger;
} {
  const brief = productionBrief();
  const userPrompt = 'Create a seven-minute video essay about the quiet rigor of daily practice.';
  const sourceLedger = buildThinkForgeSourceLedger({ userPrompt });
  const authoringRequest = createThinkForgeAuthoringRequest({
    contentContract: createThinkForgeWriterContract('video_script'),
    platformSurface: { id: 'youtube' },
    publishingSurface: 'youtube_video',
    targetDurationSec: 420,
  });
  const editorialPlan = buildThinkForgeEditorialPlan({
    userPrompt,
    authoringRequest,
    productionBrief: brief,
    sourceLedgerEntryIds: sourceLedger.entries.map((entry) => entry.referenceId),
  });
  if (editorialPlan.writerKind !== 'script') throw new Error('Expected a script editorial plan fixture.');

  const input: LongFormScriptGenerationJobSnapshot['input'] = {
    userId: 'user_1',
    orgId: 'org_1',
    sessionId: 'session_1',
    generationId: 'generation_1',
    scriptId: 'script_1',
    baseVersion: 0,
    authoringContext: {
      projectMeta: { brandId: 'brand_1' },
      retrievedContext: { projectFacts: [], globalFacts: [], semanticFacts: [], interactionPatterns: [] },
      creativeReferenceContext: {
        version: 1,
        referenceSet: { version: 1, referenceSetId: 'creative_refs_empty', references: [] },
        scope: { kind: 'personal', ownerUserId: 'user_1', brandId: 'brand_1' },
        sources: [],
        selectedReferenceIds: [],
        analyzedReferenceIds: [],
        unresolved: [],
        brandRevision: null,
      },
      systemBrief: 'Author from the accepted brand context and the user request.',
      snapshot: { profile: { recordId: 'profile_1', revision: 5, checksum: 'c'.repeat(64) } },
    } as never,
    authoringInput: {
      context: { projectSummary: 'A documentary about visible daily practice.' },
      userPrompt,
      authoringRequest,
      editorialPlan,
      productionBrief: brief,
      sourceLedger,
    } as never,
    signalTrace: { outputFormat: 'video_script', goal: 'documentary', angle: 'observational' } as never,
  };

  return {
    job: {
      id: 'longscript_provider_stub_e2e',
      version: LONG_FORM_SCRIPT_JOB_VERSION,
      dedupeKey: createLongFormScriptJobDedupeKey(input),
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      generationId: 'generation_1',
      input,
      status: 'running',
      stage: 'planning',
      dispatchCount: 1,
      stageFailureCount: 0,
      maxStageFailures: 3,
      leaseExpiresAt: null,
      queueMessageId: null,
      plan: null,
      planHash: null,
      chapterArtifacts: {},
      chapterArtifactHashes: {},
      assembledResult: null,
      assembledResultHash: null,
      commitReceipt: null,
      error: null,
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-20T10:00:00.000Z',
      expiresAt: '2026-08-22T10:00:00.000Z',
    },
    editorialPlan,
    sourceLedger,
  };
}

function shootKitProfile() {
  return {
    version: 1,
    profileId: 'profile_provider_stub_e2e',
    spaces: [{
      id: 'workroom',
      label: 'Quiet workroom',
      dimensionsM: { width: 3.5, depth: 4.5, height: 2.8 },
      usableDepthM: 3.8,
      noiseFloor: 'quiet',
    }],
    equipment: [
      {
        id: 'phone',
        label: 'Phone camera',
        category: 'camera',
        kind: 'phone',
        availability: 'owned',
        preferred: true,
        focalLengthEquivalentMm: { min: 24, max: 28 },
      },
      { id: 'tripod', label: 'Phone tripod', category: 'support', kind: 'tripod', availability: 'owned', maxHeightM: 1.8 },
    ],
    people: {
      performersAvailable: 1,
      cameraOperatorsAvailable: 0,
      assistantsAvailable: 0,
      selfShoot: true,
      subjectCalibration: {
        source: 'user-measured',
        eyeHeightMByStance: { standing: 1.61 },
      },
    },
    constraints: {
      currency: 'INR',
      maxIncrementalSpend: 0,
      rentalAllowed: false,
      purchaseAllowed: false,
      maxSetupMinutes: 20,
      maxSetupChanges: 4,
      maxLocationChanges: 0,
    },
    preferences: {
      defaultPlanTier: 'no-spend',
      prioritize: ['cost', 'setup-time'],
      householdSubstitutionsAllowed: true,
    },
  };
}

function semanticRequirements(prompt: string): Array<{ id: string; allowedSceneIds: string[] }> {
  const encoded = prompt.match(/<tf_untrusted_data version="1">\n([\s\S]+)\n<\/tf_untrusted_data>/)?.[1];
  if (!encoded) throw new Error('Provider stub did not receive an isolated semantic-validation envelope.');
  const envelope = JSON.parse(encoded) as { data?: { requirements?: string } };
  const requirements = envelope.data?.requirements;
  if (!requirements) throw new Error('Provider stub did not receive semantic requirements.');
  return JSON.parse(requirements) as Array<{ id: string; allowedSceneIds: string[] }>;
}

function semanticCitationsByScene(prompt: string): Map<string, { beatId: string; lineId: string }> {
  const encoded = prompt.match(/<tf_untrusted_data version="1">\n([\s\S]+)\n<\/tf_untrusted_data>/)?.[1];
  if (!encoded) throw new Error('Provider stub did not receive an isolated semantic-validation envelope.');
  const envelope = JSON.parse(encoded) as { data?: { chapterTranscript?: string } };
  const transcript = envelope.data?.chapterTranscript;
  if (!transcript) throw new Error('Provider stub did not receive the chapter transcript.');

  const citations = new Map<string, { beatId: string; lineId: string }>();
  let sceneId: string | null = null;
  let beatId: string | null = null;
  transcript.split('\n').forEach((line) => {
    const scene = line.match(/^SCENE (?!PURPOSE:)([^:]+):/);
    if (scene) {
      sceneId = scene[1] ?? null;
      beatId = null;
      return;
    }
    const beat = line.match(/^BEAT ([^\s]+) \(/);
    if (beat) {
      beatId = beat[1] ?? null;
      return;
    }
    const spokenLine = line.match(/^LINE ([^:]+):/);
    if (sceneId && beatId && spokenLine && !citations.has(sceneId)) {
      citations.set(sceneId, { beatId, lineId: spokenLine[1]! });
    }
  });
  return citations;
}

beforeEach(() => {
  // Constructors use the real provider router, but every provider call below is stubbed.
  process.env.GEMINI_API_KEY = 'provider-stub-key';
  persistence.applyCommand.mockReset();
  persistence.claimGenerationCommit.mockReset();
  persistence.generateStructuredWithWritingContextCache.mockReset();
  persistence.getActiveGeneration.mockReset();
  persistence.getScript.mockReset();
  persistence.getSession.mockReset();

  persistence.applyCommand.mockResolvedValue({ ok: true, script: { version: 1 } });
  persistence.claimGenerationCommit.mockResolvedValue(true);
  persistence.getActiveGeneration.mockResolvedValue({
    id: 'generation_1',
    scriptId: 'script_1',
    status: 'running',
  });
  persistence.getScript.mockResolvedValue(null);
  persistence.getSession.mockResolvedValue({ _id: 'session_1' });
  persistence.generateStructuredWithWritingContextCache.mockImplementation(async (input: { prompt: string }) => ({
    modelName: 'gemini-semantic-provider-stub',
    cacheStatus: 'inline',
    result: {
      assessments: semanticRequirements(input.prompt).map((requirement) => {
        const sceneId = requirement.allowedSceneIds[0];
        if (!sceneId) throw new Error(`Semantic requirement ${requirement.id} has no allowed scene.`);
        const citations = semanticCitationsByScene(input.prompt);
        const citation = citations.get(sceneId);
        if (!citation) {
          throw new Error(
            `Semantic transcript has no spoken citation for ${sceneId}; available scenes: ${[...citations.keys()].join(', ') || 'none'}.`,
          );
        }
        return {
          requirementId: requirement.id,
          status: 'satisfied',
          evidence: [{
            sceneId,
            beatId: citation.beatId,
            kind: 'spoken_line',
            lineIds: [citation.lineId],
          }],
          rationale: 'The stub cites a real chapter line, allowing the runtime receipt validator to run normally.',
        };
      }),
    },
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalGeminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiApiKey;
});

describe('long-form ThinkForge provider-stub E2E', () => {
  it('persists a seven-minute chaptered script and carries its chapter identity into Shoot Kit and Editron', async () => {
    const fixture = jobFixture();
    const plan = masterPlan();
    const trace = buildThinkForgeWriterInvocationTrace({
      writerType: 'script',
      editorialPlan: fixture.editorialPlan,
      selectedTechniques: [],
      promptTemplate: 'provider-stub-long-form-writer',
      sourceLedger: fixture.sourceLedger,
      provider: 'gemini',
      model: 'gemini-provider-stub',
      cacheStatus: 'inline',
      generatedAt: '2026-08-20T10:00:00.000Z',
    });
    const planAgent = vi.spyOn(ScriptChapterPlanAgent.prototype, 'generatePlan').mockResolvedValue({
      result: plan,
      metadata: {},
    } as never);
    const writer = vi.spyOn(ScriptWriterAgent.prototype, 'runStructured').mockImplementation(async (input) => {
      const execution = input.chapterExecution;
      if (!execution) throw new Error('Chapter writer must receive the server-owned assignment.');
      const chapter = execution.plan.acts
        .flatMap((act) => act.chapters.map((candidate) => ({ actId: act.id, chapter: candidate })))
        .find((candidate) => candidate.chapter.id === execution.chapterId);
      const scene = chapter?.chapter.sceneBlueprints[0];
      if (!chapter || !scene) throw new Error(`Unexpected chapter assignment: ${execution.chapterId}`);
      return {
        result: chapterResult({
          actId: chapter.actId,
          sceneId: scene.id,
          durationSeconds: scene.durationIntentSeconds,
        }),
        metadata: { writerTrace: trace },
      } as never;
    });

    const planned = await executeLongFormScriptAction({ job: fixture.job, action: { kind: 'plan' } });
    expect(planned).toMatchObject({ kind: 'plan', plan: { targetDurationSeconds: 420 } });
    if (planned.kind !== 'plan') throw new Error('Expected master-plan action.');

    const plannedJob: LongFormScriptGenerationJobSnapshot = {
      ...fixture.job,
      plan: planned.plan,
      stage: 'writing',
    };
    const firstChapter = await executeLongFormScriptAction({
      job: plannedJob,
      action: { kind: 'write_chapter', actId: 'act_attention', chapterId: 'chapter_preparation' },
    });
    if (firstChapter.kind !== 'write_chapter') throw new Error('Expected first chapter artifact.');

    const firstArtifactJob: LongFormScriptGenerationJobSnapshot = {
      ...plannedJob,
      chapterArtifacts: { chapter_preparation: firstChapter.artifact },
    };
    const secondChapter = await executeLongFormScriptAction({
      job: firstArtifactJob,
      action: { kind: 'write_chapter', actId: 'act_meaning', chapterId: 'chapter_public_meaning' },
    });
    if (secondChapter.kind !== 'write_chapter') throw new Error('Expected second chapter artifact.');

    const completeArtifactJob: LongFormScriptGenerationJobSnapshot = {
      ...firstArtifactJob,
      chapterArtifacts: {
        ...firstArtifactJob.chapterArtifacts,
        chapter_public_meaning: secondChapter.artifact,
      },
      stage: 'assembling',
    };
    const assembled = await executeLongFormScriptAction({ job: completeArtifactJob, action: { kind: 'assemble' } });
    if (assembled.kind !== 'assemble') throw new Error('Expected assembled long-form script.');
    expect(assembled.result.metadata.estimatedTimeSeconds).toBe(420);

    const committed = await executeLongFormScriptAction({
      job: { ...completeArtifactJob, assembledResult: assembled.result, stage: 'committing' },
      action: { kind: 'commit' },
    });
    expect(committed).toMatchObject({ kind: 'commit', receipt: { documentVersion: 1 } });
    expect(planAgent).toHaveBeenCalledOnce();
    expect(writer).toHaveBeenCalledTimes(2);
    expect(persistence.generateStructuredWithWritingContextCache).toHaveBeenCalledTimes(2);

    const command = persistence.applyCommand.mock.calls[0]?.[0] as {
      payload?: {
        content?: string;
        contentContract?: unknown;
        documentType?: string;
        metadata?: { writerOutput?: unknown } & Record<string, unknown>;
      };
    };
    const writerOutput = command.payload?.metadata?.writerOutput as {
      scriptSidecar: unknown;
      longForm: { plan: ScriptChapterPlan };
      profileCompliance?: unknown;
      generationTrace?: { qualityGate: { evidenceHash: string } };
    };
    expect(writerOutput.longForm.plan.targetDurationSeconds).toBe(420);
    expect(writerOutput.profileCompliance).toEqual({
      kind: 'long_form_script',
      chapterCount: 2,
      narrativeContract: 'passed',
      profileCompliance: { status: 'not_applicable' },
    });
    expect(hashThinkForgeTraceValue(writerOutput.profileCompliance))
      .toBe(writerOutput.generationTrace?.qualityGate.evidenceHash);
    expect(diagnoseThinkForgeDocumentEvidence({
      sessionId: 'session_1',
      scriptId: 'script_1',
      session: { projectMeta: { brandBinding: { version: 2, brandId: 'brand_1', scope: 'personal' } } } as never,
      script: {
        version: 1,
        documentType: command.payload?.documentType,
        contentContract: command.payload?.contentContract,
        content: command.payload?.content,
        metadata: command.payload?.metadata,
      } as never,
    }).traceIntegrity).toEqual({ valid: false, codes: ['generation_receipt_missing'] });

    const shootKit = buildScriptShotPlan({
      sidecar: writerOutput.scriptSidecar,
      chapterPlan: writerOutput.longForm.plan,
      profile: shootKitProfile(),
      aspectRatio: '16:9',
    });
    expect(shootKit.status).toBe('ready');
    if (shootKit.status !== 'ready') throw new Error('Expected a production-ready Shoot Kit plan.');
    expect(shootKit.plan.narrativeStructure?.acts.flatMap((act) => act.chapters.map((chapter) => chapter.id)))
      .toEqual(['chapter_preparation', 'chapter_public_meaning']);

    const editron = mapScriptSidecarToEditronExport(writerOutput.scriptSidecar, {
      chapterPlan: writerOutput.longForm.plan,
    });
    expect(editron.sidecarCompilation.sceneBindings.map((binding) => ({
      actId: binding.actId,
      chapterId: binding.chapterId,
      narrativeSceneId: binding.narrativeSceneId,
    }))).toEqual([
      { actId: 'act_attention', chapterId: 'chapter_preparation', narrativeSceneId: 'scene_preparation' },
      { actId: 'act_meaning', chapterId: 'chapter_public_meaning', narrativeSceneId: 'scene_public_meaning' },
    ]);
  });

  it('preserves an approved V3 semantic treatment through durable chapter assembly and commit', async () => {
    const fixture = jobFixture();
    const treatment = structuredClone(longFormTreatment);
    treatment.audiovisualIntent.audibleSpeech = 'required';
    treatment.decisionTrace.sourceRefs = ['brief_user'];
    treatment.visualEvents[0]!.sourceRefs = ['brief_user'];
    fixture.editorialPlan.execution.plan.audiovisualIntent = structuredClone(treatment.audiovisualIntent);
    fixture.job.input.authoringInput = {
      ...fixture.job.input.authoringInput,
      editorialPlan: fixture.editorialPlan,
      videoTreatment: treatment,
    };
    fixture.job.dedupeKey = createLongFormScriptJobDedupeKey(fixture.job.input);
    const plan = masterPlan();
    plan.acts[0]!.chapters[0]!.sceneBlueprints[0]!.treatmentEventIds = ['event_long_form_anchor'];
    const trace = buildThinkForgeWriterInvocationTrace({
      writerType: 'script',
      editorialPlan: fixture.editorialPlan,
      selectedTechniques: [],
      promptTemplate: 'provider-stub-long-form-v3-writer',
      sourceLedger: fixture.sourceLedger,
      provider: 'gemini',
      model: 'gemini-provider-stub',
      cacheStatus: 'inline',
      generatedAt: '2026-08-22T10:00:00.000Z',
    });
    const planAgent = vi.spyOn(ScriptChapterPlanAgent.prototype, 'generatePlan').mockImplementation(async (input) => {
      expect(input.videoTreatment).toEqual(treatment);
      return { result: plan, metadata: {} } as never;
    });
    const writer = vi.spyOn(ScriptWriterAgent.prototype, 'runStructured').mockImplementation(async (input) => {
      const execution = input.chapterExecution;
      if (!execution) throw new Error('Chapter writer must receive the server-owned assignment.');
      expect(input.videoTreatment).toEqual(treatment);
      const prompt = new ScriptWriterAgent().buildPromptParts(input).prompt;
      expect(prompt).toContain('"audibleSpeech": "required"');
      expect(prompt).toContain('"targetDurationSeconds": 420');
      expect(prompt).toContain(`"targetDurationSeconds": ${execution.chapterId === 'chapter_preparation' ? 180 : 240}`);
      const chapter = execution.plan.acts
        .flatMap((act) => act.chapters.map((candidate) => ({ actId: act.id, chapter: candidate })))
        .find((candidate) => candidate.chapter.id === execution.chapterId);
      const scene = chapter?.chapter.sceneBlueprints[0];
      if (!chapter || !scene) throw new Error(`Unexpected chapter assignment: ${execution.chapterId}`);
      return {
        result: chapterResultV3({
          actId: chapter.actId,
          chapterId: chapter.chapter.id,
          sceneId: scene.id,
          durationSeconds: scene.durationIntentSeconds,
          treatmentEventIds: [...(scene.treatmentEventIds ?? [])],
          treatment,
        }),
        metadata: { writerTrace: trace },
      } as never;
    });

    const planned = await executeLongFormScriptAction({ job: fixture.job, action: { kind: 'plan' } });
    if (planned.kind !== 'plan') throw new Error('Expected master-plan action.');
    const plannedJob: LongFormScriptGenerationJobSnapshot = {
      ...fixture.job,
      plan: planned.plan,
      stage: 'writing',
    };
    const firstChapter = await executeLongFormScriptAction({
      job: plannedJob,
      action: { kind: 'write_chapter', actId: 'act_attention', chapterId: 'chapter_preparation' },
    });
    if (firstChapter.kind !== 'write_chapter') throw new Error('Expected first chapter artifact.');
    const secondChapter = await executeLongFormScriptAction({
      job: { ...plannedJob, chapterArtifacts: { chapter_preparation: firstChapter.artifact } },
      action: { kind: 'write_chapter', actId: 'act_meaning', chapterId: 'chapter_public_meaning' },
    });
    if (secondChapter.kind !== 'write_chapter') throw new Error('Expected second chapter artifact.');
    const completeArtifactJob: LongFormScriptGenerationJobSnapshot = {
      ...plannedJob,
      chapterArtifacts: {
        chapter_preparation: firstChapter.artifact,
        chapter_public_meaning: secondChapter.artifact,
      },
      stage: 'assembling',
    };
    const assembled = await executeLongFormScriptAction({ job: completeArtifactJob, action: { kind: 'assemble' } });
    if (assembled.kind !== 'assemble' || !isScriptWriterV3Result(assembled.result)) {
      throw new Error('Expected a materialized V3 long-form script.');
    }
    expect(assembled.result.metadata.estimatedTimeSeconds).toBe(420);
    const assembledEvents = assembled.result.sidecar.acts
      .flatMap((act) => act.narrativeScenes)
      .flatMap((scene) => scene.beats)
      .flatMap((beat) => beat.visualEvents);
    expect(assembled.result.sidecar.treatment).toEqual({
      treatmentId: treatment.treatmentId,
      treatmentVersion: treatment.version,
      inputFingerprint: treatment.decisionTrace.inputFingerprint,
    });
    expect(assembledEvents.map((event) => event.treatmentEventId)).toEqual(['event_long_form_anchor']);
    expect(assembledEvents[0]?.sourceRefs).toEqual(['brief_user']);
    expect(assembled.result.sidecar.sourceRefs).toContain('brief_user');
    expect(JSON.stringify(assembled.result.sidecar)).not.toContain('shotIntent');
    expect(JSON.stringify(assembled.result.sidecar)).not.toContain('renderPlan');

    await expect(executeLongFormScriptAction({
      job: { ...completeArtifactJob, assembledResult: assembled.result, stage: 'committing' },
      action: { kind: 'commit' },
    })).resolves.toMatchObject({ kind: 'commit', receipt: { documentVersion: 1 } });
    expect(planAgent).toHaveBeenCalledOnce();
    expect(writer).toHaveBeenCalledTimes(2);
    const persistedWriterOutput = (persistence.applyCommand.mock.calls[0]?.[0] as {
      payload?: {
        metadata?: {
          writerOutput?: {
            scriptSidecar?: { sidecarVersion?: number };
            videoTreatment?: unknown;
          };
        };
      };
    }).payload?.metadata?.writerOutput;
    const persistedSidecar = persistedWriterOutput?.scriptSidecar;
    expect(persistedSidecar?.sidecarVersion).toBe(3);
    expect(persistedWriterOutput?.videoTreatment).toEqual(treatment);
  });

  it('rejects changed V3 identity, audiovisual intent, or source provenance before planning', async () => {
    const fixture = jobFixture();
    const treatment = structuredClone(longFormTreatment);
    treatment.audiovisualIntent.audibleSpeech = 'required';
    treatment.decisionTrace.sourceRefs = ['brief_user'];
    treatment.visualEvents[0]!.sourceRefs = ['brief_user'];
    fixture.editorialPlan.execution.plan.audiovisualIntent = structuredClone(treatment.audiovisualIntent);
    fixture.job.input.authoringInput = {
      ...fixture.job.input.authoringInput,
      editorialPlan: fixture.editorialPlan,
      videoTreatment: treatment,
    };
    fixture.job.dedupeKey = createLongFormScriptJobDedupeKey(fixture.job.input);
    const planAgent = vi.spyOn(ScriptChapterPlanAgent.prototype, 'generatePlan');

    const changedFingerprint = structuredClone(fixture.job);
    changedFingerprint.input.authoringInput.videoTreatment!.decisionTrace.inputFingerprint = 'changed_fingerprint';
    const integrityError = await executeLongFormScriptAction({
      job: changedFingerprint,
      action: { kind: 'plan' },
    }).then(() => null, (error: unknown) => error);
    expect(integrityError).toMatchObject({
      name: 'LongFormScriptJobInputIntegrityError',
      code: 'LONG_FORM_SCRIPT_INPUT_INTEGRITY_INVALID',
      failures: ['immutable_input_hash_mismatch'],
    });
    expect(isRetryableLongFormScriptActionError(integrityError)).toBe(false);
    expect(normalizeLongFormScriptJobError(integrityError, 'planning', false)).toMatchObject({
      code: 'LONG_FORM_SCRIPT_INPUT_INTEGRITY_INVALID',
      retryable: false,
      stage: 'planning',
    });

    const removedTreatment = structuredClone(fixture.job);
    delete removedTreatment.input.authoringInput.videoTreatment;
    await expect(executeLongFormScriptAction({
      job: removedTreatment,
      action: { kind: 'plan' },
    })).rejects.toThrow(/immutable_input_hash_mismatch/);

    const changedIntent = structuredClone(fixture.job);
    changedIntent.input.authoringInput.editorialPlan.execution.plan.audiovisualIntent.audibleSpeech = 'forbidden';
    changedIntent.dedupeKey = createLongFormScriptJobDedupeKey(changedIntent.input);
    await expect(executeLongFormScriptAction({
      job: changedIntent,
      action: { kind: 'plan' },
    })).rejects.toThrow(/audiovisual_intent_mismatch/);

    const changedSource = structuredClone(fixture.job);
    changedSource.input.authoringInput.videoTreatment!.visualEvents[0]!.sourceRefs = ['forged_source'];
    changedSource.dedupeKey = createLongFormScriptJobDedupeKey(changedSource.input);
    await expect(executeLongFormScriptAction({
      job: changedSource,
      action: { kind: 'plan' },
    })).rejects.toThrow(/unknown_source_ref:forged_source/);

    expect(planAgent).not.toHaveBeenCalled();
  });
});
