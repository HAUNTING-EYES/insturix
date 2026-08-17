import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type {
  ConnectedDevelopmentStage123ReceiptV2,
  ConnectedDevelopmentStageRowV2,
} from './development-connected-stage123-runner-v2';
import type { DevelopmentTaskCaseV2 } from './development-cohort-runner-v2';

type JsonRecord = Record<string, unknown>;

export interface ConnectedDevelopmentStage4CompilerInputV2 {
  taskId: string;
  conditionId: string;
  referenceBlueprint: Readonly<JsonRecord>;
  editorialIntent: Readonly<JsonRecord>;
  evidencePack: Readonly<JsonRecord>;
  evidenceBoundIntent: Readonly<JsonRecord>;
  sourceReferenceBlueprintHash: string;
  sourceEditorialIntentHash: string;
  evidencePackHash: string;
  sourceEvidenceBoundIntentHash: string;
}

export interface ConnectedDevelopmentStage4EvaluationV2 {
  disposition: 'PASS' | 'EXPECTED_CAPABILITY_GAP' | 'FAIL' | 'UNVERIFIABLE';
  diagnostics: readonly string[];
  dimensions?: Readonly<JsonRecord>;
}

export interface ConnectedDevelopmentStage4OwnerV2 {
  ownerRef: string;
  compiledArtifactType: string;
  compile: (
    input: Readonly<ConnectedDevelopmentStage4CompilerInputV2>,
  ) => Readonly<JsonRecord> | Promise<Readonly<JsonRecord>>;
  evaluate: (
    artifact: Readonly<JsonRecord>,
    input: Readonly<ConnectedDevelopmentStage4CompilerInputV2>,
  ) => Readonly<ConnectedDevelopmentStage4EvaluationV2>;
}

export interface ConnectedDevelopmentStage4ReceiptV2 {
  receiptVersion: 'EDITRON_OE_CONNECTED_STAGE4_RECEIPT_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  handoffMode: 'CONNECTED_ACTUAL_STAGE123_TO_EXISTING_COMPILER_OWNER';
  taskId: string;
  conditionId: string;
  routeId: string;
  claimedModelIdentity: string;
  sourceStage123ReceiptHash: string;
  compilerOwnerRef: string;
  compiledArtifactType: string;
  sourceHashes: Readonly<{
    referenceBlueprint: string;
    editorialIntent: string;
    evidencePack: string;
    evidenceBoundIntent: string;
  }>;
  compiledArtifact: Readonly<JsonRecord> | null;
  compiledArtifactHash: string | null;
  evaluation: Readonly<ConnectedDevelopmentStage4EvaluationV2>;
  stateEffects: readonly [];
  receiptHash: string;
}

export async function delegateConnectedDevelopmentStage4V2(input: {
  task: DevelopmentTaskCaseV2;
  stage123Receipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>;
  owner: ConnectedDevelopmentStage4OwnerV2;
}): Promise<Readonly<ConnectedDevelopmentStage4ReceiptV2>> {
  const rows = validateStage123Receipt(input.task, input.stage123Receipt);
  if (!input.owner.ownerRef.trim()) throw new Error('CONNECTED_STAGE4_OWNER_REF_INVALID');
  if (!input.owner.compiledArtifactType.trim()) throw new Error('CONNECTED_STAGE4_ARTIFACT_TYPE_INVALID');
  const compilerInput = buildCompilerInput(input.task, rows);
  let compiledArtifact: Readonly<JsonRecord> | null = null;
  let evaluation: Readonly<ConnectedDevelopmentStage4EvaluationV2>;
  try {
    compiledArtifact = await input.owner.compile(compilerInput);
    const bindingDiagnostics = compiledArtifactBindingDiagnostics(
      compiledArtifact,
      compilerInput,
      input.owner.compiledArtifactType,
    );
    evaluation = bindingDiagnostics.length
      ? deepFreezeV1({ disposition: 'UNVERIFIABLE', diagnostics: bindingDiagnostics })
      : validateOwnerEvaluation(input.owner.evaluate(compiledArtifact, compilerInput));
  } catch (error) {
    evaluation = deepFreezeV1({
      disposition: 'UNVERIFIABLE',
      diagnostics: [`COMPILER_REJECTED:${error instanceof Error ? error.message : 'UNKNOWN'}`],
    });
  }
  return buildReceipt(input, compilerInput, compiledArtifact, evaluation);
}

function validateStage123Receipt(
  task: DevelopmentTaskCaseV2,
  receipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>,
): readonly [ConnectedDevelopmentStageRowV2, ConnectedDevelopmentStageRowV2, ConnectedDevelopmentStageRowV2] {
  const { receiptHash, ...unsigned } = receipt;
  if (receiptHash !== hashCanonicalJsonV1(unsigned)
    || receipt.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || receipt.handoffMode !== 'CONNECTED_SAME_ROUTE_ACTUAL_PRIOR_ARTIFACT'
    || receipt.finalDisposition !== 'STAGE3_EVALUATED'
    || receipt.taskId !== task.taskId
    || receipt.conditionId !== task.conditionId
    || receipt.systemEvidencePackHash !== hashCanonicalJsonV1(task.canonical.evidencePack)) {
    throw new Error('CONNECTED_STAGE4_STAGE123_RECEIPT_INVALID');
  }
  if (receipt.rows.length !== 3 || receipt.rows.some((row, index) => row.stage !== index + 1)) {
    throw new Error('CONNECTED_STAGE4_STAGE123_ROW_SET_INVALID');
  }
  const rows = receipt.rows as readonly [
    ConnectedDevelopmentStageRowV2,
    ConnectedDevelopmentStageRowV2,
    ConnectedDevelopmentStageRowV2,
  ];
  for (const row of rows) {
    const artifact = row.providerRun.artifact;
    if (row.providerRun.disposition !== 'ARTIFACT_ACCEPTED' || !artifact
      || row.artifactHash !== hashCanonicalJsonV1(artifact)) {
      throw new Error(`CONNECTED_STAGE4_STAGE${row.stage}_ARTIFACT_INVALID`);
    }
  }
  if (rows[1].priorArtifactHash !== rows[0].artifactHash
    || rows[1].packetPriorArtifactHash !== rows[0].artifactHash
    || rows[2].priorArtifactHash !== rows[1].artifactHash
    || rows[2].packetPriorArtifactHash !== rows[1].artifactHash) {
    throw new Error('CONNECTED_STAGE4_ACTUAL_ARTIFACT_LINEAGE_INVALID');
  }
  if (!['PASS', 'EXPECTED_CAPABILITY_GAP'].includes(rows[2].evaluation.disposition)) {
    throw new Error(`CONNECTED_STAGE4_STAGE3_NOT_APPROVED:${rows[2].evaluation.disposition}`);
  }
  return rows;
}

