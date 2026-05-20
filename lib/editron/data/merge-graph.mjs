import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const partsDir = join(__dirname, 'creative-graph-parts');

// Load all parts
const load = f => JSON.parse(readFileSync(join(partsDir, f), 'utf8'));
const parts = [
  load('part-0-intent.json'),
  load('part-1-signals.json'),
  load('part-2-mappings.json'),
  load('part-3-techniques.json'),
  load('part-4-constraints.json'),
  load('part-5-theory.json'),
  load('part-6-constants.json'),
];

// 1. Add missing entity_name signal
parts[1].nodes.push({
  id: 'signal:entity.name',
  type: 'Signal',
  category: 'entity',
  name: 'Entity Name',
  summary: 'Person, company, or product name detected in transcript via NER.',
  details: {
    detection: 'Named Entity Recognition (NER) on transcript — detect PERSON, ORG, PRODUCT entities.',
    output: 'boolean (entity_name = true when a named entity is first mentioned)',
    thresholds: 'First mention triggers lower_third. Repeat within 60s suppressed.',
    rationale: 'Names mentioned once in speech are easily missed. Visual reinforcement ensures the viewer catches the reference.',
    implementsIn: ['lib/editron/services/raw-footage-processor.ts']
  },
  tags: ['NEEDS_CODE'],
  sourceLines: [544, 620]
});

// 2. Technique alias map (Part 2 refs → Part 3 actual IDs)
const techAlias = {
  'technique:zoom.punch': 'technique:zoom.zoom_punch',
  'technique:zoom.push': 'technique:zoom.zoom_push',
  'technique:zoom.pull_back': 'technique:zoom.zoom_pull_back',
  'technique:zoom.drift': 'technique:zoom.zoom_drift',
  'technique:zoom.reset': 'technique:zoom.zoom_reset',
  'technique:transition.bridge': 'technique:transition.dissolve',
  'technique:transition.blur': 'technique:transition.blur_transition',
  'technique:transition.slide': 'technique:transition.slide_transition',
  'technique:speed.ramp': 'technique:speed.speed_ramp',
  'technique:audio.duck_music': 'technique:sound.music_duck',
  'technique:audio.ambient_bed': 'technique:sound.sfx_ambient_bed',
  'technique:audio.crossfade': 'technique:sound.sfx_ambient_bed',
  'technique:audio.sfx_pairing': 'technique:sound.sfx_impact',
  'technique:audio.spot_sfx': 'technique:sound.sfx_spot',
  'technique:audio.editorial_sfx': 'technique:sound.sfx_spot',
  'technique:audio.meaning_design': 'technique:sound.sfx_ambient_bed',
  'technique:audio.world_extension': 'technique:sound.sfx_ambient_bed',
  'technique:audio.music_edit': 'technique:music-knowledge.song_structure_alignment',
  'technique:audio.climax_align': 'technique:music-knowledge.song_structure_alignment',
  'technique:audio.perspective_match': 'technique:sound.sfx_spot',
  'technique:camera.shake': 'technique:other.camera_shake',
  'technique:graphic.stat': 'technique:graphic.stat_counter',
  'technique:graphic.keyword': 'technique:graphic.keyword_highlight',
  'technique:graphic.logo': 'technique:graphic.logo_reveal',
  'technique:graphic.chapter_card': 'technique:graphic.lower_third',
  'technique:caption.emphasis': 'technique:caption.caption_emphasis',
  'technique:caption.activate': 'technique:caption.word_by_word',
  'technique:caption.reposition': 'technique:caption.subtitle_mode',
  'technique:color.base_grade': 'technique:color.color_warm_shift',
  'technique:color.grade_shift': 'technique:color.grade_change',
  'technique:color.normalize': 'technique:color.grade_change',
  'technique:finishing.grain': 'technique:other.film_grain',
  'technique:finishing.vignette': 'technique:other.vignette',
  'technique:pacing.beat_align': 'technique:music-knowledge.song_structure_alignment',
  'technique:pacing.beat_pause': 'technique:sound.silence_beat',
  'technique:pacing.decompression': 'technique:sound.silence_beat',
  'technique:pacing.density_adjust': 'technique:speed.speed_ramp',
  'technique:pacing.extend_hold': 'technique:sound.silence_beat',
  'technique:pacing.increase_density': 'technique:speed.speed_ramp',
  'technique:pacing.shorten_hold': 'technique:speed.speed_ramp',
  'technique:pacing.linger_or_leave': 'technique:sound.silence_beat',
  'technique:pacing.metric_montage': 'technique:music-knowledge.song_structure_alignment',
  'technique:pacing.movement_complete': 'technique:transition.hard_cut',
  'technique:pacing.progressive_increase': 'technique:speed.speed_ramp',
  'technique:pacing.resolution': 'technique:transition.fade_to_black',
  'technique:pacing.section_align': 'technique:music-knowledge.song_structure_alignment',
  'technique:pacing.syncopation': 'technique:music-knowledge.song_structure_alignment',
  'technique:composition.eye_trace': 'technique:shot-type.center_framing',
  'technique:composition.strong_opening': 'technique:shot-type.center_framing',
  'technique:composition.vary_scale': 'technique:shot-type.ms',
  'technique:cut.content_driven': 'technique:transition.hard_cut',
  'technique:cut.dialogue_pattern': 'technique:transition.j_cut',
  'technique:cut.early': 'technique:transition.hard_cut',
  'technique:cut.find_point': 'technique:transition.hard_cut',
  'technique:cut.speech_boundary_lock': 'technique:transition.hard_cut',
  'technique:cut.to_listener': 'technique:transition.hard_cut',
  'technique:hold': 'technique:sound.silence_beat',
  'technique:hold.extended': 'technique:sound.silence_beat',
  'technique:hold.protect_silence': 'technique:sound.silence_beat',
  'technique:humanize.jitter': 'technique:other.camera_shake',
  'technique:layout.stagger_overlays': 'technique:graphic.lower_third',
  'technique:multi.emphasis_stack': 'technique:zoom.zoom_punch',
  'technique:flag.continuity_break': 'technique:transition.hard_cut',
  'technique:flag.mood_mismatch': 'technique:color.grade_change',
  'technique:silence.removal': 'technique:speed.speed_ramp',
};

