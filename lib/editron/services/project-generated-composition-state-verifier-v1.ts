import {
  projectGeneratedCompositionStateSchemaV1,
  type ProjectGeneratedCompositionStateV1,
} from './project-generated-composition-state-v1';

export interface ProjectGeneratedCompositionStateVerificationV1 {
  disposition: 'PASS' | 'FAIL';
  diagnostics: readonly string[];
}

export class ProjectGeneratedCompositionStateValidationErrorV1 extends Error {
  readonly code = 'PROJECT_GENERATED_COMPOSITION_STATE_INVALID';

  constructor(readonly diagnostics: readonly string[]) {
    super(`Generated composition state is invalid: ${diagnostics.join(', ')}`);
    this.name = 'ProjectGeneratedCompositionStateValidationErrorV1';
  }
}

export function parseProjectGeneratedCompositionStateV1(
  value: unknown,
): ProjectGeneratedCompositionStateV1 {
  const parsed = projectGeneratedCompositionStateSchemaV1.safeParse(value);
  if (!parsed.success) {
    throw new ProjectGeneratedCompositionStateValidationErrorV1(
      parsed.error.issues.map((issue) => `SCHEMA:${issue.path.join('.')}:${issue.message}`).sort(),
    );
  }
  const verification = verifyProjectGeneratedCompositionStateV1(parsed.data);
  if (verification.disposition === 'FAIL') {
    throw new ProjectGeneratedCompositionStateValidationErrorV1(verification.diagnostics);
  }
  return parsed.data;
}

