import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type {
  ProviderNativeOperatorToolV2R,
  ProviderNativeToolSetV2R,
} from './provider-native-tool-catalog-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_RESULT_REFERENCE_V2R_2' as const;
export const PROVIDER_NATIVE_ARGUMENT_REFERENCE_FIELD_V2R =
  'argumentReferences' as const;

export type ProviderNativeArgumentHandoffModeV2R =
  | 'DIRECT_ARGUMENTS'
  | 'OPAQUE_RESULT_REFERENCES';

export interface ProviderNativeIssuedResultReferenceV2R {
  version: typeof PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R;
  resultReferenceId: string;
  originTurn: number;
  sourceOperatorId: string;
  sourceOutputField: string;
  sourceOutputPath: readonly string[];
  valueKind: 'ARRAY' | 'BOOLEAN' | 'NUMBER' | 'OBJECT' | 'STRING';
  valueSha256: string;
}

export interface ProviderNativeResolvedArgumentReferenceV2R {
  targetField: string;
  resultReferenceId: string;
  originTurn: number;
  sourceOperatorId: string;
  sourceOutputField: string;
  sourceOutputPath: readonly string[];
  valueSha256: string;
}

interface StoredResultReferenceV2R {
  receipt: Readonly<ProviderNativeIssuedResultReferenceV2R>;
  value: JsonValue;
}

export interface ProviderNativeResultReferenceProjectionV2R {
  sourceOperatorId: string;
  sourceOutputPath: readonly string[];
}

export class ProviderNativeResultReferenceRegistryV2R {
  private readonly references = new Map<string, Readonly<StoredResultReferenceV2R>>();
  private readonly projections: readonly Readonly<ProviderNativeResultReferenceProjectionV2R>[];

  constructor(
    private readonly episodeId: string,
    projections: readonly Readonly<ProviderNativeResultReferenceProjectionV2R>[] = [],
  ) {
    if (!episodeId.trim()) throw new Error('PROVIDER_NATIVE_RESULT_REFERENCE_EPISODE_INVALID');
    this.projections = validateProjectionPolicy(projections);
  }

  issueFromOutput(input: {
    originTurn: number;
    sourceOperatorId: string;
    output: Readonly<JsonRecord>;
  }): readonly Readonly<ProviderNativeIssuedResultReferenceV2R>[] {
    requirePositiveTurn(input.originTurn);
    if (!input.sourceOperatorId.trim()) {
      throw new Error('PROVIDER_NATIVE_RESULT_REFERENCE_OPERATOR_INVALID');
    }
    const fields = this.projections
      .filter(({ sourceOperatorId }) => sourceOperatorId === input.sourceOperatorId)
      .map(({ sourceOutputPath }) => ({
        sourceOutputPath,
        value: valueAtPath(input.output, sourceOutputPath),
      }))
      .filter((entry): entry is {
        sourceOutputPath: readonly string[];
        value: Exclude<JsonValue, null>;
      } => entry.value !== null && isJsonValue(entry.value))
      .sort((left, right) => compareCodeUnits(
        left.sourceOutputPath.join('.'), right.sourceOutputPath.join('.'),
      ));
    const issued = fields.map(({ sourceOutputPath, value }, index) => {
      const sourceOutputField = sourceOutputPath.join('.');
      const valueSha256 = hashCanonicalJsonV1(value);
      const resultReferenceId = `result_t${input.originTurn}_${index + 1}`;
      const receipt = deepFreezeV1({
        version: PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R,
        resultReferenceId,
        originTurn: input.originTurn,
        sourceOperatorId: input.sourceOperatorId,
        sourceOutputField,
        sourceOutputPath: [...sourceOutputPath],
        valueKind: valueKind(value),
        valueSha256,
      });
      if (this.references.has(resultReferenceId)) {
        throw new Error('PROVIDER_NATIVE_RESULT_REFERENCE_ID_COLLISION');
      }
      this.references.set(resultReferenceId, deepFreezeV1({
        receipt,
        value: cloneJson(value),
      }));
      return receipt;
    });
    return deepFreezeV1(issued);
  }

