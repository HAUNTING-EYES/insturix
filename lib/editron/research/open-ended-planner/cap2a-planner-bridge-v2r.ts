import { deepFreezeV1 } from './contracts-v1';

// V2-1F bridge between the executable planner operator catalog
// (operator-specs-v2.json, the IDs the lowerer compiles) and the rich CAP-2A
// atomic-operation census (the code-grounded 16-dimension tool sheet).
//
// The two catalogs use different identifier schemes and were built for different
// purposes: the spec catalog is the executable contract the lowerer binds; CAP-2A
// is the truth census of what actually exists. Their correspondence is semantic,
// not mechanical — only 8 of 37 CAP-2A entrypoint symbols literally equal a spec
// operatorId. This bridge is therefore a declared, versioned mapping with an
// explicit confidence per row, not an inferred one. Rows marked UNVERIFIED are a
// semantic best-match that a reconciliation pass must confirm before the dossier
// is treated as ground truth for that operator.

export const CAP2A_PLANNER_BRIDGE_VERSION_V2R = 'EDITRON_OE_CAP2A_PLANNER_BRIDGE_V2R' as const;

export type Cap2aBridgeConfidenceV2R = 'ENTRYPOINT_EXACT' | 'SEMANTIC' | 'UNVERIFIED';

export interface Cap2aBridgeRowV2R {
  specOperatorId: string;
  cap2aOperatorId: string;
  confidence: Cap2aBridgeConfidenceV2R;
}

export interface Cap2aPlannerBridgeV2R {
  bridgeVersion: typeof CAP2A_PLANNER_BRIDGE_VERSION_V2R;
  authority: 'RESEARCH_ONLY_DECLARED_SEMANTIC_MAPPING';
  rows: readonly Cap2aBridgeRowV2R[];
}

// Declared mapping. ENTRYPOINT_EXACT = the CAP-2A record's surfaces.entrypoints
// symbol literally equals the spec operatorId (machine-verified). SEMANTIC = the
// CAP-2A record describes the same atomic operation under a different identifier
// (reconciliation-confirmed family/entrypoint). UNVERIFIED = best-effort semantic
// match pending a reconciliation pass.
const BRIDGE_ROWS: readonly Cap2aBridgeRowV2R[] = [
  // Reads / analysis / resolvers (entrypoint-verified where the symbol matches).
  { specOperatorId: 'read_project_file', cap2aOperatorId: 'project.read', confidence: 'SEMANTIC' },
  { specOperatorId: 'get_timeline_view', cap2aOperatorId: 'timeline.read-view', confidence: 'SEMANTIC' },
  { specOperatorId: 'list_user_assets', cap2aOperatorId: 'asset.list', confidence: 'ENTRYPOINT_EXACT' },
  { specOperatorId: 'search_user_assets', cap2aOperatorId: 'asset.search', confidence: 'ENTRYPOINT_EXACT' },
  { specOperatorId: 'inspect_user_asset', cap2aOperatorId: 'asset.inspect', confidence: 'ENTRYPOINT_EXACT' },
  { specOperatorId: 'resolve_user_asset_overlay', cap2aOperatorId: 'asset.resolve-placement', confidence: 'ENTRYPOINT_EXACT' },
  { specOperatorId: 'find_transcript_moment', cap2aOperatorId: 'transcript.find-moment', confidence: 'ENTRYPOINT_EXACT' },
  { specOperatorId: 'resolve_transcript_edit', cap2aOperatorId: 'transcript.resolve-edit', confidence: 'ENTRYPOINT_EXACT' },
  { specOperatorId: 'find_visual_moment', cap2aOperatorId: 'visual.find-moment', confidence: 'SEMANTIC' },
  { specOperatorId: 'resolve_visual_edit', cap2aOperatorId: 'visual.resolve-edit', confidence: 'SEMANTIC' },
  { specOperatorId: 'resolve_keyframe_edit', cap2aOperatorId: 'visual.resolve-keyframe', confidence: 'SEMANTIC' },
  { specOperatorId: 'find_audio_moment', cap2aOperatorId: 'audio.find-moment', confidence: 'ENTRYPOINT_EXACT' },
  { specOperatorId: 'resolve_audio_edit', cap2aOperatorId: 'audio.resolve-edit', confidence: 'ENTRYPOINT_EXACT' },
  // Mutations (semantic match on the atomic action).
  { specOperatorId: 'set_keyframes', cap2aOperatorId: 'keyframe.set-one', confidence: 'SEMANTIC' },
  { specOperatorId: 'apply_camera_shake', cap2aOperatorId: 'visual.apply-camera-shake', confidence: 'SEMANTIC' },
  { specOperatorId: 'apply_fade', cap2aOperatorId: 'visual.apply-fade', confidence: 'SEMANTIC' },
  { specOperatorId: 'apply_filter', cap2aOperatorId: 'visual.apply-filter', confidence: 'SEMANTIC' },
  { specOperatorId: 'apply_speed_ramp', cap2aOperatorId: 'visual.apply-speed-ramp', confidence: 'SEMANTIC' },
  { specOperatorId: 'move_retime_overlay', cap2aOperatorId: 'visual.move-retime', confidence: 'SEMANTIC' },
  { specOperatorId: 'reorder_layer', cap2aOperatorId: 'visual.reorder-layer', confidence: 'SEMANTIC' },
  { specOperatorId: 'add_overlay', cap2aOperatorId: 'overlay.add', confidence: 'SEMANTIC' },
  { specOperatorId: 'update_overlay', cap2aOperatorId: 'overlay.update-one', confidence: 'SEMANTIC' },
  { specOperatorId: 'delete_overlay', cap2aOperatorId: 'overlay.delete-one', confidence: 'SEMANTIC' },
  { specOperatorId: 'sync_cuts_to_beats', cap2aOperatorId: 'music.beat-sync', confidence: 'SEMANTIC' },
  { specOperatorId: 'add_captions', cap2aOperatorId: 'caption.canonical-install', confidence: 'SEMANTIC' },
  { specOperatorId: 'generated_composition_program', cap2aOperatorId: 'generated-composition.prepare', confidence: 'SEMANTIC' },
];

export const CAP2A_PLANNER_BRIDGE_V2R: Readonly<Cap2aPlannerBridgeV2R> = deepFreezeV1({
  bridgeVersion: CAP2A_PLANNER_BRIDGE_VERSION_V2R,
  authority: 'RESEARCH_ONLY_DECLARED_SEMANTIC_MAPPING',
  rows: BRIDGE_ROWS,
});

export function cap2aOperatorIdForSpecOperatorV2R(specOperatorId: string): string | null {
  const row = BRIDGE_ROWS.find((candidate) => candidate.specOperatorId === specOperatorId);
  return row ? row.cap2aOperatorId : null;
}

export function cap2aBridgeConfidenceV2R(specOperatorId: string): Cap2aBridgeConfidenceV2R | null {
  const row = BRIDGE_ROWS.find((candidate) => candidate.specOperatorId === specOperatorId);
  return row ? row.confidence : null;
}
