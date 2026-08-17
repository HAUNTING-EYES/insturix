import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';

type JsonRecord = Record<string, unknown>;

export function buildDev01ProviderRelativeSourceV2() {
  const canonical = getCanonicalDev01Stage123V2();
  const editorialIntent = structuredClone(canonical.editorialIntent);
  const canonicalIntentNodes = new Map(records(editorialIntent.nodes)
    .map((entry) => [text(entry.intentNodeId), entry]));
  const intentNode = (
    sourceId: string, intentNodeId: string, candidateCapabilityIds: string[],
    requiresNodeIds: string[], operationFamily: string,
  ): JsonRecord => ({
    ...structuredClone(required(canonicalIntentNodes, sourceId)),
    intentNodeId, candidateCapabilityIds, requiresNodeIds, operationFamily,
  });
  editorialIntent.nodes = [
    intentNode('node-observe', 'provider-read', ['read_project_file', 'get_timeline_view'], [], 'CONTEXT_READ'),
    intentNode('node-resolve-cut', 'provider-find-transcript', ['find_transcript_moment'], ['provider-read'], 'TRANSCRIPT_FIND'),
    intentNode('node-resolve-cut', 'provider-resolve-transcript', ['resolve_transcript_edit'], ['provider-find-transcript'], 'TRANSCRIPT_RESOLVE'),
    intentNode('node-cut', 'provider-cut', ['cut_section'], ['provider-resolve-transcript'], 'SAFE_CUT'),
    intentNode('node-resolve-post-cut-product', 'provider-find-visual', ['find_visual_moment'], ['provider-read', 'provider-cut'], 'VISUAL_FIND'),
    intentNode('node-resolve-post-cut-product', 'provider-resolve-keyframe', ['resolve_keyframe_edit'], ['provider-find-visual', 'provider-cut'], 'KEYFRAME_RESOLVE'),
    intentNode('node-push-in', 'provider-push', ['set_keyframes'], ['provider-resolve-keyframe'], 'PUSH_IN'),
    intentNode('node-duck', 'provider-find-audio', ['find_audio_moment'], ['provider-read', 'provider-cut'], 'AUDIO_FIND'),
    intentNode('node-duck', 'provider-resolve-audio', ['resolve_audio_edit'], ['provider-find-audio', 'provider-cut'], 'AUDIO_RESOLVE'),
    intentNode('node-duck', 'provider-duck', ['apply_audio_ducking'], ['provider-resolve-audio'], 'BGM_DUCK'),
  ];
  editorialIntent.edges = [];

  const evidenceBoundIntent = structuredClone(canonical.evidenceBoundIntents.BASELINE);
  const canonicalBoundNodes = new Map(records(evidenceBoundIntent.nodes)
    .map((entry) => [text(entry.intentNodeId), entry]));
  const boundNode = (
    sourceId: string, intentNodeId: string, candidateCapabilityIds: string[],
  ): JsonRecord => ({
    ...structuredClone(required(canonicalBoundNodes, sourceId)),
    intentNodeId, candidateCapabilityIds,
  });
  evidenceBoundIntent.nodes = [
    boundNode('node-observe', 'provider-read', ['read_project_file', 'get_timeline_view']),
    boundNode('node-resolve-cut', 'provider-find-transcript', ['find_transcript_moment']),
    boundNode('node-resolve-cut', 'provider-resolve-transcript', ['resolve_transcript_edit']),
    boundNode('node-cut', 'provider-cut', ['cut_section']),
    boundNode('node-resolve-post-cut-product', 'provider-find-visual', ['find_visual_moment']),
    boundNode('node-resolve-post-cut-product', 'provider-resolve-keyframe', ['resolve_keyframe_edit']),
    boundNode('node-push-in', 'provider-push', ['set_keyframes']),
    boundNode('node-duck', 'provider-find-audio', ['find_audio_moment']),
    boundNode('node-duck', 'provider-resolve-audio', ['resolve_audio_edit']),
    boundNode('node-duck', 'provider-duck', ['apply_audio_ducking']),
  ];
  const bindingNodes: Record<string, string[]> = {
    'bind-project': ['provider-read'],
    'bind-transcript': ['provider-find-transcript', 'provider-resolve-transcript', 'provider-cut'],
    'bind-product': ['provider-find-visual', 'provider-resolve-keyframe', 'provider-push'],
    'bind-audio': ['provider-find-audio', 'provider-resolve-audio', 'provider-duck'],
  };
  evidenceBoundIntent.evidenceBindings = records(evidenceBoundIntent.evidenceBindings)
    .map((binding) => ({ ...binding, nodeIds: bindingNodes[text(binding.bindingId)] ?? [] }));

  return {
    referenceBlueprint: canonical.referenceBlueprints.BASELINE,
    editorialIntent,
    evidenceBoundIntent,
    evidencePack: canonical.evidencePacks.BASELINE,
  };
}

function required(map: Map<string, JsonRecord>, key: string): JsonRecord {
  const value = map.get(key);
  if (!value) throw new Error(`Missing canonical node ${key}`);
  return value;
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
