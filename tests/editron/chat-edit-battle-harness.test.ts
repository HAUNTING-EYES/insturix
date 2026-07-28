import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const fixture = vi.hoisted(() => ({
  modelStep: 0,
  systemInstruction: '',
  modelContents: [] as unknown[],
  project: {} as Record<string, unknown>,
}));

vi.mock('@google/generative-ai', () => ({
  SchemaType: { OBJECT: 'object' },
  GoogleGenerativeAI: class GoogleGenerativeAIFixture {
    getGenerativeModel(config: { systemInstruction?: string }) {
      fixture.systemInstruction = config.systemInstruction ?? '';
      return {
        async generateContentStream(input: { contents: unknown[] }) {
          fixture.modelContents.push(input.contents);
          const step = fixture.modelStep++;
          if (step > 0) {
            const modelMessages = (input.contents as Array<{
              role?: string;
              parts?: Array<Record<string, unknown>>;
            }>).filter((content) => content.role === 'model');
            const latestFunctionCall = [...modelMessages]
              .reverse()
              .flatMap((content) => content.parts ?? [])
              .find((part) => 'functionCall' in part);
            if (!latestFunctionCall?.thoughtSignature) {
              throw new Error('Function call is missing a thought_signature');
            }
          }
          const part = step === 0
            ? {
                functionCall: {
                  name: 'read_project_file',
                  args: { mode: 'full', start: '0', end: '1000000', trackIds: 'all' },
                },
                thoughtSignature: 'signed-read-project',
              }
            : step === 1
              ? {
                  functionCall: {
                    name: 'add_overlay',
                    args: {
                      type: 'text',
                      content: 'Launch day',
                      from: 0,
                      durationInFrames: 90,
                    },
                  },
                  thoughtSignature: 'signed-add-overlay',
                }
              : { text: 'Added the requested title.' };
          const chunk = { candidates: [{ content: { parts: [part] } }] };
          return {
            stream: {
              async *[Symbol.asyncIterator]() {
                yield chunk;
              },
            },
            response: Promise.resolve({
              // The legacy SDK's aggregate currently drops thoughtSignature
              // even though the streaming chunk above contains it. The agent
              // must preserve stream parts and use this aggregate for usage only.
              candidates: [{
                content: {
                  parts: ['functionCall' in part ? [{ functionCall: part.functionCall }] : [part]],
                },
              }],
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 5,
                totalTokenCount: 15,
              },
            }),
          };
        },
      };
    }
  },
}));

vi.mock('@/lib/editron/agent/tools', () => ({
  createTools: () => [
    tool(
      async () => JSON.stringify({
        status: 'success',
        data: { projectId: fixture.project.projectId, overlayCount: (fixture.project.overlays as unknown[]).length },
        error: null,
        nextAction: null,
      }),
      {
        name: 'read_project_file',
        description: 'Read project state.',
        schema: z.object({
          mode: z.enum(['full', 'slice', 'byTrackIds']).optional().default('full'),
          start: z.coerce.number().optional(),
          end: z.coerce.number().optional(),
          trackIds: z.array(z.string()).optional(),
        }),
      },
    ),
    tool(
      async (input) => {
        const overlays = fixture.project.overlays as Record<string, unknown>[];
        overlays.push({
          id: 'title-1',
          type: input.type,
          content: input.content,
          from: input.from,
          durationInFrames: input.durationInFrames,
          row: 0,
        });
        return JSON.stringify({
          status: 'success',
          data: { overlayId: 'title-1' },
          error: null,
          nextAction: { reloadProject: true },
        });
      },
      {
        name: 'add_overlay',
        description: 'Add an overlay.',
        schema: z.object({
          type: z.string(),
          content: z.string(),
          from: z.number(),
          durationInFrames: z.number(),
        }),
      },
    ),
  ],
}));

import { createAgent, normalizeAgentToolArgs } from '@/lib/editron/agent/agent-graph';
import {
  enforceChatToolPostcondition,
  verifyChatToolPostcondition,
} from '@/lib/editron/agent/chat-edit-postconditions';
import { CHAT_TOOL_REGISTRY } from '@/lib/editron/agent/chat-tool-registry';
import {
  CHAT_EDIT_BATTLE_SCENARIOS,
  buildChatBattleProjectSnapshot,
  buildChatEditBattleSuite,
  chatBattleInvocationHasSuccessfulMutation,
  evaluateChatEditBattleJourney,
  evaluateChatBattleFixturePreconditions,
  extractPersistedChatBattleRenderEvidence,
  getChatEditBattleScenario,
  runChatEditBattleJourney,
  type ChatBattleInvocationEvidence,
  type ChatBattleToolEvent,
} from '@/lib/editron/services/chat-edit-battle-harness';
import {
  buildRequestedChatEditRenderVerification,
  markChatEditRenderVerificationDelivered,
  markChatEditRenderVerificationDeliveryFailed,
  markChatEditRenderVerificationDispatched,
  markChatEditRenderVerificationRendering,
  markChatEditRenderVerificationTerminal,
  resolveChatEditRenderVerificationStatus,
} from '@/lib/editron/services/chat-edit-render-verification-lifecycle';
import type {
  ChatEditRenderedAudioEvidence,
  ChatEditRenderedAudioWindowEvidence,
  ChatEditRenderVerificationRequest,
} from '@/lib/editron/services/phase0-rendered-evidence-worker';
import {
  buildLiveChatRequestBody,
  chatBattleInvocationQueuedProjectMutation,
  extractQueuedDubbingJobId,
  extractQueuedEditorialIntentJobId,
  extractQueuedReferenceStyleJobId,
  loadChatBattleMongoProject,
  mergeChatBattleInvocations,
  parseChatBattleCliArgs,
  parseChatBattleOperationReplayResponse,
  shouldPollForFreshChatBattleRenderEvidence,
  validateChatBattleCliOptions,
  waitForDubbingJobTerminal,
  waitForEditorialIntentJobTerminal,
  waitForReferenceStyleJobTerminal,
  waitForFreshChatBattleRenderEvidence,
  waitForQueuedProjectMutation,
  readChatBattleAuthHeaders,
} from '../../scripts/run-chat-edit-battle';

function project(overlays: Record<string, unknown>[] = []) {
  return {
    projectId: 'proj_battle',
    durationInFrames: 300,
    fps: 30,
    width: 1920,
    height: 1080,
    overlays,
  };
}

function successEnvelope(data: Record<string, unknown> = {}) {
  return JSON.stringify({ status: 'success', data, error: null, nextAction: null });
}

function advisoryEnvelope(data: Record<string, unknown> = {}) {
  return JSON.stringify({ status: 'advisory', data, error: null, nextAction: 'ask_clarification' });
}

function successEnvelopeWithCanonicalPreflight(data: Record<string, unknown> = {}) {
  return successEnvelope({
    ...data,
    postconditionVerification: {
      version: 'editron-chat-postcondition-v1',
      status: 'pass',
      beforeStateHash: 'before-hash',
      afterStateHash: 'after-hash',
      stateChanged: true,
    },
  });
}

function renderVerificationRequest(
  overrides: Partial<ChatEditRenderVerificationRequest> = {},
): ChatEditRenderVerificationRequest {
  return {
    version: 'editron-chat-render-verification-v1',
    operationId: 'op_render_lifecycle',
    sessionId: 'session_battle',
    beforeCheckpointId: 'checkpoint_before',
    afterCheckpointId: 'checkpoint_after',
    requestedAt: '2026-07-18T10:00:01.000Z',
    modalities: ['visual', 'audio'],
    targets: [{
      overlayId: 'txt_after',
      overlayType: 'text',
      state: 'created',
      from: 30,
      endFrame: 90,
    }],
    sampleFrames: [0, 30, 60],
    ...overrides,
  };
}

function renderedAudioEvidence(
  windows: ChatEditRenderedAudioWindowEvidence[] = [],
): ChatEditRenderedAudioEvidence {
  return {
    version: 'editron-chat-rendered-audio-v1' as const,
    status: 'pass' as const,
    capturedAt: '2026-07-18T10:00:04.000Z',
    windows,
    reason: null,
  };
}

function invocation(
  scenarioId: string,
  toolEvents: ChatBattleToolEvent[],
): ChatBattleInvocationEvidence {
  const scenario = getChatEditBattleScenario(scenarioId);
  if (!scenario) throw new Error(`missing scenario ${scenarioId}`);
  return {
    agentRunId: `fixture-${scenarioId}`,
    mode: 'deterministic-fixture',
    prompt: scenario.prompt,
    responseText: 'done',
    toolEvents,
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  fixture.modelStep = 0;
  fixture.systemInstruction = '';
  fixture.modelContents.length = 0;
  fixture.project = project([]);
});

