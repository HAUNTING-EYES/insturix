import * as ts from 'typescript';

import { findDangerousFreeformTsx } from '@/lib/editron/freeform-glm/ollama-client';
import { parseFreeformTsx } from '@/lib/editron/freeform-trace/instrument';

import { deepFreezeV1, hashCanonicalJsonV1, sha256TextV1 } from './contracts-v1';
import {
  GENERATED_COMPOSITION_API_ID_V1,
  GENERATED_COMPOSITION_PROGRAM_VERSION_V1,
  GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1,
  hashGeneratedCompositionSourceBundleV1,
  type GeneratedCompositionContractVerificationV1,
  type GeneratedCompositionProgramV1,
  type GeneratedCompositionSourceBundleV1,
} from './generated-composition-program-v1';

type JsonRecord = Record<string, unknown>;
export type GeneratedCompositionVisualSourceKindV1 = 'VIDEO' | 'STILL_IMAGE';

interface SourceReferencesV1 {
  sourceSlots: Set<string>;
  textSlots: Set<string>;
  fontSlots: Set<string>;
  parameters: Set<string>;
  sourcePanelLayers: Set<string>;
  textLayers: Set<string>;
}

export interface VerifyGeneratedCompositionProgramInputV1 {
  program: unknown;
  sourceBundle: unknown;
  evidencePack: unknown;
  referenceBlueprint: unknown;
  supplementalFacts?: unknown;
}

const REQUIRED_MODULES = new Map([
  ['react', '19.1.2'],
  ['remotion', '4.0.509'],
  [GENERATED_COMPOSITION_API_ID_V1, '1'],
]);
const RESOURCE_LIMITS = {
  maxSourceFiles: 1, maxSourceBytes: 256 * 1024, maxInputBytes: 64 * 1024 * 1024,
  maxOutputBytes: 1024 * 1024 * 1024, maxFrames: 900, maxCpuMs: 120_000,
  maxWallTimeMs: 180_000, maxMemoryMiB: 2_048,
} as const;

export function verifyGeneratedCompositionProgramV1(
  input: VerifyGeneratedCompositionProgramInputV1,
): Readonly<GeneratedCompositionContractVerificationV1> {
  if (!isRecord(input.program) || !isRecord(input.sourceBundle) || !isRecord(input.evidencePack) || !isRecord(input.referenceBlueprint)) {
    return result('UNVERIFIABLE', null, null, ['CONTRACT_INPUT_MISSING']);
  }
  const program = input.program as unknown as GeneratedCompositionProgramV1;
  const bundle = input.sourceBundle as unknown as GeneratedCompositionSourceBundleV1;
  const diagnostics: string[] = [];
  let programHash: string | null = null;
  let sourceBundleHash: string | null = null;
  try {
    programHash = hashCanonicalJsonV1(program);
    sourceBundleHash = hashGeneratedCompositionSourceBundleV1(bundle);
    validateIdentity(program, bundle, input.evidencePack, input.referenceBlueprint, diagnostics);
    const facts = [...records(record(input.evidencePack).facts), ...records(input.supplementalFacts)];
    validateProjectAndCanvas(program, facts, diagnostics);
    validateSources(program, facts, diagnostics);
    validateFontsAndApi(program, facts, diagnostics);
    validateSecurityAndResources(program, bundle, diagnostics);
    validateProofAndMeasurements(program, input.evidencePack, input.referenceBlueprint, diagnostics);
    validateSourceBundle(program, bundle, diagnostics);
  } catch {
    diagnostics.push('CONTRACT_VALIDATION_EXCEPTION');
  }
  return result(diagnostics.length ? 'CONTRACT_FAIL' : 'CONTRACT_PASS', programHash, sourceBundleHash, diagnostics);
}

