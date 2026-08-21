import { describe, expect, it } from 'vitest';

import {
  REFERENCE_NATIVE_OBSERVER_SUBMISSION_VERSION_V2R,
  buildReferenceNativeObserverFinishSchemaV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-observation-contract-v2r';
import {
  normalizeProviderNativeTurnV2R,
  serializeProviderNativeTurnV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  buildProviderNativeControlOnlyToolSetV2R,
  buildProviderNativeToolSetV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-catalog-v2r';

describe('provider-native provider schema projection V2R', () => {
  it('retains local uniqueness validation while stripping unsupported provider keywords', () => {
    const tools = buildProviderNativeToolSetV2R(['find_transcript_moment']);
    const exact = JSON.stringify(tools.operators[0].exactInputSchema);
    const provider = JSON.stringify(tools.operators[0].providerInputSchema);
    const openAi = JSON.stringify(tools.operators[0].openAiInputSchema);
    expect(exact).toContain('uniqueItems');
    expect(provider).not.toContain('uniqueItems');
    expect(openAi).not.toContain('uniqueItems');
    expect(JSON.stringify(tools.finishControl.inputSchema)).toContain('uniqueItems');
    expect(JSON.stringify(tools.finishControl.providerInputSchema)).not.toContain('uniqueItems');
    expect(missingTypes(tools.operators[0].providerInputSchema)).toEqual([]);
    expect(missingTypes(tools.finishControl.providerInputSchema)).toEqual([]);
  });

  it('projects the real native-video observer schema into Google-supported constraints', () => {
    const tools = buildProviderNativeControlOnlyToolSetV2R(
      buildReferenceNativeObserverFinishSchemaV2R(),
    );
    const exact = JSON.stringify(tools.finishControl.inputSchema);
    const provider = JSON.stringify(tools.finishControl.providerInputSchema);
    for (const keyword of ['const', 'maxLength', 'minLength', 'pattern', 'uniqueItems']) {
      expect(exact).toContain(`"${keyword}"`);
      expect(provider).not.toContain(`"${keyword}"`);
    }
    const properties = (tools.finishControl.providerInputSchema.properties ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    expect(properties.submissionVersion).toEqual({
      enum: [REFERENCE_NATIVE_OBSERVER_SUBMISSION_VERSION_V2R],
      type: 'string',
    });
    expect(missingTypes(tools.finishControl.providerInputSchema)).toEqual([]);
  });

  it('uses validated Gemini calls only for a control-only terminal contract', () => {
    const route = {
      routeId: 'GOOGLE_FLASH' as const,
      provider: 'google' as const,
      model: 'gemini-3.7-flash' as const,
      claimedModelIdentity: 'gemini-3.7-flash',
      reasoningMode: 'medium' as const,
    };
    const controlRequest = serializeProviderNativeTurnV2R({
      route,
      toolSet: buildProviderNativeControlOnlyToolSetV2R(
        buildReferenceNativeObserverFinishSchemaV2R(),
      ),
      history: [{ type: 'user_input', content: [{ type: 'text', text: 'Observe.' }] }],
      maxOutputTokens: 4096,
    });
    const operatorRequest = serializeProviderNativeTurnV2R({
      route,
      toolSet: buildProviderNativeToolSetV2R(['read_project_file']),
      history: [{ type: 'user_input', content: [{ type: 'text', text: 'Read.' }] }],
      maxOutputTokens: 4096,
    });
    expect(controlRequest.body.generation_config).toMatchObject({ tool_choice: 'validated' });
    expect(operatorRequest.body.generation_config).toMatchObject({ tool_choice: 'auto' });
  });

  it('normalizes text from Gemini Interactions model_output content', () => {
    const normalized = normalizeProviderNativeTurnV2R('google', {
      id: 'interaction-text-1',
      model: 'gemini-3.7-flash',
      status: 'completed',
      steps: [{
        type: 'model_output',
        content: [
          { type: 'text', text: 'First.' },
          { type: 'output_text', text: ' Second.' },
        ],
      }],
    });
    expect(normalized.text).toBe('First. Second.');
    expect(normalized.toolCalls).toEqual([]);
    expect(normalized.continuationItems).toHaveLength(1);
  });

  it('preserves audio-field units and owner-default guidance in provider schemas', () => {
    const tools = buildProviderNativeToolSetV2R(['apply_audio_ducking']);
    const exact = JSON.stringify(tools.operators[0].exactInputSchema);
    const provider = JSON.stringify(tools.operators[0].providerInputSchema);
    const openAi = JSON.stringify(tools.operators[0].openAiInputSchema);
    for (const schema of [exact, provider, openAi]) {
      expect(schema).toContain('Absolute linear BGM output gain');
      expect(schema).toContain('not a percentage');
      expect(schema).toContain('owner default');
    }
  });

  it('exposes the transcript resolver phrase contract without compiler-owned constraints', () => {
    const tools = buildProviderNativeToolSetV2R(['resolve_transcript_edit']);
    const operator = tools.operators[0];
    expect(operator.optionalInputFields).toEqual([]);
    for (const schema of [
      operator.exactInputSchema,
      operator.providerInputSchema,
      operator.openAiInputSchema,
    ]) {
      const encoded = JSON.stringify(schema);
      expect(encoded).toContain('Exact spoken transcript phrase');
      expect(encoded).toContain('not the editing instruction');
      expect(encoded).not.toContain('constraints');
    }
  });
});

function missingTypes(value: unknown, path = '$'): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => missingTypes(entry, `${path}[${index}]`));
  const record = value as Record<string, unknown>;
  const current = ('const' in record || 'enum' in record) && !('type' in record) ? [path] : [];
  return [...current, ...Object.entries(record).flatMap(([key, child]) => missingTypes(child, `${path}.${key}`))];
}
