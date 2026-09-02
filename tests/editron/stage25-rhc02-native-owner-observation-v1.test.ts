import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  STAGE25_RHC02_NATIVE_OWNER_IMPLEMENTATION_BINDING_V1,
  executeStage25Rhc02NativeOwnerObservationV1,
} from '@/lib/editron/research/open-ended-planner/stage25-rhc02-native-owner-observation-v1';
import {
  RHC02_PREVIEW_ASSET_IDS_V1,
  type Rhc02PreviewFixtureIdentityV1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/rhc02-preview-fixture-v1';

const identity = {
  assetVersions: Object.fromEntries(RHC02_PREVIEW_ASSET_IDS_V1.map(
    (assetId, index) => [assetId, prefixedSha(String(index + 1))],
  )),
  rightsEvidenceVersions: Object.fromEntries(RHC02_PREVIEW_ASSET_IDS_V1.map(
    (assetId, index) => [assetId, prefixedSha(String(index + 5))],
  )),
  fontVersion: prefixedSha('9'),
  fontFileSha256: 'a'.repeat(64),
} as Rhc02PreviewFixtureIdentityV1;

describe('Stage 2.5 RHC-02 native owner observation V1', () => {
  it('records both still forms as isolated successes and exact font as a safe stop', async () => {
    const receipt = await executeStage25Rhc02NativeOwnerObservationV1(identity);

    expect(receipt).toMatchObject({
      authority: 'CURRENT_RHC02_ISOLATED_OWNER_OBSERVATION_NO_CANONICAL_MUTATION',
      taskId: 'RHC-02',
      implementationBinding: STAGE25_RHC02_NATIVE_OWNER_IMPLEMENTATION_BINDING_V1,
      dispatcherProfile: 'RHC02_OVERLAY_RESEARCH_V1',
      imagePlan: {
        disposition: 'OK',
        observations: [
          {
            operationId: 'rhc02-add-still-a',
            overlayId: 3,
            resolvedPosition: { left: 54, top: 96, width: 486, height: 1728 },
            changedPaths: ['$.overlays[2]'],
          },
          {
            operationId: 'rhc02-add-still-b',
            overlayId: 4,
            resolvedPosition: { left: 540, top: 96, width: 486, height: 1728 },
            changedPaths: ['$.overlays[3]'],
          },
        ],
        proposalChangedPaths: ['$.overlays[2]', '$.overlays[3]'],
        canonicalUnchanged: true,
        immutableAudioOverlayPaths: ['$.overlays[0]', '$.overlays[1]'],
      },
      exactFontTitle: {
        disposition: 'UNVERIFIABLE',
        code: 'PROJECTSERVICE_ISOLATED_OVERLAY_FORM_INPUT_INVALID',
        proposalChangedPaths: [],
        canonicalUnchanged: true,
      },
      currentTruth: {
        isolatedRevisionIssuedOverlayWriter: true,
        bothStillImageFormsAccepted: true,
        exactNativeFontFileBinding: false,
        nativeRouteCapabilityAvailable: false,
        capabilityGapCodes: ['NATIVE_EXACT_FONT_FILE_BINDING_UNAVAILABLE'],
      },
      externalCalls: {
        providerInferenceCalls: 0,
        renderCalls: 0,
        databaseCalls: 0,
        canonicalProjectMutationWrites: 0,
      },
      proofCeiling: 'ISOLATED_OWNER_AND_FORM_PROOF_NOT_RENDER_OR_PRODUCT_MUTATION',
      stateEffects: [],
    });
    const { receiptSha256, ...unsigned } = receipt;
    expect(receiptSha256).toBe(hashCanonicalJsonV1(unsigned));
  });

  it('is deterministic and does not inherit the historical unsupported-owner result', async () => {
    const [first, second] = await Promise.all([
      executeStage25Rhc02NativeOwnerObservationV1(identity),
      executeStage25Rhc02NativeOwnerObservationV1(identity),
    ]);

    expect(first.receiptSha256).toBe(second.receiptSha256);
    expect(first.imagePlan.observations.every(
      ({ writerProjectRevision }) => /^project-proposal-v2r:[a-f0-9]{64}$/.test(
        String(writerProjectRevision),
      ),
    )).toBe(true);
    expect(first.exactFontTitle.code)
      .not.toBe('PROJECTSERVICE_ISOLATED_DISPATCH_OPERATOR_UNSUPPORTED');
  });

  it('fails closed before owner execution for an invalid bound fixture identity', async () => {
    const invalid = {
      ...identity,
      fontFileSha256: 'invalid',
    } as Rhc02PreviewFixtureIdentityV1;

    await expect(executeStage25Rhc02NativeOwnerObservationV1(invalid))
      .rejects.toThrow('RHC02_PREVIEW_FIXTURE_FONT_FILE_SHA256_INVALID');
  });
});

function prefixedSha(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}