function buildCompilerInput(
  task: DevelopmentTaskCaseV2,
  rows: readonly [ConnectedDevelopmentStageRowV2, ConnectedDevelopmentStageRowV2, ConnectedDevelopmentStageRowV2],
): Readonly<ConnectedDevelopmentStage4CompilerInputV2> {
  const referenceBlueprint = requiredArtifact(rows[0]);
  const editorialIntent = requiredArtifact(rows[1]);
  const evidenceBoundIntent = requiredArtifact(rows[2]);
  const evidencePack = task.canonical.evidencePack;
  return deepFreezeV1({
    taskId: task.taskId,
    conditionId: task.conditionId,
    referenceBlueprint,
    editorialIntent,
    evidencePack,
    evidenceBoundIntent,
    sourceReferenceBlueprintHash: hashCanonicalJsonV1(referenceBlueprint),
    sourceEditorialIntentHash: hashCanonicalJsonV1(editorialIntent),
    evidencePackHash: hashCanonicalJsonV1(evidencePack),
    sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(evidenceBoundIntent),
  });
}

function compiledArtifactBindingDiagnostics(
  artifact: Readonly<JsonRecord>,
  source: Readonly<ConnectedDevelopmentStage4CompilerInputV2>,
  compiledArtifactType: string,
): string[] {
  const expected = {
    artifactType: compiledArtifactType,
    taskId: source.taskId,
    sourceEditorialIntentHash: source.sourceEditorialIntentHash,
    sourceEvidenceBoundIntentHash: source.sourceEvidenceBoundIntentHash,
    evidencePackHash: source.evidencePackHash,
  };
  return Object.entries(expected)
    .filter(([field, value]) => artifact[field] !== value)
    .map(([field]) => `COMPILED_ARTIFACT_BINDING_INVALID:${field}`);
}

function validateOwnerEvaluation(
  value: Readonly<ConnectedDevelopmentStage4EvaluationV2>,
): Readonly<ConnectedDevelopmentStage4EvaluationV2> {
  if (!['PASS', 'EXPECTED_CAPABILITY_GAP', 'FAIL', 'UNVERIFIABLE'].includes(value.disposition)
    || !Array.isArray(value.diagnostics)
    || value.diagnostics.some((diagnostic) => typeof diagnostic !== 'string')) {
    return deepFreezeV1({ disposition: 'UNVERIFIABLE', diagnostics: ['STAGE4_OWNER_EVALUATION_INVALID'] });
  }
  return deepFreezeV1(value);
}

function buildReceipt(
  input: {
    task: DevelopmentTaskCaseV2;
    stage123Receipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>;
    owner: ConnectedDevelopmentStage4OwnerV2;
  },
  source: Readonly<ConnectedDevelopmentStage4CompilerInputV2>,
  compiledArtifact: Readonly<JsonRecord> | null,
  evaluation: Readonly<ConnectedDevelopmentStage4EvaluationV2>,
): Readonly<ConnectedDevelopmentStage4ReceiptV2> {
  const material = {
    receiptVersion: 'EDITRON_OE_CONNECTED_STAGE4_RECEIPT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    handoffMode: 'CONNECTED_ACTUAL_STAGE123_TO_EXISTING_COMPILER_OWNER' as const,
    taskId: input.task.taskId,
    conditionId: input.task.conditionId,
    routeId: input.stage123Receipt.routeId,
    claimedModelIdentity: input.stage123Receipt.claimedModelIdentity,
    sourceStage123ReceiptHash: input.stage123Receipt.receiptHash,
    compilerOwnerRef: input.owner.ownerRef,
    compiledArtifactType: input.owner.compiledArtifactType,
    sourceHashes: {
      referenceBlueprint: source.sourceReferenceBlueprintHash,
      editorialIntent: source.sourceEditorialIntentHash,
      evidencePack: source.evidencePackHash,
      evidenceBoundIntent: source.sourceEvidenceBoundIntentHash,
    },
    compiledArtifact,
    compiledArtifactHash: compiledArtifact ? hashCanonicalJsonV1(compiledArtifact) : null,
    evaluation,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
}

function requiredArtifact(row: ConnectedDevelopmentStageRowV2): Readonly<JsonRecord> {
  const artifact = row.providerRun.artifact;
  if (!artifact) throw new Error(`CONNECTED_STAGE4_STAGE${row.stage}_ARTIFACT_MISSING`);
  return artifact;
}
