/**
 * Blueprint Engine - Requirement Graphs
 *
 * Defines the mapping between project complexity levels and the required
 * artifact types (documents) that ThinkForge should generate.
 *
 * Each blueprint is a static "To-Do list" of artifact types.
 * The Discovery Agent uses this as a reference when proposing blueprints.
 */

import type { ProjectComplexity, DocumentType } from '../state/types';

export interface ArtifactSpec {
  type: DocumentType;
  label: string;
  description: string;
  priority: 'required' | 'recommended' | 'optional';
}

export interface Blueprint {
  complexity: ProjectComplexity;
  label: string;
  description: string;
  artifacts: ArtifactSpec[];
}

// ---------------------------------------------------------------------------
// Predefined Blueprints
// ---------------------------------------------------------------------------

const UGC_BLUEPRINT: Blueprint = {
  complexity: 'solo_ugc',
  label: 'UGC / Short-Form',
  description: 'Solo creator content: reels, shorts, ads, social posts.',
  artifacts: [
    { type: 'screenplay', label: 'Script', description: 'Hook, body, CTA script with timing.', priority: 'required' },
    { type: 'shot_list', label: 'B-Roll List', description: 'Suggested B-roll clips and overlay assets.', priority: 'recommended' },
    { type: 'research_brief', label: 'SEO / Repurposing Plan', description: 'Platform-specific optimization and repurposing angles.', priority: 'optional' },
  ],
};

const BRAND_DOC_BLUEPRINT: Blueprint = {
  complexity: 'brand_doc',
  label: 'Brand Documentary',
  description: 'Interview-based branded content, narrative arc, 2-10 min.',
  artifacts: [
    { type: 'screenplay', label: 'Narrative Arc', description: 'The story structure and interview weave.', priority: 'required' },
    { type: 'interview_questions', label: 'Interview Questions', description: 'Prepared questions for subjects.', priority: 'required' },
    { type: 'shot_list', label: 'Archive Footage List', description: 'Archive and B-roll footage needed.', priority: 'recommended' },
    { type: 'score_direction', label: 'Soundscape Direction', description: 'Music and ambient audio direction.', priority: 'optional' },
  ],
};

const SHORT_FILM_BLUEPRINT: Blueprint = {
  complexity: 'short_film',
  label: 'Short Film / Branded',
  description: 'High-end branded content or short film, multi-crew.',
  artifacts: [
    { type: 'screenplay', label: 'Screenplay', description: 'Standard screenplay format with scenes.', priority: 'required' },
    { type: 'shot_list', label: 'Shot List', description: 'Detailed shot breakdown with framing.', priority: 'required' },
    { type: 'character_bible', label: 'Character Notes', description: 'Character motivations and arcs.', priority: 'recommended' },
    { type: 'score_direction', label: 'Score Direction', description: 'Music cues per scene.', priority: 'recommended' },
    { type: 'budget', label: 'Production Budget', description: 'Cost estimates for locations, crew, gear.', priority: 'optional' },
  ],
};

const FEATURE_FILM_BLUEPRINT: Blueprint = {
  complexity: 'feature_film',
  label: 'Feature Film',
  description: 'Feature-length production with full crew, 60-120+ min.',
  artifacts: [
    { type: 'screenplay', label: 'Screenplay', description: 'Full screenplay in standard industry format.', priority: 'required' },
    { type: 'character_bible', label: 'Character Backstories', description: 'Deep character bibles with arcs.', priority: 'required' },
    { type: 'shot_list', label: 'Shot List / Storyboard', description: 'Shot-by-shot visual plan.', priority: 'required' },
    { type: 'vfx_brief', label: 'VFX Brief', description: 'Visual effects requirements per scene.', priority: 'recommended' },
    { type: 'score_direction', label: 'Score Direction', description: 'Emotional music direction per act.', priority: 'recommended' },
    { type: 'budget', label: 'Production Budget', description: 'Line-item budget and resource plan.', priority: 'recommended' },
  ],
};

