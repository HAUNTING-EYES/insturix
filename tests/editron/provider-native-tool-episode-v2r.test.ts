import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  ProviderNativeTransportErrorV2R,
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { ProviderNativeRouteV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import { buildProviderNativeToolSetV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-catalog-v2r';
import {
  PROVIDER_NATIVE_REFERENCE_ARM_V2R,
  PROVIDER_NATIVE_REFERENCE_INPUT_VERSION_V2R,
  type ProviderNativeReferenceInputV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-input-v2r';

const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'episode-native-tools-1',
  objective: 'Read the revision-bound project and stop honestly.',
  activeTarget: { targetClaimId: 'claim-1', requirement: 'inspect project' },
  revisionBinding: { projectId: 'project-1', expectedProjectRevision: 'revision-7' },
  projectState: { projectId: 'project-1', expectedProjectRevision: 'revision-7' },
  evidence: [{ evidenceId: 'ev-1', kind: 'project-identity' }],
  preservationRules: ['Do not mutate the project.'],
  authorityAndPolicy: { mutation: 'DENIED', network: 'PROVIDER_ONLY' },
  budget: { maxTurns: 3, maxOutputTokensPerTurn: 512, maxIdenticalCalls: 1 },
};

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const ONE_PIXEL_PNG_SHA256 = createHash('sha256')
  .update(Buffer.from(ONE_PIXEL_PNG, 'base64'))
  .digest('hex');
const REFERENCE_INPUT: ProviderNativeReferenceInputV2R = {
  version: PROVIDER_NATIVE_REFERENCE_INPUT_VERSION_V2R,
  arm: PROVIDER_NATIVE_REFERENCE_ARM_V2R,
  referenceId: 'ref_00000001',
  referenceAssetSha256: 'a'.repeat(64),
  resolution: 'high',
  frames: [
    {
      frameId: 'frame_000001', timestampUs: '0', mimeType: 'image/png',
      bytesBase64: ONE_PIXEL_PNG, bytesSha256: ONE_PIXEL_PNG_SHA256,
    },
    {
      frameId: 'frame_000002', timestampUs: '1000000', mimeType: 'image/png',
      bytesBase64: ONE_PIXEL_PNG, bytesSha256: ONE_PIXEL_PNG_SHA256,
    },
  ],
};

describe('V2R provider-native sequential tool episode', () => {
  it('derives exact tools from V2R/CAP-2A and rejects non-compilable rows', () => {
    const tools = buildProviderNativeToolSetV2R([
      'read_project_file', 'get_timeline_view', 'cut_section',
    ]);
    expect(tools.authority).toBe('V2R_CATALOG_PLUS_CAP2A_DOSSIER');
    expect(tools.operatorIds).toEqual([
      'read_project_file', 'get_timeline_view', 'cut_section',
    ]);
    expect(tools.operators[0]).toMatchObject({
      operatorId: 'read_project_file',
      openAiStrict: false,
    });
    expect(tools.operators[1]).toMatchObject({
      operatorId: 'get_timeline_view',
      openAiStrict: true,
    });
    expect(tools.operators[2]).toMatchObject({
      operatorId: 'cut_section',
      openAiStrict: false,
    });
    expect(tools.operators[2].description).toContain(
      'ResearchEpisodeAuthorization=CALLABLE_ISOLATED_CLONE_ONLY',
    );
    expect(tools.operators[2].exactInputSchema).toMatchObject({
      required: ['projectId', 'expectedProjectRevision', 'targetRange'],
      additionalProperties: false,
    });
    expect(() => buildProviderNativeToolSetV2R(['add_transition']))
      .toThrow('PROVIDER_NATIVE_OPERATOR_NOT_RESEARCH_EXECUTABLE:add_transition');
  });

  it.each([
    ['OPENAI_LUNA', 'gpt-5.6-luna'],
    ['OPENAI_TERRA', 'gpt-5.6-terra'],
  ] as const)('runs a stateless sequential OpenAI episode for %s', async (routeId, model) => {
    const requests: Array<Record<string, unknown>> = [];
    const rawFirst = openAiToolCall('response-1', model, 'call-read', 'read_project_file', {
      projectId: 'project-1', expectedProjectRevision: 'revision-7',
    });
    const invoke = vi.fn(async (request: { body: Record<string, unknown> }) => {
      requests.push(request.body);
      return requests.length === 1
        ? { status: 200, body: rawFirst }
        : { status: 200, body: openAiFinish('response-2', model, 'READY_FOR_PROOF') };
    });
    const executeIsolated = vi.fn(async () => ({
      authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
      disposition: 'OK' as const,
      output: { result: { projectId: 'project-1' }, evidence: { revision: 'revision-7' } },
      evidenceIds: ['ev-project-read'],
    }));

    const receipt = await runProviderNativeToolEpisodeV2R({
      route: openAiRoute(routeId, model), context: CONTEXT,
      eligibleOperatorIds: ['read_project_file'], invoke, executeIsolated,
    });

    expect(requests[0]).toMatchObject({
      model, store: false, parallel_tool_calls: false, tool_choice: 'auto',
    });
    expect(JSON.stringify(requests[0])).toContain('isolated research clone');
    expect(JSON.stringify(requests[0])).toContain(
      'Use UNVERIFIABLE when required evidence or proof is absent',
    );
    expect((requests[0].tools as Array<Record<string, unknown>>)[0]).toMatchObject({
      name: 'read_project_file', strict: false,
    });
    const secondInput = requests[1].input as Array<Record<string, unknown>>;
    expect(secondInput).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'reasoning', id: 'reasoning-1' }),
      expect.objectContaining({ type: 'function_call', call_id: 'call-read' }),
      expect.objectContaining({ type: 'function_call_output', call_id: 'call-read' }),
    ]));
    expect(executeIsolated).toHaveBeenCalledWith({
      operatorId: 'read_project_file',
      arguments: { projectId: 'project-1', expectedProjectRevision: 'revision-7' },
      turn: 1,
    });
    expect(receipt).toMatchObject({
      authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
      selectedOperatorIds: ['read_project_file'],
      terminal: { disposition: 'READY_FOR_PROOF' },
      productOutcome: 'NOT_EVALUATED_ADAPTER_ONLY', stateEffects: [],
    });
    expect(receipt.turns[0].rawResponse).toEqual(rawFirst);
  });

  it('replays Gemini thought/call/result steps with the exact function id', async () => {
    const requests: Array<Record<string, unknown>> = [];
    const invoke = vi.fn(async (request: { body: Record<string, unknown> }) => {
      requests.push(request.body);
      return requests.length === 1
        ? {
            status: 200,
            body: {
              id: 'interaction-1', model: 'gemini-3.7-flash', status: 'completed',
              steps: [
                { type: 'thought', id: 'thought-1', summary: 'Need the exact project.' },
                { type: 'function_call', id: 'gemini-read-1', name: 'read_project_file', arguments: {
                  projectId: 'project-1', expectedProjectRevision: 'revision-7',
                } },
              ],
            },
          }
        : { status: 200, body: googleFinish('interaction-2', 'PASS') };
    });
    const receipt = await runProviderNativeToolEpisodeV2R({
      route: googleRoute(), context: CONTEXT, eligibleOperatorIds: ['read_project_file'], invoke,
      executeIsolated: async () => ({
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION',
        disposition: 'OK',
        output: { result: { projectId: 'project-1' }, evidence: { revision: 'revision-7' } },
        evidenceIds: ['ev-project-read'],
      }),
    });

    expect(requests[0]).toMatchObject({
      model: 'gemini-3.7-flash', store: false,
      generation_config: { max_output_tokens: 512, thinking_level: 'medium', tool_choice: 'auto' },
    });
    const history = requests[1].input as Array<Record<string, unknown>>;
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'thought', id: 'thought-1' }),
      expect.objectContaining({ type: 'function_call', id: 'gemini-read-1' }),
      expect.objectContaining({ type: 'function_result', call_id: 'gemini-read-1', name: 'read_project_file' }),
    ]));
    expect(receipt.terminal.disposition).toBe('PASS');
    expect(receipt.selectedOperatorIds).toEqual(['read_project_file']);
  });

  it('sends byte-equivalent ordered reference frames through provider-native image syntax', async () => {
    let openAiRequest: { body: Readonly<Record<string, unknown>> } | undefined;
    let googleRequest: { body: Readonly<Record<string, unknown>> } | undefined;
    await runProviderNativeToolEpisodeV2R({
      route: openAiRoute('OPENAI_LUNA', 'gpt-5.6-luna'), context: CONTEXT,
      eligibleOperatorIds: ['read_project_file'], referenceInput: REFERENCE_INPUT,
      invoke: async (request) => {
        openAiRequest = request;
        return { status: 200, body: openAiFinish('image-openai', 'gpt-5.6-luna', 'READY_FOR_PROOF') };
      },
      executeIsolated: vi.fn(),
    });
    await runProviderNativeToolEpisodeV2R({
      route: googleRoute(), context: CONTEXT,
      eligibleOperatorIds: ['read_project_file'], referenceInput: REFERENCE_INPUT,
      invoke: async (request) => {
        googleRequest = request;
        return { status: 200, body: googleFinish('image-google', 'READY_FOR_PROOF') };
      },
      executeIsolated: vi.fn(),
    });

    expect(openAiRequest).toBeDefined();
    expect(googleRequest).toBeDefined();
    const openAiContent = initialContent(openAiRequest?.body);
    const googleContent = initialContent(googleRequest?.body);
    expect(openAiContent).toHaveLength(6);
    expect(googleContent).toHaveLength(6);
    expect(openAiContent[1].text).toBe(googleContent[1].text);
    expect(openAiContent[2].text).toBe(googleContent[2].text);
    expect(openAiContent[4].text).toBe(googleContent[4].text);
    expect(openAiContent[3]).toEqual({
      type: 'input_image',
      image_url: `data:image/png;base64,${ONE_PIXEL_PNG}`,
      detail: 'high',
    });
    expect(googleContent[3]).toEqual({
      type: 'image', data: ONE_PIXEL_PNG, mime_type: 'image/png', resolution: 'high',
    });
    const modelVisibleText = [...openAiContent, ...googleContent]
      .filter((item) => typeof item.text === 'string')
      .map((item) => item.text)
      .join('\n');
    expect(modelVisibleText).not.toContain(ONE_PIXEL_PNG);
    expect(modelVisibleText).not.toMatch(/filmstrip|five[ -]panel|opposed motion/i);
    expect(modelVisibleText).toContain(ONE_PIXEL_PNG_SHA256);
  });

  it('rejects malformed or semantically reordered reference input before provider dispatch', async () => {
    const malformed: Array<Readonly<{ label: string; input: ProviderNativeReferenceInputV2R }>> = [
      {
        label: 'tampered image hash',
        input: { ...REFERENCE_INPUT, frames: [
          { ...REFERENCE_INPUT.frames[0], bytesSha256: 'b'.repeat(64) },
          REFERENCE_INPUT.frames[1],
        ] },
      },
      {
        label: 'unordered timestamps',
        input: { ...REFERENCE_INPUT, frames: [
          { ...REFERENCE_INPUT.frames[0], timestampUs: '1000000' },
          { ...REFERENCE_INPUT.frames[1], timestampUs: '0' },
        ] },
      },
      {
        label: 'invalid base64',
        input: { ...REFERENCE_INPUT, frames: [
          { ...REFERENCE_INPUT.frames[0], bytesBase64: 'not-base64!' },
          REFERENCE_INPUT.frames[1],
        ] },
      },
      {
        label: 'unsupported mime',
        input: { ...REFERENCE_INPUT, frames: [
          { ...REFERENCE_INPUT.frames[0], mimeType: 'image/gif' },
          REFERENCE_INPUT.frames[1],
        ] } as unknown as ProviderNativeReferenceInputV2R,
      },
      {
        label: 'extra undeclared field',
        input: { ...REFERENCE_INPUT, frames: [
          { ...REFERENCE_INPUT.frames[0], semanticHint: 'five panels' },
          REFERENCE_INPUT.frames[1],
        ] } as unknown as ProviderNativeReferenceInputV2R,
      },
    ];

    for (const scenario of malformed) {
      const invoke = vi.fn();
      await expect(runProviderNativeToolEpisodeV2R({
        route: openAiRoute('OPENAI_TERRA', 'gpt-5.6-terra'), context: CONTEXT,
        eligibleOperatorIds: ['read_project_file'], referenceInput: scenario.input,
        invoke, executeIsolated: vi.fn(),
      }), scenario.label).rejects.toThrow(/REFERENCE_/);
      expect(invoke, scenario.label).not.toHaveBeenCalled();
    }
  });

  it('permits the same proof read after a successful mutation but blocks an unchanged loop', async () => {
    const context = {
      ...CONTEXT,
      budget: { ...CONTEXT.budget, maxTurns: 4, maxIdenticalCalls: 1 },
    };
    const calls = [
      openAiToolCall('r1', 'gpt-5.6-luna', 'c1', 'read_project_file', {
        projectId: 'project-1', expectedProjectRevision: 'revision-7',
      }),
      openAiToolCall('r2', 'gpt-5.6-luna', 'c2', 'set_keyframes', {
        projectId: 'project-1', expectedProjectRevision: 'revision-7',
        overlayId: 1, keyframes: [{ frame: 10, value: 1.1 }],
      }),
      openAiToolCall('r3', 'gpt-5.6-luna', 'c3', 'read_project_file', {
        projectId: 'project-1', expectedProjectRevision: 'revision-7',
      }),
      openAiFinish('r4', 'gpt-5.6-luna', 'READY_FOR_PROOF'),
    ];
    let turn = 0;
    const receipt = await runProviderNativeToolEpisodeV2R({
      route: openAiRoute('OPENAI_LUNA', 'gpt-5.6-luna'), context,
      eligibleOperatorIds: ['read_project_file', 'set_keyframes'],
      invoke: async () => ({ status: 200, body: calls[turn++] }),
      executeIsolated: async ({ operatorId }) => ({
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION',
        disposition: 'OK',
        output: operatorId === 'set_keyframes'
          ? { receipt: { status: 'PASS' } }
          : { result: { projectId: 'project-1' }, evidence: { revision: 'revision-7' } },
        evidenceIds: ['ev-project-read'],
      }),
    });
    expect(receipt.terminal.disposition).toBe('READY_FOR_PROOF');
    expect(receipt.selectedOperatorIds).toEqual([
      'read_project_file', 'set_keyframes', 'read_project_file',
    ]);

    let unchangedTurn = 0;
    const unchangedLoop = await runProviderNativeToolEpisodeV2R({
      route: openAiRoute('OPENAI_LUNA', 'gpt-5.6-luna'), context: CONTEXT,
      eligibleOperatorIds: ['read_project_file'],
      invoke: async () => ({ status: 200, body: openAiToolCall(
        `loop-${unchangedTurn}`,
        'gpt-5.6-luna',
        `loop-call-${unchangedTurn++}`,
        'read_project_file',
        { projectId: 'project-1', expectedProjectRevision: 'revision-7' },
      ) }),
      executeIsolated: async () => ({
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'OK',
        output: { result: { projectId: 'project-1' }, evidence: { revision: 'revision-7' } },
        evidenceIds: ['ev-project-read'],
      }),
    });
    expect(unchangedLoop.terminal).toMatchObject({
      disposition: 'TOOL_PROTOCOL_FAILURE',
      reasonCodes: ['IDENTICAL_CALL_BUDGET_EXHAUSTED'],
    });
  });

  it('removes nested strict-provider null placeholders only for exact-schema optional fields', async () => {
    const executeIsolated = vi.fn(async () => ({
      authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
      disposition: 'OK' as const,
      output: { receipt: { status: 'PASS' } },
      evidenceIds: ['ev-1'],
    }));
    let turn = 0;
    const responses = [
      openAiToolCall('r1', 'gpt-5.6-luna', 'c1', 'apply_audio_ducking', {
        projectId: 'project-1',
        expectedProjectRevision: 'revision-7',
        audioPlan: {
          enabled: true,
          duckLevel: null,
          rampDownMs: null,
          rampUpMs: null,
          lookAheadMs: null,
        },
        evidenceIds: ['ev-1'],
      }),
      openAiFinish('r2', 'gpt-5.6-luna', 'READY_FOR_PROOF'),
    ];
    const receipt = await runProviderNativeToolEpisodeV2R({
      route: openAiRoute('OPENAI_LUNA', 'gpt-5.6-luna'),
      context: CONTEXT,
      eligibleOperatorIds: ['apply_audio_ducking'],
      invoke: async () => ({ status: 200, body: responses[turn++] }),
      executeIsolated,
    });

    expect(executeIsolated).toHaveBeenCalledWith({
      operatorId: 'apply_audio_ducking',
      arguments: {
        projectId: 'project-1', expectedProjectRevision: 'revision-7',
        audioPlan: { enabled: true }, evidenceIds: ['ev-1'],
      },
      turn: 1,
    });
    expect(receipt.terminal.disposition).toBe('READY_FOR_PROOF');
  });

  it('returns missing evidence to the same conversation and preserves UNVERIFIABLE', async () => {
    let call = 0;
    const receipt = await runProviderNativeToolEpisodeV2R({
      route: openAiRoute('OPENAI_LUNA', 'gpt-5.6-luna'), context: CONTEXT,
      eligibleOperatorIds: ['read_project_file'],
      invoke: async (request) => {
        call += 1;
        if (call === 2) {
          const history = request.body.input as Array<Record<string, unknown>>;
          const result = history.find((item) => item.type === 'function_call_output');
          expect(String(result?.output)).toContain('UNVERIFIABLE');
        }
        return call === 1
          ? { status: 200, body: openAiToolCall('r1', 'gpt-5.6-luna', 'c1', 'read_project_file', {
              projectId: 'project-1', expectedProjectRevision: 'revision-7',
            }) }
          : { status: 200, body: openAiFinish('r2', 'gpt-5.6-luna', 'UNVERIFIABLE') };
      },
      executeIsolated: async () => ({
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION',
        disposition: 'UNVERIFIABLE',
        output: {
          code: 'PROJECT_SNAPSHOT_MISSING',
          message: 'The revision-bound project snapshot is unavailable.',
          details: { missing: ['project snapshot'] },
        },
        evidenceIds: [],
      }),
    });
    expect(receipt.terminal.disposition).toBe('UNVERIFIABLE');
  });

  it('fails closed when a non-OK execution omits its diagnostic contract', async () => {
    const receipt = await runProviderNativeToolEpisodeV2R({
      route: openAiRoute('OPENAI_LUNA', 'gpt-5.6-luna'), context: CONTEXT,
      eligibleOperatorIds: ['read_project_file'],
      invoke: async () => ({ status: 200, body: openAiToolCall(
        'r1', 'gpt-5.6-luna', 'c1', 'read_project_file',
        { projectId: 'project-1', expectedProjectRevision: 'revision-7' },
      ) }),
      executeIsolated: async () => ({
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION',
        disposition: 'FAIL', output: { result: 'FAIL' }, evidenceIds: [],
      }),
    });
    expect(receipt.terminal).toMatchObject({
      disposition: 'TOOL_PROTOCOL_FAILURE', reasonCodes: ['OPERATOR_RESULT_SCHEMA_INVALID'],
    });
  });

  it('returns schema diagnostics to the same conversation and executes only a corrected call', async () => {
    const executeIsolated = vi.fn(async () => ({
      authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
      disposition: 'OK' as const,
      output: { result: { projectId: 'project-1' }, evidence: { revision: 'revision-7' } },
      evidenceIds: ['ev-project-read'],
    }));
    let turn = 0;
    const receipt = await runProviderNativeToolEpisodeV2R({
      route: openAiRoute('OPENAI_TERRA', 'gpt-5.6-terra'),
      context: CONTEXT,
      eligibleOperatorIds: ['read_project_file'],
      executeIsolated,
      invoke: async (request) => {
        turn += 1;
        if (turn === 2) {
          const history = request.body.input as Array<Record<string, unknown>>;
          const diagnostic = history.find((item) => item.type === 'function_call_output');
          expect(String(diagnostic?.output)).toContain('OPERATOR_ARGUMENT_SCHEMA_INVALID');
          expect(String(diagnostic?.output)).toContain('$.arguments.expectedProjectRevision:REQUIRED');
        }
        if (turn === 1) {
          return { status: 200, body: openAiToolCall(
            'r1', 'gpt-5.6-terra', 'invalid-1', 'read_project_file',
            { projectId: 'project-1', madeUp: true },
          ) };
        }
        if (turn === 2) {
          return { status: 200, body: openAiToolCall(
            'r2', 'gpt-5.6-terra', 'corrected-1', 'read_project_file',
            { projectId: 'project-1', expectedProjectRevision: 'revision-7' },
          ) };
        }
        return { status: 200, body: openAiFinish('r3', 'gpt-5.6-terra', 'READY_FOR_PROOF') };
      },
    });

    expect(receipt.terminal.disposition).toBe('READY_FOR_PROOF');
    expect(receipt.selectedOperatorIds).toEqual(['read_project_file']);
    expect(executeIsolated).toHaveBeenCalledTimes(1);
    expect(receipt.turns[0]).toHaveProperty('argumentRepair');
  });

  it('fails closed on parallel calls and exhausted invalid-argument repairs without executing', async () => {
    const executeIsolated = vi.fn();
    const parallel = await runProviderNativeToolEpisodeV2R({
      route: googleRoute(), context: CONTEXT, eligibleOperatorIds: ['read_project_file'], executeIsolated,
      invoke: async () => ({ status: 200, body: {
        id: 'i1', steps: [
          { type: 'function_call', id: 'c1', name: 'read_project_file', arguments: { projectId: 'project-1', expectedProjectRevision: 'revision-7' } },
          { type: 'function_call', id: 'c2', name: 'read_project_file', arguments: { projectId: 'project-1', expectedProjectRevision: 'revision-7' } },
        ],
      } }),
    });
    expect(parallel.terminal).toMatchObject({
      disposition: 'TOOL_PROTOCOL_FAILURE', reasonCodes: ['PARALLEL_TOOL_CALLS_NOT_AUTHORIZED'],
    });

    let invalidTurn = 0;
    const invalid = await runProviderNativeToolEpisodeV2R({
      route: openAiRoute('OPENAI_TERRA', 'gpt-5.6-terra'),
      context: { ...CONTEXT, budget: { ...CONTEXT.budget, maxTurns: 4 } },
      eligibleOperatorIds: ['read_project_file'], executeIsolated,
      invoke: async () => ({ status: 200, body: openAiToolCall(
        `invalid-${invalidTurn}`,
        'gpt-5.6-terra',
        `invalid-call-${invalidTurn++}`,
        'read_project_file', {
        projectId: 'project-1', madeUp: true,
      }) }),
    });
    expect(invalid.terminal).toMatchObject({
      disposition: 'TOOL_PROTOCOL_FAILURE',
      reasonCodes: ['OPERATOR_ARGUMENT_SCHEMA_REPAIR_BUDGET_EXHAUSTED'],
    });
    expect(invalid.turns).toHaveLength(3);
    expect(executeIsolated).not.toHaveBeenCalled();
  });

  it('keeps provider failures distinct and retains the raw 429 body', async () => {
    const rateLimited = await runProviderNativeToolEpisodeV2R({
      route: googleRoute(), context: CONTEXT, eligibleOperatorIds: ['read_project_file'],
      executeIsolated: vi.fn(), invoke: async () => ({ status: 429, body: { error: { code: 429, message: 'quota' } } }),
    });
    expect(rateLimited.terminal.disposition).toBe('PROVIDER_RATE_LIMIT');
    expect(rateLimited.turns[0].rawResponse).toEqual({ error: { code: 429, message: 'quota' } });

    const timedOut = await runProviderNativeToolEpisodeV2R({
      route: openAiRoute('OPENAI_LUNA', 'gpt-5.6-luna'), context: CONTEXT,
      eligibleOperatorIds: ['read_project_file'], executeIsolated: vi.fn(),
      invoke: async () => { throw new ProviderNativeTransportErrorV2R('PROVIDER_TIMEOUT', 'deadline'); },
    });
    expect(timedOut.terminal).toMatchObject({
      disposition: 'PROVIDER_TIMEOUT', reasonCodes: ['PROVIDER_TIMEOUT'], summary: 'deadline',
    });

    const executionFailed = await runProviderNativeToolEpisodeV2R({
      route: openAiRoute('OPENAI_TERRA', 'gpt-5.6-terra'), context: CONTEXT,
      eligibleOperatorIds: ['read_project_file'],
      invoke: async () => ({ status: 200, body: openAiToolCall(
        'r1', 'gpt-5.6-terra', 'c1', 'read_project_file',
        { projectId: 'project-1', expectedProjectRevision: 'revision-7' },
      ) }),
      executeIsolated: async () => { throw new Error('isolated owner failed'); },
    });
    expect(executionFailed.terminal).toMatchObject({
      disposition: 'TOOL_EXECUTION_FAILURE',
      reasonCodes: ['ISOLATED_EXECUTOR_THROWN'],
      summary: 'isolated owner failed',
    });
  });
});

