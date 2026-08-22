import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { GeneratedCompositionModelRepairV1 }
  from './generated-composition-model-candidate-v1';
import { verifyGeneratedCompositionProgramV1 }
  from './generated-composition-program-verifier-v1';
import type { ProviderNativeToolExecutionV2R }
  from './provider-native-tool-episode-v2r';
import type { ProviderNativeRouteV2R }
  from './provider-native-tool-codecs-v2r';
import {
  buildSealedH03GeneratedCompositionModelPacketV3R,
  materializeSealedH03GeneratedCompositionModelCandidateV3R,
} from './sealed-holdout-h03-model-candidate-v3r';

type JsonRecord = Record<string, unknown>;
type H03Candidate = ReturnType<
  typeof materializeSealedH03GeneratedCompositionModelCandidateV3R
>;
export type SealedH03ModelSourcePacketV3R2 = ReturnType<
  typeof buildSealedH03GeneratedCompositionModelPacketV3R
>;

export interface SealedH03GeneratedSourceV3R2 {
  source: string;
  modelId: string;
  promptHash: string;
  orchestratorSpecSha256: string;
  generationReceipt: Readonly<JsonRecord>;
}

export type SealedH03SourceGeneratorV3R2 = (request: Readonly<{
  route: Readonly<ProviderNativeRouteV2R>;
  packet: SealedH03ModelSourcePacketV3R2;
  arguments: Readonly<JsonRecord>;
  orchestratorSpecSha256: string;
  candidateOrdinal: 0 | 1;
  repair?: GeneratedCompositionModelRepairV1;
}>) => Promise<Readonly<SealedH03GeneratedSourceV3R2>>;

export interface SealedH03AcceptedSourceV3R2 {
  candidateOrdinal: 0 | 1;
  orchestratorArgumentsSha256: string;
  ownerAuthorizationOutputSha256: string;
  generationReceipt: Readonly<JsonRecord>;
  generationReceiptSha256: string;
  verification: ReturnType<typeof verifyGeneratedCompositionProgramV1>;
  candidate: H03Candidate;
  attempts: readonly Readonly<JsonRecord>[];
}

