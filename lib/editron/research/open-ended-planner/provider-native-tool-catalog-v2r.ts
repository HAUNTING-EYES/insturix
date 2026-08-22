import { buildCap2aPlannerToolSheetV2R } from './cap2a-planner-dossier-v2r';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  V2R_OPERATOR_CATALOG,
  v2rOperatorCatalogIdentity,
} from './operator-catalog-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_TOOL_SET_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_TOOL_SET_V2R_6' as const;
export const PROVIDER_NATIVE_VERSIONED_CATALOG_TOOL_SET_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_VERSIONED_CATALOG_TOOL_SET_V2R_1' as const;
export const PROVIDER_NATIVE_CONTROL_ONLY_TOOL_SET_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_CONTROL_ONLY_TOOL_SET_V2R_2' as const;
export const FINISH_RESEARCH_EPISODE_TOOL_V2R =
  'finish_editron_research_episode' as const;

export interface ProviderNativeOperatorToolV2R {
  operatorId: string;
  kind: string;
  compilerEligibility: string;
  exactInputSchema: Readonly<JsonRecord>;
  exactOutputSchema: Readonly<JsonRecord>;
  optionalInputFields: readonly string[];
  providerInputSchema: Readonly<JsonRecord>;
  openAiInputSchema: Readonly<JsonRecord>;
  openAiStrict: boolean;
  description: string;
  plannerRecord: Readonly<JsonRecord>;
}

export interface ProviderNativeToolSetV2R {
  version:
    | typeof PROVIDER_NATIVE_TOOL_SET_VERSION_V2R
    | typeof PROVIDER_NATIVE_VERSIONED_CATALOG_TOOL_SET_VERSION_V2R
    | typeof PROVIDER_NATIVE_CONTROL_ONLY_TOOL_SET_VERSION_V2R;
  authority:
    | 'V2R_CATALOG_PLUS_CAP2A_DOSSIER'
    | 'VERSIONED_CATALOG_PLUS_CAP2A_DOSSIER'
    | 'RESEARCH_CONTROL_ONLY_NO_EDITING_OPERATORS';
  catalogIdentity: Readonly<JsonRecord>;
  dossierSha256: string;
  operatorIds: readonly string[];
  operators: readonly Readonly<ProviderNativeOperatorToolV2R>[];
  finishControl: Readonly<{
    name: typeof FINISH_RESEARCH_EPISODE_TOOL_V2R;
    role: 'CONTROL_DISPOSITION_NOT_CATALOG_OPERATION';
    inputSchema: Readonly<JsonRecord>;
    providerInputSchema: Readonly<JsonRecord>;
  }>;
  toolSetSha256: string;
}

export function buildProviderNativeToolSetV2R(
  eligibleOperatorIds: readonly string[],
  finishInputSchema: Readonly<JsonRecord> = finishControlSchema(),
): Readonly<ProviderNativeToolSetV2R> {
  return buildProviderNativeToolSetFromSourceV2R({
    eligibleOperatorIds,
    finishInputSchema,
    catalog: V2R_OPERATOR_CATALOG,
    catalogIdentity: v2rOperatorCatalogIdentity(),
    version: PROVIDER_NATIVE_TOOL_SET_VERSION_V2R,
    authority: 'V2R_CATALOG_PLUS_CAP2A_DOSSIER',
  });
}

/**
 * Builds provider tools from an explicitly versioned catalog. The ordinary V2R
 * builder above remains the historical default; corrected benchmark identities
 * must opt into this seam instead of mutating that catalog in place.
 */
export function buildProviderNativeToolSetFromCatalogV2R(input: Readonly<{
  eligibleOperatorIds: readonly string[];
  finishInputSchema?: Readonly<JsonRecord>;
  catalog: Readonly<JsonRecord>;
  catalogIdentity: Readonly<JsonRecord>;
}>): Readonly<ProviderNativeToolSetV2R> {
  return buildProviderNativeToolSetFromSourceV2R({
    ...input,
    finishInputSchema: input.finishInputSchema ?? finishControlSchema(),
    version: PROVIDER_NATIVE_VERSIONED_CATALOG_TOOL_SET_VERSION_V2R,
    authority: 'VERSIONED_CATALOG_PLUS_CAP2A_DOSSIER',
  });
}

