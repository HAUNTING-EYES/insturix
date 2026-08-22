import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1,
  assertDev02GeneratedCompositionResearchProxyCapabilityV1,
  type GeneratedCompositionResearchProxyCapabilityV1,
} from './generated-composition-research-proxy-capability-v1';

export const GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_VERSION_V2 =
  'EDITRON_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2' as const;

export type GeneratedCompositionResearchProxyCapabilityV2 = Omit<
  GeneratedCompositionResearchProxyCapabilityV1,
  'artifactType' | 'contractVersion' | 'proofBindings' | 'capabilityHash'
> & {
  artifactType: 'GeneratedCompositionResearchProxyCapabilityV2';
  contractVersion: typeof GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_VERSION_V2;
  proofBindings: {
    predecessorCapabilityHash: string;
    benchmarkPlanHash: string;
    qualification: {
      kind: 'CURRENT_SANDBOX_PLAYABLE_PROXY_SMOKE';
      requestId: string;
      requestHash: string;
      hostReceiptHash: string;
      proxyReceiptHash: string;
      playableProxySha256: string;
      contactSheetSha256: string;
      workerWallTimeMs: number;
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

export type Dev02GeneratedCompositionResearchProxyCapability =
  | GeneratedCompositionResearchProxyCapabilityV1
  | GeneratedCompositionResearchProxyCapabilityV2;

const material: Omit<GeneratedCompositionResearchProxyCapabilityV2, 'capabilityHash'> = {
  artifactType: 'GeneratedCompositionResearchProxyCapabilityV2',
  contractVersion: GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_VERSION_V2,
  authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
  taskId: 'DEV-02',
  operatorId: 'generated_composition_program',
  ownerRef: 'lib/editron/research/open-ended-planner/generated-composition-sandbox-runner-v1.ts#executeGeneratedCompositionInSandboxV1',
  acceptedProfile: {
    projectId: 'oe-dev-02',
    expectedProjectRevision: 'R3',
    canvas: { width: 1080, height: 1920, colorIntent: 'SDR_BT709' },
    projectRate: { numerator: '30', denominator: '1' },
    targetRange: { coordinateDomain: 'PROJECT_TICK', start: '0', endExclusive: '180' },
    allowedAssetIds: ['dev02-close', 'dev02-wide'],
  },
  implementation: {
    snapshotId: 'snap_CRyxD1vbg4meL6dm1SqXhdxbofnR',
    snapshotCommit: '95c5a1fbdccb3058b408079777266f4e97b10c94',
    apiImplementationHash: 'bc61a906a339386975d21ed69aa87e7a56beabfe0406511ee980a7a39e5e3e47',
    runnerImplementationHash: '578d2a306f58aa994194a94baaf3e249067b0f9ff36cee0c23825cd1ae3f8c1c',
    workerImplementationHash: 'acbd1e6b8dcd30443b9bb919dc15cf2d8d501b2cee0ba8c460af972b3b5046f0',
  },
  proofBindings: {
    predecessorCapabilityHash: DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1.capabilityHash,
    benchmarkPlanHash: '5ce9a559f33445da3eac5f1f15963d396adae62f68d15da78cd4870b194c5f33',
    qualification: {
      kind: 'CURRENT_SANDBOX_PLAYABLE_PROXY_SMOKE',
      requestId: '3c848041a1d562b5ec078a03ca443e6bd5a5e9f56222111c039fc8c277b98595',
      requestHash: '154a01c22b7d51d587d867d1a059cbff625cc18413071add5ad9af8f8dc7eda3',
      hostReceiptHash: '73291ed9e11643f9b1fa98f34d06ed5307207922b6a73b2ce0ca709cc9b0a971',
      proxyReceiptHash: 'e6a0635cb66e5baeb0b64fdda28361240e95f3a03ab6c88cb5c15e7d044ced64',
      playableProxySha256: '873074a33fdf60fa7d1a9b1fc22584c4aea417d3c3372b0c568bed83ccbf5cad',
      contactSheetSha256: '6d4107d1d336504b9f7f1f6c3c5775250d167c293811656bf716be70c0054fc4',
      workerWallTimeMs: 94_057,
      resourceBudget: {
        wallTimeMs: 180_000,
        maxCpuMs: 120_000,
        memoryMiB: 2_048,
        maxOutputBytes: 64 * 1_024 * 1_024,
      },
    },
  },
  sandboxPolicy: {
    network: 'DENY_ALL', environment: 'EMPTY', secrets: 'NONE', database: 'DENY',
    projectMutation: 'DENY', persistent: false,
  },
  previewExecutionEligibility: 'RESEARCH_PROXY_ONLY',
  fullProjectExecutionEligibility: 'NOT_EXECUTABLE',
  certificationDisposition: 'TECHNICAL_PREVIEW_ONLY_CREATIVE_QUALITY_UNCERTIFIED',
  stateEffects: [],
};

export const DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2:
Readonly<GeneratedCompositionResearchProxyCapabilityV2> = deepFreezeV1({
  ...material,
  capabilityHash: hashCanonicalJsonV1(material),
});

export function assertDev02GeneratedCompositionResearchProxyCapabilityV2(
  value: unknown,
): asserts value is GeneratedCompositionResearchProxyCapabilityV2 {
  if (hashCanonicalJsonV1(value) !== hashCanonicalJsonV1(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2)) {
    throw new Error('DEV02_RESEARCH_PROXY_CAPABILITY_V2_DRIFT');
  }
  const capability = value as GeneratedCompositionResearchProxyCapabilityV2;
  const { capabilityHash: _capabilityHash, ...unsigned } = capability;
  if (capability.capabilityHash !== hashCanonicalJsonV1(unsigned)) {
    throw new Error('DEV02_RESEARCH_PROXY_CAPABILITY_V2_HASH_INVALID');
  }
}

export function assertDev02GeneratedCompositionResearchProxyCapability(
  value: unknown,
): asserts value is Dev02GeneratedCompositionResearchProxyCapability {
  const artifactType = value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>).artifactType
    : undefined;
  if (artifactType === 'GeneratedCompositionResearchProxyCapabilityV1') {
    assertDev02GeneratedCompositionResearchProxyCapabilityV1(value);
    return;
  }
  if (artifactType === 'GeneratedCompositionResearchProxyCapabilityV2') {
    assertDev02GeneratedCompositionResearchProxyCapabilityV2(value);
    return;
  }
  throw new Error('DEV02_RESEARCH_PROXY_CAPABILITY_VERSION_UNSUPPORTED');
}
