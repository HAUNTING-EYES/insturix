import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { v2rOperatorCatalogIdentity }
  from '@/lib/editron/research/open-ended-planner/operator-catalog-v2r';
import {
  buildProviderNativeToolSetFromCatalogV2R,
  buildProviderNativeToolSetV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-catalog-v2r';
import {
  SEALED_HOLDOUT_OPERATOR_CATALOG_V3R,
  SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V3R,
  sealedHoldoutOperatorCatalogIdentityV3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-catalog-v3r';
import { validateJsonSchemaV2 }
  from '@/lib/editron/research/open-ended-planner/stage4-compilation-evaluator-v2';

type JsonRecord = Record<string, unknown>;

const FROZEN_V2_RESOLVE_VISUAL_TOOL_SET_SHA256 =
  '07f7698c898edba5543a67c9e8e4f99b860a4fdbf434f76c367988bb95a65b72';

describe('sealed holdout V3R catalog correction', () => {
  it('preserves V2 and gives the corrected catalog a distinct self-consistent identity', () => {
    expect(buildProviderNativeToolSetV2R(['resolve_visual_edit']).toolSetSha256)
      .toBe(FROZEN_V2_RESOLVE_VISUAL_TOOL_SET_SHA256);

    const identity = sealedHoldoutOperatorCatalogIdentityV3R();
    const material = structuredClone(SEALED_HOLDOUT_OPERATOR_CATALOG_V3R) as JsonRecord;
    delete material.catalogSha256;

    expect(identity.catalogSha256).toBe(hashCanonicalJsonV1(material));
    expect(identity.catalogSha256).not.toBe(v2rOperatorCatalogIdentity().catalogSha256);
    expect(identity.derivedFromCatalogSha256).toBe(v2rOperatorCatalogIdentity().catalogSha256);
  });

  it('closes the visual resolver input and its resolver-specific output', () => {
    const tool = operatorTool('resolve_visual_edit');
    const action = record(record(record(tool.exactInputSchema.properties).intent).properties).action;

    expect(record(action).enum).toEqual([
      'inspect', 'cut_range', 'replace_with_matching_source_range',
    ]);
    expect(validateJsonSchemaV2({
      projectId: 'project-1', expectedProjectRevision: 'R1', evidenceIds: ['EV1'],
      intent: { query: 'match the dial at the cut', action: 'replace_with_matching_source_range' },
    }, tool.exactInputSchema, '$.arguments')).toEqual([]);
    expect(validateJsonSchemaV2({
      projectId: 'project-1', expectedProjectRevision: 'R1', evidenceIds: ['EV1'],
      intent: { query: 'match the dial', action: 'highlight' },
    }, tool.exactInputSchema, '$.arguments')).not.toEqual([]);

    const validOutput = {
      proposedOperation: {
        targetOperatorId: 'use_matching_footage',
        arguments: {
          projectId: 'project-1', expectedProjectRevision: 'R1', assetId: 'incoming',
          targetRange: { startFrame: 150, endFrame: 300 },
          sourceRange: { startFrame: 30, endFrame: 180 }, evidenceIds: ['EV1'],
        },
      },
      evidence: { observations: [] },
    };
    expect(validateJsonSchemaV2(validOutput, tool.exactOutputSchema, '$.output')).toEqual([]);
    expect(validateJsonSchemaV2({
      ...validOutput,
      proposedOperation: {
        ...validOutput.proposedOperation,
        arguments: { ...validOutput.proposedOperation.arguments, inventedHandle: 900 },
      },
    }, tool.exactOutputSchema, '$.output')).not.toEqual([]);
  });

  it('closes generated-composition and reframe nested forms', () => {
    const generated = operatorTool('generated_composition_program');
    const generatedArguments = {
      projectId: 'project-1', expectedProjectRevision: 'R1', assetIds: ['a', 'b'],
      targetRange: { startFrame: 20, endFrame: 140 }, referenceBlueprintId: 'ref-1',
      layoutSpec: {
        panelCount: 5, geometry: 'ASYMMETRIC_NORMALIZED_BOUNDS', gutters: true,
        titleSafeBand: { left: 0.2, top: 0.35, width: 0.6, height: 0.3 },
      },
      motionSpec: {
        entryFrames: [20, 40], stableFrames: [40, 110], exitFrames: [110, 140],
        relationship: 'OPPOSED_HORIZONTAL_SIDES_AND_VERTICAL_CENTRE',
      },
      typographySpec: { text: 'EVENT\nMOMENT', alignment: 'CENTER', fontAssetId: 'font-1' },
      constraints: {
        referencePixelsForbidden: true, preserveOutsideRange: true,
        returnBinding: { overlayId: 'clip-7', assetId: 'b', sourceFrame: 120 },
        titleFaceOverlapMaximumPixels: 0,
      },
      evidenceIds: ['EV1'],
    };
    expect(validateJsonSchemaV2(generatedArguments, generated.exactInputSchema, '$.arguments'))
      .toEqual([]);
    expect(validateJsonSchemaV2({
      ...generatedArguments,
      motionSpec: { ...generatedArguments.motionSpec, guessedEasing: 'cinematic' },
    }, generated.exactInputSchema, '$.arguments')).not.toEqual([]);

    const reframe = operatorTool('reframe_project');
    const reframeArguments = {
      projectId: 'project-1', expectedProjectRevision: 'R1',
      reframePlan: {
        targetAspectRatio: '9:16', trackingMode: 'FOLLOW_SPATIAL_EVIDENCE',
        preserveAuthoredLayout: true,
      },
      constraints: { noStaticCenterCrop: true, preserveDuration: true },
    };
    expect(validateJsonSchemaV2(reframeArguments, reframe.exactInputSchema, '$.arguments'))
      .toEqual([]);
    expect(validateJsonSchemaV2({
      ...reframeArguments,
      reframePlan: { ...reframeArguments.reframePlan, hiddenCropX: 0.4 },
    }, reframe.exactInputSchema, '$.arguments')).not.toEqual([]);
  });

  it('resolves matching footage only from explicit windows and sufficient source handles', () => {
    const resolveVisualEdit = SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V3R.resolveVisualEdit;
    expect(resolveVisualEdit).toBeTypeOf('function');
    const base = {
      arguments: {
        projectId: 'project-1', constraints: {
          noDissolve: true, noFlashyEffect: true, preserveContinuity: true,
        },
        intent: { query: 'match the dial', action: 'replace_with_matching_source_range' },
      },
      observations: [
        { kind: 'TIMELINE', value: { boundaryFrame: 150 } },
        { kind: 'VISUAL_WINDOWS', value: {
          incoming: { assetId: 'incoming', validStartFrameWindow: [30, 120] },
        } },
      ],
      evidenceRefs: ['EV1'], project: { durationFrames: 300 },
      media: [{ assetId: 'incoming', durationFrames: 500 }], currentProjectRevision: 'R1',
    };

    expect(resolveVisualEdit?.(base)).toMatchObject({
      targetOperatorId: 'use_matching_footage',
      arguments: {
        expectedProjectRevision: 'R1', assetId: 'incoming',
        targetRange: { startFrame: 150, endFrame: 300 },
        sourceRange: { startFrame: 30, endFrame: 180 },
      },
    });
    expect(() => resolveVisualEdit?.({ ...base, media: [{ assetId: 'incoming' }] }))
      .toThrow('SEALED_V3_VISUAL_MATCH_EVIDENCE_UNVERIFIABLE');
    expect(() => resolveVisualEdit?.({
      ...base, media: [{ assetId: 'incoming', durationFrames: 170 }],
    })).toThrow('SEALED_V3_VISUAL_MATCH_SOURCE_HANDLES_UNVERIFIABLE');
    expect(() => resolveVisualEdit?.({
      ...base,
      observations: [
        { kind: 'TIMELINE', value: { boundaryFrame: 150 } },
        { kind: 'VISUAL_WINDOWS', value: { incoming: {
          assetId: 'incoming', candidateStartFrames: [30, 120],
        } } },
      ],
    })).toThrow('SEALED_V3_VISUAL_MATCH_EVIDENCE_UNVERIFIABLE');
  });
});

function operatorTool(operatorId: string) {
  const identity = sealedHoldoutOperatorCatalogIdentityV3R();
  return buildProviderNativeToolSetFromCatalogV2R({
    eligibleOperatorIds: [operatorId], catalog: SEALED_HOLDOUT_OPERATOR_CATALOG_V3R,
    catalogIdentity: { version: String(identity.version), catalogSha256: String(identity.catalogSha256) },
  }).operators[0];
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