function buildProviderNativeToolSetFromSourceV2R(input: Readonly<{
  eligibleOperatorIds: readonly string[];
  finishInputSchema: Readonly<JsonRecord>;
  catalog: Readonly<JsonRecord>;
  catalogIdentity: Readonly<JsonRecord>;
  version: ProviderNativeToolSetV2R['version'];
  authority: ProviderNativeToolSetV2R['authority'];
}>): Readonly<ProviderNativeToolSetV2R> {
  const operatorIds = requireUniqueIds(input.eligibleOperatorIds);
  const catalogOperators = records(input.catalog.operators);
  const byId = new Map(catalogOperators.map((operator) => [text(operator.operatorId), operator]));
  const selected = operatorIds.map((operatorId) => {
    const operator = byId.get(operatorId);
    if (!operator) throw new Error(`PROVIDER_NATIVE_OPERATOR_UNKNOWN:${operatorId}`);
    if (text(operator.compilerEligibility) === 'NOT_COMPILABLE') {
      throw new Error(`PROVIDER_NATIVE_OPERATOR_NOT_RESEARCH_EXECUTABLE:${operatorId}`);
    }
    return operator;
  });
  const dossier = buildCap2aPlannerToolSheetV2R(selected);
  const plannerById = new Map(
    dossier.operators.map((operator) => [text(operator.operatorId), operator]),
  );
  const operators = selected.map((operator) =>
    buildOperatorTool(operator, plannerById, input.catalog));
  assertProviderStrictControlSchema(input.finishInputSchema, '$');
  const finishControl = buildFinishControl(input.finishInputSchema);
  const material = {
    version: input.version,
    authority: input.authority,
    catalogIdentity: input.catalogIdentity,
    dossierSha256: dossier.sheetSha256,
    operatorIds,
    operators,
    finishControl,
  };
  return deepFreezeV1({ ...material, toolSetSha256: hashCanonicalJsonV1(material) });
}

export function buildProviderNativeControlOnlyToolSetV2R(
  finishInputSchema: Readonly<JsonRecord>,
): Readonly<ProviderNativeToolSetV2R> {
  assertProviderStrictControlSchema(finishInputSchema, '$');
  const noOperatorDossier = {
    version: 'EDITRON_PROVIDER_NATIVE_EMPTY_OPERATOR_DOSSIER_V2R_1',
    authority: 'NO_EDITING_OPERATORS_EXPOSED',
    operatorIds: [] as const,
  };
  const material = {
    version: PROVIDER_NATIVE_CONTROL_ONLY_TOOL_SET_VERSION_V2R,
    authority: 'RESEARCH_CONTROL_ONLY_NO_EDITING_OPERATORS' as const,
    catalogIdentity: v2rOperatorCatalogIdentity(),
    dossierSha256: hashCanonicalJsonV1(noOperatorDossier),
    operatorIds: [] as const,
    operators: [] as const,
    finishControl: buildFinishControl(finishInputSchema),
  };
  return deepFreezeV1({ ...material, toolSetSha256: hashCanonicalJsonV1(material) });
}

function buildFinishControl(inputSchema: Readonly<JsonRecord>): ProviderNativeToolSetV2R['finishControl'] {
  return deepFreezeV1({
    name: FINISH_RESEARCH_EPISODE_TOOL_V2R,
    role: 'CONTROL_DISPOSITION_NOT_CATALOG_OPERATION' as const,
    inputSchema,
    providerInputSchema: stripUnsupportedProviderKeywords(inputSchema),
  });
}

