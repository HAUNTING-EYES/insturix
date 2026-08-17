import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { DevelopmentStageEvaluationV2 } from './development-cohort-runner-v2';
import type {
  HashedStagePacketV2,
  ProviderStagePacketV2,
} from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;

export interface ConnectedSemanticRepairSourceV2 {
  repairVersion: 'EDITRON_OE_CONNECTED_SEMANTIC_REPAIR_V2';
  initialPacketHash: string;
  initialTransportHash: string;
  initialArtifactHash: string;
  repairDiagnostics: readonly string[];
  repairFeedbackHash: string;
}

export interface ConnectedStage1SemanticRepairSourceV2 {
  repairVersion: 'EDITRON_OE_CONNECTED_STAGE1_SEMANTIC_REPAIR_V2';
  initialPacketHash: string;
  initialTransportHash: string;
  initialArtifactHash: string;
  repairDiagnostics: readonly string[];
  repairFeedbackHash: string;
}

export function buildConnectedStage1SemanticRepairPacketV2(input: {
  packet: HashedStagePacketV2;
  failedArtifact: Readonly<JsonRecord>;
  repairDiagnostics: readonly string[];
}): Readonly<{
  packet: HashedStagePacketV2;
  source: Readonly<ConnectedStage1SemanticRepairSourceV2>;
}> {
  if (input.packet.packet.stage !== 1 || !input.repairDiagnostics.length
    || input.repairDiagnostics.some((diagnostic) => !diagnostic.trim())) {
    throw new Error('CONNECTED_STAGE1_SEMANTIC_REPAIR_NOT_ELIGIBLE');
  }
  const initialArtifactHash = hashCanonicalJsonV1(input.failedArtifact);
  const feedback = {
    repairVersion: 'EDITRON_OE_CONNECTED_STAGE1_SEMANTIC_REPAIR_V2' as const,
    failedArtifact: input.failedArtifact,
    failedArtifactHash: initialArtifactHash,
    repairDiagnostics: [...input.repairDiagnostics],
    instructions: [
      'Return a complete replacement ReferenceBlueprintV2 artifact, not a patch or explanation.',
      'Re-inspect the supplied ordered reference evidence before correcting the blueprint.',
      'For each diagnostic, add an explicit target claim only when the supplied evidence supports it.',
      'Preserve supported observations, source facts, uncertainty, and user requirements from the failed artifact.',
      'Do not copy canonical fixture IDs, invent unobserved motion, or claim exact easing from sparse evidence.',
    ],
  };
  const packet: ProviderStagePacketV2 = {
    ...input.packet.packet,
    instructions: [
      ...input.packet.packet.instructions,
      'This is the single allowed Stage-1 semantic-repair attempt. Apply the hashed feedback exactly.',
    ],
    modelInput: {
      ...input.packet.packet.modelInput,
      stageOneSemanticRepairFeedback: feedback,
    },
  };
  const hashedPacket = deepFreezeV1({
    packet: deepFreezeV1(packet),
    packetHash: hashCanonicalJsonV1(packet),
    transportAttachments: input.packet.transportAttachments,
    transportHash: hashCanonicalJsonV1(input.packet.transportAttachments),
  });
  const source = deepFreezeV1({
    repairVersion: 'EDITRON_OE_CONNECTED_STAGE1_SEMANTIC_REPAIR_V2' as const,
    initialPacketHash: input.packet.packetHash,
    initialTransportHash: input.packet.transportHash,
    initialArtifactHash,
    repairDiagnostics: [...input.repairDiagnostics],
    repairFeedbackHash: hashCanonicalJsonV1(feedback),
  });
  return deepFreezeV1({ packet: hashedPacket, source });
}

export function buildConnectedSemanticRepairPacketV2(input: {
  packet: HashedStagePacketV2;
  failedArtifact: Readonly<JsonRecord>;
  evaluation: Readonly<DevelopmentStageEvaluationV2>;
}): Readonly<{
  packet: HashedStagePacketV2;
  source: Readonly<ConnectedSemanticRepairSourceV2>;
}> {
  if (![2, 3].includes(input.packet.packet.stage)
    || input.evaluation.disposition !== 'FAIL'
    || !input.evaluation.diagnostics.length) {
    throw new Error('CONNECTED_SEMANTIC_REPAIR_NOT_ELIGIBLE');
  }
  const initialArtifactHash = hashCanonicalJsonV1(input.failedArtifact);
  const feedback = {
    repairVersion: 'EDITRON_OE_CONNECTED_SEMANTIC_REPAIR_V2' as const,
    failedArtifact: input.failedArtifact,
    failedArtifactHash: initialArtifactHash,
    repairDiagnostics: [...input.evaluation.diagnostics],
    repairGuidance: input.evaluation.diagnostics.map(repairGuidance),
    instructions: [
      'Return a complete replacement artifact, not a patch or explanation.',
      'Preserve the exact prior-artifact claim and node identities unless a diagnostic requires changing them.',
      'Correct every diagnostic without inventing claims, evidence, capabilities, or project state.',
      'If the requested result is not supported, declare the structured capability gap instead of substituting another effect.',
    ],
  };
  const packet: ProviderStagePacketV2 = {
    ...input.packet.packet,
    instructions: [
      ...input.packet.packet.instructions,
      'This is the single allowed semantic-repair attempt. Apply the supplied diagnostics exactly.',
    ],
    modelInput: {
      ...input.packet.packet.modelInput,
      semanticRepairFeedback: feedback,
    },
  };
  const hashedPacket = deepFreezeV1({
    packet: deepFreezeV1(packet),
    packetHash: hashCanonicalJsonV1(packet),
    transportAttachments: input.packet.transportAttachments,
    transportHash: hashCanonicalJsonV1(input.packet.transportAttachments),
  });
  const source = deepFreezeV1({
    repairVersion: 'EDITRON_OE_CONNECTED_SEMANTIC_REPAIR_V2' as const,
    initialPacketHash: input.packet.packetHash,
    initialTransportHash: input.packet.transportHash,
    initialArtifactHash,
    repairDiagnostics: [...input.evaluation.diagnostics],
    repairFeedbackHash: hashCanonicalJsonV1(feedback),
  });
  return deepFreezeV1({ packet: hashedPacket, source });
}

function repairGuidance(diagnostic: string): string {
  if (diagnostic === 'DEV02_SOURCE_RESOLUTION_BEFORE_GENERATED_MISSING') {
    return 'Add a NATIVE source-resolution intent with inspect_user_asset and resolve_user_asset_overlay; every generated-composition intent that consumes user media must transitively depend on it through requiresNodeIds.';
  }
  if (diagnostic === 'DEV02_NATIVE_CONTINUATION_AFTER_GENERATED_MISSING') {
    return 'Add a NATIVE boundary-continuation intent after the generated-composition intent. It must use a legal continuation capability, transitively depend on the generated intent, and cover every continuation/handoff target claim.';
  }
  if (diagnostic === 'DEV02_NATIVE_CONTINUATION_BEFORE_PROOF_MISSING') {
    return 'Add a distinct NATIVE proof-read intent with read_project_file and get_timeline_view after the post-generated boundary-continuation intent; its requiresNodeIds path must prove continuation before final project/timeline inspection.';
  }
  return `Resolve the evaluator diagnostic exactly as written without inventing claims or capabilities: ${diagnostic}`;
}
