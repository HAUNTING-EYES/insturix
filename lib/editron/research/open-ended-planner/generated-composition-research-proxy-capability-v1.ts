import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_VERSION_V1 =
  'EDITRON_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1' as const;

export interface GeneratedCompositionResearchProxyCapabilityV1 {
  artifactType: 'GeneratedCompositionResearchProxyCapabilityV1';
  contractVersion: typeof GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_VERSION_V1;
  authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION';
  taskId: 'DEV-02';
  operatorId: 'generated_composition_program';
  ownerRef: 'lib/editron/research/open-ended-planner/generated-composition-sandbox-runner-v1.ts#executeGeneratedCompositionInSandboxV1';
  acceptedProfile: {
    projectId: 'oe-dev-02';
    expectedProjectRevision: 'R3';
    canvas: { width: 1080; height: 1920; colorIntent: 'SDR_BT709' };
    projectRate: { numerator: '30'; denominator: '1' };
    targetRange: { coordinateDomain: 'PROJECT_TICK'; start: '0'; endExclusive: '180' };
    allowedAssetIds: readonly ['dev02-close', 'dev02-wide'];
  };
  implementation: {
    snapshotId: string;
    snapshotCommit: string;
    apiImplementationHash: string;
    runnerImplementationHash: string;
    workerImplementationHash: string;
  };
  proofBindings: {
    benchmarkPlanHash: string;
    sourceRunReceiptHash: string;
    playableReplayReceiptHash: string;
    sandboxHostReceiptHashes: readonly string[];
    renderedProofHashes: readonly string[];
  };
  sandboxPolicy: {
    network: 'DENY_ALL';
    environment: 'EMPTY';
    secrets: 'NONE';
    database: 'DENY';
    projectMutation: 'DENY';
    persistent: false;
  };
  previewExecutionEligibility: 'RESEARCH_PROXY_ONLY';
  fullProjectExecutionEligibility: 'NOT_EXECUTABLE';
  certificationDisposition: 'TECHNICAL_PREVIEW_ONLY_CREATIVE_QUALITY_UNCERTIFIED';
  stateEffects: readonly [];
  capabilityHash: string;
}

const material: Omit<GeneratedCompositionResearchProxyCapabilityV1, 'capabilityHash'> = {
  artifactType: 'GeneratedCompositionResearchProxyCapabilityV1',
  contractVersion: GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_VERSION_V1,
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
    snapshotId: 'snap_FuRFrHL9WE4IgNXjhWjMxeWZP9mW',
    snapshotCommit: 'eb896ffbd8927621a77c4bd4073dad2a1119876d',
    apiImplementationHash: '7da8e6696dcfd90c75bb833010a6ae7b5386b1c9e1d20e198cf604088a35641b',
    runnerImplementationHash: '941cbdeb66603d99439f3f98207e849b3940367c8826293731dcfabdfb22e2b3',
    workerImplementationHash: '7242b1d14363b73676e540a15be8f16a2efa5735d08db3c58f6edc469d218ed7',
  },
  proofBindings: {
    benchmarkPlanHash: '5ce9a559f33445da3eac5f1f15963d396adae62f68d15da78cd4870b194c5f33',
    sourceRunReceiptHash: '9358395553b123dfbddb7a9086d3eadc01e69eb06ae9a03e27288dea92d1f5bd',
    playableReplayReceiptHash: '9632f57328ddff75f126f27e0bd8a1efda4e2a2dfb318f83025390bfe4e84320',
    sandboxHostReceiptHashes: [
      '3c0dfdbe1a69af020645eddeafe759eac4f5ec1f89077013dd66b16f1968f8d8',
      'f5da0832ce625fa21cba417405955ee8d36f821d6628324f8eb851a73a32852a',
    ],
    renderedProofHashes: [
      '30e672dac9e30d329c1011394f0d19f7456efb62d86e54df2f9ca18b00bda336',
      'f17e66736017e95c3883c44614f96bf689768b08976e793b32f780baf23d109b',
    ],
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

export const DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1:
Readonly<GeneratedCompositionResearchProxyCapabilityV1> = deepFreezeV1({
  ...material,
  capabilityHash: hashCanonicalJsonV1(material),
});

export function assertDev02GeneratedCompositionResearchProxyCapabilityV1(
  value: unknown,
): asserts value is GeneratedCompositionResearchProxyCapabilityV1 {
  if (hashCanonicalJsonV1(value) !== hashCanonicalJsonV1(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1)) {
    throw new Error('DEV02_RESEARCH_PROXY_CAPABILITY_DRIFT');
  }
  const capability = value as GeneratedCompositionResearchProxyCapabilityV1;
  const { capabilityHash: _capabilityHash, ...unsigned } = capability;
  if (capability.capabilityHash !== hashCanonicalJsonV1(unsigned)) {
    throw new Error('DEV02_RESEARCH_PROXY_CAPABILITY_HASH_INVALID');
  }
}