const EPIC_BLUEPRINT: Blueprint = {
  complexity: 'epic',
  label: 'Epic / Franchise',
  description: 'Multi-project universe. Multiple interconnected scripts and documents.',
  artifacts: [
    { type: 'screenplay', label: 'Plot Beats / Screenplay', description: 'High-level plot and detailed screenplay.', priority: 'required' },
    { type: 'world_bible', label: 'World-Building Bible', description: 'Rules, physics, history of the universe.', priority: 'required' },
    { type: 'character_bible', label: 'Character Bible', description: 'Character arcs, powers, relationships.', priority: 'required' },
    { type: 'vfx_brief', label: 'VFX Brief', description: 'CGI requirements cross-referenced with screenplay.', priority: 'required' },
    { type: 'shot_list', label: 'Pre-Viz Shot List', description: '3D pre-visualization shot breakdown.', priority: 'recommended' },
    { type: 'budget', label: 'Production Budget', description: 'Multi-location budget and crew planning.', priority: 'recommended' },
    { type: 'score_direction', label: 'Score Direction', description: 'Thematic score for each character/arc.', priority: 'recommended' },
    { type: 'research_brief', label: 'Physics / Edge-Case Logic', description: 'Fact-checking for internal story consistency.', priority: 'optional' },
  ],
};

// ---------------------------------------------------------------------------
// Blueprint Registry
// ---------------------------------------------------------------------------

export const BLUEPRINT_REGISTRY: Record<ProjectComplexity, Blueprint> = {
  solo_ugc: UGC_BLUEPRINT,
  brand_doc: BRAND_DOC_BLUEPRINT,
  short_film: SHORT_FILM_BLUEPRINT,
  feature_film: FEATURE_FILM_BLUEPRINT,
  epic: EPIC_BLUEPRINT,
};

export function getBlueprintForComplexity(complexity: ProjectComplexity): Blueprint {
  return BLUEPRINT_REGISTRY[complexity] ?? UGC_BLUEPRINT;
}

export function getRequiredArtifacts(complexity: ProjectComplexity): ArtifactSpec[] {
  return getBlueprintForComplexity(complexity).artifacts.filter(a => a.priority === 'required');
}

export function getAllArtifacts(complexity: ProjectComplexity): ArtifactSpec[] {
  return getBlueprintForComplexity(complexity).artifacts;
}

// ---------------------------------------------------------------------------
// Cross-Document Dependency Graph
// ---------------------------------------------------------------------------

export interface DocumentDependency {
  source: DocumentType;
  target: DocumentType;
  relationship: 'informs' | 'derives_from' | 'validates';
}

export const DOCUMENT_DEPENDENCIES: DocumentDependency[] = [
  { source: 'screenplay', target: 'vfx_brief', relationship: 'informs' },
  { source: 'screenplay', target: 'shot_list', relationship: 'informs' },
  { source: 'screenplay', target: 'score_direction', relationship: 'informs' },
  { source: 'vfx_brief', target: 'budget', relationship: 'informs' },
  { source: 'shot_list', target: 'budget', relationship: 'informs' },
  { source: 'character_bible', target: 'screenplay', relationship: 'informs' },
  { source: 'world_bible', target: 'screenplay', relationship: 'informs' },
  { source: 'world_bible', target: 'vfx_brief', relationship: 'informs' },
  { source: 'research_brief', target: 'screenplay', relationship: 'validates' },
  { source: 'research_brief', target: 'world_bible', relationship: 'validates' },
];

export function getDependentsOf(sourceType: DocumentType): DocumentType[] {
  return DOCUMENT_DEPENDENCIES
    .filter(d => d.source === sourceType)
    .map(d => d.target);
}

export function getDependenciesOf(targetType: DocumentType): DocumentType[] {
  return DOCUMENT_DEPENDENCIES
    .filter(d => d.target === targetType)
    .map(d => d.source);
}
