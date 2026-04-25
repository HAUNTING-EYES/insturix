/**
 * Graph Service — Neo4j + Graphiti Intelligence Layer
 *
 * Two modes of operation, one service:
 *   Direct-write (Cypher): Asset, Project, Scene, Profile nodes
 *   Graphiti (episodic):   Brand DNA, user preferences, editing patterns
 *
 * Architecture: docs/KNOWLEDGE_GRAPH_ARCHITECTURE.md
 * Connection:   lib/editron/db/neo4j.ts
 */

import { getSession, runCypher, isNeo4jAvailable } from '@/lib/editron/db/neo4j';

// ─── Write Result ───────────────────────────────────────────────
// Every write returns this so callers (QStash workers) can handle failures
// without crashing the pipeline.

export interface GraphWriteResult {
  ok: boolean;
  error?: string;
}

// ─── Vocabulary (aligned with five-track-analysis.ts + continuity-service.ts) ──

export type Mood =
  | 'energetic' | 'dramatic' | 'inspirational' | 'playful'
  | 'serious' | 'mysterious' | 'neutral' | 'calm' | 'somber';

export type ShotType = 'wide' | 'medium' | 'close-up' | 'extreme-close-up' | 'unknown';

export type EnergyLevel = 'low' | 'medium' | 'high' | 'peak';

export type ColorTemp = 'warm' | 'neutral' | 'cold';

export type Lighting = 'golden' | 'natural' | 'studio' | 'dramatic' | 'low-key';

export type AudioContent = 'speech' | 'music' | 'ambient' | 'silent';

export type SceneType = 'continuous' | 'montage' | 'logo-reveal' | 'text-card';

// ─── Node Types (Section 4 of architecture doc) ─────────────────

export interface AssetNode {
  assetId: string;
  userId: string;
  type: 'video' | 'image' | 'audio';
  briefing: string | null;
  embedding: number[] | null;
  colorTemp: ColorTemp | null;
  composition: ShotType | null;
  lighting: Lighting | null;
  dominantColors: string[];
  mood: Mood | null;
  energy: number | null;
  energyLevel: EnergyLevel | null;
  subjects: string[];
  hasAudio: AudioContent | null;
  duration: number | null;
  qualityScore: number | null;
  slopFlags: string[];
  graphSyncVersion: number;
  createdAt: string;
}

export interface ProjectNode {
  projectId: string;
  userId: string;
  brandId: string | null;
  contentType: string;
  profileUsed: string | null;
  profileOverridden: boolean;
  overriddenTo: string | null;
  qualityScore: number | null;
  outcome: string;
  sceneCount: number;
  durationSec: number;
  currentVersion: number;
  createdAt: string;
  publishedAt: string | null;
}