function assertProviderStrictControlSchema(schema: Readonly<JsonRecord>, path: string): void {
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.length || schema.anyOf.some((entry) => !isRecord(entry))) {
      throw new Error(`PROVIDER_NATIVE_CONTROL_SCHEMA_ANY_OF_INVALID:${path}`);
    }
    schema.anyOf.forEach((entry, index) => {
      assertProviderStrictControlSchema(entry as Readonly<JsonRecord>, `${path}.anyOf[${index}]`);
    });
    return;
  }
  if (schema.type === 'array') {
    if (!isRecord(schema.items)) {
      throw new Error(`PROVIDER_NATIVE_CONTROL_SCHEMA_ITEMS_INVALID:${path}`);
    }
    assertProviderStrictControlSchema(schema.items, `${path}.items`);
    return;
  }
  if (schema.type !== 'object') return;
  if (schema.additionalProperties !== false || !isRecord(schema.properties)) {
    throw new Error(`PROVIDER_NATIVE_CONTROL_SCHEMA_OBJECT_OPEN:${path}`);
  }
  const propertyNames = Object.keys(schema.properties).sort();
  const required = strings(schema.required).sort();
  if (propertyNames.length !== required.length
    || propertyNames.some((field, index) => field !== required[index])) {
    throw new Error(`PROVIDER_NATIVE_CONTROL_SCHEMA_REQUIRED_MISMATCH:${path}`);
  }
  for (const [field, child] of Object.entries(schema.properties)) {
    if (!isRecord(child)) {
      throw new Error(`PROVIDER_NATIVE_CONTROL_SCHEMA_FIELD_INVALID:${path}.${field}`);
    }
    assertProviderStrictControlSchema(child, `${path}.${field}`);
  }
}

function buildOperatorTool(
  operator: JsonRecord,
  plannerById: ReadonlyMap<string, Readonly<JsonRecord>>,
  catalog: Readonly<JsonRecord>,
): Readonly<ProviderNativeOperatorToolV2R> {
  const operatorId = text(operator.operatorId);
  const input = record(operator.input);
  const fields = strings(input.fields);
  const required = strings(input.required);
  const exactInputSchema = assembleSchema(operatorId, fields, required, 'INPUT', catalog);
  const output = record(operator.output);
  const exactOutputSchema = assembleSchema(
    operatorId,
    strings(output.fields),
    strings(output.required),
    'OUTPUT',
    catalog,
  );
  const providerInputSchema = stripUnsupportedProviderKeywords(exactInputSchema);
  const strictSchema = makeOpenAiStrictSchema(providerInputSchema);
  const plannerRecord = plannerById.get(operatorId);
  if (!plannerRecord) throw new Error(`PROVIDER_NATIVE_DOSSIER_MISSING:${operatorId}`);
  return deepFreezeV1({
    operatorId,
    kind: text(operator.kind),
    compilerEligibility: text(operator.compilerEligibility),
    exactInputSchema,
    exactOutputSchema,
    optionalInputFields: fields.filter((field) => !required.includes(field)),
    providerInputSchema,
    openAiInputSchema: strictSchema ?? providerInputSchema,
    openAiStrict: Boolean(strictSchema),
    description: operatorDescription(operator, plannerRecord),
    plannerRecord,
  });
}

function stripUnsupportedProviderKeywords(schema: Readonly<JsonRecord>): Readonly<JsonRecord> {
  const result: JsonRecord = {};
  for (const [key, value] of Object.entries(schema)) {
    if (GOOGLE_UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) continue;
    if (Array.isArray(value)) {
      result[key] = value.map((entry) => isRecord(entry)
        ? stripUnsupportedProviderKeywords(entry) : entry);
    } else {
      result[key] = isRecord(value) ? stripUnsupportedProviderKeywords(value) : value;
    }
  }
  if ('const' in schema) result.enum = [schema.const];
  if (result.type === undefined) {
    const inferred = inferJsonType(uniformEnumValue(result.enum));
    if (inferred) result.type = inferred;
  }
  return result;
}

const GOOGLE_UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  'const',
  'maxLength',
  'minLength',
  'pattern',
  'uniqueItems',
]);

function uniformEnumValue(value: unknown): unknown {
  if (!Array.isArray(value) || !value.length) return undefined;
  const type = inferJsonType(value[0]);
  return type && value.every((entry) => inferJsonType(entry) === type) ? value[0] : undefined;
}

function inferJsonType(value: unknown): string | undefined {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value && typeof value === 'object') return 'object';
  return ['string', 'number', 'boolean'].includes(typeof value) ? typeof value : undefined;
}