function validateIdentity(program: GeneratedCompositionProgramV1, bundle: GeneratedCompositionSourceBundleV1, evidence: unknown, blueprint: unknown, diagnostics: string[]): void {
  if (program.artifactType !== 'GeneratedCompositionProgramV1' || program.contractVersion !== GENERATED_COMPOSITION_PROGRAM_VERSION_V1
    || program.authority !== 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION') diagnostics.push('IDENTITY_CONTRACT_DRIFT');
  if (bundle.bundleVersion !== GENERATED_COMPOSITION_SOURCE_BUNDLE_VERSION_V1) diagnostics.push('SOURCE_BUNDLE_VERSION_DRIFT');
  if (program.taskId !== text(record(evidence).taskId) || program.taskId !== text(record(blueprint).taskId)) diagnostics.push('IDENTITY_TASK_DRIFT');
  if (program.projectBinding.evidencePackHash !== hashCanonicalJsonV1(evidence)) diagnostics.push('IDENTITY_EVIDENCE_PACK_HASH_DRIFT');
  if (program.referenceBinding.blueprintHash !== hashCanonicalJsonV1(blueprint)) diagnostics.push('IDENTITY_BLUEPRINT_HASH_DRIFT');
  if (program.sourceBundleHash !== hashGeneratedCompositionSourceBundleV1(bundle)) diagnostics.push('IDENTITY_SOURCE_BUNDLE_HASH_DRIFT');
}

function validateProjectAndCanvas(program: GeneratedCompositionProgramV1, facts: JsonRecord[], diagnostics: string[]): void {
  const revision = fact(facts, 'PROJECT_REVISION');
  const projectRate = fact(facts, 'PROJECT_TIMEBASE');
  const canvas = fact(facts, 'CANVAS');
  const target = fact(facts, 'AUTHORIZED_TARGET_RANGE');
  if (program.projectBinding.projectId !== revision.projectId || program.projectBinding.expectedProjectRevision !== revision.expectedProjectRevision) diagnostics.push('PROJECT_REVISION_DRIFT');
  if (!sameRate(program.projectTimebase.rate, record(projectRate.rate)) || program.projectTimebase.timebaseId !== projectRate.timebaseId) diagnostics.push('PROJECT_TIMEBASE_DRIFT');
  if (!sameRate(program.compositionTimebase.rate, program.projectTimebase.rate)) diagnostics.push('COMPOSITION_RATE_CONVERSION_UNDECLARED');
  if (program.canvas.width !== integer(canvas.width) || program.canvas.height !== integer(canvas.height)
    || !sameRate(program.canvas.pixelAspectRatio, record(canvas.pixelAspectRatio))) diagnostics.push('CANVAS_DRIFT');
  const duration = program.duration;
  if (!integerText(duration.compositionStartTick, 0) || !integerText(duration.compositionEndExclusiveTick, 1)
    || duration.projectStartTick !== text(target.start) || duration.projectEndExclusiveTick !== text(target.endExclusive)) diagnostics.push('DURATION_OR_TARGET_RANGE_DRIFT');
  if (duration.handlePolicy === 'LOCKED_BOUNDARY_NO_TRIM' && (duration.headHandleTicks !== '0' || duration.tailHandleTicks !== '0')) diagnostics.push('HANDLE_POLICY_DRIFT');
}

function validateSources(program: GeneratedCompositionProgramV1, facts: JsonRecord[], diagnostics: string[]): void {
  const rights = fact(facts, 'RIGHTS_POLICY');
  const allowed = new Set(strings(rights.allowedAssetIds));
  const windowFact = fact(facts, 'ALLOWED_SOURCE_WINDOWS');
  const slots = program.sourceSlots ?? [];
  if (!uniqueIds(slots.map(({ slotId }) => slotId))) diagnostics.push('SOURCE_SLOT_ID_DUPLICATE');
  for (const slot of slots) {
    const identity = facts.find((entry) => entry.kind === 'SOURCE_MEDIA_IDENTITY' && entry.assetId === slot.assetId);
    if (!identity || !allowed.has(slot.assetId) || slot.assetVersion !== identity.assetVersion) diagnostics.push(`SOURCE_IDENTITY_OR_RIGHTS_DRIFT:${slot.slotId}`);
    if (identity && (!sameRate(slot.timebase.rate, record(record(identity.timebase).rate)) || slot.timebase.timebaseId !== record(identity.timebase).timebaseId)) diagnostics.push(`SOURCE_TIMEBASE_DRIFT:${slot.slotId}`);
    const start = integer(slot.sourceRange.start); const end = integer(slot.sourceRange.endExclusive);
    const mediaKind = resolveGeneratedCompositionVisualSourceKindV1(identity, slot.sourceRange);
    if (!mediaKind) diagnostics.push(`SOURCE_MEDIA_KIND_UNSUPPORTED:${slot.slotId}`);
    if (mediaKind === 'STILL_IMAGE' && (start !== 0 || end !== 1)) diagnostics.push(`STILL_IMAGE_SOURCE_RANGE_INVALID:${slot.slotId}`);
    const windows = records(windowFact.windows).find((entry) => entry.assetId === slot.assetId);
    const legal = records(windows?.ranges).some((range) => start >= integer(range.start) && end <= integer(range.endExclusive) && end > start);
    if (!legal) diagnostics.push(`SOURCE_RANGE_UNAUTHORISED:${slot.slotId}`);
  }
}

/**
 * SOURCE_MEDIA_IDENTITY owns media kind; programs bind only its asset/version.
 * Legacy generated-composition evidence predates mediaKind and can only mean
 * video because V1 previously exposed a muted-video source owner. A one-frame
 * source never receives that compatibility inference and must declare
 * STILL_IMAGE.
 */
export function resolveGeneratedCompositionVisualSourceKindV1(
  value: unknown,
  sourceRange?: { start?: unknown; endExclusive?: unknown },
): GeneratedCompositionVisualSourceKindV1 | null {
  const identity = record(value);
  const mediaKind = text(identity.mediaKind);
  if (mediaKind === 'STILL_IMAGE') return 'STILL_IMAGE';
  if (mediaKind === 'VIDEO' || mediaKind.startsWith('VIDEO_')) return 'VIDEO';
  if (mediaKind) return null;
  const extent = record(identity.extent);
  const start = integer(extent.start ?? sourceRange?.start);
  const end = integer(extent.endExclusive ?? sourceRange?.endExclusive);
  return Number.isSafeInteger(start)
    && Number.isSafeInteger(end)
    && end - start > 1
    ? 'VIDEO'
    : null;
}

function validateFontsAndApi(program: GeneratedCompositionProgramV1, facts: JsonRecord[], diagnostics: string[]): void {
  const fontIds = new Set(program.fontSlots.map(({ slotId }) => slotId));
  const sourceIds = new Set(program.sourceSlots.map(({ slotId }) => slotId));
  const textIds = new Set(program.textSlots.map(({ slotId }) => slotId));
  const parameterIds = new Set(program.exposedParameters.map(({ parameterId }) => parameterId));
  for (const slot of program.textSlots) {
    if (!fontIds.has(slot.fontSlotId)) diagnostics.push(`TEXT_FONT_SLOT_UNKNOWN:${slot.slotId}`);
    if (!parameterIds.has(slot.parameterId)) diagnostics.push(`TEXT_PARAMETER_UNKNOWN:${slot.slotId}`);
  }
  for (const font of program.fontSlots) {
    const identity = facts.find((entry) => entry.kind === 'FONT_IDENTITY' && entry.fontAssetId === font.fontAssetId);
    if (!identity || !['INTERNAL_OWNED_FIXTURE', 'BUNDLED_DEPENDENCY_LICENSED_FIXTURE'].includes(text(identity.rightsStatus)) || identity.fontAssetVersion !== font.fontAssetVersion
      || identity.fileSha256 !== font.fileSha256 || identity.licenseId !== font.licenseId
      || declaredValueDrifts(identity, 'family', font.family)
      || declaredValueDrifts(identity, 'face', font.face)
      || declaredValueDrifts(identity, 'weight', font.weight)) diagnostics.push(`FONT_IDENTITY_OR_RIGHTS_DRIFT:${font.slotId}`);
  }
  if (!uniqueIds(program.declaredLayers.map(({ layerId }) => layerId)) || !uniqueNumbers(program.declaredLayers.map(({ zIndex }) => zIndex))) diagnostics.push('DECLARED_LAYER_ID_OR_ORDER_INVALID');
  for (const layer of program.declaredLayers) {
    if (layer.kind === 'SOURCE_PANEL' && (!layer.sourceSlotId || !sourceIds.has(layer.sourceSlotId))) diagnostics.push(`DECLARED_LAYER_SOURCE_UNKNOWN:${layer.layerId}`);
    if (layer.kind === 'TEXT' && (!layer.textSlotId || !textIds.has(layer.textSlotId))) diagnostics.push(`DECLARED_LAYER_TEXT_UNKNOWN:${layer.layerId}`);
    if (layer.kind === 'TEXT' && layer.layerId !== layer.textSlotId) diagnostics.push(`DECLARED_LAYER_TEXT_BINDING_INVALID:${layer.layerId}`);
  }
  const modules = new Map(program.allowedApi.modules.map(({ specifier, version }) => [specifier, version]));
  if (program.allowedApi.apiId !== GENERATED_COMPOSITION_API_ID_V1 || program.allowedApi.apiVersion !== '1'
    || modules.size !== REQUIRED_MODULES.size || [...REQUIRED_MODULES].some(([id, version]) => modules.get(id) !== version)) diagnostics.push('ALLOWED_API_MODULE_SET_DRIFT');
  const apiFact = facts.find((entry) => entry.kind === 'GENERATED_COMPOSITION_API_IDENTITY');
  if (!apiFact || apiFact.apiId !== program.allowedApi.apiId || apiFact.apiVersion !== program.allowedApi.apiVersion
    || apiFact.supportStatus !== 'RESEARCH_CONTRACT_ONLY_NOT_IMPLEMENTED') diagnostics.push('ALLOWED_API_IDENTITY_UNBOUND');
}

function validateSecurityAndResources(program: GeneratedCompositionProgramV1, bundle: GeneratedCompositionSourceBundleV1, diagnostics: string[]): void {
  const policy = program.securityPolicy;
  if (policy.network !== 'DENY' || policy.secrets !== 'DENY' || policy.database !== 'DENY' || policy.projectMutation !== 'DENY'
    || policy.filesystem !== 'WORKSPACE_MATERIALIZED_INPUTS_ONLY' || program.stateEffects.length !== 0) diagnostics.push('SECURITY_OR_STATE_EFFECT_POLICY_DRIFT');
  const budget = program.resourceBudget;
  for (const [key, ceiling] of Object.entries(RESOURCE_LIMITS)) {
    const value = budget[key as keyof typeof budget];
    if (!Number.isSafeInteger(value) || value <= 0 || value > ceiling) diagnostics.push(`RESOURCE_BUDGET_INVALID:${key}`);
  }
  const sourceBytes = bundle.files.reduce((total, file) => total + Buffer.byteLength(file.source, 'utf8'), 0);
  const durationFrames = integer(program.duration.compositionEndExclusiveTick) - integer(program.duration.compositionStartTick);
  if (bundle.files.length > budget.maxSourceFiles || sourceBytes > budget.maxSourceBytes || durationFrames > budget.maxFrames) diagnostics.push('RESOURCE_BUDGET_EXCEEDED');
  if (program.output.representation !== 'EDITABLE_PROGRAM_AND_PROXY' || program.output.flatteningDisposition !== 'EXPLICIT_HANDOFF_ONLY'
    || program.output.audioDisposition !== 'CUE_HANDOFF_ONLY') diagnostics.push('OUTPUT_EDITABILITY_DRIFT');
}

function validateProofAndMeasurements(program: GeneratedCompositionProgramV1, evidence: unknown, blueprint: unknown, diagnostics: string[]): void {
  const proofIds = records(record(evidence).proofRequirements).map((entry) => text(entry.proofObligationId));
  if (!sameSet([...program.proofObligationIds], proofIds)) diagnostics.push('PROOF_OBLIGATION_SET_DRIFT');
  const claimIds = new Set(records(record(blueprint).targetClaims).map((entry) => text(entry.claimId)));
  if (!program.expectedMeasurementRefs.length || program.expectedMeasurementRefs.some((id) => !claimIds.has(id))) diagnostics.push('MEASUREMENT_REFERENCE_UNBOUND');
}

function validateSourceBundle(program: GeneratedCompositionProgramV1, bundle: GeneratedCompositionSourceBundleV1, diagnostics: string[]): void {
  if (!uniqueIds(bundle.files.map(({ path }) => path)) || !bundle.files.some(({ path }) => path === bundle.entryFile)) diagnostics.push('SOURCE_FILE_IDENTITY_INVALID');
  const allowedModules = new Set(program.allowedApi.modules.map(({ specifier }) => specifier));
  const used: SourceReferencesV1 = {
    sourceSlots: new Set<string>(),
    textSlots: new Set<string>(),
    fontSlots: new Set<string>(),
    parameters: new Set<string>(),
    sourcePanelLayers: new Set<string>(),
    textLayers: new Set<string>(),
  };
  for (const file of bundle.files) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(ts|tsx)$/.test(file.path) || sha256TextV1(file.source) !== file.sha256) diagnostics.push(`SOURCE_FILE_HASH_OR_PATH_INVALID:${file.path}`);
    if (/https?:\/\/|file:\/\/|[A-Za-z]:\\/.test(file.source)) diagnostics.push(`SOURCE_EXTERNAL_LOCATION_FORBIDDEN:${file.path}`);
    for (const danger of findDangerousFreeformTsx(file.source)) diagnostics.push(`SOURCE_${danger.code.toUpperCase()}:${file.path}`);
    if (/\bMath\.random\b|\bDate\.now\b|\bnew\s+Date\b|\bset(?:Timeout|Interval)\s*\(/.test(file.source)) diagnostics.push(`SOURCE_NONDETERMINISTIC:${file.path}`);
    let sourceFile: ts.SourceFile;
    try { sourceFile = parseFreeformTsx(file.source, file.path); } catch { diagnostics.push(`SOURCE_PARSE_FAILED:${file.path}`); continue; }
    if (!hasGeneratedCompositionExport(sourceFile)) diagnostics.push(`SOURCE_EXPORT_MISSING:${file.path}`);
    inspectAst(sourceFile, allowedModules, used, diagnostics, file.path);
  }
  compareReferences('SOURCE_SLOT', used.sourceSlots, new Set(program.sourceSlots.map(({ slotId }) => slotId)), diagnostics);
  compareReferences('TEXT_SLOT', used.textSlots, new Set(program.textSlots.map(({ slotId }) => slotId)), diagnostics);
  compareReferences('FONT_SLOT', used.fontSlots, new Set(program.fontSlots.map(({ slotId }) => slotId)), diagnostics);
  compareReferences('PARAMETER', used.parameters, new Set(program.exposedParameters.map(({ parameterId }) => parameterId)), diagnostics);
  compareReferences('SOURCE_PANEL_LAYER', used.sourcePanelLayers, new Set(program.declaredLayers
    .filter(({ kind }) => kind === 'SOURCE_PANEL').map(({ layerId }) => layerId)), diagnostics);
  compareReferences('TEXT_LAYER', used.textLayers, new Set(program.declaredLayers
    .filter(({ kind }) => kind === 'TEXT').map(({ layerId }) => layerId)), diagnostics);
}

