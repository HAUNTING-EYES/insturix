import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2,
  assertDev02GeneratedCompositionResearchProxyCapability,
  type Dev02GeneratedCompositionResearchProxyCapability,
  type GeneratedCompositionResearchProxyCapabilityV2,
} from './generated-composition-research-proxy-capability-v2';

export const GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_VERSION_V3 =
  'EDITRON_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V3' as const;

export type GeneratedCompositionResearchProxyCapabilityV3 = Omit<
  GeneratedCompositionResearchProxyCapabilityV2,
  'artifactType' | 'contractVersion' | 'implementation' | 'proofBindings' | 'capabilityHash'
> & {
  artifactType: 'GeneratedCompositionResearchProxyCapabilityV3';
  contractVersion: typeof GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_VERSION_V3;
  implementation: GeneratedCompositionResearchProxyCapabilityV2['implementation'];
  proofBindings: {
    predecessorCapabilityHash: string;
    benchmarkPlanHash: string;
    qualification: {
      kind: 'CURRENT_HASH_DENY_ALL_SANDBOX_PLAYABLE_PROXY_SMOKE';
      executionId: string;
      requestId: string;
      requestHash: string;
      resultHash: string;
      hostReceiptHash: string;
      proxyReceiptHash: string;
      programHash: string;
      sourceBundleHash: string;
      apiImplementationHash: string;
      workerImplementationHash: string;
      playableProxySha256: string;
      contactSheetSha256: string;
      workerWallTimeMs: number;
      workerCpuUpperBoundMs: number;
      productionSandbox: 'PASS';
      outputMaterialization: 'PASS';
      projectMutation: 'NONE';
      sandboxDeleted: true;
      currentStillImageSandboxRender: 'NOT_RUN';
      resourceBudget: {
        wallTimeMs: number;
        maxCpuMs: number;
        memoryMiB: number;
        maxOutputBytes: number;
      };
    };
  };
  capabilityHash: string;
};

export type CurrentDev02GeneratedCompositionResearchProxyCapability =
  | Dev02GeneratedCompositionResearchProxyCapability
  | GeneratedCompositionResearchProxyCapabilityV3;

const {
  artifactType: _predecessorArtifactType,
  contractVersion: _predecessorContractVersion,
  implementation: _predecessorImplementation,
  proofBindings: predecessorProofBindings,
  capabilityHash: _predecessorCapabilityHash,
  ...predecessorMaterial
} = DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2;

const material: Omit<GeneratedCompositionResearchProxyCapabilityV3, 'capabilityHash'> = {
  ...predecessorMaterial,
  artifactType: 'GeneratedCompositionResearchProxyCapabilityV3',
  contractVersion: GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_VERSION_V3,
  implementation: {
    snapshotId: 'snap_FuRFrHL9WE4IgNXjhWjMxeWZP9mW',
    snapshotCommit: 'eb896ffbd8927621a77c4bd4073dad2a1119876d',
    apiImplementationHash: 'ee2468e25c67987e466abaee1e1ef18b0e7caa08c48875b8c52b66ee0382e4bc',
    runnerImplementationHash: '578d2a306f58aa994194a94baaf3e249067b0f9ff36cee0c23825cd1ae3f8c1c',
    workerImplementationHash: '7359b7251c019bf3036c23483aea2cbee7be4823e7e272b1da8cc4e1a3b6c047',
  },
  proofBindings: {
    predecessorCapabilityHash:
      DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2.capabilityHash,
    benchmarkPlanHash: predecessorProofBindings.benchmarkPlanHash,
    qualification: {
      kind: 'CURRENT_HASH_DENY_ALL_SANDBOX_PLAYABLE_PROXY_SMOKE',
      executionId: 'dev02-sandbox-1787839358657',
      requestId: '133dbd06d108699a8ba428d2d5c6d18dc7594af580da44a58e029421f08c9119',
      requestHash: '9f1514bb967e3546459b6dd3619caef88ea6dcd82cf07deaab5029df54a2b448',
      resultHash: '2b8a33d2cb82066833926790c5a7008434922ba68616a4552ea14915afe64099',
      hostReceiptHash: 'df7653eba5d470a94735c4d1cafd2cc85d25de217ac29bceef10b78aee09b681',
      proxyReceiptHash: '055d68d9ae26d963ec28c01ec9c3d8568fab9791a4644eb828f10e0f8fdff9d0',
      programHash: 'b3effa47dd61b838be631bb1a82e91684cf5c0aeb6dea93cb08cf4bbb61267f7',
      sourceBundleHash: '08529169c0a466d5bbc2ca947e9479bfaf1ec169a85da715e7f098b29799779a',
      apiImplementationHash: 'ee2468e25c67987e466abaee1e1ef18b0e7caa08c48875b8c52b66ee0382e4bc',
      workerImplementationHash: '7359b7251c019bf3036c23483aea2cbee7be4823e7e272b1da8cc4e1a3b6c047',
      playableProxySha256: '873074a33fdf60fa7d1a9b1fc22584c4aea417d3c3372b0c568bed83ccbf5cad',
      contactSheetSha256: '6d4107d1d336504b9f7f1f6c3c5775250d167c293811656bf716be70c0054fc4',
      workerWallTimeMs: 91_392,
      workerCpuUpperBoundMs: 91_392,
      productionSandbox: 'PASS',
      outputMaterialization: 'PASS',
      projectMutation: 'NONE',
      sandboxDeleted: true,
      currentStillImageSandboxRender: 'NOT_RUN',
      resourceBudget: {
        wallTimeMs: 180_000,
        maxCpuMs: 120_000,
        memoryMiB: 2_048,
        maxOutputBytes: 64 * 1_024 * 1_024,
      },
    },
  },
};

export const DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V3:
Readonly<GeneratedCompositionResearchProxyCapabilityV3> = deepFreezeV1({
  ...material,
  capabilityHash: hashCanonicalJsonV1(material),
});

export function assertDev02GeneratedCompositionResearchProxyCapabilityV3(
  value: unknown,
): asserts value is GeneratedCompositionResearchProxyCapabilityV3 {
  if (hashCanonicalJsonV1(value)
    !== hashCanonicalJsonV1(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V3)) {
    throw new Error('DEV02_RESEARCH_PROXY_CAPABILITY_V3_DRIFT');
  }
  const capability = value as GeneratedCompositionResearchProxyCapabilityV3;
  const { capabilityHash: _capabilityHash, ...unsigned } = capability;
  if (capability.capabilityHash !== hashCanonicalJsonV1(unsigned)) {
    throw new Error('DEV02_RESEARCH_PROXY_CAPABILITY_V3_HASH_INVALID');
  }
}

export function assertCurrentDev02GeneratedCompositionResearchProxyCapability(
  value: unknown,
): asserts value is CurrentDev02GeneratedCompositionResearchProxyCapability {
  const artifactType = value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>).artifactType
    : undefined;
  if (artifactType === 'GeneratedCompositionResearchProxyCapabilityV3') {
    assertDev02GeneratedCompositionResearchProxyCapabilityV3(value);
    return;
  }
  assertDev02GeneratedCompositionResearchProxyCapability(value);
}