function assembleSchema(
  operatorId: string,
  fields: readonly string[],
  required: readonly string[],
  direction: 'INPUT' | 'OUTPUT',
  catalog: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  const globalSchemas = record(catalog.fieldSchemas);
  const operatorSchemaTable = direction === 'INPUT'
    ? record(catalog.operatorFieldSchemas)
    : record(catalog.operatorOutputFieldSchemas);
  const operatorSchemas = record(operatorSchemaTable[operatorId]);
  const properties = Object.fromEntries(fields.map((field) => {
    const schema = operatorSchemas[field] ?? globalSchemas[field];
    if (!isRecord(schema)) throw new Error(`PROVIDER_NATIVE_FIELD_SCHEMA_MISSING:${operatorId}:${field}`);
    return [field, schema];
  }));
  return deepFreezeV1({ type: 'object', properties, required: [...required], additionalProperties: false });
}

function makeOpenAiStrictSchema(schema: Readonly<JsonRecord>): Readonly<JsonRecord> | null {
  if (Array.isArray(schema.anyOf)) {
    const alternatives = schema.anyOf.map((entry) => isRecord(entry) ? makeOpenAiStrictSchema(entry) : null);
    return alternatives.every((entry): entry is Readonly<JsonRecord> => Boolean(entry))
      ? { ...schema, anyOf: alternatives }
      : null;
  }
  if (schema.type === 'array') {
    if (!isRecord(schema.items)) return null;
    const items = makeOpenAiStrictSchema(schema.items);
    return items ? { ...schema, items } : null;
  }
  if (schema.type !== 'object') return { ...schema };
  if (schema.additionalProperties !== false) return null;
  const properties = record(schema.properties);
  const previouslyRequired = new Set(strings(schema.required));
  const strictProperties: JsonRecord = {};
  for (const [field, value] of Object.entries(properties)) {
    if (!isRecord(value)) return null;
    const child = makeOpenAiStrictSchema(value);
    if (!child) return null;
    strictProperties[field] = previouslyRequired.has(field)
      ? child
      : { anyOf: [child, { type: 'null' }] };
  }
  return {
    ...schema,
    properties: strictProperties,
    required: Object.keys(strictProperties),
    additionalProperties: false,
  };
}

function finishControlSchema(): Readonly<JsonRecord> {
  return buildProviderNativeFinishControlSchemaV2R([
    'READY_FOR_PROOF', 'PASS', 'FAIL', 'UNVERIFIABLE', 'CAPABILITY_GAP', 'CONFLICT',
  ]);
}

export function buildProviderNativeFinishControlSchemaV2R(
  dispositions: readonly string[],
): Readonly<JsonRecord> {
  const unique = dispositions.map((value) => value.trim());
  if (!unique.length || unique.some((value) => !value)
    || new Set(unique).size !== unique.length) {
    throw new Error('PROVIDER_NATIVE_FINISH_DISPOSITIONS_INVALID');
  }
  return deepFreezeV1({
    type: 'object',
    properties: {
      disposition: {
        enum: unique,
      },
      reasonCodes: {
        type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, uniqueItems: true,
      },
      evidenceIds: {
        type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true,
      },
      summary: { type: 'string', minLength: 1, maxLength: 2000 },
    },
    required: ['disposition', 'reasonCodes', 'evidenceIds', 'summary'],
    additionalProperties: false,
  });
}

function operatorDescription(operator: JsonRecord, plannerRecord: Readonly<JsonRecord>): string {
  const proof = strings(operator.proof).join('; ') || 'catalog-declared proof';
  const availability = record(plannerRecord.availability);
  return [
    `Editron ${text(operator.kind)} operation ${text(operator.operatorId)}.`,
    `Support=${text(operator.supportStatus)}; compiler=${text(operator.compilerEligibility)}.`,
    `ProductPlanner=${text(availability.plannerEligibility)}; productCertification=${text(availability.certificationStatus)}.`,
    'ResearchEpisodeAuthorization=CALLABLE_ISOLATED_CLONE_ONLY; this does not authorize real-project mutation.',
    `Proof=${proof}.`,
  ].join(' ');
}

function requireUniqueIds(values: readonly string[]): string[] {
  const ids = values.map((value) => value.trim());
  if (!ids.length || ids.some((value) => !value)) throw new Error('PROVIDER_NATIVE_OPERATOR_SET_EMPTY');
  if (new Set(ids).size !== ids.length) throw new Error('PROVIDER_NATIVE_OPERATOR_SET_DUPLICATE');
  return ids;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
