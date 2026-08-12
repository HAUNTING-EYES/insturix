import {
  type CandidateGraphNodeV1,
  type CandidateGraphV1,
} from './contracts-v1';
import { type GraphVerifierPredicateV1 } from './graph-verifier-v1';

export const OE2_DEVELOPMENT_PREDICATE_VERSION_V1 = 'OE2_DEVELOPMENT_PREDICATES_V2';

export function getDevelopmentGraphPredicatesV1(taskId: string): GraphVerifierPredicateV1[] {
  switch (taskId) {
    case 'DEV-01': return dev01Predicates();
    case 'DEV-02': return dev02Predicates();
    case 'DEV-03': return dev03Predicates();
    case 'DEV-04': return dev04Predicates();
    default: throw new TypeError(`No frozen OE-2 development predicates for ${taskId}`);
  }
}

function dev01Predicates(): GraphVerifierPredicateV1[] {
  return [
    predicate('DEV-01-REQUIRED-OPERATIONS', 'Pause removal, product emphasis, and speech ducking operations are required',
      (graph) => hasOperators(graph, ['cut_section', 'set_keyframes', 'apply_audio_ducking'])),
    predicate('DEV-01-EVIDENCE-BOUND-CUT', 'The cut must exactly use transcript-bound dead air [151,196)',
      (graph) => nodes(graph, 'cut_section').some((node) => hasExactDev01CutBinding(graph, node))),
    predicate('DEV-01-BOUNDED-SCALE', 'Product scale keyframes must be local, evidence-bound, and remain within 1.00..1.12',
      (graph) => nodes(graph, 'set_keyframes').some((node) =>
        node.inputs.property === 'scale'
        && node.evidenceIds.includes('EV-DEV01-V1')
        && boundedKeyframes(node.inputs.keyframes, 1, 1.12))),
    predicate('DEV-01-EVIDENCE-BOUND-DUCKING', 'Ducking must be enabled and bound to the measured speech evidence',
      (graph) => nodes(graph, 'apply_audio_ducking').some((node) =>
        node.inputs.enabled === true && node.evidenceIds.includes('EV-DEV01-A1'))),
  ];
}

function dev02Predicates(): GraphVerifierPredicateV1[] {
  return [
    predicate('DEV-02-PANEL-AND-TITLE-COUNT', 'The graph must create five visual panels and one text title', (graph) => {
      const additions = nodes(graph, 'add_overlay');
      return additions.filter((node) => ['image', 'video'].includes(String(node.inputs.type))).length >= 5
        && additions.some((node) => node.inputs.type === 'text');
    }),
    predicate('DEV-02-MOTION-OPERATION', 'At least one resolver-issued keyframe operation is required',
      (graph) => nodes(graph, 'set_keyframes').length > 0),
    predicate('DEV-02-REFERENCE-NOT-INSERTED', 'The reference image is evidence only and must not become graph input',
      (graph) => !containsValue(graph.nodes.map(({ inputs }) => inputs), 'dev02-reference')),
    predicate('DEV-02-EXIT-CONTINUITY', 'One dev02-close panel must end at source frame 180 for continuity into the next shot',
      (graph) => nodes(graph, 'add_overlay').some((node) => {
        const asset = node.inputs.asset ?? node.inputs.content;
        const sourceStart = node.inputs.sourceStart;
        const duration = node.inputs.duration;
        return asset === 'dev02-close'
          && typeof sourceStart === 'number'
          && typeof duration === 'number'
          && sourceStart + duration === 180;
      })),
  ];
}

