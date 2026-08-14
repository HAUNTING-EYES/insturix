import { describe, expect, it } from 'vitest';

import { sha256TextV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildDev02GeneratedCompositionModelPacketV1,
  materializeDev02GeneratedCompositionModelCandidateV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-model-candidate-v1';
import { verifyGeneratedCompositionProgramV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

const API_HASH = 'a'.repeat(64);
const PROMPT_HASH = 'b'.repeat(64);

describe('open-ended planner V2 model-generated composition candidate', () => {
  it('builds a stable source-synthesis packet without leaking the human implementation', () => {
    const first = buildDev02GeneratedCompositionModelPacketV1({ apiImplementationHash: API_HASH });
    const second = buildDev02GeneratedCompositionModelPacketV1({ apiImplementationHash: API_HASH });
    const serialized = JSON.stringify(first);
    expect(first).toEqual(second);
    expect(first.packetHash).toHaveLength(64);
    expect(first.transportAttachments).toEqual([]);
    expect(serialized).not.toContain(DEV02_GENERATED_COMPOSITION_SOURCE_V1);
    expect(serialized).not.toContain(DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1.files[0].sha256);
    expect(serialized).not.toContain('const centreTravel');
    expect(serialized).not.toContain('exitSourceFrame');
    expect(serialized).toContain('claim-ref-opposed-motion');
    expect(serialized).toContain('@editron/generated-composition-api/v1');
  });

  it('binds accepted source to model and prompt identity before the canonical verifier', () => {
    const candidate = materializeDev02GeneratedCompositionModelCandidateV1({
      source: DEV02_GENERATED_COMPOSITION_SOURCE_V1,
      modelId: 'benchmark-model',
      promptHash: PROMPT_HASH,
      candidateOrdinal: 0,
    });
    const verification = verifyGeneratedCompositionProgramV1({
      ...candidate,
      evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
      referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
      supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
    });
    expect(verification.disposition).toBe('CONTRACT_PASS');
    expect(candidate.program.generator).toMatchObject({
      kind: 'MODEL_GENERATED', modelId: 'benchmark-model', promptHash: PROMPT_HASH,
    });
    expect(candidate.program.sourceBundleHash).toBe(verification.sourceBundleHash);
  });

  it('does not hide an unsafe model repair behind rehashing', () => {
    const unsafe = DEV02_GENERATED_COMPOSITION_SOURCE_V1.replace(
      'const frame = useCurrentFrame();',
      "const frame = useCurrentFrame(); fetch('https://example.com/escape');",
    );
    const candidate = materializeDev02GeneratedCompositionModelCandidateV1({
      source: unsafe, modelId: 'benchmark-model', promptHash: PROMPT_HASH, candidateOrdinal: 1,
    });
    const verification = verifyGeneratedCompositionProgramV1({
      ...candidate,
      evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
      referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
      supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
    });
    expect(candidate.sourceBundle.files[0].sha256).toBe(sha256TextV1(unsafe));
    expect(verification.disposition).toBe('CONTRACT_FAIL');
    expect(verification.diagnostics).toEqual(expect.arrayContaining([
      'SOURCE_DANGEROUS_NETWORK_FETCH:GeneratedComposition.tsx',
      'SOURCE_EXTERNAL_LOCATION_FORBIDDEN:GeneratedComposition.tsx',
    ]));
  });
});
