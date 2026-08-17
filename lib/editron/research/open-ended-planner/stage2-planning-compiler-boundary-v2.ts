import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HashedStagePacketV2 } from './staged-packet-v2';

export const STAGE2_PLANNING_COMPILER_BOUNDARY_V2 = deepFreezeV1({
  boundaryVersion: 'EDITRON_OE_STAGE2_PLANNING_COMPILER_BOUNDARY_V2',
  purpose: 'Separate editorial orchestration from deterministic runtime scaffolding.',
  modelOwns: [
    'target-claim coverage and preservation intent',
    'native, generated-composition, hybrid, or capability-gap routing',
    'semantic operation and resolver families',
    'dependencies whose order changes the requested editorial result',
    'source resolution before a generated island and native continuation after it',
    'ambiguity, unsupported capability, and clarification decisions',
  ],
  compilerOwns: [
    'initial project and timeline reads required only to bind current state',
    'catalog READ adapters mechanically implied by a bound resolver',
    'exact operator arguments, ports, revision propagation, and receipt wiring',
    'post-mutation project, timeline, render, visual, and audio proof reads',
    'idempotency, concurrency, retry, undo, resource, and failure scaffolding',
  ],
  rules: {
    editorialDependencyRule:
      'The model must order semantic operations when an earlier edit changes the identity, range, timing, or evidence consumed by a later edit.',
    proofRule:
      'The model declares what must be proven; the deterministic compiler materializes the read and proof nodes that perform that proof.',
    resolverRule:
      'The model selects the resolver family. The compiler may insert a catalog READ adapter when Stage-3 evidence bindings require one and that adapter does not change editorial meaning.',
    ambiguityRule:
      'The model must not leave multiple nodes eligible for the same required semantic role unless it records an unresolved alternative; the compiler never guesses between editorially distinct candidates.',
    noBoilerplateFailureRule:
      'A Stage-2 artifact must not fail solely because it omitted compiler-owned read, proof, revision, receipt, or concurrency scaffolding.',
  },
});

export function attachStage2PlanningCompilerBoundaryV2(
  source: HashedStagePacketV2,
): HashedStagePacketV2 {
  if (source.packet.stage !== 2) {
    throw new Error('PLANNING_COMPILER_BOUNDARY_STAGE_INVALID');
  }
  if (source.packet.modelInput.planningCompilerBoundary !== undefined) {
    throw new Error('PLANNING_COMPILER_BOUNDARY_ALREADY_ATTACHED');
  }
  const packet = deepFreezeV1({
    ...source.packet,
    modelInput: {
      ...source.packet.modelInput,
      planningCompilerBoundary: STAGE2_PLANNING_COMPILER_BOUNDARY_V2,
    },
  });
  return deepFreezeV1({
    packet,
    packetHash: hashCanonicalJsonV1(packet),
    transportAttachments: source.transportAttachments,
    transportHash: source.transportHash,
  });
}