function inspectAst(sourceFile: ts.SourceFile, allowed: Set<string>, used: SourceReferencesV1, diagnostics: string[], path: string): void {
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !allowed.has(node.moduleSpecifier.text)) diagnostics.push(`SOURCE_IMPORT_FORBIDDEN:${path}/${node.moduleSpecifier.text}`);
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !allowed.has(node.moduleSpecifier.text)) diagnostics.push(`SOURCE_EXPORT_MODULE_FORBIDDEN:${path}/${node.moduleSpecifier.text}`);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) diagnostics.push(`SOURCE_DYNAMIC_IMPORT_FORBIDDEN:${path}`);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useCompositionParameter') {
      const value = node.arguments[0]; if (value && ts.isStringLiteral(value)) used.parameters.add(value.text); else diagnostics.push(`SOURCE_PARAMETER_ID_NOT_LITERAL:${path}`);
    }
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const name = node.tagName.getText(sourceFile);
      if (name === 'AssetSlot') addJsxLiteral(node, 'slotId', used.sourceSlots, diagnostics, path);
      if (name === 'Panel') addJsxLiteral(node, 'layerId', used.sourcePanelLayers, diagnostics, path);
      if (name === 'TextSlot') {
        addJsxLiteral(node, 'slotId', used.textSlots, diagnostics, path);
        addJsxLiteral(node, 'slotId', used.textLayers, diagnostics, path);
        addJsxLiteral(node, 'fontSlotId', used.fontSlots, diagnostics, path);
        addJsxLiteral(node, 'parameterId', used.parameters, diagnostics, path);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function addJsxLiteral(node: ts.JsxSelfClosingElement | ts.JsxOpeningElement, name: string, target: Set<string>, diagnostics: string[], path: string): void {
  const attr = node.attributes.properties.find((entry): entry is ts.JsxAttribute => ts.isJsxAttribute(entry) && entry.name.getText() === name);
  if (attr?.initializer && ts.isStringLiteral(attr.initializer)) target.add(attr.initializer.text); else diagnostics.push(`SOURCE_${name.toUpperCase()}_NOT_LITERAL:${path}`);
}
function hasGeneratedCompositionExport(sourceFile: ts.SourceFile): boolean { return sourceFile.statements.some((statement) => (ts.isFunctionDeclaration(statement) && statement.name?.text === 'GeneratedComposition' || ts.isVariableStatement(statement) && statement.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === 'GeneratedComposition')) && Boolean(statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))); }
function compareReferences(label: string, used: Set<string>, declared: Set<string>, diagnostics: string[]): void { for (const id of used) if (!declared.has(id)) diagnostics.push(`${label}_UNDECLARED:${id}`); for (const id of declared) if (!used.has(id)) diagnostics.push(`${label}_UNUSED:${id}`); }
function sameRate(left: unknown, right: unknown): boolean { const a = reducedRate(left); const b = reducedRate(right); return a !== null && a === b; }
function reducedRate(value: unknown): string | null { const rate = record(value); const n = text(rate.numerator); const d = text(rate.denominator); if (!/^[1-9]\d*$/.test(n) || !/^[1-9]\d*$/.test(d)) return null; const a = BigInt(n); const b = BigInt(d); return gcd(a, b) === BigInt(1) ? `${a}/${b}` : null; }
function gcd(a: bigint, b: bigint): bigint { while (b) [a, b] = [b, a % b]; return a; }
function integer(value: unknown): number { const parsed = Number(value); return Number.isSafeInteger(parsed) ? parsed : Number.NaN; }
function integerText(value: unknown, minimum: number): boolean { const parsed = integer(value); return Number.isSafeInteger(parsed) && parsed >= minimum; }
function fact(facts: JsonRecord[], kind: string): JsonRecord { return facts.find((entry) => entry.kind === kind) ?? {}; }
function result(disposition: GeneratedCompositionContractVerificationV1['disposition'], programHash: string | null, sourceBundleHash: string | null, diagnostics: string[]): Readonly<GeneratedCompositionContractVerificationV1> { return deepFreezeV1({ disposition, executionEligibility: 'NOT_EXECUTABLE', programHash, sourceBundleHash, diagnostics: [...new Set(diagnostics)].sort(compareUtf16) }); }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function declaredValueDrifts(recordValue: JsonRecord, key: string, actual: unknown): boolean { return Object.hasOwn(recordValue, key) && recordValue[key] !== actual; }
function uniqueIds(values: string[]): boolean { return values.every(Boolean) && new Set(values).size === values.length; }
function uniqueNumbers(values: number[]): boolean { return values.every(Number.isSafeInteger) && new Set(values).size === values.length; }
function sameSet(left: string[], right: string[]): boolean { return left.length === right.length && right.every((value) => left.includes(value)); }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
