import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
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
          const part = step === 0
            ? { functionCall: { name: 'read_project_file', args: {} } }
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
        schema: z.object({}),
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

import { createAgent } from '@/lib/editron/agent/agent-graph';
import {
  CHAT_EDIT_BATTLE_SCENARIOS,
  buildChatBattleProjectSnapshot,
  buildChatEditBattleSuite,
  evaluateChatEditBattleJourney,
  getChatEditBattleScenario,
  runChatEditBattleJourney,
  type ChatBattleInvocationEvidence,
  type ChatBattleToolEvent,
} from '@/lib/editron/services/chat-edit-battle-harness';
import {
  chatBattleInvocationQueuedProjectMutation,
  parseChatBattleCliArgs,
  validateChatBattleCliOptions,
  waitForQueuedProjectMutation,
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

    expect(chatBattleInvocationQueuedProjectMutation(queued)).toBe(true);
    expect(chatBattleInvocationQueuedProjectMutation(immediate)).toBe(false);
  });

  it('waits for material project state after a queued edit and reports timeout honestly', async () => {
    const unchanged = project([]);
    const changed = project([{ id: 'video-2', type: 'video', from: 0, durationInFrames: 300, row: 0 }]);
    const baselineDigest = buildChatBattleProjectSnapshot(unchanged, 'mongo-before').digest;
    let clock = 0;
    const loadProject = vi.fn()
      .mockResolvedValueOnce(unchanged)
      .mockResolvedValueOnce(unchanged)
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
    const reload = project([{ id: 'image-1', type: 'image', from: 0, durationInFrames: 90, row: 1, publicUrl: 'https://cdn/a?token=two', content: 'A' }]);
    const changed = project([{ id: 'image-1', type: 'image', from: 0, durationInFrames: 90, row: 1, publicUrl: 'https://cdn/a?token=two', content: 'B' }]);
    expect(buildChatBattleProjectSnapshot(mongo, 'mongo-after').digest)
      .toBe(buildChatBattleProjectSnapshot(reload, 'ui-reload').digest);
    expect(buildChatBattleProjectSnapshot(mongo, 'mongo-after').digest)
      .not.toBe(buildChatBattleProjectSnapshot(changed, 'ui-reload').digest);
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
    });
    expect(validateChatBattleCliOptions(options!)).toContain('--allow-live-write');
    expect(validateChatBattleCliOptions({ ...options!, allowLiveWrite: true })).toBeNull();
    expect(validateChatBattleCliOptions({
      ...options!,
      scenarioId: 'not-a-case',
      allowLiveWrite: true,
    })).toBe('Unknown chat battle case: not-a-case');
  });
});