function dev03Predicates(): GraphVerifierPredicateV1[] {
  return [
    predicate('DEV-03-REQUIRED-OPERATIONS', 'Beat synchronization and a final camera shake are required',
      (graph) => hasOperators(graph, ['sync_cuts_to_beats', 'apply_camera_shake'])),
    predicate('DEV-03-FINAL-HIT-SHAKE', 'The bounded shake must target measured final hit frame 480',
      (graph) => nodes(graph, 'apply_camera_shake').some((node) =>
        node.inputs.targetFrame === 480 && node.evidenceIds.includes('EV-DEV03-B1'))),
    predicate('DEV-03-SAFE-BOUNDARY-MOVES', 'Every declared boundary move must land on a strong beat, stay within 12 frames, and avoid dialogue',
      (graph) => nodes(graph, 'sync_cuts_to_beats').some((node) =>
        node.evidenceIds.includes('EV-DEV03-B1')
        && node.evidenceIds.includes('EV-DEV03-D1')
        && validBoundaryMoves(node.expectedOutputs.boundaryMoves))),
  ];
}

function dev04Predicates(): GraphVerifierPredicateV1[] {
  return [
    predicate('DEV-04-CAPABILITY-GAP', 'Moving matte/tracking must produce a zero-mutation capability gap or clarification',
      (graph) => graph.nodes.length === 0 && graph.edges.length === 0
        && graph.clarifications.length + graph.declines.length > 0),
  ];
}

function predicate(
  predicateId: string,
  message: string,
  evaluate: (graph: CandidateGraphV1) => boolean,
): GraphVerifierPredicateV1 {
  return {
    predicateId,
    version: OE2_DEVELOPMENT_PREDICATE_VERSION_V1,
    message,
    evaluate: ({ graph }) => evaluate(graph),
  };
}

function nodes(graph: CandidateGraphV1, operatorId: string): CandidateGraphNodeV1[] {
  return graph.nodes.filter((node) => node.operatorId === operatorId);
}

function hasOperators(graph: CandidateGraphV1, operatorIds: string[]): boolean {
  const present = new Set(graph.nodes.map(({ operatorId }) => operatorId));
  return operatorIds.every((operatorId) => present.has(operatorId));
}

function hasExactDev01CutBinding(graph: CandidateGraphV1, cut: CandidateGraphNodeV1): boolean {
  if (!cut.evidenceIds.includes('EV-DEV01-T1')) return false;
  if (cut.inputs.startFrame === 151 && cut.inputs.endFrame === 196) return true;
  const startEdge = graph.edges.find((edge) =>
    edge.toNodeId === cut.nodeId && edge.toPort === 'startFrame' && edge.fromPort === 'startFrame');
  const endEdge = graph.edges.find((edge) =>
    edge.toNodeId === cut.nodeId && edge.toPort === 'endFrame' && edge.fromPort === 'endFrame');
  if (!startEdge || !endEdge || startEdge.fromNodeId !== endEdge.fromNodeId) return false;
  const resolver = graph.nodes.find((node) => node.nodeId === startEdge.fromNodeId);
  return resolver?.operatorId === 'resolve_transcript_edit'
    && resolver.evidenceIds.includes('EV-DEV01-T1')
    && resolver.expectedOutputs.startFrame === 151
    && resolver.expectedOutputs.endFrame === 196;
}

function boundedKeyframes(value: unknown, minimum: number, maximum: number): boolean {
  return Array.isArray(value) && value.length >= 2 && value.every((entry) =>
    isRecord(entry) && typeof entry.value === 'number' && entry.value >= minimum && entry.value <= maximum);
}

function validBoundaryMoves(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const strongBeats = new Set([120, 240, 360, 480]);
  return value.every((entry) => {
    if (!isRecord(entry)) return false;
    const from = numericField(entry, ['fromFrame', 'originalFrame', 'boundaryFrame']);
    const to = numericField(entry, ['toFrame', 'targetFrame', 'beatFrame']);
    return from !== undefined && to !== undefined
      && Math.abs(to - from) <= 12
      && strongBeats.has(to)
      && (to < 250 || to >= 350);
  });
}

function numericField(value: Record<string, unknown>, names: string[]): number | undefined {
  for (const name of names) if (typeof value[name] === 'number') return value[name] as number;
  return undefined;
}

function containsValue(value: unknown, expected: string): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((entry) => containsValue(entry, expected));
  return isRecord(value) && Object.values(value).some((entry) => containsValue(entry, expected));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