// Signal alias map
const sigAlias = {
  'signal:composite.emotional_valence': 'signal:speech.emotional_valence',
  'signal:composite.narrative_phase': 'signal:entity.narrative_phase',
  'signal:speech.speaking_rate': 'signal:speech.speaking_rate_wpm',
  'signal:structural.position': 'signal:structural.position_in_video',
  'signal:structural.overlay_count': 'signal:structural.active_overlays_count',
  'signal:structural.scene_type': 'signal:visual.scene_type',
  'signal:structural.formality': 'signal:speech.formality',
  'signal:speech.has_narration': 'signal:speech.energy',
  'signal:speech.speech_end': 'signal:speech.silence_duration_ms',
  'signal:speech.same_angle_compression': 'signal:visual.shot_scale',
  'signal:structural.ai_generated': 'signal:visual.ai_artifact_risk',
  'signal:structural.cut_point': 'signal:structural.time_since_last_cut',
  'signal:structural.edit_density': 'signal:structural.cumulative_edit_density',
  'signal:structural.final_pass': 'signal:structural.position_in_video',
  'signal:structural.machine_precision': 'signal:structural.cumulative_edit_density',
  'signal:structural.overlay_entrance': 'signal:structural.active_overlays_count',
  'signal:structural.platform': 'signal:structural.position_in_video',
  'signal:structural.project_start': 'signal:structural.position_in_video',
  'signal:structural.transition_type': 'signal:structural.time_since_last_cut',
  'signal:structural.zoom_count': 'signal:structural.time_since_last_zoom',
  'signal:visual.frame_obstruction': 'signal:visual.motion_intensity',
  'signal:visual.shape_similarity': 'signal:visual.shot_composition',
  'signal:audio.bgm_duration': 'signal:audio.music_energy',
  'signal:audio.scene_audio': 'signal:audio.ambient_type',
  'signal:entity.content_culture': 'signal:entity.topic_boundary',
  'signal:entity.sequential_content': 'signal:entity.topic_boundary',
};

// 3. Merge all nodes (dedup by ID)
const seenIds = new Set();
const allNodes = [];
for (const part of parts) {
  for (const node of part.nodes) {
    if (!seenIds.has(node.id)) {
      seenIds.add(node.id);
      allNodes.push(node);
    }
  }
}

// 4. Merge all edges + reconcile IDs
let reconciled = 0;
const allEdges = [];
for (const part of parts) {
  for (const edge of part.edges) {
    let changed = false;
    if (techAlias[edge.from]) { edge.from = techAlias[edge.from]; changed = true; }
    if (techAlias[edge.to]) { edge.to = techAlias[edge.to]; changed = true; }
    if (sigAlias[edge.from]) { edge.from = sigAlias[edge.from]; changed = true; }
    if (sigAlias[edge.to]) { edge.to = sigAlias[edge.to]; changed = true; }
    if (changed) reconciled++;
    allEdges.push(edge);
  }
}

// 5. Validate dangling refs
let dangling = 0;
const danglingList = [];
for (const e of allEdges) {
  if (e.from && !seenIds.has(e.from)) { dangling++; danglingList.push(e.from); }
  if (e.to && !seenIds.has(e.to)) { dangling++; danglingList.push(e.to); }
}

// 6. Stats by type
const byType = {};
allNodes.forEach(n => { byType[n.type] = (byType[n.type] || 0) + 1; });

// 7. Build final graph
const graph = {
  version: '3.0',
  source: 'creative_production_knowledge_v3 (1).md',
  extractedAt: '2026-05-03',
  description: 'Complete knowledge graph of the Creative Production Knowledge v3 document. 6 Parts + preamble. Consumed by Unified Intelligence Engine, Director Agent, Anti-pattern Detector, QualityGate, Thompson Sampling, and Claude Code.',
  stats: {
    totalNodes: allNodes.length,
    totalEdges: allEdges.length,
    edgesReconciled: reconciled,
    danglingEdgeRefs: dangling,
    nodesByType: byType,
  },
  aliasMap: { ...techAlias, ...sigAlias },
  nodes: allNodes,
  edges: allEdges,
};

// Write
const outPath = join(__dirname, 'creative-knowledge-graph.json');
writeFileSync(outPath, JSON.stringify(graph, null, 2));

console.log('=== FINAL GRAPH WRITTEN ===');
console.log('Path:', outPath);
console.log('Nodes:', allNodes.length);
console.log('Edges:', allEdges.length);
console.log('Reconciled:', reconciled);
console.log('Dangling refs:', dangling);
if (dangling > 0) {
  const unique = [...new Set(danglingList)].slice(0, 15);
  console.log('First 15 dangling:', unique);
}
console.log('By type:', JSON.stringify(byType, null, 2));
