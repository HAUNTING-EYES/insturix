import { describe, expect, it } from 'vitest';

import { sha256TextV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  hashGeneratedCompositionSourceBundleV1,
  type GeneratedCompositionProgramV1,
  type GeneratedCompositionSourceBundleV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-program-v1';
import { verifyGeneratedCompositionProgramV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

describe('open-ended planner V2 GeneratedCompositionProgramV1 contract', () => {
  it('accepts the source-bound DEV-02 contract while keeping it non-executable', () => {
    const verification = verify(fixture());
    expect(verification).toMatchObject({
      disposition: 'CONTRACT_PASS', executionEligibility: 'NOT_EXECUTABLE', diagnostics: [],
    });
    expect(verification.programHash).toBe('cfe91e0aa264b237d2c019a7216e4c725da632b32b1273afa5da4cc12e035cb7');
    expect(verification.sourceBundleHash).toBe('08529169c0a466d5bbc2ca947e9479bfaf1ec169a85da715e7f098b29799779a');
    expect(DEV02_GENERATED_COMPOSITION_PROGRAM_V1.declaredLayers.filter(({ kind }) => kind === 'SOURCE_PANEL')).toHaveLength(5);
  });

  it('rejects source tampering and rehashed unsafe or undeclared source', () => {
    const tampered = fixture();
    tampered.sourceBundle.files[0].source += '\n// drift';
    expect(verify(tampered).diagnostics).toContain('SOURCE_FILE_HASH_OR_PATH_INVALID:GeneratedComposition.tsx');

    const network = fixture();
    rebindSource(network, network.sourceBundle.files[0].source.replace(
      'const frame = useCurrentFrame();',
      "const frame = useCurrentFrame(); fetch('https://example.com/escape');",
    ));
    expect(verify(network).diagnostics).toEqual(expect.arrayContaining([
      'SOURCE_DANGEROUS_NETWORK_FETCH:GeneratedComposition.tsx',
      'SOURCE_EXTERNAL_LOCATION_FORBIDDEN:GeneratedComposition.tsx',
    ]));

    const undeclared = fixture();
    rebindSource(undeclared, undeclared.sourceBundle.files[0].source.replace(
      "import React from 'react';",
      "import unsafe from 'not-allowed';",
    ));
    expect(verify(undeclared).diagnostics).toContain('SOURCE_IMPORT_FORBIDDEN:GeneratedComposition.tsx/not-allowed');
  });

  it('rejects stale revisions, illegal ranges, float rates, state effects, and unlicensed fonts', () => {
    const stale = fixture(); stale.program.projectBinding.expectedProjectRevision = 'R2';
    expect(verify(stale).diagnostics).toContain('PROJECT_REVISION_DRIFT');

    const range = fixture(); range.program.sourceSlots[0].sourceRange.endExclusive = '300';
    expect(verify(range).diagnostics).toContain('SOURCE_RANGE_UNAUTHORISED:source-wide');

    const floatRate = fixture(); floatRate.program.compositionTimebase.rate.numerator = '29.97';
    expect(verify(floatRate).diagnostics).toContain('COMPOSITION_RATE_CONVERSION_UNDECLARED');

    const effect = fixture(); effect.program.stateEffects = ['project.timeline.write'];
    expect(verify(effect).diagnostics).toContain('SECURITY_OR_STATE_EFFECT_POLICY_DRIFT');

    const font = fixture(); font.supplementalFacts[0].rightsStatus = 'UNKNOWN';
    expect(verify(font).diagnostics).toContain('FONT_IDENTITY_OR_RIGHTS_DRIFT:font-title');
  });
});

function verify(value: Fixture) {
  return verifyGeneratedCompositionProgramV1({
    program: value.program,
    sourceBundle: value.sourceBundle,
    evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
    referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
    supplementalFacts: value.supplementalFacts,
  });
}

function fixture(): Fixture {
  return structuredClone({
    program: DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
    sourceBundle: DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
    supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
  }) as unknown as Fixture;
}

function rebindSource(value: Fixture, source: string): void {
  value.sourceBundle.files[0].source = source;
  value.sourceBundle.files[0].sha256 = sha256TextV1(source);
  value.program.sourceBundleHash = hashGeneratedCompositionSourceBundleV1(value.sourceBundle);
}

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object ? { -readonly [Key in keyof T]: Mutable<T[Key]> } : T;
type MutableProgram = Omit<Mutable<GeneratedCompositionProgramV1>, 'stateEffects'> & { stateEffects: unknown[] };
interface Fixture {
  program: MutableProgram;
  sourceBundle: Mutable<GeneratedCompositionSourceBundleV1>;
  supplementalFacts: Array<Record<string, unknown>>;
}
