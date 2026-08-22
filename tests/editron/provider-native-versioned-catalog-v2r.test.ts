import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { V2R_OPERATOR_CATALOG } from '@/lib/editron/research/open-ended-planner/operator-catalog-v2r';
import {
  buildProviderNativeToolSetFromCatalogV2R,
  buildProviderNativeToolSetV2R,
  type ProviderNativeToolSetV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-catalog-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';

type JsonRecord = Record<string, unknown>;

const CORRECTED_ACTION = 'replace_with_matching_source_range';
const FROZEN_V2_RESOLVE_VISUAL_TOOL_SET_SHA256 =
  '07f7698c898edba5543a67c9e8e4f99b860a4fdbf434f76c367988bb95a65b72';

const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'versioned-catalog-episode-1',
  objective: 'Resolve one visual edit against a research clone.',
  activeTarget: { targetClaimId: 'claim-visual-1' },
  revisionBinding: { projectId: 'project-1', expectedProjectRevision: 'revision-7' },
  projectState: { projectId: 'project-1', expectedProjectRevision: 'revision-7' },
  evidence: [{ evidenceId: 'ev-visual-1' }],
  preservationRules: ['Do not mutate a user project.'],
  authorityAndPolicy: { mutation: 'RESEARCH_CLONE_ONLY' },
  budget: { maxTurns: 1, maxOutputTokensPerTurn: 512, maxIdenticalCalls: 1 },
};

describe('provider-native versioned catalog injection', () => {
  it('keeps the historical V2 builder identity frozen and opts into corrected schemas', () => {
    const historical = buildProviderNativeToolSetV2R(['resolve_visual_edit']);
    const corrected = buildCorrectedToolSet(['resolve_visual_edit']);

    expect(historical.toolSetSha256).toBe(FROZEN_V2_RESOLVE_VISUAL_TOOL_SET_SHA256);
    expect(actionEnum(historical)).not.toContain(CORRECTED_ACTION);
    expect(corrected.authority).toBe('VERSIONED_CATALOG_PLUS_CAP2A_DOSSIER');
    expect(corrected.toolSetSha256).not.toBe(historical.toolSetSha256);
    expect(actionEnum(corrected)).toContain(CORRECTED_ACTION);
  });

  it('serializes the explicitly injected catalog into the provider request', async () => {
    const requests: JsonRecord[] = [];
    const invoke = vi.fn(async (request: Readonly<{ body: JsonRecord }>) => {
      requests.push(request.body);
      return {
        status: 200,
        body: openAiFinish('response-1', 'gpt-5.6-luna', 'READY_FOR_PROOF'),
      };
    });
    const executeIsolated = vi.fn();

    const receipt = await runProviderNativeToolEpisodeV2R({
      route: {
        routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
        claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
      },
      context: CONTEXT,
      eligibleOperatorIds: ['resolve_visual_edit'],
      toolSetFactory: ({ eligibleOperatorIds, finishInputSchema }) => (
        buildCorrectedToolSet(eligibleOperatorIds, finishInputSchema)
      ),
      invoke,
      executeIsolated,
    });

    expect(receipt.terminal.disposition).toBe('READY_FOR_PROOF');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(executeIsolated).not.toHaveBeenCalled();
    expect(JSON.stringify(requests[0])).toContain(CORRECTED_ACTION);
  });

  it('rejects forged or mismatched injected authority before inference', async () => {
    const invoke = vi.fn();
    const executeIsolated = vi.fn();
    const corrected = buildCorrectedToolSet(['resolve_visual_edit']);
    const base = {
      route: {
        routeId: 'OPENAI_LUNA' as const, provider: 'openai' as const,
        model: 'gpt-5.6-luna' as const, claimedModelIdentity: 'gpt-5.6-luna',
        reasoningMode: 'medium' as const,
      },
      context: CONTEXT,
      eligibleOperatorIds: ['resolve_visual_edit'] as const,
      invoke,
      executeIsolated,
    };

    await expect(runProviderNativeToolEpisodeV2R({
      ...base,
      toolSetFactory: () => ({ ...corrected, toolSetSha256: '0'.repeat(64) }),
    })).rejects.toThrow('PROVIDER_NATIVE_TOOL_SET_HASH_MISMATCH');

    await expect(runProviderNativeToolEpisodeV2R({
      ...base,
      toolSetFactory: () => buildCorrectedToolSet(['read_project_file']),
    })).rejects.toThrow('PROVIDER_NATIVE_TOOL_SET_OPERATOR_IDS_MISMATCH');

    await expect(runProviderNativeToolEpisodeV2R({
      ...base,
      finishInputSchema: closedObject(['disposition'], {
        disposition: { enum: ['READY_FOR_PROOF'] },
      }),
      toolSetFactory: () => corrected,
    })).rejects.toThrow('PROVIDER_NATIVE_TOOL_SET_FINISH_SCHEMA_MISMATCH');

    expect(invoke).not.toHaveBeenCalled();
    expect(executeIsolated).not.toHaveBeenCalled();
  });
});

function buildCorrectedToolSet(
  eligibleOperatorIds: readonly string[],
  finishInputSchema?: Readonly<JsonRecord>,
): Readonly<ProviderNativeToolSetV2R> {
  const catalog = correctedCatalog();
  return buildProviderNativeToolSetFromCatalogV2R({
    eligibleOperatorIds,
    finishInputSchema,
    catalog,
    catalogIdentity: {
      version: 'EDITRON_TEST_CORRECTED_OPERATOR_CATALOG_V3R_1',
      catalogSha256: hashCanonicalJsonV1(catalog),
    },
  });
}

function correctedCatalog(): JsonRecord {
  const catalog = JSON.parse(JSON.stringify(V2R_OPERATOR_CATALOG)) as JsonRecord;
  const operatorFieldSchemas = record(catalog.operatorFieldSchemas);
  const visualSchemas = record(operatorFieldSchemas.resolve_visual_edit);
  const intent = record(visualSchemas.intent);
  const properties = record(intent.properties);
  const action = record(properties.action);
  action.enum = [...strings(action.enum), CORRECTED_ACTION];
  return catalog;
}

function actionEnum(toolSet: Readonly<ProviderNativeToolSetV2R>): readonly string[] {
  const input = toolSet.operators[0]?.exactInputSchema;
  const intent = record(record(input?.properties).intent);
  return strings(record(record(intent.properties).action).enum);
}

function closedObject(required: readonly string[], properties: JsonRecord): JsonRecord {
  return { type: 'object', required: [...required], properties, additionalProperties: false };
}

function openAiFinish(id: string, model: string, disposition: string): JsonRecord {
  return {
    id, model, status: 'completed',
    output: [{
      type: 'function_call', call_id: `finish-${id}`,
      name: 'finish_editron_research_episode',
      arguments: JSON.stringify({
        disposition,
        reasonCodes: [`MODEL_${disposition}`],
        evidenceIds: [],
        summary: `Finished as ${disposition}`,
      }),
    }],
  };
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}