export function verifyProjectGeneratedCompositionStateV1(
  state: ProjectGeneratedCompositionStateV1,
): ProjectGeneratedCompositionStateVerificationV1 {
  const diagnostics: string[] = [];
  const add = (condition: boolean, code: string) => {
    if (condition) diagnostics.push(code);
  };

  add(state.programRef.boundProjectId !== state.projectId, 'PROGRAM_CROSS_PROJECT');
  add(
    state.placement.projectTimebase.scope !== 'PROJECT'
      || state.placement.projectTimebase.scopeId !== state.projectId,
    'PROJECT_TIMEBASE_SCOPE_INVALID',
  );
  add(
    state.placement.compositionTimebase.scope !== 'COMPOSITION'
      || state.placement.compositionTimebase.scopeId !== state.compositionId,
    'COMPOSITION_TIMEBASE_SCOPE_INVALID',
  );
  add(state.placement.compositionRange.startTick !== '0', 'COMPOSITION_RANGE_NOT_ZERO_BASED');

  const rates = [
    state.placement.projectTimebase.rate,
    state.placement.compositionTimebase.rate,
    state.canvas.pixelAspectRatio,
    ...state.sourceBindings.flatMap((binding) => binding.mediaKind === 'VIDEO' ? [binding.sourceTimebase.rate] : []),
    ...state.dependencyBindings.map(({ sourceTimebase }) => sourceTimebase.rate),
    ...state.renderArtifacts.map(({ frameRate }) => frameRate),
  ];
  add(rates.some((rate) => !isReducedRate(rate)), 'NON_REDUCED_RATIONAL_RATE');
  add(!validRange(state.placement.projectRange), 'PROJECT_RANGE_INVALID');
  add(!validRange(state.placement.compositionRange), 'COMPOSITION_RANGE_INVALID');
  add(
    validRange(state.placement.projectRange)
      && validRange(state.placement.compositionRange)
      && !durationsEqual(
        state.placement.projectRange,
        state.placement.projectTimebase.rate,
        state.placement.compositionRange,
        state.placement.compositionTimebase.rate,
      ),
    'PLACEMENT_DURATION_MISMATCH',
  );

  const head = BigInt(state.placement.headHandleTicks);
  const tail = BigInt(state.placement.tailHandleTicks);
  add(
    state.placement.handlePolicy === 'LOCKED_BOUNDARY_NO_TRIM'
      && (head !== BigInt(0) || tail !== BigInt(0)),
    'LOCKED_BOUNDARY_HAS_HANDLES',
  );
  add(
    state.placement.handlePolicy === 'DECLARED_HANDLES'
      && head === BigInt(0) && tail === BigInt(0),
    'DECLARED_HANDLES_EMPTY',
  );

  checkUnique(state.sourceBindings.map(({ slotId }) => slotId), 'SOURCE_SLOT_DUPLICATE', diagnostics);
  checkUnique(state.dependencyBindings.map(({ dependencyId }) => dependencyId), 'DEPENDENCY_ID_DUPLICATE', diagnostics);
  checkUnique(state.fontBindings.map(({ slotId }) => slotId), 'FONT_SLOT_DUPLICATE', diagnostics);
  checkUnique(state.exposedControls.map(({ parameterId }) => parameterId), 'CONTROL_ID_DUPLICATE', diagnostics);
  checkUnique(state.audioCueIntents.map(({ cueId }) => cueId), 'AUDIO_CUE_ID_DUPLICATE', diagnostics);
  checkUnique(state.renderArtifacts.map(({ stage }) => stage), 'RENDER_STAGE_DUPLICATE', diagnostics);

  const sources = new Map(state.sourceBindings.map((binding) => [binding.slotId, binding]));
  state.sourceBindings.forEach((binding) => {
    if (binding.mediaKind !== 'VIDEO') return;
    add(!validRange(binding.sourceRange), `SOURCE_RANGE_INVALID:${binding.slotId}`);
    add(
      binding.sourceTimebase.scope !== 'SOURCE'
        || binding.sourceTimebase.scopeId !== binding.asset.artifactId,
      `SOURCE_TIMEBASE_SCOPE_INVALID:${binding.slotId}`,
    );
  });
  state.dependencyBindings.forEach((binding) => {
    const source = sources.get(binding.sourceSlotId);
    add(!validRange(binding.sourceRange), `DEPENDENCY_RANGE_INVALID:${binding.dependencyId}`);
    add(!source || source.mediaKind !== 'VIDEO', `DEPENDENCY_SOURCE_MISSING:${binding.dependencyId}`);
    if (source?.mediaKind === 'VIDEO') {
      add(
        binding.sourceTimebase.timebaseId !== source.sourceTimebase.timebaseId
          || binding.sourceTimebase.version !== source.sourceTimebase.version
          || !sameRate(binding.sourceTimebase.rate, source.sourceTimebase.rate),
        `DEPENDENCY_TIMEBASE_MISMATCH:${binding.dependencyId}`,
      );
      add(
        BigInt(binding.sourceRange.startTick) < BigInt(source.sourceRange.startTick)
          || BigInt(binding.sourceRange.endExclusiveTick) > BigInt(source.sourceRange.endExclusiveTick),
        `DEPENDENCY_RANGE_OUTSIDE_SOURCE:${binding.dependencyId}`,
      );
    }
  });

  state.exposedControls.forEach((control) => {
    if (control.kind === 'STRING') add(control.value.length > control.maximumLength, `CONTROL_STRING_TOO_LONG:${control.parameterId}`);
    if (control.kind === 'NUMBER') {
      add(
        control.minimum > control.maximum
          || control.value < control.minimum
          || control.value > control.maximum,
        `CONTROL_NUMBER_OUT_OF_RANGE:${control.parameterId}`,
      );
    }
  });

  const contentTicks = validRange(state.placement.compositionRange)
    ? rangeDuration(state.placement.compositionRange)
    : BigInt(0);
  const renderedTicks = contentTicks + head + tail;
  state.audioCueIntents.forEach((cue) => {
    add(BigInt(cue.localTick) >= contentTicks, `AUDIO_CUE_OUTSIDE_CONTENT:${cue.cueId}`);
  });
  state.renderArtifacts.forEach((artifact) => {
    add(artifact.boundStateToken !== state.stateIdentity.token, `RENDER_STATE_STALE:${artifact.stage}`);
    add(
      artifact.programDigest.value !== state.programRef.programArtifact.digest.value,
      `RENDER_PROGRAM_MISMATCH:${artifact.stage}`,
    );
    add(
      artifact.width !== state.canvas.width
        || artifact.height !== state.canvas.height
        || !sameRate(artifact.frameRate, state.placement.compositionTimebase.rate),
      `RENDER_FORMAT_MISMATCH:${artifact.stage}`,
    );
    add(
      BigInt(artifact.durationTicks) !== renderedTicks
        || BigInt(artifact.contentOffsetTicks) !== head,
      `RENDER_HANDLE_BINDING_INVALID:${artifact.stage}`,
    );
    add(artifact.outputKind !== state.output.kind, `RENDER_OUTPUT_KIND_MISMATCH:${artifact.stage}`);
  });

  verifyProofLifecycle(state, diagnostics);
  return {
    disposition: diagnostics.length === 0 ? 'PASS' : 'FAIL',
    diagnostics: [...new Set(diagnostics)].sort(compareCodeUnits),
  };
}