describe('chat edit battle harness', () => {
  it('drives the real agent graph with a deterministic model fixture and records the full journey', async () => {
    const eventMap = new Map<string, ChatBattleToolEvent>();
    const invokeAgent = async ({ scenario }: { scenario: { prompt: string } }): Promise<ChatBattleInvocationEvidence> => {
      const agent = createAgent('user-battle', 'Project fixture: 30fps, 10 seconds, no overlays.');
      const result = await agent.invoke(
        { messages: [new HumanMessage(scenario.prompt)] },
        {
          recursionLimit: 10,
          configurable: {
            projectId: 'proj_battle',
            loadPostconditionProject: async () => structuredClone(fixture.project),
            streamCallback: (chunk: { type: string; data: Record<string, unknown> }) => {
              const id = String(chunk.data.id ?? '');
              if (chunk.type === 'tool_start') {
                eventMap.set(id, {
                  id,
                  name: String(chunk.data.tool),
                  args: chunk.data.args as Record<string, unknown>,
                  startedAt: '2026-07-16T10:00:00.100Z',
                });
              } else if (chunk.type === 'tool_end') {
                const existing = eventMap.get(id);
                eventMap.set(id, {
                  id,
                  name: String(chunk.data.tool),
                  args: existing?.args ?? {},
                  startedAt: existing?.startedAt ?? '2026-07-16T10:00:00.100Z',
                  completedAt: '2026-07-16T10:00:00.200Z',
                  output: chunk.data.output,
                });
              }
            },
          },
        },
      );
      const finalMessage = [...(result.messages ?? [])].reverse().find((message) => message instanceof AIMessage);
      return {
        agentRunId: 'deterministic-agent-run-1',
        mode: 'deterministic-fixture',
        prompt: scenario.prompt,
        responseText: typeof finalMessage?.content === 'string' ? finalMessage.content : '',
        toolEvents: [...eventMap.values()],
      };
    };
    const times = [new Date('2026-07-16T10:00:00.000Z'), new Date('2026-07-16T10:00:01.000Z')];
    const report = await runChatEditBattleJourney(
      {
        scenarioId: 'explicit-text',
        projectId: 'proj_battle',
        journeyId: 'journey-1',
        now: () => times.shift() ?? new Date('2026-07-16T10:00:01.000Z'),
      },
      {
        loadMongoProject: async () => fixture.project,
        invokeAgent,
        reloadUiProject: async () => ({ project: structuredClone(fixture.project) }),
        captureRenderEvidence: async () => ({
          status: 'pass',
          capturedAt: '2026-07-16T10:00:00.900Z',
          artifactRefs: ['artifact://title-1/frame-30.png'],
          issues: [],
        }),
      },
    );

    expect(report.verdict).toBe('pass');
    expect(report.invocation.toolEvents.map((event) => event.name)).toEqual(['read_project_file', 'add_overlay']);
    expect(report.mongoBefore.overlayCount).toBe(0);
    expect(report.mongoAfter.overlayCount).toBe(1);
    expect(report.uiReload?.digest).toBe(report.mongoAfter.digest);
    expect(fixture.systemInstruction).toContain('Editron AI');
    expect(JSON.stringify(fixture.modelContents[0])).toContain('Add a bold white title');
    expect(JSON.stringify(fixture.modelContents[1])).toContain('signed-read-project');
    expect(JSON.stringify(fixture.modelContents[2])).toContain('signed-add-overlay');
    expect(String(report.invocation.toolEvents[0]?.output)).toContain('"status":"success"');
    expect(String(report.invocation.toolEvents[1]?.output)).toContain('editron-chat-postcondition-v1');
  });

  it('declares a machine-checkable postcondition for every mutating chat tool', () => {
    const missing = Object.values(CHAT_TOOL_REGISTRY)
      .filter((metadata) => metadata.mutatesProject && !metadata.postconditions)
      .map((metadata) => metadata.name);

    expect(missing).toEqual([]);
  });

  it('preserves the UI reload failure instead of collapsing it into a null snapshot', async () => {
    const beforeProject = project([]);
    const afterProject = project([{
      id: 'title-1',
      type: 'text',
      content: 'Standing strong',
      from: 0,
      durationInFrames: 90,
      row: 1,
    }]);
    const times = [
      new Date('2026-07-16T10:00:00.000Z'),
      new Date('2026-07-16T10:00:01.000Z'),
    ];
    const report = await runChatEditBattleJourney({
      scenarioId: 'explicit-text',
      projectId: 'proj_reload_failure',
      journeyId: 'reload-failure',
      now: () => times.shift() ?? new Date('2026-07-16T10:00:01.000Z'),
    }, {
      loadMongoProject: async (_projectId, phase) => (
        phase === 'before' ? beforeProject : afterProject
      ),
      invokeAgent: async () => invocation('explicit-text', [
        {
          id: 'read-project',
          name: 'read_project_file',
          args: {},
          startedAt: '2026-07-16T10:00:00.100Z',
          completedAt: '2026-07-16T10:00:00.200Z',
          output: successEnvelope({ project: beforeProject }),
        },
        {
          id: 'add-title',
          name: 'add_overlay',
          args: { type: 'text', content: 'Standing strong' },
          startedAt: '2026-07-16T10:00:00.300Z',
          completedAt: '2026-07-16T10:00:00.400Z',
          output: successEnvelope({
            postconditionVerification: {
              version: 'editron-chat-postcondition-v1',
              status: 'pass',
              affectedTargets: [{
                overlayId: 'title-1',
                overlayType: 'text',
                state: 'created',
                from: 0,
                endFrame: 90,
              }],
            },
          }),
        },
      ]),
      reloadUiProject: async () => {
        throw new Error('Editor project reload failed: HTTP 503 upstream unavailable');
      },
      captureRenderEvidence: async () => ({
        status: 'pass',
        capturedAt: '2026-07-16T10:00:00.900Z',
        artifactRefs: ['artifact://title-1/frame-30.png'],
        issues: [],
      }),
    });

    expect(report.uiReload).toBeNull();
    expect(report.uiReloadError).toBe(
      'Editor project reload failed: HTTP 503 upstream unavailable',
    );
    expect(report.checks.find((item) => item.id === 'ui.reload-parity')).toMatchObject({
      status: 'fail',
      evidence: {
        error: 'Editor project reload failed: HTTP 503 upstream unavailable',
      },
    });
  });

  it('turns status-success into an error when canonical state did not change', () => {
    const before = project([{ id: 1, type: 'text', content: 'before', from: 0, durationInFrames: 30 }]);
    const enforced = enforceChatToolPostcondition({
      toolName: 'update_overlay',
      args: { id: 1, text: 'after' },
      output: successEnvelope({ updates: { content: 'after' } }),
      beforeProject: before,
      afterProject: structuredClone(before),
    });

    expect(enforced.verification).toMatchObject({ status: 'fail', stateChanged: false });
    expect(JSON.parse(enforced.output)).toMatchObject({
      status: 'error',
      error: { code: 'CHAT_EDIT_POSTCONDITION_FAILED' },
      nextAction: 'stop',
    });
  });

  it('accepts a durable editorial queue receipt without pretending the timeline already changed', () => {
    const before = project([{ id: 1, type: 'video', from: 0, durationInFrames: 300 }]);
    const enforced = enforceChatToolPostcondition({
      toolName: 'apply_editorial_intent',
      args: { goal: 'Rebuild this edit from my script.' },
      output: successEnvelope({
        dispatch: {
          owner: 'phase2-script-planner',
          status: 'queued',
          mutated: false,
          authority: {
            queueStatus: 'queued',
            uploadBatchId: 'upload_batch_123',
            messageId: 'qstash_123',
          },
        },
      }),
      beforeProject: before,
      afterProject: structuredClone(before),
    });

    expect(enforced.verification).toMatchObject({
      status: 'pass',
      stateChanged: false,
      renderVerification: {
        status: 'deferred',
        required: false,
        modalities: [],
      },
    });
    expect(JSON.parse(enforced.output)).toMatchObject({
      status: 'success',
      data: {
        postconditionVerification: {
          status: 'pass',
          renderVerification: { status: 'deferred', required: false },
        },
      },
    });
  });

  it('fails closed when an editorial queue claim lacks a durable batch receipt', () => {
    const before = project([{ id: 1, type: 'video', from: 0, durationInFrames: 300 }]);
    const enforced = enforceChatToolPostcondition({
      toolName: 'apply_editorial_intent',
      args: { goal: 'Rebuild this edit from my script.' },
      output: successEnvelope({
        dispatch: {
          owner: 'phase2-script-planner',
          status: 'queued',
          mutated: false,
          authority: { queueStatus: 'queued' },
        },
      }),
      beforeProject: before,
      afterProject: structuredClone(before),
    });

    expect(enforced.verification).toMatchObject({
      status: 'fail',
      stateChanged: false,
    });
    expect(JSON.parse(enforced.output)).toMatchObject({
      status: 'error',
      error: { code: 'CHAT_EDIT_POSTCONDITION_FAILED' },
    });
  });

  it('fails a partial batch update instead of accepting one changed target', () => {
    const before = project([
      { id: 1, type: 'text', content: 'one', from: 0, durationInFrames: 30 },
      { id: 2, type: 'text', content: 'two', from: 30, durationInFrames: 30 },
    ]);
    const after = project([
      { id: 1, type: 'text', content: 'changed', from: 0, durationInFrames: 30 },
      { id: 2, type: 'text', content: 'two', from: 30, durationInFrames: 30 },
    ]);

    const verification = verifyChatToolPostcondition({
      toolName: 'batch_update_overlays',
      args: { updates: [{ id: 1, text: 'changed' }, { id: 2, text: 'also changed' }] },
      resultData: {},
      beforeProject: before,
      afterProject: after,
    });

    expect(verification).toMatchObject({
      status: 'fail',
      requestedTargetIds: ['1', '2'],
      affectedTargets: [{ overlayId: '1', state: 'updated' }],
    });
  });

  it('derives render modalities from affected overlay families instead of broad registry defaults', () => {
    const textVerification = verifyChatToolPostcondition({
      toolName: 'update_overlay',
      args: { id: 1, text: 'after' },
      resultData: {},
      beforeProject: project([{ id: 1, type: 'text', content: 'before', from: 0, durationInFrames: 30 }]),
      afterProject: project([{ id: 1, type: 'text', content: 'after', from: 0, durationInFrames: 30 }]),
    });
    const soundVerification = verifyChatToolPostcondition({
      toolName: 'update_overlay',
      args: { id: 2, volume: 0.5 },
      resultData: {},
      beforeProject: project([{ id: 2, type: 'sound', volume: 1, from: 0, durationInFrames: 30 }]),
      afterProject: project([{ id: 2, type: 'sound', volume: 0.5, from: 0, durationInFrames: 30 }]),
    });

    expect(textVerification.renderVerification.modalities).toEqual(['visual']);
    expect(soundVerification.renderVerification.modalities).toEqual(['audio']);
  });

  it('keeps caption-only editorial intent visual when an existing BGM is unchanged', () => {
    const existingBgm = {
      id: 'bgm-1',
      type: 'sound',
      row: 1,
      assetId: 'bgm-legacy-1',
      volume: 0.45,
      from: 0,
      durationInFrames: 300,
      _workerAdded: true,
      metadata: { role: 'bgm' },
    };
    const before = project([
      { id: 'caption-1', type: 'caption', content: 'before', from: 0, durationInFrames: 300 },
      existingBgm,
    ]);
    const after = project([
      { id: 'caption-1', type: 'caption', content: 'after', from: 0, durationInFrames: 300 },
      structuredClone(existingBgm),
    ]);

    const verification = verifyChatToolPostcondition({
      toolName: 'apply_editorial_intent',
      args: { request: 'clean up the captions' },
      resultData: {},
      beforeProject: before,
      afterProject: after,
    });

    expect(verification).toMatchObject({
      status: 'pass',
      affectedTargets: [{
        overlayId: 'caption-1',
        overlayType: 'caption',
        state: 'updated',
      }],
      renderVerification: {
        required: true,
        modalities: ['visual'],
      },
    });
  });

  it('allows a licensed generated BGM to replace a legacy BGM without rights evidence', () => {
    const legacyBgm = {
      id: 'bgm-1',
      type: 'sound',
      row: 1,
      assetId: 'bgm-legacy-1',
      volume: 0.45,
      from: 0,
      durationInFrames: 300,
      _workerAdded: true,
    };
    const generatedBgm = {
      ...legacyBgm,
      assetId: 'bgm-generated-1',
      src: 'https://cdn.example/generated-bgm.mp3',
      musicRights: {
        mediaRole: 'music',
        source: 'generated',
        userChoice: 'attested',
        licensed: true,
        evidence: {
          kind: 'generated-provider',
          sourceAssetId: 'bgm-generated-1',
          licenseId: 'provider:commercial-use',
        },
      },
    };

    const verification = verifyChatToolPostcondition({
      toolName: 'regenerate_bgm',
      args: { mood: 'restrained cinematic' },
      resultData: { overlayId: 'bgm-1' },
      beforeProject: project([legacyBgm]),
      afterProject: project([generatedBgm]),
    });

    expect(verification).toMatchObject({
      status: 'pass',
      affectedTargets: [{
        overlayId: 'bgm-1',
        overlayType: 'sound',
        state: 'updated',
      }],
      renderVerification: {
        required: true,
        modalities: ['audio'],
      },
    });
  });

  it('rejects a changed BGM when the resulting overlay still has no rights evidence', () => {
    const legacyBgm = {
      id: 'bgm-1',
      type: 'sound',
      row: 1,
      assetId: 'bgm-legacy-1',
      volume: 0.45,
      from: 0,
      durationInFrames: 300,
      _workerAdded: true,
    };

    const verification = verifyChatToolPostcondition({
      toolName: 'update_overlay',
      args: { id: 'bgm-1', volume: 0.7 },
      resultData: { overlayId: 'bgm-1' },
      beforeProject: project([legacyBgm]),
      afterProject: project([{ ...legacyBgm, volume: 0.7 }]),
    });

    expect(verification.status).toBe('fail');
    expect(verification.reason).toContain('Cannot render unlicensed audio overlay bgm-1');
    expect(verification.affectedTargets).toEqual([
      expect.objectContaining({
        overlayId: 'bgm-1',
        overlayType: 'sound',
        state: 'updated',
      }),
    ]);
  });

  it('ignores audio rights and persistence provenance churn when deriving render modalities', () => {
    const beforeBgm = {
      id: 'bgm-1',
      type: 'sound',
      src: 'https://cdn.example/bgm.mp3?signature=before',
      volume: 0.45,
      from: 0,
      durationInFrames: 300,
      _workerAdded: false,
      musicRights: {
        mediaRole: 'music',
        source: 'library',
        userChoice: 'attested',
        licensed: true,
        evidence: {
          kind: 'library-license',
          sourceAssetId: 'bgm-asset-1',
          licenseId: 'license-bgm-asset-1',
          attestedAt: '2026-07-24T00:00:00.000Z',
        },
      },
    };
    const afterBgm = {
      ...structuredClone(beforeBgm),
      src: 'https://cdn.example/bgm.mp3?signature=after',
      _workerAdded: true,
      musicRights: {
        ...structuredClone(beforeBgm.musicRights),
        evidence: {
          ...structuredClone(beforeBgm.musicRights.evidence),
          attestedAt: '2026-07-25T00:00:00.000Z',
        },
      },
    };

    const verification = verifyChatToolPostcondition({
      toolName: 'apply_editorial_intent',
      args: { request: 'clean up the captions' },
      resultData: {},
      beforeProject: project([
        { id: 'caption-1', type: 'caption', content: 'before', from: 0, durationInFrames: 300 },
        beforeBgm,
      ]),
      afterProject: project([
        { id: 'caption-1', type: 'caption', content: 'after', from: 0, durationInFrames: 300 },
        afterBgm,
      ]),
    });

    expect(verification).toMatchObject({
      status: 'pass',
      affectedTargets: [{
        overlayId: 'caption-1',
        overlayType: 'caption',
        state: 'updated',
      }],
      renderVerification: {
        required: true,
        modalities: ['visual'],
      },
    });
  });

  it('does not mistake expiring transport URLs for an edit', () => {
    const before = project([{
      id: 1,
      type: 'video',
      assetId: 'asset-1',
      src: 'https://cdn.example/video?signature=old',
      from: 0,
      durationInFrames: 30,
    }]);
    const after = project([{
      id: 1,
      type: 'video',
      assetId: 'asset-1',
      src: 'https://cdn.example/video?signature=new',
      from: 0,
      durationInFrames: 30,
    }]);

    const verification = verifyChatToolPostcondition({
      toolName: 'update_overlay',
      args: { id: 1 },
      resultData: {},
      beforeProject: before,
      afterProject: after,
    });

    expect(verification).toMatchObject({ status: 'fail', stateChanged: false, affectedTargets: [] });
  });

  it('drops only inactive read-project arguments and keeps active arguments strict', () => {
    expect(normalizeAgentToolArgs('read_project_file', {
      mode: 'full',
      start: '0',
      end: '1000000',
      trackIds: 'all',
    })).toEqual({ mode: 'full' });

    const activeInvalidArgs = normalizeAgentToolArgs('read_project_file', {
      mode: 'byTrackIds',
      trackIds: 'all',
    });
    const schema = z.object({
      mode: z.enum(['full', 'slice', 'byTrackIds']),
      trackIds: z.array(z.string()).optional(),
    });
    expect(activeInvalidArgs).toEqual({ mode: 'byTrackIds', trackIds: 'all' });
    expect(schema.safeParse(activeInvalidArgs).success).toBe(false);
  });

  it('requires the semantic script owner and forbids the legacy single-video tool', () => {
    for (const id of ['multiasset-script-intake', 'multiasset-script-chat']) {
      const scenario = getChatEditBattleScenario(id)!;
      expect(scenario.prompt).toContain('Script:');
      expect(scenario.requiredToolSequence).toEqual([
        ['read_project_file', 'get_timeline_view'],
        'apply_editorial_intent',
      ]);
      expect(scenario.forbiddenTools).toContain('auto_edit_from_script');
      expect(scenario.requireRenderedEvidence).toBe(false);
    }
  });

  it('requires semantic owner dispatch for broad and MG/transition family requests', () => {
    const cases = [
      ['vague-enhance', ['add_transition', 'add_motion_graphic', 'auto_motion_graphics']],
      ['vague-transitions', ['add_transition']],
      ['vague-motion-graphics', ['add_motion_graphic', 'auto_motion_graphics']],
    ] as const;

    for (const [id, forbiddenTools] of cases) {
      const scenario = getChatEditBattleScenario(id)!;
      expect(scenario.requiredToolSequence).toEqual([
        ['read_project_file', 'get_timeline_view'],
        'apply_editorial_intent',
      ]);
      expect(scenario.forbiddenTools).toEqual(expect.arrayContaining([...forbiddenTools]));
    }
  });

  it('derives caption, localized zoom, and localized SFX paths from runtime authority', () => {
    expect(getChatEditBattleScenario('clean-captions')).toMatchObject({
      requiredToolSequence: [
        ['read_project_file', 'get_timeline_view'],
        'add_captions',
      ],
      forbiddenTools: ['apply_editorial_intent'],
    });
    expect(getChatEditBattleScenario('motivated-zoom')).toMatchObject({
      requiredToolSequence: [
        ['read_project_file', 'get_timeline_view'],
        ['resolve_transcript_edit', 'resolve_visual_edit', 'resolve_audio_edit', 'resolve_keyframe_edit'],
        'set_keyframes',
      ],
      forbiddenTools: ['apply_editorial_intent'],
    });
    expect(getChatEditBattleScenario('vague-sfx-beat')).toMatchObject({
      requiredToolSequence: [
        ['read_project_file', 'get_timeline_view'],
        'resolve_audio_edit',
        'add_sfx',
      ],
      forbiddenTools: ['apply_editorial_intent'],
    });
  });

  it('routes explicit and vague assist-mode BGM requests to the direct licensed owner', () => {
    for (const id of ['bgm-explicit', 'bgm-vague']) {
      const scenario = getChatEditBattleScenario(id)!;
      expect(scenario.projectMode).toBe('assist');
      expect(scenario.requiredToolSequence).toEqual([
        ['read_project_file', 'get_timeline_view'],
        'regenerate_bgm',
      ]);
      expect(scenario.forbiddenTools).toContain('apply_editorial_intent');
    }
  });

  it('requires operation-ready resolvers before localized audio, visual, and asset mutations', () => {
    expect(getChatEditBattleScenario('audio-anchored-camera-shake')?.requiredToolSequence).toEqual([
      'resolve_audio_edit',
      'apply_camera_shake',
    ]);
    expect(getChatEditBattleScenario('visual-speed-ramp')?.requiredToolSequence).toEqual([
      'resolve_visual_edit',
      'apply_speed_ramp',
    ]);
    expect(getChatEditBattleScenario('beat-sync-cuts')?.requiredToolSequence).toEqual([
      'resolve_audio_edit',
      'sync_cuts_to_beats',
    ]);
    expect(getChatEditBattleScenario('replace-with-uploaded-footage')?.requiredToolSequence).toEqual([
      ['read_project_file', 'get_timeline_view'],
      'resolve_user_asset_overlay',
      'use_matching_footage',
    ]);
  });

  it('accepts only a structured resolver ambiguity as a safe paraphrase clarification', () => {
    const scenario = getChatEditBattleScenario('visual-object-paraphrase')!;
    const unchanged = buildChatBattleProjectSnapshot(project([]), 'mongo-before');
    const evaluate = (resolverStatus: 'ambiguous' | 'no-match') => evaluateChatEditBattleJourney({
      journeyId: `visual-paraphrase-${resolverStatus}`,
      scenario,
      projectId: 'proj_battle',
      startedAt: '2026-07-24T10:00:00.000Z',
      completedAt: '2026-07-24T10:00:01.000Z',
      invocation: invocation('visual-object-paraphrase', [{
        id: 'resolve',
        name: 'resolve_visual_edit',
        args: { query: 'garment sketch being measured', action: 'highlight' },
        startedAt: '2026-07-24T10:00:00.100Z',
        completedAt: '2026-07-24T10:00:00.200Z',
        output: JSON.stringify({
          status: 'error',
          data: { status: resolverStatus, useWith: undefined },
          error: { code: 'VISUAL_RESOLUTION_REQUIRED', message: resolverStatus },
          nextAction: 'Ask the user to choose before editing.',
        }),
      }]),
      mongoBefore: unchanged,
      mongoAfter: { ...unchanged, source: 'mongo-after' },
      uiReload: null,
      renderEvidence: {
        status: 'missing',
        artifactRefs: [],
        issues: [],
        reason: 'No material change to render.',
      },
      fixturePreconditions: { ok: true, missing: [], satisfied: [] },
    });

    expect(scenario.acceptedResolverOutcomes).toEqual(['ambiguous']);
    expect(scenario.mutationExpectation).toBe('conditional');
    const accepted = evaluate('ambiguous');
    expect(accepted.checks.find((check) => check.id === 'agent.required-owner-path')?.status).toBe('pass');
    expect(accepted.checks.find((check) => check.id === 'agent.grounded-clarification')?.status).toBe('pass');
    expect(accepted.checks.find((check) => check.id === 'mongo.mutation-truth')?.status).toBe('pass');

    const rejected = evaluate('no-match');
    expect(rejected.checks.find((check) => check.id === 'agent.grounded-clarification')?.status).toBe('fail');
    expect(rejected.checks.find((check) => check.id === 'mongo.mutation-truth')?.status).toBe('fail');
  });

  it('treats motivated zoom and SFX as evidence-licensed conditional edits', () => {
    for (const id of ['motivated-zoom', 'vague-sfx-beat']) {
      const scenario = getChatEditBattleScenario(id)!;
      expect(scenario.mutationExpectation).toBe('conditional');
      expect(scenario.minimumSuccessfulMutations).toBe(0);
    }
  });

  it('requires process-diagram creation to persist MG-family output', () => {
    const scenario = getChatEditBattleScenario('create-html-scene')!;
    expect(scenario.requiredToolSequence).toEqual([
      ['read_project_file', 'get_timeline_view'],
      'apply_editorial_intent',
    ]);
    expect(scenario.forbiddenTools).toEqual(expect.arrayContaining([
      'generate_html_scene',
      'generate_html_sticker',
      'add_overlay',
    ]));
    expect(scenario.requiredCreatedOverlayTypes).toEqual([
      ['motion-graphic', 'mg-sequence'],
    ]);
  });

  it('keeps rendered title proof on the literal overlay owner and rejects collateral captions', () => {
    const scenario = getChatEditBattleScenario('post-edit-render-proof')!;
    expect(scenario.prompt).toContain('top center for the first 2 seconds');
    expect(scenario.prompt).not.toContain('verify');
    expect(scenario.requiredToolSequence).toEqual([
      ['read_project_file', 'get_timeline_view'],
      'add_overlay',
    ]);
    expect(scenario.requiredCreatedOverlayTypes).toEqual(['text']);

    const beforeProject = project([]);
    const afterProject = project([{
      id: 'collateral-caption',
      type: 'caption',
      from: 0,
      durationInFrames: 60,
      row: 4,
    }]);
    const report = evaluateChatEditBattleJourney({
      journeyId: 'render-proof-collateral-caption',
      scenario,
      projectId: 'proj_battle',
      startedAt: '2026-07-24T10:00:00.000Z',
      completedAt: '2026-07-24T10:00:01.000Z',
      invocation: invocation('post-edit-render-proof', [
        {
          id: 'read',
          name: 'get_timeline_view',
          args: {},
          startedAt: '2026-07-24T10:00:00.100Z',
          completedAt: '2026-07-24T10:00:00.200Z',
          output: successEnvelope(),
        },
        {
          id: 'add',
          name: 'add_overlay',
          args: { type: 'text', text: 'Chat Battle', start: 0, duration: 60 },
          startedAt: '2026-07-24T10:00:00.300Z',
          completedAt: '2026-07-24T10:00:00.400Z',
          output: successEnvelope(),
        },
      ]),
      mongoBefore: buildChatBattleProjectSnapshot(beforeProject, 'mongo-before'),
      mongoAfter: buildChatBattleProjectSnapshot(afterProject, 'mongo-after'),
      uiReload: buildChatBattleProjectSnapshot(afterProject, 'ui-reload'),
      renderEvidence: {
        status: 'pass',
        capturedAt: '2026-07-24T10:00:00.900Z',
        artifactRefs: ['artifact://collateral-caption.png'],
        issues: [],
      },
    });

    expect(report.checks.find((check) => check.id === 'mongo.required-created-overlay-types'))
      .toMatchObject({
        status: 'fail',
        evidence: { missing: ['text'] },
      });
  });

  it('rejects collateral caption creation as process-diagram success', () => {
    const scenario = getChatEditBattleScenario('create-html-scene')!;
    const beforeProject = project([]);
    const invocationEvidence = invocation('create-html-scene', [
      {
        id: 'read',
        name: 'read_project_file',
        args: { mode: 'full' },
        startedAt: '2026-07-24T10:00:00.100Z',
        completedAt: '2026-07-24T10:00:00.200Z',
        output: successEnvelope(),
      },
      {
        id: 'intent',
        name: 'apply_editorial_intent',
        args: { goal: scenario.prompt },
        startedAt: '2026-07-24T10:00:00.300Z',
        completedAt: '2026-07-24T10:00:00.400Z',
        output: successEnvelope(),
      },
    ]);
    const evaluateCreatedType = (type: string) => {
      const afterProject = project([{
        id: `created-${type}`,
        type,
        from: 0,
        durationInFrames: 90,
        row: 1,
      }]);
      return evaluateChatEditBattleJourney({
        journeyId: `process-diagram-${type}`,
        scenario,
        projectId: 'proj_battle',
        startedAt: '2026-07-24T10:00:00.000Z',
        completedAt: '2026-07-24T10:00:01.000Z',
        invocation: invocationEvidence,
        mongoBefore: buildChatBattleProjectSnapshot(beforeProject, 'mongo-before'),
        mongoAfter: buildChatBattleProjectSnapshot(afterProject, 'mongo-after'),
        uiReload: buildChatBattleProjectSnapshot(afterProject, 'ui-reload'),
        renderEvidence: {
          status: 'pass',
          capturedAt: '2026-07-24T10:00:00.900Z',
          artifactRefs: [`artifact://${type}.png`],
          issues: [],
        },
      });
    };

    expect(evaluateCreatedType('caption').checks.find(
      (check) => check.id === 'mongo.required-created-overlay-types',
    )).toMatchObject({
      status: 'fail',
      blocking: true,
      evidence: {
        createdOverlays: [{ id: 'created-caption', type: 'caption' }],
        missing: [['motion-graphic', 'mg-sequence']],
      },
    });
    expect(evaluateCreatedType('mg-sequence').checks.find(
      (check) => check.id === 'mongo.required-created-overlay-types',
    )).toMatchObject({
      status: 'pass',
      blocking: true,
    });
  });

  it('targets the embedded HTML scene explicitly for in-place editing', () => {
    const scenario = getChatEditBattleScenario('edit-html-scene')!;
    expect(scenario.prompt).toContain('selected HTML scene itself');
    expect(scenario.prompt).toContain('Do not edit the separate text overlay');
    expect(scenario.requiredToolSequence).toEqual([
      ['read_project_file', 'get_timeline_view'],
      'edit_html_scene',
    ]);
  });

  it('recognizes a queued semantic-owner result without treating ordinary successful tools as queued', () => {
    const queued = invocation('multiasset-script-chat', [{
      id: 'intent',
      name: 'apply_editorial_intent',
      args: {},
      startedAt: '2026-07-16T10:00:00.100Z',
      completedAt: '2026-07-16T10:00:00.200Z',
      output: successEnvelope({ dispatch: { status: 'queued' } }),
    }]);
    const immediate = invocation('explicit-text', [{
      id: 'text',
      name: 'add_overlay',
      args: {},
      startedAt: '2026-07-16T10:00:00.100Z',
      completedAt: '2026-07-16T10:00:00.200Z',
      output: successEnvelope({ overlayId: 'title-1' }),
    }]);
    const referenceStyle = invocation('reference-style-transfer', [{
      id: 'style',
      name: 'apply_reference_style',
      args: { referenceAssetId: 'asset-reference' },
      startedAt: '2026-07-16T10:00:00.100Z',
      completedAt: '2026-07-16T10:00:00.200Z',
      output: successEnvelope({ jobId: 'chat_style_123', queueStatus: 'queued' }),
    }]);

    expect(chatBattleInvocationQueuedProjectMutation(queued)).toBe(true);
    expect(chatBattleInvocationQueuedProjectMutation(referenceStyle)).toBe(true);
    expect(extractQueuedReferenceStyleJobId(referenceStyle)).toBe('chat_style_123');
    expect(extractQueuedReferenceStyleJobId(invocation('reference-style-transfer', [{
      ...referenceStyle.toolEvents[0],
      output: successEnvelope({ jobId: '../not-safe', queueStatus: 'queued' }),
    }]))).toBeNull();
    expect(chatBattleInvocationQueuedProjectMutation(immediate)).toBe(false);
    expect(extractQueuedEditorialIntentJobId(invocation('vague-motion-graphics', [{
      ...queued.toolEvents[0],
      output: successEnvelope({
        dispatch: {
          status: 'queued',
          authority: { jobId: 'chat_intent_123' },
        },
      }),
    }]))).toBe('chat_intent_123');
    expect(extractQueuedEditorialIntentJobId(invocation('vague-motion-graphics', [{
      ...queued.toolEvents[0],
      output: successEnvelope({
        dispatch: {
          status: 'queued',
          authority: { jobId: '../not-safe' },
        },
      }),
    }]))).toBeNull();
  });

  it('treats a durable MG decline as a valid conditional no-op instead of a queued mutation hang', () => {
    const scenario = getChatEditBattleScenario('vague-motion-graphics')!;
    const queued = invocation('vague-motion-graphics', [{
      id: 'intent',
      name: 'apply_editorial_intent',
      args: {},
      startedAt: '2026-07-24T08:00:00.000Z',
      completedAt: '2026-07-24T08:00:01.000Z',
      output: successEnvelope({
        dispatch: {
          status: 'queued',
          authority: { jobId: 'chat_intent_declined' },
        },
      }),
    }]);
    const settled: ChatBattleInvocationEvidence = {
      ...queued,
      durableOperations: [{
        owner: 'editorial-intent',
        jobId: 'chat_intent_declined',
        status: 'declined',
        materialChange: false,
        polls: 2,
      }],
    };
    const unchanged = buildChatBattleProjectSnapshot(project([]), 'mongo-before');
    const report = evaluateChatEditBattleJourney({
      journeyId: 'declined-mg',
      scenario,
      projectId: 'proj_battle',
      startedAt: '2026-07-24T08:00:00.000Z',
      completedAt: '2026-07-24T08:00:02.000Z',
      invocation: settled,
      mongoBefore: unchanged,
      mongoAfter: { ...unchanged, source: 'mongo-after' },
      uiReload: { ...unchanged, source: 'ui-reload' },
      renderEvidence: {
        status: 'missing',
        artifactRefs: [],
        issues: [],
        reason: 'no material change to render',
      },
      fixturePreconditions: { ok: true, missing: [], satisfied: [] },
    });

    expect(scenario.mutationExpectation).toBe('conditional');
    expect(chatBattleInvocationHasSuccessfulMutation(settled)).toBe(false);
    expect(report.checks.find((check) => check.id === 'mongo.mutation-truth')?.status).toBe('pass');
    expect(report.checks.find((check) => check.id === 'render.fresh-evidence')?.status).toBe('pass');
  });

  it('requires the dedicated durable dubbing and subject-aware reframing owners', () => {
    const dubbing = getChatEditBattleScenario('selected-dialogue-dubbing')!;
    const reframing = getChatEditBattleScenario('vertical-subject-reframe')!;

    for (const scenario of [dubbing, reframing]) {
      expect(scenario.mutationExpectation).toBe('required');
      expect(scenario.minimumSuccessfulMutations).toBe(1);
      expect(scenario.requireUiReload).toBe(true);
      expect(scenario.requireRenderedEvidence).toBe(true);
    }
    expect(dubbing.requiredToolSequence).toEqual([
      'dub_selected_dialogue',
      'get_dubbing_job_result',
    ]);
    expect(dubbing.requireEvidenceBeforeMutation).toBe(false);
    expect(reframing.requiredToolSequence).toEqual([
      ['read_project_file', 'get_timeline_view'],
      'reframe_project',
    ]);
    expect(dubbing.prompt).toContain('Preserve the original speech timing');
    expect(reframing.prompt).toContain('keep the main subject visible');
  });

  it('keeps semantic transcript deletion fail-closed until the user confirms an exact range', () => {
    const scenario = getChatEditBattleScenario('semantic-transcript-topic')!;

    expect(scenario.mutationExpectation).toBe('forbidden');
    expect(scenario.minimumSuccessfulMutations).toBe(0);
    expect(scenario.requiredToolSequence).toEqual(['resolve_transcript_edit']);
    expect(scenario.requireRenderedEvidence).toBe(false);
  });

  it('extracts and merges the two durable dubbing proof turns without inventing a job id', () => {
    const initial = invocation('selected-dialogue-dubbing', [{
      id: 'dub',
      name: 'dub_selected_dialogue',
      args: { overlayId: 'video-1', targetLanguage: 'English' },
      startedAt: '2026-07-23T00:00:00.000Z',
      completedAt: '2026-07-23T00:00:01.000Z',
      output: successEnvelope({ jobId: 'chat_dub_123', status: 'queued' }),
    }]);
    const followUp = invocation('selected-dialogue-dubbing', [{
      id: 'result',
      name: 'get_dubbing_job_result',
      args: { jobId: 'chat_dub_123' },
      startedAt: '2026-07-23T00:00:10.000Z',
      completedAt: '2026-07-23T00:00:11.000Z',
      output: successEnvelope({ jobId: 'chat_dub_123', status: 'completed' }),
    }]);

    expect(extractQueuedDubbingJobId(initial)).toBe('chat_dub_123');
    expect(extractQueuedDubbingJobId(invocation('selected-dialogue-dubbing', [{
      ...initial.toolEvents[0],
      output: successEnvelope({ jobId: '../not-safe', status: 'queued' }),
    }]))).toBeNull();
    expect(mergeChatBattleInvocations(initial, followUp)).toMatchObject({
      responseText: 'done\ndone',
      toolEvents: [
        { name: 'dub_selected_dialogue' },
        { name: 'get_dubbing_job_result' },
      ],
    });
  });

  it('settles durable dubbing from the job source of truth instead of waiting for project mutation', async () => {
    let clock = 0;
    const loadCompleted = vi.fn()
      .mockResolvedValueOnce({ status: 'running' })
      .mockResolvedValueOnce({ status: 'completed' });
    const completed = await waitForDubbingJobTerminal({
      jobId: 'chat_dub_123',
      projectId: 'proj_battle',
      timeoutMs: 100,
      pollIntervalMs: 10,
    }, {
      loadJob: loadCompleted,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
    });
    expect(completed).toEqual({ status: 'completed', polls: 2 });

    const failed = await waitForDubbingJobTerminal({
      jobId: 'chat_dub_failed',
      projectId: 'proj_battle',
      timeoutMs: 100,
      pollIntervalMs: 10,
    }, {
      loadJob: vi.fn().mockResolvedValue({ status: 'failed', error: 'unnatural-phrase-fit' }),
      now: () => 0,
      sleep: async () => undefined,
    });
    expect(failed).toEqual({
      status: 'failed',
      polls: 1,
      error: 'unnatural-phrase-fit',
    });
  });

  it('settles reference style from its own job source of truth', async () => {
    let clock = 0;
    const completed = await waitForReferenceStyleJobTerminal({
      jobId: 'chat_style_123',
      projectId: 'proj_battle',
      timeoutMs: 100,
      pollIntervalMs: 10,
    }, {
      loadJob: vi.fn()
        .mockResolvedValueOnce({ status: 'running' })
        .mockResolvedValueOnce({ status: 'completed_unverified' }),
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
    });
    expect(completed).toEqual({
      status: 'completed_unverified',
      materialChange: true,
      polls: 2,
    });

    const declined = await waitForReferenceStyleJobTerminal({
      jobId: 'chat_style_declined',
      projectId: 'proj_battle',
      timeoutMs: 100,
      pollIntervalMs: 10,
    }, {
      loadJob: vi.fn().mockResolvedValue({ status: 'declined' }),
      now: () => 0,
      sleep: async () => undefined,
    });
    expect(declined).toEqual({
      status: 'declined',
      materialChange: false,
      polls: 1,
    });
  });

  it('settles durable editorial intent from its job receipt, including clean decline and material completion', async () => {
    let clock = 0;
    const declined = await waitForEditorialIntentJobTerminal({
      jobId: 'chat_intent_declined',
      projectId: 'proj_battle',
      timeoutMs: 100,
      pollIntervalMs: 10,
    }, {
      loadJob: vi.fn()
        .mockResolvedValueOnce({ status: 'running' })
        .mockResolvedValueOnce({ status: 'declined', result: { overlaysModified: 0 } }),
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
    });
    expect(declined).toEqual({ status: 'declined', materialChange: false, polls: 2 });

    const completed = await waitForEditorialIntentJobTerminal({
      jobId: 'chat_intent_completed',
      projectId: 'proj_battle',
      timeoutMs: 100,
      pollIntervalMs: 10,
    }, {
      loadJob: vi.fn().mockResolvedValue({
        status: 'completed',
        result: { overlaysModified: 2 },
      }),
      now: () => 0,
      sleep: async () => undefined,
    });
    expect(completed).toEqual({ status: 'completed', materialChange: true, polls: 1 });
  });

  it('snapshots bounded MG child evidence before disposable fixture cleanup removes durable jobs', async () => {
    const parent = {
      status: 'completed',
      pendingChildJobIds: ['mgr_child_generated', 'mgr_child_failed'],
      result: {
        overlaysModified: 1,
        lifecycle: 'async-mg-render-reconciled',
        generatedChildJobIds: ['mgr_child_generated'],
        postconditionVerification: { status: 'pass' },
      },
    };
    const children = [
      {
        _id: 'mgr_child_generated',
        status: 'completed',
        requestAudit: {
          momentId: 'moment-1',
          candidateId: 'candidate-1',
          factKind: 'claim',
        },
        result: {
          status: 'generated',
          sequence: { address: { sequenceId: 'mgseq_1' } },
          receipt: { outcome: 'generated' },
        },
      },
      {
        _id: 'mgr_child_failed',
        status: 'failed',
        requestAudit: {
          momentId: 'moment-2',
          candidateId: 'candidate-2',
          factKind: 'comparison',
        },
        lastError: 'sandbox timeout '.repeat(500),
        result: {
          status: 'fallback',
          reason: 'provider unavailable '.repeat(500),
          receipt: {
            outcome: 'fallback',
            failure: {
              provider: 'zai',
              operation: 'component-generation',
              code: 'timeout',
              disposition: 'retryable',
              statusCode: 504,
            },
          },
        },
      },
    ];
    const settlement = await waitForEditorialIntentJobTerminal({
      jobId: 'chat_intent_children',
      projectId: 'proj_battle',
      timeoutMs: 100,
      pollIntervalMs: 10,
    }, {
      loadJob: vi.fn().mockResolvedValue(parent),
      loadChildJobs: vi.fn().mockResolvedValue(children),
      now: () => 0,
      sleep: async () => undefined,
    });

    parent.pendingChildJobIds.length = 0;
    children.length = 0;

    expect(settlement).toMatchObject({
      status: 'completed',
      materialChange: true,
      lifecycle: 'async-mg-render-reconciled',
      postconditionStatus: 'pass',
      pendingChildJobIds: ['mgr_child_failed', 'mgr_child_generated'],
      generatedChildJobIds: ['mgr_child_generated'],
      childOperations: [
        {
          jobId: 'mgr_child_failed',
          status: 'failed',
          outcome: 'fallback',
          momentId: 'moment-2',
          candidateId: 'candidate-2',
          factKind: 'comparison',
          providerFailure: {
            provider: 'zai',
            operation: 'component-generation',
            code: 'timeout',
            disposition: 'retryable',
            statusCode: 504,
          },
        },
        {
          jobId: 'mgr_child_generated',
          status: 'completed',
          outcome: 'generated',
          momentId: 'moment-1',
          candidateId: 'candidate-1',
          factKind: 'claim',
          sequenceId: 'mgseq_1',
        },
      ],
    });
    expect(settlement.childOperations?.[0].reason).toHaveLength(2_000);
    expect(settlement.childOperations?.[0].error).toHaveLength(2_000);
  });

  it('preserves parent child outcomes when direct MG evidence loading fails', async () => {
    const settlement = await waitForEditorialIntentJobTerminal({
      jobId: 'chat_intent_declined_children',
      projectId: 'proj_battle',
      timeoutMs: 100,
      pollIntervalMs: 10,
    }, {
      loadJob: vi.fn().mockResolvedValue({
        status: 'declined',
        pendingChildJobIds: ['mgr_child_declined'],
        result: {
          overlaysModified: 0,
          childOutcomes: [{
            jobId: 'mgr_child_declined',
            jobStatus: 'completed',
            outcome: 'declined',
            reason: 'no visually explainable structure',
          }],
        },
      }),
      loadChildJobs: vi.fn().mockRejectedValue(new Error('mongo evidence unavailable')),
      now: () => 0,
      sleep: async () => undefined,
    });

    expect(settlement).toMatchObject({
      status: 'declined',
      materialChange: false,
      reason: 'all-async-mg-children-produced-no-material-change',
      evidenceError: 'mongo evidence unavailable',
      childOperations: [{
        jobId: 'mgr_child_declined',
        status: 'completed',
        outcome: 'declined',
        reason: 'no visually explainable structure',
      }],
    });
  });

  it('tests reference style through the durable owner and forbids legacy style authority', () => {
    const scenario = getChatEditBattleScenario('reference-style-transfer')!;
    expect(scenario.requiredToolSequence).toEqual(['apply_reference_style']);
    expect(scenario.forbiddenTools).toEqual(expect.arrayContaining(['extract_style', 'apply_style']));
    expect(scenario.minimumSuccessfulMutations).toBe(0);
    expect(scenario.requireEvidenceBeforeMutation).toBe(false);
    expect(scenario.requireUiReload).toBe(true);
    expect(scenario.requireRenderedEvidence).toBe(true);
  });

  it('waits for material project state after a queued edit and reports timeout honestly', async () => {
    const unchanged = project([]);
    const changedWhileRunning = {
      ...project([{ id: 'video-2', type: 'video', from: 0, durationInFrames: 300, row: 0 }]),
      autoEditStatus: 'directing',
    };
    const changed = {
      ...project([
        { id: 'video-2', type: 'video', from: 0, durationInFrames: 300, row: 0 },
        { id: 'caption-1', type: 'caption', from: 0, durationInFrames: 300, row: 1 },
      ]),
      autoEditStatus: 'complete',
    };
    const baselineDigest = buildChatBattleProjectSnapshot(unchanged, 'mongo-before').digest;
    let clock = 0;
    const loadProject = vi.fn()
      .mockResolvedValueOnce(unchanged)
      .mockResolvedValueOnce(changedWhileRunning)
      .mockResolvedValueOnce(changed);
    const settled = await waitForQueuedProjectMutation({
      projectId: 'proj_battle',
      baselineDigest,
      timeoutMs: 100,
      pollIntervalMs: 10,
    }, {
      loadProject,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
    });

    expect(settled).toMatchObject({ project: changed, changed: true, polls: 3 });

    const timedOut = await waitForQueuedProjectMutation({
      projectId: 'proj_battle',
      baselineDigest,
      timeoutMs: 0,
      pollIntervalMs: 10,
    }, {
      loadProject: vi.fn(async () => unchanged),
      now: () => 0,
      sleep: vi.fn(async () => undefined),
    });
    expect(timedOut).toMatchObject({ project: unchanged, changed: false, polls: 1 });

    const terminalFailure = {
      ...unchanged,
      autoEditStatus: 'failed',
      autoEditError: 'Script grounding failed',
    };
    const sleep = vi.fn(async () => undefined);
    const failed = await waitForQueuedProjectMutation({
      projectId: 'proj_battle',
      baselineDigest,
      timeoutMs: 100,
      pollIntervalMs: 10,
    }, {
      loadProject: vi.fn(async () => terminalFailure),
      now: () => 0,
      sleep,
    });
    expect(failed).toMatchObject({
      project: terminalFailure,
      changed: false,
      polls: 1,
      terminalStatus: 'failed',
      terminalError: 'Script grounding failed',
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not let the static scenario registry count as battle evidence', () => {
    const suite = buildChatEditBattleSuite([]);
    expect(CHAT_EDIT_BATTLE_SCENARIOS.length).toBeGreaterThanOrEqual(36);
    expect(suite).toMatchObject({
      verdict: 'fail',
      requiredScenarioCount: CHAT_EDIT_BATTLE_SCENARIOS.length,
      executedScenarioCount: 0,
      passedScenarioCount: 0,
    });
    expect(suite.missingScenarioIds).toHaveLength(CHAT_EDIT_BATTLE_SCENARIOS.length);
  });

  it('marks fixture-dependent scenarios invalid before blaming product behavior', async () => {
    const runtime = {
      loadMongoProject: vi.fn(async () => project([])),
      invokeAgent: vi.fn(async () => invocation('undo-overlay-edit', [])),
      reloadUiProject: vi.fn(async () => project([])),
      captureRenderEvidence: vi.fn(async () => ({
        status: 'pass' as const,
        capturedAt: '2026-07-18T10:00:02.000Z',
        artifactRefs: [],
        issues: [],
      })),
    };

    const report = await runChatEditBattleJourney({
      scenarioId: 'undo-overlay-edit',
      projectId: 'proj_fixture',
      journeyId: 'fixture-missing',
      now: () => new Date('2026-07-18T10:00:00.000Z'),
    }, runtime);

    expect(runtime.invokeAgent).not.toHaveBeenCalled();
    expect(runtime.captureRenderEvidence).not.toHaveBeenCalled();
    expect(report.verdict).toBe('fail');
    expect(report.invocation.refusalReason).toContain('ai-edit-checkpoint');
    expect(report.checks).toEqual([expect.objectContaining({
      id: 'fixture.preconditions',
      status: 'fail',
      evidence: expect.objectContaining({
        missing: ['ai-edit-checkpoint'],
      }),
    })]);
  });

  it('lets explicitly seeded fixture capability exercise the live tool path', async () => {
    const beforeProject = project([{ id: 'clip-1', type: 'video', from: 0, durationInFrames: 90, row: 0 }]);
    const afterProject = project([{ id: 'clip-1', type: 'video', from: 0, durationInFrames: 90, row: 0 }]);
    const runtime = {
      loadMongoProject: vi.fn(async (_projectId: string, phase: 'before' | 'after') => (
        phase === 'before' ? beforeProject : afterProject
      )),
      invokeAgent: vi.fn(async () => invocation('undo-overlay-edit', [{
        id: 'undo',
        name: 'restore_ai_edit_checkpoint',
        args: { checkpointId: 'checkpoint_before' },
        startedAt: '2026-07-18T10:00:00.100Z',
        completedAt: '2026-07-18T10:00:00.200Z',
        output: successEnvelope({ checkpointId: 'checkpoint_before' }),
      }])),
      reloadUiProject: vi.fn(async () => afterProject),
      captureRenderEvidence: vi.fn(async () => ({
        status: 'pass' as const,
        capturedAt: '2026-07-18T10:00:01.000Z',
        artifactRefs: [],
        issues: [],
      })),
    };

    const report = await runChatEditBattleJourney({
      scenarioId: 'undo-overlay-edit',
      projectId: 'proj_fixture',
      journeyId: 'fixture-seeded',
      clientContext: {
        chatBattleFixture: { beforeCheckpointId: 'checkpoint_before' },
      },
      now: () => new Date('2026-07-18T10:00:00.000Z'),
    }, runtime);

    expect(runtime.invokeAgent).toHaveBeenCalledTimes(1);
    expect(report.checks.find((check) => check.id === 'fixture.preconditions')).toMatchObject({
      status: 'pass',
      evidence: { satisfied: ['ai-edit-checkpoint'] },
    });
  });

  it('detects fixture capabilities from project metadata and attached reference assets', () => {
    const referenceScenario = getChatEditBattleScenario('reference-style-transfer')!;
    const analysisScenario = getChatEditBattleScenario('read-completed-clip-analysis')!;

    expect(evaluateChatBattleFixturePreconditions(referenceScenario, {
      ...project([]),
      mediaAssets: [{ assetId: 'asset_ref', metadata: { role: 'reference' } }],
    })).toMatchObject({ ok: true, satisfied: ['durable-reference-asset'] });
    expect(evaluateChatBattleFixturePreconditions(analysisScenario, {
      ...project([]),
      intelligence: { chatDeepAnalysisJobs: [{ jobId: 'deep_1', status: 'completed' }] },
    })).toMatchObject({ ok: true, satisfied: ['completed-clip-analysis-job'] });
  });

  it('requires the concrete timeline condition named by gap and layer scenarios', () => {
    const gapScenario = getChatEditBattleScenario('close-timeline-gaps')!;
    const layerScenario = getChatEditBattleScenario('reorder-overlay-layer')!;
    const timeline = project([
      { id: 'video-1', type: 'video', from: 0, durationInFrames: 60, row: 0 },
      { id: 'video-2', type: 'video', from: 90, durationInFrames: 60, row: 0 },
      { id: 'title-1', type: 'text', from: 30, durationInFrames: 60, row: 1 },
      { id: 'image-1', type: 'image', from: 45, durationInFrames: 30, row: 2 },
    ]);

    expect(evaluateChatBattleFixturePreconditions(gapScenario, timeline)).toMatchObject({
      ok: true,
      satisfied: ['timeline-gap'],
    });
    expect(evaluateChatBattleFixturePreconditions(layerScenario, timeline, {
      selectedOverlayId: 'title-1',
    })).toMatchObject({
      ok: true,
      satisfied: ['selected-image-overlap'],
    });
    expect(evaluateChatBattleFixturePreconditions(layerScenario, timeline, {
      selectedOverlayId: 'video-1',
    })).toMatchObject({
      ok: false,
      missing: ['selected-image-overlap'],
    });
  });

  it('fails a stale rendered artifact even when tools and Mongo mutation look healthy', () => {
    const scenario = getChatEditBattleScenario('explicit-text')!;
    const before = buildChatBattleProjectSnapshot(project([]), 'mongo-before', '2026-07-16T10:00:00.000Z');
    const afterProject = project([{ id: 'title-1', type: 'text', content: 'Launch day', from: 0, durationInFrames: 90, row: 0 }]);
    const after = buildChatBattleProjectSnapshot(afterProject, 'mongo-after', '2026-07-16T10:00:01.000Z');
    const report = evaluateChatEditBattleJourney({
      journeyId: 'stale-render',
      scenario,
      projectId: 'proj_battle',
      startedAt: '2026-07-16T10:00:00.000Z',
      completedAt: '2026-07-16T10:00:01.000Z',
      invocation: invocation('explicit-text', [
        { id: 'read', name: 'read_project_file', args: {}, startedAt: '2026-07-16T10:00:00.100Z', completedAt: '2026-07-16T10:00:00.200Z', output: successEnvelope() },
        { id: 'add', name: 'add_overlay', args: { type: 'text' }, startedAt: '2026-07-16T10:00:00.300Z', completedAt: '2026-07-16T10:00:00.400Z', output: successEnvelope() },
      ]),
      mongoBefore: before,
      mongoAfter: after,
      uiReload: buildChatBattleProjectSnapshot(afterProject, 'ui-reload', '2026-07-16T10:00:01.000Z'),
      renderEvidence: { status: 'pass', capturedAt: '2026-07-16T09:59:59.000Z', artifactRefs: ['artifact://old.png'], issues: [] },
    });
    expect(report.verdict).toBe('fail');
    expect(report.checks.find((check) => check.id === 'render.fresh-evidence')).toMatchObject({ status: 'fail' });
  });

  it('preserves a fresh rendered warning without failing a successful edit', () => {
    const scenario = getChatEditBattleScenario('explicit-text')!;
    const beforeProject = project([]);
    const afterProject = project([{
      id: 'title-1',
      type: 'text',
      content: 'Launch day',
      from: 0,
      durationInFrames: 90,
      row: 0,
    }]);
    const report = evaluateChatEditBattleJourney({
      journeyId: 'fresh-render-warning',
      scenario,
      projectId: 'proj_battle',
      startedAt: '2026-07-16T10:00:00.000Z',
      completedAt: '2026-07-16T10:00:01.000Z',
      invocation: invocation('explicit-text', [
        { id: 'read', name: 'read_project_file', args: {}, startedAt: '2026-07-16T10:00:00.100Z', completedAt: '2026-07-16T10:00:00.200Z', output: successEnvelope() },
        { id: 'add', name: 'add_overlay', args: { type: 'text' }, startedAt: '2026-07-16T10:00:00.300Z', completedAt: '2026-07-16T10:00:00.400Z', output: successEnvelope() },
      ]),
      mongoBefore: buildChatBattleProjectSnapshot(beforeProject, 'mongo-before', '2026-07-16T10:00:00.000Z'),
      mongoAfter: buildChatBattleProjectSnapshot(afterProject, 'mongo-after', '2026-07-16T10:00:01.000Z'),
      uiReload: buildChatBattleProjectSnapshot(afterProject, 'ui-reload', '2026-07-16T10:00:01.000Z'),
      renderEvidence: {
        status: 'warn',
        capturedAt: '2026-07-16T10:00:00.900Z',
        artifactRefs: ['artifact://title.png'],
        issues: [{ code: 'title_safe_overflow', severity: 'warn' }],
      },
    });

    expect(report.verdict).toBe('warn');
    expect(report.checks.find((check) => check.id === 'render.fresh-evidence')).toMatchObject({
      status: 'warn',
      blocking: true,
    });
  });

  it('recognizes advisory tool results as deterministic envelopes without treating them as mutations', () => {
    const scenario = getChatEditBattleScenario('selected-overlay-edit')!;
    const unchangedProject = project([{ id: 'title-1', type: 'text', content: 'Title', from: 0, durationInFrames: 90 }]);
    const report = evaluateChatEditBattleJourney({
      journeyId: 'advisory-envelope',
      scenario,
      projectId: 'proj_battle',
      startedAt: '2026-07-16T10:00:00.000Z',
      completedAt: '2026-07-16T10:00:01.000Z',
      invocation: invocation('selected-overlay-edit', [{
        id: 'advisory',
        name: 'apply_editorial_intent',
        args: { goal: 'Make the selected title larger.' },
        startedAt: '2026-07-16T10:00:00.100Z',
        completedAt: '2026-07-16T10:00:00.200Z',
        output: advisoryEnvelope({ reason: 'target-needs-clarification' }),
      }]),
      mongoBefore: buildChatBattleProjectSnapshot(unchangedProject, 'mongo-before'),
      mongoAfter: buildChatBattleProjectSnapshot(unchangedProject, 'mongo-after'),
      uiReload: buildChatBattleProjectSnapshot(unchangedProject, 'ui-reload'),
      renderEvidence: { status: 'missing', artifactRefs: [], issues: [] },
    });

    expect(report.checks.find((check) => check.id === 'agent.tool-envelope')).toMatchObject({ status: 'pass' });
    expect(report.checks.find((check) => check.id === 'mongo.mutation-truth')).toMatchObject({ status: 'fail' });
  });

  it('rereads the rotatable auth file instead of caching an expired bearer', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'editron-chat-auth-'));
    const authFile = path.join(directory, 'headers.json');
    try {
      await writeFile(authFile, JSON.stringify({ authorization: 'Bearer first' }), 'utf8');
      expect(await readChatBattleAuthHeaders(authFile)).toEqual({ authorization: 'Bearer first' });

      await writeFile(authFile, JSON.stringify({ authorization: 'Bearer refreshed' }), 'utf8');
      expect(await readChatBattleAuthHeaders(authFile)).toEqual({ authorization: 'Bearer refreshed' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not misreport a policy-blocked tool attempt as a mutation before evidence', () => {
    const scenario = getChatEditBattleScenario('explicit-text')!;
    const beforeProject = project([]);
    const afterProject = project([{ id: 'title-1', type: 'text', content: 'Launch day', from: 0, durationInFrames: 90, row: 0 }]);
    const report = evaluateChatEditBattleJourney({
      journeyId: 'blocked-before-evidence',
      scenario,
      projectId: 'proj_battle',
      startedAt: '2026-07-16T10:00:00.000Z',
      completedAt: '2026-07-16T10:00:01.000Z',
      invocation: invocation('explicit-text', [
        {
          id: 'blocked-add',
          name: 'add_overlay',
          args: { type: 'text' },
          startedAt: '2026-07-16T10:00:00.100Z',
          completedAt: '2026-07-16T10:00:00.200Z',
          output: JSON.stringify({
            status: 'error',
            data: null,
            error: { code: 'CHAT_TOOL_EVIDENCE_REQUIRED', message: 'Read project state first.' },
            nextAction: 'Call read_project_file and retry.',
          }),
        },
        { id: 'read', name: 'read_project_file', args: {}, startedAt: '2026-07-16T10:00:00.300Z', completedAt: '2026-07-16T10:00:00.400Z', output: successEnvelope() },
        { id: 'add', name: 'add_overlay', args: { type: 'text' }, startedAt: '2026-07-16T10:00:00.500Z', completedAt: '2026-07-16T10:00:00.600Z', output: successEnvelope() },
      ]),
      mongoBefore: buildChatBattleProjectSnapshot(beforeProject, 'mongo-before', '2026-07-16T10:00:00.000Z'),
      mongoAfter: buildChatBattleProjectSnapshot(afterProject, 'mongo-after', '2026-07-16T10:00:01.000Z'),
      uiReload: buildChatBattleProjectSnapshot(afterProject, 'ui-reload', '2026-07-16T10:00:01.000Z'),
      renderEvidence: { status: 'pass', capturedAt: '2026-07-16T10:00:00.900Z', artifactRefs: ['artifact://title.png'], issues: [] },
    });

    expect(report.checks.find((check) => check.id === 'agent.evidence-before-mutation')).toMatchObject({
      status: 'pass',
      evidence: {
        firstMutationIndex: 2,
        priorEvidenceTools: ['read_project_file'],
        blockedMutationAttempts: ['add_overlay'],
      },
    });
  });

  it('accepts server-attested canonical state as preflight evidence without a redundant model read', () => {
    const scenario = getChatEditBattleScenario('explicit-text')!;
    const beforeProject = project([]);
    const afterProject = project([{ id: 'title-1', type: 'text', content: 'Launch day', from: 0, durationInFrames: 90, row: 0 }]);
    const report = evaluateChatEditBattleJourney({
      journeyId: 'server-canonical-preflight',
      scenario,
      projectId: 'proj_battle',
      startedAt: '2026-07-16T10:00:00.000Z',
      completedAt: '2026-07-16T10:00:01.000Z',
      invocation: invocation('explicit-text', [{
        id: 'add',
        name: 'add_overlay',
        args: { type: 'text' },
        startedAt: '2026-07-16T10:00:00.100Z',
        completedAt: '2026-07-16T10:00:00.200Z',
        output: successEnvelopeWithCanonicalPreflight({ overlayId: 'title-1' }),
      }]),
      mongoBefore: buildChatBattleProjectSnapshot(beforeProject, 'mongo-before', '2026-07-16T10:00:00.000Z'),
      mongoAfter: buildChatBattleProjectSnapshot(afterProject, 'mongo-after', '2026-07-16T10:00:01.000Z'),
      uiReload: buildChatBattleProjectSnapshot(afterProject, 'ui-reload', '2026-07-16T10:00:01.000Z'),
      renderEvidence: { status: 'pass', capturedAt: '2026-07-16T10:00:00.900Z', artifactRefs: ['artifact://title.png'], issues: [] },
    });

    expect(report.verdict).toBe('pass');
    expect(report.checks.find((check) => check.id === 'agent.required-owner-path')).toMatchObject({
      status: 'pass',
      evidence: { ownerPath: ['server-canonical-project-state', 'add_overlay'] },
    });
    expect(report.checks.find((check) => check.id === 'agent.evidence-before-mutation')).toMatchObject({
      status: 'pass',
      evidence: { serverCanonicalPreflight: true, priorEvidenceTools: [] },
    });
  });

  it('places server canonical preflight before resolver evidence in the logical owner path', () => {
    const scenario = getChatEditBattleScenario('manual-keyframe-zoom')!;
    const beforeProject = project([{ id: 'clip-1', type: 'video', from: 0, durationInFrames: 120, row: 0 }]);
    const afterProject = project([{
      ...beforeProject.overlays[0],
      keyframeTracks: [{ property: 'scale', keyframes: [{ frame: 0, value: 1 }, { frame: 60, value: 1.08 }] }],
    }]);
    const report = evaluateChatEditBattleJourney({
      journeyId: 'resolver-with-server-preflight',
      scenario,
      projectId: 'proj_battle',
      startedAt: '2026-07-16T10:00:00.000Z',
      completedAt: '2026-07-16T10:00:01.000Z',
      invocation: invocation('manual-keyframe-zoom', [
        {
          id: 'resolve',
          name: 'resolve_keyframe_edit',
          args: { overlayId: 'clip-1' },
          startedAt: '2026-07-16T10:00:00.100Z',
          completedAt: '2026-07-16T10:00:00.200Z',
          output: successEnvelope({ useWith: { set_keyframes: { overlayId: 'clip-1', property: 'scale' } } }),
        },
        {
          id: 'mutate',
          name: 'set_keyframes',
          args: { overlayId: 'clip-1', property: 'scale' },
          startedAt: '2026-07-16T10:00:00.300Z',
          completedAt: '2026-07-16T10:00:00.400Z',
          output: successEnvelopeWithCanonicalPreflight({ overlayId: 'clip-1' }),
        },
      ]),
      mongoBefore: buildChatBattleProjectSnapshot(beforeProject, 'mongo-before'),
      mongoAfter: buildChatBattleProjectSnapshot(afterProject, 'mongo-after'),
      uiReload: buildChatBattleProjectSnapshot(afterProject, 'ui-reload'),
      renderEvidence: { status: 'pass', capturedAt: '2026-07-16T10:00:00.900Z', artifactRefs: ['artifact://zoom.png'], issues: [] },
    });

    expect(report.checks.find((check) => check.id === 'agent.required-owner-path')).toMatchObject({
      status: 'pass',
      evidence: {
        ownerPath: ['server-canonical-project-state', 'resolve_keyframe_edit', 'set_keyframes'],
      },
    });
  });

  it('rejects the legacy apply-to-all transition recipe even if it changed Mongo', () => {
    const scenario = getChatEditBattleScenario('vague-transitions')!;
    const beforeProject = project([{ id: 'clip-a', type: 'video', from: 0, durationInFrames: 150, row: 0 }]);
    const afterProject = project([
      ...beforeProject.overlays,
      { id: 'transition-1', type: 'transition', from: 149, durationInFrames: 12, row: 2 },
    ]);
    const report = evaluateChatEditBattleJourney({
      journeyId: 'legacy-transition',
      scenario,
      projectId: 'proj_battle',
      startedAt: '2026-07-16T10:00:00.000Z',
      completedAt: '2026-07-16T10:00:01.000Z',
      invocation: invocation('vague-transitions', [
        { id: 'read', name: 'get_timeline_view', args: {}, startedAt: '2026-07-16T10:00:00.100Z', completedAt: '2026-07-16T10:00:00.200Z', output: successEnvelope() },
        { id: 'transition', name: 'add_transition', args: { applyToAll: true }, startedAt: '2026-07-16T10:00:00.300Z', completedAt: '2026-07-16T10:00:00.400Z', output: successEnvelope() },
      ]),
      mongoBefore: buildChatBattleProjectSnapshot(beforeProject, 'mongo-before', '2026-07-16T10:00:00.000Z'),
      mongoAfter: buildChatBattleProjectSnapshot(afterProject, 'mongo-after', '2026-07-16T10:00:01.000Z'),
      uiReload: buildChatBattleProjectSnapshot(afterProject, 'ui-reload', '2026-07-16T10:00:01.000Z'),
      renderEvidence: { status: 'pass', capturedAt: '2026-07-16T10:00:00.900Z', artifactRefs: ['artifact://transition.png'], issues: [] },
    });
    expect(report.verdict).toBe('fail');
    expect(report.checks.find((check) => check.id === 'agent.no-forbidden-authority')).toMatchObject({ status: 'fail' });
  });

  it('ignores expiring URLs in reload parity but catches actual overlay changes', () => {
    const mongo = project([{ id: 'image-1', type: 'image', from: 0, durationInFrames: 90, row: 1, publicUrl: 'https://cdn/a?token=one', content: 'A' }]);
    const reload = project([{ id: 'image-1', type: 'image', from: 0, durationInFrames: 90, row: 1, publicUrl: 'https://cdn/a?token=two', src: 'https://cdn/resolved', content: 'A' }]);
    const changed = project([{ id: 'image-1', type: 'image', from: 0, durationInFrames: 90, row: 1, publicUrl: 'https://cdn/a?token=two', src: 'https://cdn/resolved', content: 'B' }]);
    const mongoVideo = project([{ id: 'video-1', type: 'video', assetId: 'upload_1', from: 0, durationInFrames: 90, row: 0 }]);
    const hydratedVideo = project([{
      id: 'video-1',
      type: 'video',
      assetId: 'upload_1',
      from: 0,
      durationInFrames: 90,
      row: 0,
      src: 'https://cdn/asset/upload_1',
      content: 'https://cdn/asset/upload_1',
    }]);
    expect(buildChatBattleProjectSnapshot(mongo, 'mongo-after').digest)
      .toBe(buildChatBattleProjectSnapshot(reload, 'ui-reload').digest);
    expect(buildChatBattleProjectSnapshot(mongo, 'mongo-after').digest)
      .not.toBe(buildChatBattleProjectSnapshot(changed, 'ui-reload').digest);
    expect(buildChatBattleProjectSnapshot(mongoVideo, 'mongo-after').digest)
      .toBe(buildChatBattleProjectSnapshot(hydratedVideo, 'ui-reload').digest);
  });

  it('preserves numeric overlay IDs so live created-overlay checks remain trustworthy', () => {
    const before = buildChatBattleProjectSnapshot(project([{
      id: 1783964668040,
      type: 'video',
      from: 0,
      durationInFrames: 90,
      row: 0,
    }]), 'mongo-before');
    const after = buildChatBattleProjectSnapshot(project([
      {
        id: 1783964668040,
        type: 'video',
        from: 0,
        durationInFrames: 90,
        row: 0,
      },
      {
        id: 1785055208000,
        type: 'text',
        from: 0,
        durationInFrames: 60,
        row: 1,
      },
    ]), 'mongo-after');

    expect(before.overlays.map((overlay) => overlay.id)).toEqual(['1783964668040']);
    expect(after.overlays.map((overlay) => overlay.id)).toEqual([
      '1783964668040',
      '1785055208000',
    ]);
  });

  it('requires an explicit live-write flag and a known battle case', () => {
    const options = parseChatBattleCliArgs([
      '--project=proj_battle',
      '--case=explicit-text',
      '--base-url=https://preview.example/',
      '--auth-header-file=C:\\tmp\\editron-auth.json',
      '--run-id=chat-run-1',
    ]);
    expect(options).toMatchObject({
      projectId: 'proj_battle',
      scenarioId: 'explicit-text',
      baseUrl: 'https://preview.example',
      allowLiveWrite: false,
      cleanupFixture: true,
    });
    expect(parseChatBattleCliArgs([
      '--project=proj_battle',
      '--case=explicit-text',
      '--base-url=https://preview.example/',
      '--auth-header-file=C:\\tmp\\editron-auth.json',
      '--keep-fixture',
    ])).toMatchObject({ cleanupFixture: false });
    expect(validateChatBattleCliOptions(options!)).toContain('--allow-live-write');
    expect(validateChatBattleCliOptions({ ...options!, allowLiveWrite: true })).toBeNull();
    expect(validateChatBattleCliOptions({
      ...options!,
      scenarioId: 'not-a-case',
      allowLiveWrite: true,
    })).toBe('Unknown chat battle case: not-a-case');
  });

  it('sends the deployed chat route a stable operation id and exact fixture context', () => {
    const request = buildLiveChatRequestBody({
      scenarioPrompt: 'Add a title.',
      projectId: 'proj_chatbattle_contract',
      selectedOverlayId: 'overlay-title-1',
      clientContext: { currentFrame: 45 },
      runId: 'run 2026/07/18 #1',
    });

    expect(request).toEqual({
      message: 'Add a title.',
      projectId: 'proj_chatbattle_contract',
      operationId: 'chat-battle:run-2026-07-18-1',
      selectedOverlayId: 'overlay-title-1',
      clientContext: { currentFrame: 45 },
    });
    expect(buildLiveChatRequestBody({
      scenarioPrompt: 'Add a title.',
      projectId: 'proj_chatbattle_contract',
      runId: 'run 2026/07/18 #1',
    }).operationId).toBe(request.operationId);
    expect(buildLiveChatRequestBody({
      scenarioPrompt: 'Retry the previous edit.',
      projectId: 'proj_chatbattle_contract',
      runId: 'run 2026/07/18 #2',
      operationId: 'chat-battle-seed:retry-idempotency:operation',
    }).operationId).toBe('chat-battle-seed:retry-idempotency:operation');
  });

  it('parses only the canonical chat operation replay receipt', () => {
    expect(parseChatBattleOperationReplayResponse(409, JSON.stringify({
      code: 'CHAT_EDIT_OPERATION_REPLAY',
      operationId: 'chat-battle-seed:retry-idempotency:operation',
      operationStatus: 'completed',
      beforeCheckpointId: 'checkpoint_before',
      afterCheckpointId: 'checkpoint_after',
    }))).toEqual({
      code: 'CHAT_EDIT_OPERATION_REPLAY',
      operationId: 'chat-battle-seed:retry-idempotency:operation',
      operationStatus: 'completed',
      beforeCheckpointId: 'checkpoint_before',
      afterCheckpointId: 'checkpoint_after',
    });
    expect(parseChatBattleOperationReplayResponse(200, '{}')).toBeNull();
    expect(() => parseChatBattleOperationReplayResponse(409, '<html>conflict</html>'))
      .toThrow('without a valid JSON replay receipt');
    expect(() => parseChatBattleOperationReplayResponse(409, JSON.stringify({
      code: 'SOME_OTHER_CONFLICT',
      operationId: 'operation',
    }))).toThrow('unexpected HTTP 409 response');
  });

  it('proves idempotent retry through durable replay evidence and zero second mutation', () => {
    const scenario = getChatEditBattleScenario('retry-idempotency')!;
    const unchangedProject = project([{
      id: 'video-1',
      type: 'video',
      from: 0,
      durationInFrames: 300,
      row: 0,
      assetId: 'asset-1',
    }]);
    const before = buildChatBattleProjectSnapshot(unchangedProject, 'mongo-before');
    const after = buildChatBattleProjectSnapshot(unchangedProject, 'mongo-after');
    const reload = buildChatBattleProjectSnapshot(unchangedProject, 'ui-reload');
    const report = evaluateChatEditBattleJourney({
      journeyId: 'journey-replay',
      scenario,
      projectId: 'proj_battle',
      startedAt: '2026-07-25T10:00:00.000Z',
      completedAt: '2026-07-25T10:00:01.000Z',
      invocation: {
        agentRunId: 'journey-replay',
        mode: 'live-provider',
        prompt: scenario.prompt,
        responseText: '',
        toolEvents: [],
        replayProtection: {
          code: 'CHAT_EDIT_OPERATION_REPLAY',
          operationId: 'chat-battle-seed:retry-idempotency:operation',
          operationStatus: 'completed',
          beforeCheckpointId: 'checkpoint_before',
          afterCheckpointId: 'checkpoint_after',
        },
      },
      mongoBefore: before,
      mongoAfter: after,
      uiReload: reload,
      renderEvidence: {
        status: 'missing',
        artifactRefs: [],
        issues: [],
      },
      fixturePreconditions: {
        ok: true,
        missing: [],
        satisfied: ['prior-idempotency-record'],
      },
    });

    expect(report.verdict).toBe('pass');
    expect(report.checks.find((check) => check.id === 'agent.operation-replay-protection'))
      .toMatchObject({ status: 'pass', blocking: true });
    expect(report.checks.find((check) => check.id === 'agent.tool-completion'))
      .toMatchObject({ status: 'pass' });
    expect(report.checks.find((check) => check.id === 'mongo.mutation-truth'))
      .toMatchObject({ status: 'pass' });
  });

  it('rejects an operation replay receipt during a fresh scenario', () => {
    const scenario = getChatEditBattleScenario('explicit-text')!;
    const unchangedProject = project([]);
    const report = evaluateChatEditBattleJourney({
      journeyId: 'journey-unexpected-replay',
      scenario,
      projectId: 'proj_battle',
      startedAt: '2026-07-25T10:00:00.000Z',
      completedAt: '2026-07-25T10:00:01.000Z',
      invocation: {
        agentRunId: 'journey-unexpected-replay',
        mode: 'live-provider',
        prompt: scenario.prompt,
        responseText: '',
        toolEvents: [],
        replayProtection: {
          code: 'CHAT_EDIT_OPERATION_REPLAY',
          operationId: 'unexpected-operation',
        },
      },
      mongoBefore: buildChatBattleProjectSnapshot(unchangedProject, 'mongo-before'),
      mongoAfter: buildChatBattleProjectSnapshot(unchangedProject, 'mongo-after'),
      uiReload: buildChatBattleProjectSnapshot(unchangedProject, 'ui-reload'),
      renderEvidence: {
        status: 'missing',
        artifactRefs: [],
        issues: [],
      },
      fixturePreconditions: {
        ok: true,
        missing: [],
        satisfied: [],
      },
    });

    expect(report.verdict).toBe('fail');
    expect(report.checks.find((check) => check.id === 'agent.operation-replay-protection'))
      .toMatchObject({ status: 'fail', blocking: true });
  });

  it('reuses the process-owned Mongo connection across before and after snapshots', async () => {
    const findProject = vi.fn(async (projectId: string) => ({
      projectId,
      overlays: [],
      durationInFrames: 300,
    }));

    const before = await loadChatBattleMongoProject('proj_fixture', { findProject });
    const after = await loadChatBattleMongoProject('proj_fixture', { findProject });

    expect(findProject).toHaveBeenCalledTimes(2);
    expect(before.projectId).toBe('proj_fixture');
    expect(after.projectId).toBe('proj_fixture');
  });

  it('waits for asynchronous rendered evidence and returns the completed verdict', async () => {
    let now = 1_000;
    const pending = project([]);
    const completed = {
      ...project([]),
      intelligence: {
        latestChatEditRenderVerification: {
          status: 'pass',
          requestedAt: '2026-07-18T10:00:01.000Z',
          completedAt: '2026-07-18T10:00:03.000Z',
          visual: {
            renderedFrames: [{ beforeUrl: 'https://cdn/before.webp', afterUrl: 'https://cdn/after.webp' }],
            issues: [],
          },
          audio: {
            windows: [{ beforeUrl: 'https://cdn/before.wav', afterUrl: 'https://cdn/after.wav' }],
          },
        },
      },
    };
    const loadProject = vi.fn(async () => completed);

    const evidence = await waitForFreshChatBattleRenderEvidence({
      projectId: 'proj_fixture',
      startedAt: '2026-07-18T10:00:00.000Z',
      initialProject: pending,
      timeoutMs: 10_000,
      pollIntervalMs: 1_000,
    }, {
      loadProject,
      now: () => now,
      sleep: async (milliseconds) => { now += milliseconds; },
    });

    expect(loadProject).toHaveBeenCalledTimes(1);
    expect(evidence).toMatchObject({ status: 'pass', capturedAt: '2026-07-18T10:00:03.000Z' });
    expect(evidence.artifactRefs).toEqual([
      'https://cdn/before.webp',
      'https://cdn/after.webp',
      'https://cdn/before.wav',
      'https://cdn/after.wav',
    ]);
  });

  it('keeps a disposable fixture alive beyond the worker three-minute boundary by default', async () => {
    let now = 0;
    const pending = project([]);
    const completed = {
      ...project([]),
      intelligence: {
        latestChatEditRenderVerification: {
          status: 'pass',
          requestedAt: '2026-07-18T10:00:01.000Z',
          completedAt: '2026-07-18T10:04:00.000Z',
          visual: {
            renderedFrames: [{ beforeUrl: 'https://cdn/before.webp', afterUrl: 'https://cdn/after.webp' }],
            issues: [],
          },
          audio: { windows: [] },
        },
      },
    };

    const evidence = await waitForFreshChatBattleRenderEvidence({
      projectId: 'proj_fixture',
      startedAt: '2026-07-18T10:00:00.000Z',
      initialProject: pending,
      pollIntervalMs: 60_000,
    }, {
      loadProject: async () => now >= 4 * 60_000 ? completed : pending,
      now: () => now,
      sleep: async (milliseconds) => { now += milliseconds; },
    });

    expect(now).toBe(4 * 60_000);
    expect(evidence).toMatchObject({ status: 'pass', capturedAt: '2026-07-18T10:04:00.000Z' });
  });

  it('does not poll for rendered evidence after a terminal agent invocation failure', () => {
    expect(shouldPollForFreshChatBattleRenderEvidence({
      requiresRenderedEvidence: true,
      initialStatus: 'missing',
      invocationError: 'CHAT_PROVIDER_CREDITS_DEPLETED',
      hasSuccessfulMutation: true,
    })).toBe(false);

    expect(shouldPollForFreshChatBattleRenderEvidence({
      requiresRenderedEvidence: true,
      initialStatus: 'missing',
      invocationError: null,
      hasSuccessfulMutation: true,
    })).toBe(true);

    expect(shouldPollForFreshChatBattleRenderEvidence({
      requiresRenderedEvidence: true,
      initialStatus: 'missing',
      invocationError: null,
      hasSuccessfulMutation: false,
    })).toBe(false);
  });

  it('tracks render verification lifecycle without regressing a delivered job to dispatched', () => {
    const requested = buildRequestedChatEditRenderVerification(
      renderVerificationRequest(),
      '2026-07-18T10:00:01.100Z',
    );
    const dispatched = markChatEditRenderVerificationDispatched(
      requested,
      { dispatched: true, messageId: 'msg_123' },
      '2026-07-18T10:00:01.200Z',
    );
    const delivered = markChatEditRenderVerificationDelivered(dispatched, {
      attemptCount: 2,
      workerRequestId: 'worker_req_123',
      now: '2026-07-18T10:00:02.000Z',
    });
    const lateDispatch = markChatEditRenderVerificationDispatched(
      delivered,
      { dispatched: true, messageId: 'msg_123' },
      '2026-07-18T10:00:02.500Z',
    );
    const rendering = markChatEditRenderVerificationRendering(lateDispatch, '2026-07-18T10:00:03.000Z');
    const completed = markChatEditRenderVerificationTerminal(rendering, {
      status: 'pass',
      visual: { renderedFrames: [], issues: [] },
      audio: renderedAudioEvidence(),
      reasons: [],
      now: '2026-07-18T10:00:04.000Z',
    });

    expect(dispatched.lifecycle).toMatchObject({
      state: 'dispatched',
      qstashMessageId: 'msg_123',
      dispatchedAt: '2026-07-18T10:00:01.200Z',
    });
    expect(lateDispatch.lifecycle).toMatchObject({
      state: 'delivered',
      attemptCount: 2,
      workerRequestId: 'worker_req_123',
    });
    expect(completed.lifecycle).toMatchObject({
      state: 'completed',
      terminalStatus: 'pass',
      attemptCount: 2,
      terminalAt: '2026-07-18T10:00:04.000Z',
    });
  });

  it('preserves advisory rendered quality warnings while blocking missing or failed evidence', () => {
    const visualWarning = {
      status: 'completed',
      gateStatus: 'warn',
      renderedFrames: [{ afterUrl: 'https://cdn/title.webp' }],
      issues: [{
        modality: 'visual',
        severity: 'warn',
        code: 'safe-area',
        message: 'Title exceeds title-safe margin.',
      }],
    };
    expect(resolveChatEditRenderVerificationStatus({
      requestedModalities: ['visual'],
      visual: visualWarning,
      audio: null,
    })).toBe('warn');
    expect(resolveChatEditRenderVerificationStatus({
      requestedModalities: ['visual'],
      visual: { ...visualWarning, gateStatus: 'needs_review' },
      audio: null,
    })).toBe('fail');
    expect(resolveChatEditRenderVerificationStatus({
      requestedModalities: ['visual', 'audio'],
      visual: { ...visualWarning, gateStatus: 'pass' },
      audio: null,
    })).toBe('fail');
    expect(resolveChatEditRenderVerificationStatus({
      requestedModalities: ['visual', 'audio'],
      visual: { ...visualWarning, gateStatus: 'pass' },
      audio: renderedAudioEvidence(),
    })).toBe('pass');

    const completed = markChatEditRenderVerificationTerminal(
      buildRequestedChatEditRenderVerification(renderVerificationRequest()),
      {
        status: 'warn',
        visual: visualWarning,
        audio: null,
        reasons: ['visual_gate_warn'],
        issues: visualWarning.issues,
        now: '2026-07-18T10:00:04.000Z',
      },
    );
    const evidence = extractPersistedChatBattleRenderEvidence({
      projectId: 'proj_battle',
      intelligence: { latestChatEditRenderVerification: completed },
    }, '2026-07-18T10:00:00.000Z');

    expect(completed).toMatchObject({
      status: 'warn',
      lifecycle: {
        state: 'completed',
        terminalStatus: 'quality-warn',
      },
    });
    expect(evidence).toMatchObject({
      status: 'warn',
      artifactRefs: ['https://cdn/title.webp'],
      issues: [expect.objectContaining({ severity: 'warn', code: 'safe-area' })],
    });
  });

  it('never persists a non-pass terminal render verdict without a diagnostic', () => {
    const failed = markChatEditRenderVerificationTerminal(
      buildRequestedChatEditRenderVerification(renderVerificationRequest()),
      {
        status: 'fail',
        visual: null,
        audio: null,
        reasons: [],
        issues: [],
        now: '2026-07-18T10:00:04.000Z',
      },
    );

    expect(failed).toMatchObject({
      status: 'fail',
      reasons: ['render_verification_terminal_missing_diagnostic'],
      issues: [{
        modality: 'system',
        severity: 'error',
        code: 'render_verification_terminal_missing_diagnostic',
        message: 'Render verification ended without a diagnostic.',
      }],
      lifecycle: {
        state: 'completed',
        terminalStatus: 'quality-fail',
        reason: 'render_verification_terminal_missing_diagnostic',
      },
    });
  });

  it('marks exhausted render verification deliveries as terminal system errors', () => {
    const requested = buildRequestedChatEditRenderVerification(
      renderVerificationRequest(),
      '2026-07-18T10:00:01.100Z',
    );
    const failed = markChatEditRenderVerificationDeliveryFailed(requested, {
      reason: 'qstash_delivery_failed:timeout:request timed out',
      attemptCount: 3,
      qstashMessageId: 'msg_failed',
      now: '2026-07-18T10:05:01.000Z',
    });
    const alreadyCompleted = markChatEditRenderVerificationDeliveryFailed(
      markChatEditRenderVerificationTerminal(
        markChatEditRenderVerificationRendering(
          markChatEditRenderVerificationDelivered(requested, {
            attemptCount: 1,
            workerRequestId: 'worker_done',
            now: '2026-07-18T10:00:02.000Z',
          }),
          '2026-07-18T10:00:03.000Z',
        ),
        {
          status: 'pass',
          visual: { renderedFrames: [], issues: [] },
          audio: renderedAudioEvidence(),
          reasons: [],
          now: '2026-07-18T10:00:04.000Z',
        },
      ),
      {
        reason: 'late_qstash_callback',
        attemptCount: 4,
        qstashMessageId: 'msg_late',
        now: '2026-07-18T10:06:00.000Z',
      },
    );

    expect(failed).toMatchObject({
      status: 'error',
      completedAt: '2026-07-18T10:05:01.000Z',
      reasons: ['qstash_delivery_failed:timeout:request timed out'],
      issues: [{
        modality: 'system',
        severity: 'error',
        code: 'render_verification_delivery_failed',
        message: 'qstash_delivery_failed:timeout:request timed out',
      }],
      lifecycle: {
        state: 'failed',
        terminalStatus: 'system-error',
        attemptCount: 3,
        qstashMessageId: 'msg_failed',
      },
    });
    expect(alreadyCompleted.lifecycle).toMatchObject({
      state: 'completed',
      terminalStatus: 'pass',
      qstashMessageId: null,
    });
  });

  it('surfaces pending chat render verification lifecycle in battle evidence reports', () => {
    const pending = markChatEditRenderVerificationDelivered(
      markChatEditRenderVerificationDispatched(
        buildRequestedChatEditRenderVerification(renderVerificationRequest()),
        { dispatched: true, messageId: 'msg_pending' },
        '2026-07-18T10:00:01.200Z',
      ),
      {
        attemptCount: 1,
        workerRequestId: 'worker_pending',
        now: '2026-07-18T10:00:02.000Z',
      },
    );
    const evidence = extractPersistedChatBattleRenderEvidence({
      projectId: 'proj_battle',
      intelligence: { latestChatEditRenderVerification: pending },
    }, '2026-07-18T10:00:00.000Z');

    expect(evidence.status).toBe('missing');
    expect(evidence.reason).toBe('Chat edit render verification is still pending (delivered).');
    expect(evidence.jobLifecycle).toMatchObject({
      state: 'delivered',
      qstashMessageId: 'msg_pending',
      workerRequestId: 'worker_pending',
    });
  });

  it('carries completed chat render verification lifecycle into battle evidence reports', () => {
    const completed = markChatEditRenderVerificationTerminal(
      markChatEditRenderVerificationRendering(
        markChatEditRenderVerificationDelivered(
          markChatEditRenderVerificationDispatched(
            buildRequestedChatEditRenderVerification(renderVerificationRequest()),
            { dispatched: true, messageId: 'msg_done' },
            '2026-07-18T10:00:01.200Z',
          ),
          {
            attemptCount: 3,
            workerRequestId: 'worker_done',
            now: '2026-07-18T10:00:02.000Z',
          },
        ),
        '2026-07-18T10:00:03.000Z',
      ),
      {
        status: 'fail',
        visual: {
          renderedFrames: [{ beforeUrl: 'https://cdn/before.webp' }],
          issues: [{ family: 'caption', severity: 'critical' }],
        },
        audio: renderedAudioEvidence(),
        reasons: ['caption_contrast_too_low'],
        now: '2026-07-18T10:00:04.000Z',
      },
    );
    const evidence = extractPersistedChatBattleRenderEvidence({
      projectId: 'proj_battle',
      intelligence: { latestChatEditRenderVerification: completed },
    }, '2026-07-18T10:00:00.000Z');

    expect(evidence.status).toBe('fail');
    expect(evidence.artifactRefs).toEqual(['https://cdn/before.webp']);
    expect(evidence.issues).toEqual(expect.arrayContaining([expect.objectContaining({
      modality: 'visual',
      severity: 'error',
      code: 'caption_contrast_too_low',
      message: 'caption_contrast_too_low',
    })]));
    expect(evidence.jobLifecycle).toMatchObject({
      state: 'completed',
      terminalStatus: 'quality-fail',
      attemptCount: 3,
    });
  });

  it('keeps audio render failures queryable instead of reporting fail with empty issues', () => {
    const evidence = extractPersistedChatBattleRenderEvidence({
      projectId: 'proj_battle',
      intelligence: {
        latestChatEditRenderVerification: {
          status: 'fail',
          requestedAt: '2026-07-18T10:00:01.000Z',
          completedAt: '2026-07-18T10:00:04.000Z',
          reasons: ['audio_render_fail:rendered_audio_did_not_change_in_the_requested_window'],
          visual: null,
          audio: {
            version: 'editron-chat-rendered-audio-v1',
            status: 'fail',
            capturedAt: '2026-07-18T10:00:04.000Z',
            windows: [{
              startFrame: 30,
              endFrame: 120,
              beforeUrl: 'https://cdn/before.wav',
              afterUrl: 'https://cdn/after.wav',
              beforePcmSha256: 'same',
              afterPcmSha256: 'same',
              beforeRms: 0.1,
              afterRms: 0.1,
              beforePeak: 0.2,
              afterPeak: 0.2,
              changed: false,
              error: null,
            }],
            reason: 'rendered_audio_did_not_change_in_the_requested_window',
          },
          lifecycle: { state: 'completed', terminalStatus: 'quality-fail' },
        },
      },
    }, '2026-07-18T10:00:00.000Z');

    expect(evidence.status).toBe('fail');
    expect(evidence.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        modality: 'audio',
        code: 'audio_window_unchanged',
        message: 'Rendered audio did not change inside the requested verification window.',
        startFrame: 30,
        endFrame: 120,
      }),
    ]));
  });

  it('surfaces legacy failed chat verification reasons as structured issues', () => {
    const evidence = extractPersistedChatBattleRenderEvidence({
      projectId: 'proj_battle',
      intelligence: {
        latestChatEditRenderVerification: {
          status: 'error',
          requestedAt: '2026-07-18T10:00:01.000Z',
          completedAt: '2026-07-18T10:05:01.000Z',
          reasons: ['qstash_delivery_failed:timeout'],
          visual: null,
          audio: null,
          lifecycle: { state: 'failed', terminalStatus: 'system-error' },
        },
      },
    }, '2026-07-18T10:00:00.000Z');

    expect(evidence.status).toBe('fail');
    expect(evidence.issues).toEqual([expect.objectContaining({
      modality: 'system',
      severity: 'error',
      code: 'qstash_delivery_failed',
      message: 'qstash_delivery_failed:timeout',
    })]);
  });
});