  resolveArguments(input: {
    arguments: Readonly<JsonRecord>;
    operator: Readonly<ProviderNativeOperatorToolV2R>;
    currentTurn: number;
  }): Readonly<{
    arguments: Readonly<JsonRecord>;
    bindings: readonly Readonly<ProviderNativeResolvedArgumentReferenceV2R>[];
    diagnostics: readonly string[];
  }> {
    requirePositiveTurn(input.currentTurn);
    const rawReferences = input.arguments[PROVIDER_NATIVE_ARGUMENT_REFERENCE_FIELD_V2R];
    if (rawReferences === undefined) {
      return deepFreezeV1({ arguments: { ...input.arguments }, bindings: [], diagnostics: [] });
    }
    const diagnostics: string[] = [];
    if (!Array.isArray(rawReferences) || rawReferences.length < 1 || rawReferences.length > 16) {
      diagnostics.push('$.arguments.argumentReferences must contain 1..16 bindings');
      return deepFreezeV1({ arguments: withoutReferenceField(input.arguments), bindings: [], diagnostics });
    }
    const resolved = withoutReferenceField(input.arguments);
    const properties = record(input.operator.exactInputSchema.properties);
    const bindings: ProviderNativeResolvedArgumentReferenceV2R[] = [];
    const targetedFields = new Set<string>();
    for (const [index, candidate] of rawReferences.entries()) {
      const path = `$.arguments.argumentReferences[${index}]`;
      if (!isRecord(candidate)
        || typeof candidate.targetField !== 'string'
        || typeof candidate.resultReferenceId !== 'string'
        || Object.keys(candidate).some((key) => !['targetField', 'resultReferenceId'].includes(key))) {
        diagnostics.push(`${path} must contain only targetField and resultReferenceId strings`);
        continue;
      }
      const targetField = candidate.targetField;
      if (!(targetField in properties)) {
        diagnostics.push(`${path}.targetField is not an input field of ${input.operator.operatorId}`);
        continue;
      }
      if (targetedFields.has(targetField)) {
        diagnostics.push(`${path}.targetField duplicates ${targetField}`);
        continue;
      }
      targetedFields.add(targetField);
      if (targetField in resolved) {
        diagnostics.push(`${path}.targetField cannot override a directly supplied argument`);
        continue;
      }
      const stored = this.references.get(candidate.resultReferenceId);
      if (!stored) {
        diagnostics.push(`${path}.resultReferenceId is unknown in this episode`);
        continue;
      }
      if (stored.receipt.originTurn >= input.currentTurn) {
        diagnostics.push(`${path}.resultReferenceId does not refer to a prior turn`);
        continue;
      }
      if (hashCanonicalJsonV1(stored.value) !== stored.receipt.valueSha256) {
        diagnostics.push(`${path}.resultReferenceId failed its value hash binding`);
        continue;
      }
      resolved[targetField] = cloneJson(stored.value);
      bindings.push({
        targetField,
        resultReferenceId: stored.receipt.resultReferenceId,
        originTurn: stored.receipt.originTurn,
        sourceOperatorId: stored.receipt.sourceOperatorId,
        sourceOutputField: stored.receipt.sourceOutputField,
        sourceOutputPath: stored.receipt.sourceOutputPath,
        valueSha256: stored.receipt.valueSha256,
      });
    }
    return deepFreezeV1({
      arguments: resolved,
      bindings,
      diagnostics,
    });
  }
}

export function buildProviderNativeResultReferenceProjectionPolicyV2R(
  context: Readonly<JsonRecord>,
): readonly Readonly<ProviderNativeResultReferenceProjectionV2R>[] {
  const authorityAndPolicy = record(context.authorityAndPolicy);
  const dossier = record(authorityAndPolicy.completeCapabilityDossier);
  const supplements = records(dossier.plannerRecordSupplements);
  const projections: ProviderNativeResultReferenceProjectionV2R[] = [];
  for (const supplement of supplements) {
    const inputOrigins = record(supplement.inputOrigins);
    for (const origins of Object.values(inputOrigins)) {
      for (const origin of records(origins)) {
        if (origin.origin !== 'OPERATOR_OUTPUT'
          || typeof origin.operatorId !== 'string'
          || typeof origin.outputField !== 'string') continue;
        projections.push({
          sourceOperatorId: origin.operatorId,
          sourceOutputPath: origin.outputField.split('.'),
        });
      }
    }
  }
  return validateProjectionPolicy(projections);
}

export function buildOpaqueResultReferenceToolSetV2R(
  toolSet: Readonly<ProviderNativeToolSetV2R>,
): Readonly<ProviderNativeToolSetV2R> {
  const operators = toolSet.operators.map((tool) => ({
    ...tool,
    providerInputSchema: providerReferenceInputSchema(tool.providerInputSchema),
    openAiInputSchema: providerReferenceInputSchema(tool.openAiInputSchema),
    openAiStrict: false,
    description: `${tool.description} ArgumentHandoff=Prior tool-result values may be bound with argumentReferences; exact operator validation runs after deterministic resolution.`,
  }));
  const material = {
    version: toolSet.version,
    authority: toolSet.authority,
    catalogIdentity: toolSet.catalogIdentity,
    dossierSha256: toolSet.dossierSha256,
    operatorIds: toolSet.operatorIds,
    operators,
    finishControl: toolSet.finishControl,
  };
  return deepFreezeV1({ ...material, toolSetSha256: hashCanonicalJsonV1(material) });
}

export function appendResultReferencesForModelV2R(
  execution: Readonly<JsonRecord>,
  references: readonly Readonly<ProviderNativeIssuedResultReferenceV2R>[],
): Readonly<JsonRecord> {
  if (!references.length) return execution;
  const output = isRecord(execution.output) && isJsonValue(execution.output)
    ? redactReferencedOutput(execution.output, references)
    : execution.output;
  const publicReferences = references.map((reference) => ({
    version: reference.version,
    resultReferenceId: reference.resultReferenceId,
    originTurn: reference.originTurn,
    sourceOperatorId: reference.sourceOperatorId,
    sourceOutputField: reference.sourceOutputField,
    sourceOutputPath: reference.sourceOutputPath,
    valueKind: reference.valueKind,
  }));
  return deepFreezeV1({ ...execution, output, resultReferences: publicReferences });
}