function verifyProofLifecycle(
  state: ProjectGeneratedCompositionStateV1,
  diagnostics: string[],
): void {
  if (state.verificationDisposition === 'PENDING') {
    if (state.proof !== null) diagnostics.push('PENDING_STATE_HAS_PROOF');
    if (state.renderArtifacts.some(({ stage }) => stage === 'FINAL')) diagnostics.push('PENDING_STATE_HAS_FINAL_RENDER');
    return;
  }
  if (!state.proof) {
    diagnostics.push('TERMINAL_STATE_MISSING_PROOF');
    return;
  }
  if (state.proof.boundStateToken !== state.stateIdentity.token) diagnostics.push('PROOF_STATE_STALE');
  if (state.proof.programDigest.value !== state.programRef.programArtifact.digest.value) diagnostics.push('PROOF_PROGRAM_MISMATCH');
  if (state.proof.status !== state.verificationDisposition) diagnostics.push('PROOF_DISPOSITION_MISMATCH');
  if (state.proof.status !== aggregateProofStatus(state.proof.observations)) diagnostics.push('PROOF_OBSERVATION_AGGREGATE_MISMATCH');
  if (state.verificationDisposition === 'PASS' && !state.renderArtifacts.some(({ stage }) => stage === 'PREVIEW')) {
    diagnostics.push('PASS_MISSING_PREVIEW_RENDER');
  }
  if (state.renderArtifacts.some(({ stage }) => stage === 'FINAL') && state.verificationDisposition !== 'PASS') {
    diagnostics.push('FINAL_RENDER_WITHOUT_PASS');
  }
}

function validRange(range: { startTick: string; endExclusiveTick: string }): boolean {
  return BigInt(range.endExclusiveTick) > BigInt(range.startTick);
}

function rangeDuration(range: { startTick: string; endExclusiveTick: string }): bigint {
  return BigInt(range.endExclusiveTick) - BigInt(range.startTick);
}

function isReducedRate(rate: { numerator: string; denominator: string }): boolean {
  return greatestCommonDivisor(BigInt(rate.numerator), BigInt(rate.denominator)) === BigInt(1);
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a;
}

function sameRate(
  left: { numerator: string; denominator: string },
  right: { numerator: string; denominator: string },
): boolean {
  return BigInt(left.numerator) * BigInt(right.denominator)
    === BigInt(right.numerator) * BigInt(left.denominator);
}

function durationsEqual(
  leftRange: { startTick: string; endExclusiveTick: string },
  leftRate: { numerator: string; denominator: string },
  rightRange: { startTick: string; endExclusiveTick: string },
  rightRate: { numerator: string; denominator: string },
): boolean {
  return rangeDuration(leftRange) * BigInt(leftRate.denominator) * BigInt(rightRate.numerator)
    === rangeDuration(rightRange) * BigInt(rightRate.denominator) * BigInt(leftRate.numerator);
}

function aggregateProofStatus(
  observations: readonly { required: boolean; status: 'PASS' | 'FAIL' | 'UNVERIFIABLE' }[],
): 'PASS' | 'FAIL' | 'UNVERIFIABLE' {
  const required = observations.filter(({ required: isRequired }) => isRequired);
  if (required.some(({ status }) => status === 'FAIL')) return 'FAIL';
  if (required.length === 0 || required.some(({ status }) => status === 'UNVERIFIABLE')) return 'UNVERIFIABLE';
  return 'PASS';
}

function checkUnique(values: readonly string[], code: string, diagnostics: string[]): void {
  if (new Set(values).size !== values.length) diagnostics.push(code);
}

function compareCodeUnits(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
