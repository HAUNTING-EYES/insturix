import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2 }
  from '@/lib/editron/research/open-ended-planner/generated-composition-research-proxy-capability-v2';
import {
  DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V3,
  assertCurrentDev02GeneratedCompositionResearchProxyCapability,
  assertDev02GeneratedCompositionResearchProxyCapabilityV3,
} from '@/lib/editron/research/open-ended-planner/generated-composition-research-proxy-capability-v3';
import { hashGeneratedCompositionSourceBundleV1 }
  from '@/lib/editron/research/open-ended-planner/generated-composition-program-v1';
import { resolveGeneratedCompositionSandboxOverlayV1 }
  from '@/lib/editron/research/open-ended-planner/generated-composition-sandbox-runner-v1';
import {
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

describe('generated-composition sandbox capability V3', () => {
  it('issues a versioned successor without rewriting either historical capability', () => {
    expect(() => assertDev02GeneratedCompositionResearchProxyCapabilityV3(
      structuredClone(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V3),
    )).not.toThrow();
    expect(() => assertCurrentDev02GeneratedCompositionResearchProxyCapability(
      DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2,
    )).not.toThrow();
    expect(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V3
      .proofBindings.predecessorCapabilityHash)
      .toBe(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2.capabilityHash);
    expect(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V3.capabilityHash)
      .not.toBe(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2.capabilityHash);
  });

  it('preserves issuance hashes and exposes the qualified post-Phase-5A overlay', async () => {
    const [api, runner, overlay] = await Promise.all([
      readFile('lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx'),
      readFile('lib/editron/research/open-ended-planner/generated-composition-sandbox-runner-v1.ts'),
      resolveGeneratedCompositionSandboxOverlayV1(process.cwd()),
    ]);
    const capability = DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V3;
    expect(sha256(api)).toBe(capability.implementation.apiImplementationHash);
    expect(sha256(runner)).toBe(capability.implementation.runnerImplementationHash);
    expect(capability.implementation.workerImplementationHash)
      .toBe('7359b7251c019bf3036c23483aea2cbee7be4823e7e272b1da8cc4e1a3b6c047');
    expect(overlay.workerImplementationHash)
      .toBe('4d392654882a1b067dcf3b510add92c79b519a596e8e833ca75526f50922a79d');
    expect(overlay.workerImplementationHash)
      .not.toBe(capability.implementation.workerImplementationHash);
    expect(hashCanonicalJsonV1(DEV02_GENERATED_COMPOSITION_PROGRAM_V1))
      .toBe(capability.proofBindings.qualification.programHash);
    expect(DEV02_GENERATED_COMPOSITION_PROGRAM_V1.sourceBundleHash)
      .toBe(capability.proofBindings.qualification.sourceBundleHash);
    expect(hashGeneratedCompositionSourceBundleV1(
      DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
    )).toBe(capability.proofBindings.qualification.sourceBundleHash);
  });

  it('records sandbox safety without pretending to have rendered the RHC02 still branch', () => {
    expect(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V3).toMatchObject({
      sandboxPolicy: {
        network: 'DENY_ALL', environment: 'EMPTY', secrets: 'NONE', database: 'DENY',
        projectMutation: 'DENY', persistent: false,
      },
      previewExecutionEligibility: 'RESEARCH_PROXY_ONLY',
      fullProjectExecutionEligibility: 'NOT_EXECUTABLE',
      certificationDisposition: 'TECHNICAL_PREVIEW_ONLY_CREATIVE_QUALITY_UNCERTIFIED',
      stateEffects: [],
      proofBindings: {
        qualification: {
          productionSandbox: 'PASS', outputMaterialization: 'PASS',
          projectMutation: 'NONE', sandboxDeleted: true,
          currentStillImageSandboxRender: 'NOT_RUN',
        },
      },
    });
  });

  it('fails closed when a bound live-receipt field is changed', () => {
    const tampered = structuredClone(
      DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V3,
    );
    tampered.proofBindings.qualification.hostReceiptHash = '0'.repeat(64);
    expect(() => assertDev02GeneratedCompositionResearchProxyCapabilityV3(tampered))
      .toThrow('DEV02_RESEARCH_PROXY_CAPABILITY_V3_DRIFT');
  });
});

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