function providerReferenceInputSchema(schema: Readonly<JsonRecord>): Readonly<JsonRecord> {
  const properties = record(schema.properties);
  if (PROVIDER_NATIVE_ARGUMENT_REFERENCE_FIELD_V2R in properties) {
    throw new Error('PROVIDER_NATIVE_ARGUMENT_REFERENCE_FIELD_COLLISION');
  }
  return deepFreezeV1({
    ...schema,
    properties: {
      ...properties,
      [PROVIDER_NATIVE_ARGUMENT_REFERENCE_FIELD_V2R]: {
        type: 'array',
        minItems: 1,
        maxItems: 16,
        items: {
          type: 'object',
          properties: {
            targetField: { type: 'string', minLength: 1 },
            resultReferenceId: { type: 'string', pattern: '^result_t[1-9][0-9]*_[1-9][0-9]*$' },
          },
          required: ['targetField', 'resultReferenceId'],
          additionalProperties: false,
        },
      },
    },
    required: [],
    additionalProperties: false,
  });
}

function withoutReferenceField(argumentsValue: Readonly<JsonRecord>): JsonRecord {
  return Object.fromEntries(Object.entries(argumentsValue).filter(
    ([field]) => field !== PROVIDER_NATIVE_ARGUMENT_REFERENCE_FIELD_V2R,
  ));
}

const MAX_RESULT_REFERENCE_PROJECTIONS = 64;
const MAX_RESULT_REFERENCE_PATH_DEPTH = 8;
const SAFE_PATH_SEGMENT = /^[A-Za-z][A-Za-z0-9_]*$/;
const DENIED_PATH_SEGMENTS = new Set(['constructor', 'prototype', '__proto__']);

function validateProjectionPolicy(
  projections: readonly Readonly<ProviderNativeResultReferenceProjectionV2R>[],
): readonly Readonly<ProviderNativeResultReferenceProjectionV2R>[] {
  if (projections.length > MAX_RESULT_REFERENCE_PROJECTIONS) {
    throw new Error('PROVIDER_NATIVE_RESULT_REFERENCE_PROJECTION_LIMIT_EXCEEDED');
  }
  const unique = new Map<string, ProviderNativeResultReferenceProjectionV2R>();
  for (const projection of projections) {
    const operatorId = projection.sourceOperatorId.trim();
    const path = [...projection.sourceOutputPath];
    if (!operatorId || path.length < 1 || path.length > MAX_RESULT_REFERENCE_PATH_DEPTH
      || path.some((segment) => !SAFE_PATH_SEGMENT.test(segment)
        || DENIED_PATH_SEGMENTS.has(segment))) {
      throw new Error('PROVIDER_NATIVE_RESULT_REFERENCE_PROJECTION_INVALID');
    }
    const key = `${operatorId}:${path.join('.')}`;
    unique.set(key, { sourceOperatorId: operatorId, sourceOutputPath: path });
  }
  return deepFreezeV1([...unique.values()].sort((left, right) => compareCodeUnits(
    `${left.sourceOperatorId}:${left.sourceOutputPath.join('.')}`,
    `${right.sourceOperatorId}:${right.sourceOutputPath.join('.')}`,
  )));
}

function valueAtPath(value: Readonly<JsonRecord>, path: readonly string[]): unknown {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

function redactReferencedOutput(
  output: Readonly<JsonRecord>,
  references: readonly Readonly<ProviderNativeIssuedResultReferenceV2R>[],
): Readonly<JsonRecord> {
  const redacted = structuredClone(output) as JsonRecord;
  for (const reference of references) {
    let parent: JsonRecord | undefined = redacted;
    const path = reference.sourceOutputPath;
    for (const segment of path.slice(0, -1)) {
      const child: unknown = parent ? parent[segment] : undefined;
      parent = isRecord(child) ? child : undefined;
    }
    if (parent) delete parent[path[path.length - 1]];
  }
  return redacted;
}

type JsonPrimitive = null | boolean | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function cloneJson<T extends JsonValue>(value: T): T {
  return structuredClone(value);
}

function valueKind(value: Exclude<JsonValue, null>): ProviderNativeIssuedResultReferenceV2R['valueKind'] {
  if (Array.isArray(value)) return 'ARRAY';
  if (typeof value === 'object') return 'OBJECT';
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (typeof value === 'number') return 'NUMBER';
  return 'STRING';
}

function requirePositiveTurn(turn: number): void {
  if (!Number.isSafeInteger(turn) || turn < 1) {
    throw new Error('PROVIDER_NATIVE_RESULT_REFERENCE_TURN_INVALID');
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