export interface SceneNode {
  sceneId: string;
  projectId: string;
  version: number;
  sceneIndex: number;
  mood: Mood | null;
  energy: number | null;
  sceneType: SceneType | null;
  contentSummary: string | null;
  subjects: string[];
  transitionIn: string | null;
  transitionOut: string | null;
  filterApplied: string | null;
  zoomApplied: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ProfileNode {
  profileId: string;
  name: string;
  category: string;
  cutsPerMinLow: number;
  cutsPerMinHigh: number;
  defaultTransition: string;
  filterPreset: string;
  captionStyle: string;
  bgmDuckLevel: number;
}

// ─── Relationship Types (Section 5) ─────────────────────────────

export interface UsedInProps {
  sceneId: string;
  sceneIndex: number;
  trimStart: number | null;
  trimEnd: number | null;
  role: 'hero' | 'b-roll' | 'transition-fill';
  filterApplied: string | null;
  wasKept: boolean;
}

export interface RemovedFromProps {
  sceneId: string;
  sceneMood: string;
  sceneEnergy: number;
  sceneType: string;
  adjacentMood: string;
  assetColorTemp: string;
  assetEnergy: number;
  assetMood: string;
  colorTempContrast: boolean;
  energyGap: number;
  moodContrast: boolean;
  removedAt: string;
}

// ─── Search Result ──────────────────────────────────────────────

export interface AssetSearchHit {
  assetId: string;
  briefing: string | null;
  finalScore: number;
  reuseCount: number;
  removalCount: number;
}

// ─── Graphiti Episode Types ─────────────────────────────────────

export type EpisodeType =
  | 'brand_created'
  | 'brand_updated'
  | 'project_outcome'
  | 'user_override'
  | 'asset_removal'
  | 'asset_reuse'
  | 'editing_session_batch';

export interface EpisodePayload {
  type: EpisodeType;
  name: string;
  body: string;
  sourceDescription: string;
  groupId: string;
}

// ═══════════════════════════════════════════════════════════════════
// INDEX + CONSTRAINT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

export async function createIndicesAndConstraints(): Promise<GraphWriteResult> {
  const session = getSession('WRITE');
  try {
    // Uniqueness constraints (also serve as indexes)
    await session.run(
      'CREATE CONSTRAINT asset_id IF NOT EXISTS FOR (a:Asset) REQUIRE a.assetId IS UNIQUE'
    );
    await session.run(
      'CREATE CONSTRAINT project_id IF NOT EXISTS FOR (p:Project) REQUIRE p.projectId IS UNIQUE'
    );
    await session.run(
      'CREATE CONSTRAINT scene_id IF NOT EXISTS FOR (s:Scene) REQUIRE s.sceneId IS UNIQUE'
    );
    await session.run(
      'CREATE CONSTRAINT profile_id IF NOT EXISTS FOR (p:Profile) REQUIRE p.profileId IS UNIQUE'
    );

    // Lookup indexes for common query patterns
    await session.run(
      'CREATE INDEX asset_user IF NOT EXISTS FOR (a:Asset) ON (a.userId)'
    );
    await session.run(
      'CREATE INDEX scene_project IF NOT EXISTS FOR (s:Scene) ON (s.projectId, s.isActive)'
    );
    await session.run(
      'CREATE INDEX scene_version IF NOT EXISTS FOR (s:Scene) ON (s.projectId, s.version)'
    );
    await session.run(
      'CREATE INDEX project_user IF NOT EXISTS FOR (p:Project) ON (p.userId)'
    );

    // Vector index on Asset.embedding for similarity search
    // 768-dim matches Gemini text-embedding-004 output
    await session.run(`
      CREATE VECTOR INDEX asset_embedding IF NOT EXISTS
      FOR (a:Asset) ON (a.embedding)
      OPTIONS {indexConfig: {
        \`vector.dimensions\`: 768,
        \`vector.similarity_function\`: 'cosine'
      }}
    `);

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[graph-service] Failed to create indices:', msg);
    return { ok: false, error: msg };
  } finally {
    await session.close();
  }
}

// ═══════════════════════════════════════════════════════════════════
// ASSET NODE OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a bare Asset node on upload (before 5-Track analysis).
 * Called by QStash worker after MongoDB media_assets insert.
 */
export async function createAssetNode(
  assetId: string,
  userId: string,
  type: 'video' | 'image' | 'audio',
  duration: number | null = null,
): Promise<GraphWriteResult> {
  try {
    await runCypher(
      `MERGE (a:Asset {assetId: $assetId})
       ON CREATE SET
         a.userId = $userId,
         a.type = $type,
         a.duration = $duration,
         a.dominantColors = [],
         a.subjects = [],
         a.slopFlags = [],
         a.graphSyncVersion = 1,
         a.createdAt = datetime()
       ON MATCH SET
         a.graphSyncVersion = a.graphSyncVersion + 1`,
      { assetId, userId, type, duration }
    );

    // UPLOADED_BY edge (architecture doc Section 5)
    await runCypher(
      `MERGE (u:User {userId: $userId})
       WITH u
       MATCH (a:Asset {assetId: $assetId})
       MERGE (a)-[:UPLOADED_BY]->(u)`,
      { userId, assetId }
    );

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[graph-service] createAssetNode failed:', msg);
    return { ok: false, error: msg };
  }
}

/**
 * Enrich an Asset node after 5-Track analysis completes.
 * Adds briefing, embedding, visual attributes, slop flags.
 */
export async function enrichAssetNode(
  assetId: string,
  enrichment: {
    briefing: string;
    embedding: number[];
    colorTemp?: ColorTemp;
    composition?: ShotType;
    lighting?: Lighting;
    dominantColors?: string[];
    mood?: Mood;
    energy?: number;
    energyLevel?: EnergyLevel;
    subjects?: string[];
    hasAudio?: AudioContent;
    qualityScore?: number;
    slopFlags?: string[];
  },
): Promise<GraphWriteResult> {
  try {
    await runCypher(
      `MATCH (a:Asset {assetId: $assetId})
       SET a.briefing = $briefing,
           a.embedding = $embedding,
           a.colorTemp = $colorTemp,
           a.composition = $composition,
           a.lighting = $lighting,
           a.dominantColors = $dominantColors,
           a.mood = $mood,
           a.energy = $energy,
           a.energyLevel = $energyLevel,
           a.subjects = $subjects,
           a.hasAudio = $hasAudio,
           a.qualityScore = $qualityScore,
           a.slopFlags = $slopFlags,
           a.graphSyncVersion = a.graphSyncVersion + 1`,
      {
        assetId,
        briefing: enrichment.briefing,
        embedding: enrichment.embedding,
        colorTemp: enrichment.colorTemp ?? null,
        composition: enrichment.composition ?? null,
        lighting: enrichment.lighting ?? null,
        dominantColors: enrichment.dominantColors ?? [],
        mood: enrichment.mood ?? null,
        energy: enrichment.energy ?? null,
        energyLevel: enrichment.energyLevel ?? null,
        subjects: enrichment.subjects ?? [],
        hasAudio: enrichment.hasAudio ?? null,
        qualityScore: enrichment.qualityScore ?? null,
        slopFlags: enrichment.slopFlags ?? [],
      }
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[graph-service] enrichAssetNode failed:', msg);
    return { ok: false, error: msg };
  }
}

/**
 * Get an Asset node by ID. Returns null if not found.
 */
export async function getAssetNode(assetId: string): Promise<AssetNode | null> {
  const rows = await runCypher<{ a: AssetNode }>(
    'MATCH (a:Asset {assetId: $assetId}) RETURN properties(a) AS a',
    { assetId },
    'READ'
  );
  return rows[0]?.a ?? null;
}

// ═══════════════════════════════════════════════════════════════════
// PROJECT NODE OPERATIONS
// ═══════════════════════════════════════════════════════════════════

export async function createProjectNode(
  project: Pick<ProjectNode, 'projectId' | 'userId' | 'contentType'> & {
    brandId?: string;
    sceneCount?: number;
    durationSec?: number;
  },
): Promise<GraphWriteResult> {
  try {
    await runCypher(
      `MERGE (p:Project {projectId: $projectId})
       ON CREATE SET
         p.userId = $userId,
         p.brandId = $brandId,
         p.contentType = $contentType,
         p.outcome = 'draft',
         p.sceneCount = $sceneCount,
         p.durationSec = $durationSec,
         p.currentVersion = 0,
         p.profileOverridden = false,
         p.createdAt = datetime()`,
      {
        projectId: project.projectId,
        userId: project.userId,
        brandId: project.brandId ?? null,
        contentType: project.contentType,
        sceneCount: project.sceneCount ?? 0,
        durationSec: project.durationSec ?? 0,
      }
    );

    // CREATED_BY edge (User node created on-demand)
    await runCypher(
      `MERGE (u:User {userId: $userId})
       WITH u
       MATCH (p:Project {projectId: $projectId})
       MERGE (p)-[:CREATED_BY]->(u)`,
      { userId: project.userId, projectId: project.projectId }
    );

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[graph-service] createProjectNode failed:', msg);
    return { ok: false, error: msg };
  }
}

/**
 * Update Project after Director completes (profile, quality, version bump).
 */
export async function updateProjectAfterDirector(
  projectId: string,
  update: {
    profileUsed: string;
    profileOverridden: boolean;
    overriddenTo?: string;
    qualityScore: number;
    sceneCount: number;
    durationSec: number;
    currentVersion: number;
  },
): Promise<GraphWriteResult> {
  try {
    await runCypher(
      `MATCH (p:Project {projectId: $projectId})
       SET p.profileUsed = $profileUsed,
           p.profileOverridden = $profileOverridden,
           p.overriddenTo = $overriddenTo,
           p.qualityScore = $qualityScore,
           p.sceneCount = $sceneCount,
           p.durationSec = $durationSec,
           p.currentVersion = $currentVersion`,
      {
        projectId,
        profileUsed: update.profileUsed,
        profileOverridden: update.profileOverridden,
        overriddenTo: update.overriddenTo ?? null,
        qualityScore: update.qualityScore,
        sceneCount: update.sceneCount,
        durationSec: update.durationSec,
        currentVersion: update.currentVersion,
      }
    );

    // Wire USED_PROFILE edge
    if (update.profileUsed) {
      await runCypher(
        `MATCH (p:Project {projectId: $projectId}), (prof:Profile {profileId: $profileId})
         MERGE (p)-[:USED_PROFILE]->(prof)`,
        { projectId, profileId: update.profileUsed }
      );
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[graph-service] updateProjectAfterDirector failed:', msg);
    return { ok: false, error: msg };
  }
}

/**
 * Mark project outcome (published / archived).
 */
export async function updateProjectOutcome(
  projectId: string,
  outcome: 'published' | 'archived',
): Promise<GraphWriteResult> {
  try {
    await runCypher(
      `MATCH (p:Project {projectId: $projectId})
       SET p.outcome = $outcome,
           p.publishedAt = CASE WHEN $outcome = 'published' THEN datetime() ELSE p.publishedAt END`,
      { projectId, outcome }
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ═══════════════════════════════════════════════════════════════════
// SCENE NODE OPERATIONS (git-style versioning)
// ═══════════════════════════════════════════════════════════════════

export interface SceneInput {
  sceneIndex: number;
  mood?: Mood;
  energy?: number;
  sceneType?: SceneType;
  contentSummary?: string;
  subjects?: string[];
  transitionIn?: string;
  transitionOut?: string;
  filterApplied?: string;
  zoomApplied?: string;
}

/**
 * Write a batch of Scene nodes for a Director run.
 * Deactivates previous version's scenes, creates new active set,
 * wires FOLLOWS chain and HAS_SCENE edges.
 */
export async function writeSceneBatch(
  projectId: string,
  version: number,
  scenes: SceneInput[],
): Promise<GraphWriteResult> {
  const session = getSession('WRITE');
  const tx = session.beginTransaction();
  try {
    // Step 1: Deactivate previous version's scenes
    if (version > 1) {
      await tx.run(
        `MATCH (s:Scene {projectId: $projectId, isActive: true})
         SET s.isActive = false`,
        { projectId }
      );
    }

    // Step 2: Create new Scene nodes
    for (const scene of scenes) {
      const sceneId = `${projectId}_v${version}_s${scene.sceneIndex}`;
      await tx.run(
        `CREATE (s:Scene {
           sceneId: $sceneId,
           projectId: $projectId,
           version: $version,
           sceneIndex: $sceneIndex,
           mood: $mood,
           energy: $energy,
           sceneType: $sceneType,
           contentSummary: $contentSummary,
           subjects: $subjects,
           transitionIn: $transitionIn,
           transitionOut: $transitionOut,
           filterApplied: $filterApplied,
           zoomApplied: $zoomApplied,
           isActive: true,
           createdAt: datetime()
         })`,
        {
          sceneId,
          projectId,
          version,
          sceneIndex: scene.sceneIndex,
          mood: scene.mood ?? null,
          energy: scene.energy ?? null,
          sceneType: scene.sceneType ?? null,
          contentSummary: scene.contentSummary ?? null,
          subjects: scene.subjects ?? [],
          transitionIn: scene.transitionIn ?? null,
          transitionOut: scene.transitionOut ?? null,
          filterApplied: scene.filterApplied ?? null,
          zoomApplied: scene.zoomApplied ?? null,
        }
      );
    }

    // Step 3: Wire FOLLOWS chain (version-scoped)
    for (let i = 0; i < scenes.length - 1; i++) {
      const fromId = `${projectId}_v${version}_s${scenes[i].sceneIndex}`;
      const toId = `${projectId}_v${version}_s${scenes[i + 1].sceneIndex}`;
      await tx.run(
        `MATCH (a:Scene {sceneId: $fromId}), (b:Scene {sceneId: $toId})
         CREATE (a)-[:FOLLOWS {version: $version}]->(b)`,
        { fromId, toId, version }
      );
    }

    // Step 4: Wire HAS_SCENE edges from Project
    await tx.run(
      `MATCH (p:Project {projectId: $projectId}), (s:Scene {projectId: $projectId, version: $version})
       MERGE (p)-[:HAS_SCENE]->(s)`,
      { projectId, version }
    );

    await tx.commit();
    return { ok: true };
  } catch (err) {
    await tx.rollback();
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[graph-service] writeSceneBatch failed:', msg);
    return { ok: false, error: msg };
  } finally {
    await session.close();
  }
}

/**
 * Get active scenes for a project (current version only).
 */
export async function getActiveScenes(projectId: string): Promise<SceneNode[]> {
  const rows = await runCypher<{ s: SceneNode }>(
    `MATCH (s:Scene {projectId: $projectId, isActive: true})
     RETURN properties(s) AS s
     ORDER BY s.sceneIndex`,
    { projectId },
    'READ'
  );
  return rows.map((r) => r.s);
}

// ═══════════════════════════════════════════════════════════════════
// PROFILE NODE OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Seed all 54 edit profiles as static nodes.
 * Idempotent — uses MERGE so safe to call multiple times.
 */
export async function seedProfileNodes(
  profiles: ProfileNode[],
): Promise<GraphWriteResult> {
  const session = getSession('WRITE');
  try {
    for (const p of profiles) {
      await session.run(
        `MERGE (prof:Profile {profileId: $profileId})
         SET prof.name = $name,
             prof.category = $category,
             prof.cutsPerMinLow = $cutsPerMinLow,
             prof.cutsPerMinHigh = $cutsPerMinHigh,
             prof.defaultTransition = $defaultTransition,
             prof.filterPreset = $filterPreset,
             prof.captionStyle = $captionStyle,
             prof.bgmDuckLevel = $bgmDuckLevel`,
        {
          profileId: p.profileId,
          name: p.name,
          category: p.category,
          cutsPerMinLow: p.cutsPerMinLow,
          cutsPerMinHigh: p.cutsPerMinHigh,
          defaultTransition: p.defaultTransition,
          filterPreset: p.filterPreset,
          captionStyle: p.captionStyle,
          bgmDuckLevel: p.bgmDuckLevel,
        }
      );
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[graph-service] seedProfileNodes failed:', msg);
    return { ok: false, error: msg };
  } finally {
    await session.close();
  }
}

// ═══════════════════════════════════════════════════════════════════
// RELATIONSHIP OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Record that an asset was used in a project scene.
 */
export async function createUsedInEdge(
  assetId: string,
  projectId: string,
  props: UsedInProps,
): Promise<GraphWriteResult> {
  try {
    await runCypher(
      `MATCH (a:Asset {assetId: $assetId}), (p:Project {projectId: $projectId})
       CREATE (a)-[:USED_IN {
         sceneId: $sceneId,
         sceneIndex: $sceneIndex,
         trimStart: $trimStart,
         trimEnd: $trimEnd,
         role: $role,
         filterApplied: $filterApplied,
         wasKept: $wasKept
       }]->(p)`,
      {
        assetId,
        projectId,
        sceneId: props.sceneId,
        sceneIndex: props.sceneIndex,
        trimStart: props.trimStart,
        trimEnd: props.trimEnd,
        role: props.role,
        filterApplied: props.filterApplied,
        wasKept: props.wasKept,
      }
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[graph-service] createUsedInEdge failed:', msg);
    return { ok: false, error: msg };
  }
}

/**
 * Record that a user removed an asset from a scene (contextual rejection signal).
 * Stores observable context (NOT user-stated reason) for the penalize-not-exclude scoring.
 */
export async function createRemovedFromEdge(
  assetId: string,
  projectId: string,
  props: RemovedFromProps,
): Promise<GraphWriteResult> {
  try {
    await runCypher(
      `MATCH (a:Asset {assetId: $assetId}), (p:Project {projectId: $projectId})
       CREATE (a)-[:REMOVED_FROM {
         sceneId: $sceneId,
         sceneMood: $sceneMood,
         sceneEnergy: $sceneEnergy,
         sceneType: $sceneType,
         adjacentMood: $adjacentMood,
         assetColorTemp: $assetColorTemp,
         assetEnergy: $assetEnergy,
         assetMood: $assetMood,
         colorTempContrast: $colorTempContrast,
         energyGap: $energyGap,
         moodContrast: $moodContrast,
         removedAt: datetime($removedAt)
       }]->(p)`,
      {
        assetId,
        projectId,
        sceneId: props.sceneId,
        sceneMood: props.sceneMood,
        sceneEnergy: props.sceneEnergy,
        sceneType: props.sceneType,
        adjacentMood: props.adjacentMood,
        assetColorTemp: props.assetColorTemp,
        assetEnergy: props.assetEnergy,
        assetMood: props.assetMood,
        colorTempContrast: props.colorTempContrast,
        energyGap: props.energyGap,
        moodContrast: props.moodContrast,
        removedAt: props.removedAt,
      }
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[graph-service] createRemovedFromEdge failed:', msg);
    return { ok: false, error: msg };
  }
}

/**
 * Mark an asset's USED_IN edge as kept (user didn't remove it after Director placed it).
 */
export async function markAssetKept(
  assetId: string,
  projectId: string,
  sceneId: string,
): Promise<GraphWriteResult> {
  try {
    await runCypher(
      `MATCH (a:Asset {assetId: $assetId})-[r:USED_IN {sceneId: $sceneId}]->(p:Project {projectId: $projectId})
       SET r.wasKept = true`,
      { assetId, projectId, sceneId }
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ═══════════════════════════════════════════════════════════════════
// GRAPH-FILTERED VECTOR SEARCH (Section 7 of architecture doc)
// ═══════════════════════════════════════════════════════════════════

/**
 * Penalize-not-exclude search: finds assets by embedding similarity,
 * boosts reused assets, penalizes (but doesn't blacklist) removed ones.
 *
 * The blue crayon was wrong for sand but right for ocean.
 */
export async function searchAssets(
  userId: string,
  sceneEmbedding: number[],
  options: {
    moods?: Mood[];
    brandId?: string;
    limit?: number;
    minSemanticScore?: number;
  } = {},
): Promise<AssetSearchHit[]> {
  const { moods, brandId, limit = 5, minSemanticScore = 0.4 } = options;

  // Build mood filter clause dynamically
  const moodClause = moods && moods.length > 0
    ? 'AND a.mood IN $moods'
    : '';

  // Brand-scoped removal penalty
  const brandRemovalClause = brandId
    ? 'AND p.brandId = $brandId'
    : '';

  const cypher = `
    MATCH (a:Asset {userId: $userId})
    WHERE a.embedding IS NOT NULL
      ${moodClause}
    OPTIONAL MATCH (a)-[kept:USED_IN]->(:Project)
    WHERE kept.wasKept = true
    WITH a, count(kept) AS reuseCount
    OPTIONAL MATCH (a)-[removed:REMOVED_FROM]->(p:Project)
    WHERE removed.sceneMood IN $searchMoods
      ${brandRemovalClause}
    WITH a, reuseCount, count(removed) AS removalCount
    WITH a, reuseCount, removalCount,
         vector.similarity.cosine(a.embedding, $embedding) AS semanticScore
    WITH a, semanticScore + (reuseCount * 0.05) - (removalCount * 0.08) AS finalScore,
         reuseCount, removalCount, semanticScore
    WHERE semanticScore > $minScore
    RETURN a.assetId AS assetId, a.briefing AS briefing,
           finalScore, reuseCount, removalCount
    ORDER BY finalScore DESC
    LIMIT $limit
  `;

  try {
    const rows = await runCypher<AssetSearchHit>(
      cypher,
      {
        userId,
        embedding: sceneEmbedding,
        moods: moods ?? [],
        searchMoods: moods ?? [],
        brandId: brandId ?? null,
        minScore: minSemanticScore,
        limit,
      },
      'READ'
    );
    return rows;
  } catch (err) {
    console.error('[graph-service] searchAssets failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// EMBEDDING HELPER
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a 768-dim embedding via Gemini text-embedding-004.
 * Same model as profile-detection-service and asset-search-service.
 * Returns null on failure (caller degrades gracefully).
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
    if (!apiKey) return null;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding?.values ?? null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// GRAPHITI CLIENT INTERFACE (Phase 3 implementation)
// ═══════════════════════════════════════════════════════════════════
//
// Graphiti is a Python library (graphiti-core). For the TypeScript pipeline,
// episodes are dispatched via QStash to a Python worker endpoint.
// Reads can go directly through Neo4j Cypher (Graphiti stores facts as nodes).
//
// Phase 1: Interface defined, no-op implementation.
// Phase 3: Wire to deployed Graphiti server or Python Vercel function.

/**
 * Add an episode to Graphiti for knowledge extraction.
 * In Phase 1 this is a no-op that logs the payload.
 * In Phase 3 this dispatches via QStash to a Python Graphiti worker.
 */
export async function addGraphitiEpisode(
  episode: EpisodePayload,
): Promise<GraphWriteResult> {
  // Phase 1: log + skip (Graphiti server not yet deployed)
  console.log(
    `[graph-service] Graphiti episode queued (Phase 1 stub): ${episode.type} — ${episode.name}`
  );
  return { ok: true };
}

/**
 * Search Graphiti for temporal facts (brand DNA, user preferences, patterns).
 * In Phase 1 returns empty (no episodes ingested yet).
 * In Phase 3 calls Graphiti search endpoint.
 */
export async function searchGraphitiFacts(
  query: string,
  groupId: string,
  _limit = 5,
): Promise<string[]> {
  // Phase 1: no-op
  console.log(`[graph-service] Graphiti search (Phase 1 stub): "${query}" for group ${groupId}`);
  return [];
}

// ═══════════════════════════════════════════════════════════════════
// MONGODB SYNC STATUS HELPER
// ═══════════════════════════════════════════════════════════════════

/**
 * Update graphSyncStatus on a MongoDB document after Neo4j write.
 * Called by QStash workers after successful/failed graph writes.
 */
export async function updateMongoSyncStatus(
  collection: string,
  docId: string,
  idField: string,
  status: 'synced' | 'pending' | 'failed',
): Promise<void> {
  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    await db.collection(collection).updateOne(
      { [idField]: docId },
      { $set: { graphSyncStatus: status, graphSyncAt: new Date() } }
    );
  } catch (err) {
    console.error('[graph-service] MongoDB sync status update failed:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════
// HEALTH + AVAILABILITY
// ═══════════════════════════════════════════════════════════════════

export { isNeo4jAvailable };