function openAiRoute(
  routeId: 'OPENAI_LUNA' | 'OPENAI_TERRA',
  model: 'gpt-5.6-luna' | 'gpt-5.6-terra',
): ProviderNativeRouteV2R {
  return { routeId, provider: 'openai', model, claimedModelIdentity: model, reasoningMode: 'medium' };
}

function googleRoute(): ProviderNativeRouteV2R {
  return {
    routeId: 'GOOGLE_FLASH', provider: 'google', model: 'gemini-3.7-flash',
    claimedModelIdentity: 'gemini-3.7-flash', reasoningMode: 'medium',
  };
}

function openAiToolCall(
  id: string, model: string, callId: string, name: string, args: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id, model, status: 'completed',
    output: [
      { type: 'reasoning', id: 'reasoning-1', summary: [] },
      { type: 'function_call', call_id: callId, name, arguments: JSON.stringify(args) },
    ],
  };
}

function openAiFinish(id: string, model: string, disposition: string): Record<string, unknown> {
  return openAiToolCall(id, model, `finish-${id}`, 'finish_editron_research_episode', {
    disposition, reasonCodes: [`MODEL_${disposition}`], evidenceIds: [], summary: `Finished as ${disposition}`,
  });
}

function googleFinish(id: string, disposition: string): Record<string, unknown> {
  return {
    id, model: 'gemini-3.7-flash', status: 'completed', steps: [{
      type: 'function_call', id: `finish-${id}`, name: 'finish_editron_research_episode',
      arguments: { disposition, reasonCodes: [`MODEL_${disposition}`], evidenceIds: [], summary: `Finished as ${disposition}` },
    }],
  };
}

function initialContent(
  body: Readonly<Record<string, unknown>> | undefined,
): Array<Record<string, unknown>> {
  if (!body || !Array.isArray(body.input)) throw new Error('TEST_PROVIDER_INPUT_MISSING');
  const first = body.input[0] as Record<string, unknown>;
  if (!Array.isArray(first.content)) throw new Error('TEST_PROVIDER_CONTENT_MISSING');
  return first.content as Array<Record<string, unknown>>;
}