/** Source synthesis is downstream of owner authorization and has no project authority. */
export async function executeSealedH03ModelSourceV3R2(input: {
  route: Readonly<ProviderNativeRouteV2R>;
  apiImplementationHash: string;
  arguments: Readonly<JsonRecord>;
  sourceAArtifactSha256: string;
  sourceBArtifactSha256: string;
  ownerAuthorizationOutputSha256: string;
  generateSource: SealedH03SourceGeneratorV3R2;
}): Promise<Readonly<{
  execution: ProviderNativeToolExecutionV2R;
  accepted: Readonly<SealedH03AcceptedSourceV3R2> | null;
}>> {
  requireSha(input.apiImplementationHash, 'SEALED_H03_API_IMPLEMENTATION_HASH_INVALID');
  const orchestratorSpecSha256 = hashCanonicalJsonV1(input.arguments);
  const attempts: JsonRecord[] = [];
  let repair: GeneratedCompositionModelRepairV1 | undefined;
  for (const candidateOrdinal of [0, 1] as const) {
    let generated: Readonly<SealedH03GeneratedSourceV3R2> | undefined;
    try {
      const packet = buildSealedH03GeneratedCompositionModelPacketV3R({
        apiImplementationHash: input.apiImplementationHash,
        sourceAArtifactSha256: input.sourceAArtifactSha256,
        sourceBArtifactSha256: input.sourceBArtifactSha256,
        orchestratorArguments: input.arguments,
        ...(repair ? { repair } : {}),
      });
      generated = await input.generateSource({
        route: input.route,
        packet,
        arguments: input.arguments,
        orchestratorSpecSha256,
        candidateOrdinal,
        ...(repair ? { repair } : {}),
      });
      validateGeneratedSource(generated, packet.packetHash, orchestratorSpecSha256);
      const candidate = materializeSealedH03GeneratedCompositionModelCandidateV3R({
        source: generated.source,
        modelId: generated.modelId,
        promptHash: generated.promptHash,
        candidateOrdinal,
        sourceAArtifactSha256: input.sourceAArtifactSha256,
        sourceBArtifactSha256: input.sourceBArtifactSha256,
        orchestratorArguments: input.arguments,
      });
      const verification = verifyGeneratedCompositionProgramV1(candidate);
      if (verification.disposition !== 'CONTRACT_PASS'
        || !verification.programHash || !verification.sourceBundleHash) {
        throw new Error(`SEALED_H03_SOURCE_CONTRACT_FAIL:${verification.diagnostics.join(',')}`);
      }
      const generationReceiptSha256 = hashCanonicalJsonV1(generated.generationReceipt);
      const accepted = deepFreezeV1({
        candidateOrdinal,
        orchestratorArgumentsSha256: orchestratorSpecSha256,
        ownerAuthorizationOutputSha256: input.ownerAuthorizationOutputSha256,
        generationReceipt: generated.generationReceipt,
        generationReceiptSha256,
        verification,
        candidate,
        attempts: [...attempts, {
          candidateOrdinal,
          packetHash: packet.packetHash,
          disposition: 'CONTRACT_PASS',
        }],
      });
      return {
        accepted,
        execution: deepFreezeV1({
          authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
          disposition: 'OK' as const,
          output: {
            codeBundle: {
              status: 'CONTRACT_VERIFIED',
              programHash: verification.programHash,
              sourceBundleHash: verification.sourceBundleHash,
              modelId: generated.modelId,
              promptHash: generated.promptHash,
              orchestratorSpecSha256,
              generationReceiptSha256,
            },
            renderContract: {
              status: 'READY_FOR_BOUNDED_PROXY_RENDER',
              projectMutation: 'NONE',
              programHash: verification.programHash,
              sourceBundleHash: verification.sourceBundleHash,
            },
            cueMap: [],
            proofPlan: {
              status: 'PENDING_RENDER',
              required: ['bounded-render', 'visual', 'continuity'],
              sourceContractDisposition: verification.disposition,
            },
          },
          evidenceIds: strings(input.arguments.evidenceIds),
        }),
      };
    } catch (error) {
      const diagnostic = boundedError(error);
      attempts.push({ candidateOrdinal, disposition: 'FAIL', diagnostic });
      if (candidateOrdinal === 1 || !generated?.source || nonRepairable(diagnostic)) {
        return { accepted: null, execution: failureExecution(diagnostic, attempts) };
      }
      repair = {
        repairOrdinal: 1,
        failureStage: 'CONTRACT_VERIFIER',
        diagnostics: [diagnostic],
        priorSource: generated.source,
      };
    }
  }
  return {
    accepted: null,
    execution: failureExecution('SEALED_H03_SOURCE_GENERATION_EXHAUSTED', attempts),
  };
}

function validateGeneratedSource(
  generated: Readonly<SealedH03GeneratedSourceV3R2>,
  packetHash: string,
  orchestratorSpecSha256: string,
): void {
  const receipt = record(generated.generationReceipt);
  if (!generated.source.trim() || !generated.modelId.trim()
    || !isSha(generated.promptHash)
    || generated.orchestratorSpecSha256 !== orchestratorSpecSha256
    || receipt.authority !== 'RESEARCH_MODEL_GENERATED_SOURCE_NO_PROJECT_MUTATION'
    || receipt.packetHash !== packetHash
    || !Array.isArray(receipt.stateEffects) || receipt.stateEffects.length !== 0) {
    throw new Error('SEALED_H03_GENERATED_SOURCE_LINEAGE_INVALID');
  }
}

function failureExecution(
  error: unknown,
  attempts: readonly Readonly<JsonRecord>[],
): Readonly<ProviderNativeToolExecutionV2R> {
  const message = boundedError(error);
  return deepFreezeV1({
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
    disposition: 'FAIL' as const,
    output: {
      code: message.split(':', 1)[0] || 'SEALED_H03_SOURCE_EXECUTION_FAILED',
      message,
      details: { attempts },
    },
    evidenceIds: [] as const,
  });
}

function nonRepairable(message: string): boolean {
  return message.includes('LINEAGE_INVALID') || message.includes('API_IMPLEMENTATION_HASH_INVALID');
}
function boundedError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500)
    || 'SEALED_H03_SOURCE_EXECUTION_FAILED';
}
function requireSha(value: string, code: string): void {
  if (!isSha(value)) throw new Error(code);
}
function isSha(value: string): boolean { return /^[a-f0-9]{64}$/.test(value); }
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
