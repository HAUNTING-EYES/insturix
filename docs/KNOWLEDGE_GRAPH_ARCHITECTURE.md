# Insturix Knowledge Graph Architecture

> Production-grade design for the runtime intelligence layer.
> Every agency from Mumbai to Manhattan. Every project makes the system smarter.

---

## 1. What This System Does

An agency owner manages 5 brands. Each brand has its own visual language, editing preferences, and asset library. The system learns from every project: what transitions work for nostalgic McDonald's ads, what pacing suits corporate Deloitte training videos, which B-roll clips keep getting reused across Nike campaigns.

Without this graph, the pipeline treats every project as a blank slate. With it, project #50 for a brand is edited with the accumulated intelligence of projects #1-49.

---

## 2. Two Systems, Clear Boundaries

### MongoDB (Source of Truth — operational data)
- Users, projects, storyboards (Mongoose schemas, already exist)
- Media assets (file metadata, R2 URLs, full 5-Track analysis data)
- Pipeline state (video jobs, render jobs, queue status)
- Credits, billing, auth

MongoDB owns WHAT EXISTS. It's the system of record.

### Neo4j + Graphiti (Intelligence Layer — learned knowledge)
- Brand preferences that evolve over time
- User editing patterns learned from overrides
- Asset intelligence (briefings, relationships, reuse patterns)
- Project outcomes and what worked/failed per context
- Scene-level context for decision correlation

Neo4j owns WHAT WE'VE LEARNED. It's the system of intelligence.

### Sync: MongoDB → Neo4j via QStash

```
Event occurs (upload, finalize, override, publish)
    → MongoDB write (sync, critical path, never fails without error)
    → QStash dispatch to Neo4j writer worker (async)
        → Success: both in sync
        → Failure: QStash retries (3x exponential backoff)
        → Dead letter: MongoDB doc flagged graphSyncStatus: 'failed'
        → Background cron re-queues failed syncs every 5 minutes
```

MongoDB document carries `graphSyncStatus: 'synced' | 'pending' | 'failed'`.
If Neo4j is completely down, pipeline degrades to MongoDB-only (basic search, no relationship intelligence). When Neo4j recovers, QStash replays backlog.

---

## 3. Entity Ownership — Who Creates What

Every entity type has ONE owner. No entity is created by both systems.

| Entity | Owner | Why |
|--------|-------|-----|
| **Asset** | Direct Neo4j (via QStash after MongoDB write) | Structured. Known fields at write time. No LLM needed. |
| **Project** | Direct Neo4j | Structured. ProjectId, contentType, qualityScore. |
| **Scene** | Direct Neo4j | Structured from parser/5-Track. Mood, type, energy. |
| **Profile** | Direct Neo4j | Static. 54 profiles, deterministic data. |
| **Brand DNA** | Graphiti (episodic) | Evolving. Voice, visual preferences change over time. |
| **User preferences** | Graphiti (episodic) | Learned from behavior. Temporal. |
| **Editing patterns** | Graphiti (episodic) | "Dissolve works for nostalgic McDonald's scenes." Inferred from outcomes. |

This means: when the pipeline queries "what transitions work for McDonald's?", it queries **Graphiti facts** (learned knowledge). When it queries "which assets does this user have?", it queries **Neo4j nodes** (structured data).

They never conflict because they answer different questions about different data.

### Cross-referencing

Graphiti episodes include identifiers of directly-written entities:
```
"Project proj_abc for brand McDonald's (brand_mcdonalds) used dissolve
transitions in scenes 2-4 (nostalgic mood). User kept all transitions.
Asset asset_xyz was used as B-roll in scene 3."
```

Graphiti extracts "McDonald's" as an entity. The identifiers (`brand_mcdonalds`, `asset_xyz`, `proj_abc`) appear in the fact metadata, enabling joins without a reconciliation layer.

---

## 4. Neo4j Node Schemas (Direct-Write)

### Asset Node

```
(:Asset {
    assetId:          String,    // join key to MongoDB media_assets
    userId:           String,    // owner (Clerk ID)
    type:             String,    // video | image | audio
    
    // Intelligence-relevant data (enough to make decisions without MongoDB)
    briefing:         String,    // 200-token compressed summary from asset-briefing.ts
    embedding:        Float[],   // 768-dim from Gemini embedding (for vector search)
    
    // Visual attributes (extracted from 5-Track)
    colorTemp:        String,    // warm | neutral | cold
    composition:      String,    // center | rule-of-thirds | off-center | symmetric
    lighting:         String,    // golden | natural | studio | dramatic | low-key
    dominantColors:   String[],  // [amber, brown, cream]
    mood:             String,    // nostalgic | energetic | corporate | calm | dramatic
    energy:           Float,     // 0.0-1.0
    
    // Content
    subjects:         String[],  // [person, coffee_cup, restaurant]
    hasAudio:         String,    // speech | music | ambient | silent
    duration:         Float,     // seconds
    qualityScore:     Int,       // 0-100
    slopFlags:        String[],  // [] or [face_morphing, temporal_flicker]
    
    // Sync
    graphSyncVersion: Int,       // matches MongoDB document version
    createdAt:        DateTime
})
```

### Project Node

```
(:Project {
    projectId:        String,    // join key to MongoDB projects
    userId:           String,
    brandId:          String,    // nullable (unbranded projects)
    
    contentType:      String,    // brand-ad | product-ad | tutorial | ugc | corporate
    profileUsed:      String,    // E-04, A-02, etc.
    profileOverridden: Boolean,  // did user change from auto-detected?
    overriddenTo:     String,    // what they changed to (null if not overridden)
    
    qualityScore:     Int,       // 0-100
    outcome:          String,    // draft | published | archived
    sceneCount:       Int,
    durationSec:      Float,
    
    // Versioning
    currentVersion:   Int,       // latest Director run version
    createdAt:        DateTime,
    publishedAt:      DateTime   // null if not published
})
```

### Scene Node (Git-style versioning)

```
(:Scene {
    sceneId:          String,    // projectId + version + sceneIndex
    projectId:        String,
    version:          Int,       // Director run version (1, 2, 3...)
    sceneIndex:       Int,
    
    // Context (what makes pattern learning possible)
    mood:             String,    // nostalgic | energetic | calm | dramatic
    energy:           Float,     // 0.0-1.0
    sceneType:        String,    // continuous | montage | logo-reveal | text-card
    contentSummary:   String,    // "elderly couple sharing coffee, warm lighting"
    subjects:         String[],  // [person, coffee, restaurant]
    
    // Decisions made (by Director)
    transitionIn:     String,    // dissolve | hard-cut | dip-to-black | etc.
    transitionOut:    String,
    filterApplied:    String,    // film-portra | vivid | etc.
    zoomApplied:      String,    // punch-at-peak | slow-push | gentle-drift | none
    
    // Status
    isActive:         Boolean,   // true for currentVersion, false for historical
    createdAt:        DateTime
})
```

**Versioning model (git-inspired):**
- Each Director run increments `version` and creates a new set of Scene nodes
- Previous version's scenes get `isActive: false`
- All USED_IN and REMOVED_FROM edges reference specific `sceneId` (version-bound)
- Project node's `currentVersion` points to the active set
- Queries filter `WHERE s.isActive = true` for current state
- Queries across versions for learning: "what did Director v1 do differently from v2?"
- History kept indefinitely (cheap — Scene nodes are small)

### Profile Node

```
(:Profile {
    profileId:        String,    // E-04, A-02, etc.
    name:             String,    // Brand Narrative, YouTube Short, etc.
    category:         String,    // narrative-mode | platform-native | etc.
    cutsPerMinLow:    Int,
    cutsPerMinHigh:   Int,
    defaultTransition: String,
    filterPreset:     String,
    captionStyle:     String,
    bgmDuckLevel:     Float
})
```

---

## 5. Neo4j Relationship Schemas (Direct-Write)

### Asset relationships

```
(:Asset)-[:UPLOADED_BY]->(:User)           // ownership

(:Asset)-[:USED_IN {                        // asset appeared in project
    sceneId:          String,               // which scene (version-bound)
    sceneIndex:       Int,
    trimStart:        Float,                // seconds (null = full clip)
    trimEnd:          Float,
    role:             String,               // hero | b-roll | transition-fill
    filterApplied:    String,
    wasKept:          Boolean               // user didn't remove it
}]->(:Project)

(:Asset)-[:REMOVED_FROM {                   // user dragged clip off timeline
    sceneId:          String,               // which scene
    sceneContext: {                          // observable context, NOT user-stated reason
        mood:           String,
        energy:         Float,
        sceneType:      String,
        adjacentMood:   String              // mood of neighboring clips
    },
    assetAttributes: {                      // what the asset looked like
        colorTemp:      String,
        energy:         Float,
        mood:           String
    },
    mismatchSignals: {                      // computed mismatches
        colorTempContrast: Boolean,
        energyGap:         Float,
        moodContrast:      Boolean
    },
    removedAt:        DateTime
}]->(:Project)
```

### Project relationships

```
(:Project)-[:CREATED_BY]->(:User)
(:Project)-[:USED_PROFILE]->(:Profile)
(:Project)-[:HAS_SCENE]->(:Scene)

(:Scene)-[:FOLLOWS {version: Int}]->(:Scene)   // scene ordering, version-scoped
```

**FOLLOWS edge version scoping:** Every FOLLOWS edge carries the version it belongs to. When Director v2 creates new scenes, it creates a new FOLLOWS chain with `version: 2`. Old chain (`version: 1`) stays intact for history. Query active chain: `MATCH (s1:Scene {projectId: $pid, isActive: true})-[:FOLLOWS {version: $v}]->(s2:Scene) RETURN s1, s2 ORDER BY s1.sceneIndex`.

---

## 6. Graphiti Episodic Layer (Learned Knowledge)

Graphiti receives natural language episodes at key moments. It automatically extracts entities, relationships, and temporal facts. No schema definition needed — Graphiti infers structure from text.

### Cross-referencing reliability

Graphiti's entity extraction is LLM-driven. If an episode says "brand McDonald's (brand_mcdonalds)", Graphiti might extract "McDonald's" as the entity and ignore the ID. The cross-referencing strategy (embedding IDs in episode text) must be validated with real data.

**Validation plan:** Before committing to this approach, test 10 real episodes and verify:
1. Does Graphiti extract the entity name consistently?
2. Does it merge "McDonald's" from episode 1 with "McDonald's" from episode 5?
3. Does it capture the parenthetical ID in the entity attributes?

**Fallback: post-extraction reconciliation.** If Graphiti drops the IDs, add a post-add-episode step:
```python
# After adding episode, scan Graphiti's extracted entities
# Pattern-match known IDs from episode text
# Create REFERS_TO edges between Graphiti entities and direct-write nodes
async def reconcile_entities(episode_text, graphiti):
    ids = re.findall(r'(brand_\w+|asset_\w+|proj_\w+)', episode_text)
    entities = await graphiti.get_nodes_and_edges_by_episode(episode_name)
    for entity in entities:
        for id in ids:
            if id.startswith('brand_'):
                # Create edge: Graphiti entity → direct-write Brand node
                await driver.execute_query(
                    'MATCH (g:Entity {name: $name}), (b:Brand {brandId: $bid}) '
                    'MERGE (g)-[:REFERS_TO]->(b)',
                    {'name': entity.name, 'bid': id}
                )
```

This runs once per episode, is deterministic, and catches what the LLM misses. Cost: one Cypher query per ID found. No LLM calls.

### Episode batching (cost control)

Graphiti triggers LLM extraction on every `add_episode` call. During active editing, a user might override 15 decisions in 20 seconds. Firing 15 episodes = 15 LLM calls = expensive and unnecessary (the individual overrides matter less than the pattern).

**Batch strategy:** Collect events during an editing session. Send ONE consolidated episode when the user stops editing for 30 seconds (debounce).

```python
# Pseudocode — actual implementation in the editor's save/debounce logic
session_events = []

def on_user_override(decision_type, old_value, new_value, scene_context):
    session_events.append({...})

def on_editing_pause(after_30_seconds):
    if session_events:
        consolidated = summarize_session_events(session_events)
        await graphiti.add_episode(
            name=f"editing_session_{project_id}_{timestamp}",
            episode_body=consolidated,
            source_description="editing_session_batch",
            ...
        )
        session_events.clear()
```

One LLM call per editing pause, not per action. 15 overrides become 1 episode like: "User made 15 changes: changed 3 transitions from dissolve to hard-cut on high-energy scenes, kept all filters, overrode pacing from medium to fast on montage scenes, removed 2 assets with cold lighting from warm scenes."

Graphiti extracts the PATTERNS from this batch, which is more useful than 15 individual facts.

### Episode triggers and templates

**Brand creation:**
```python
await graphiti.add_episode(
    name=f"brand_created_{brand_id}",
    episode_body=f"""
    User {user_id} created brand '{brand_name}' in the {industry} industry.
    Brand colors: {colors}. Brand voice: {voice_description}.
    Typography: {typography}. Visual style: {visual_style}.
    """,
    source_description="brand_setup",
    reference_time=datetime.now(),
    group_id=user_id,  # scopes facts to this user
)
```

**Project outcome (after publish/archive):**
```python
await graphiti.add_episode(
    name=f"project_outcome_{project_id}",
    episode_body=f"""
    Project '{project_name}' for brand '{brand_name}' ({content_type}).
    Profile {profile_used} {'auto-detected' if not overridden else f'overridden from {detected} to {overridden_to}'}.
    {n_overrides} editing decisions overridden out of {n_total}.
    Kept: {kept_decisions}. Changed: {changed_decisions}.
    Quality score: {quality_score}/100.
    Outcome: {outcome}. Duration: {duration}s.
    """,
    source_description="project_outcome",
    reference_time=datetime.now(),
    group_id=user_id,
)
```

**User override (real-time, most important signal):**
```python
await graphiti.add_episode(
    name=f"override_{project_id}_{scene_index}",
    episode_body=f"""
    User changed {decision_type} from '{auto_value}' to '{user_value}'
    in scene {scene_index} ({scene_mood} mood, {scene_type} type, {energy} energy).
    Brand: {brand_name}. Content type: {content_type}.
    Scene context: {scene_summary}.
    """,
    source_description="user_override",
    reference_time=datetime.now(),
    group_id=user_id,
)
```

**Asset removal (contextual, not reason-stated):**
```python
await graphiti.add_episode(
    name=f"asset_removed_{asset_id}_{project_id}",
    episode_body=f"""
    Asset '{asset_briefing}' (color: {color_temp}, mood: {asset_mood}, energy: {asset_energy})
    was removed from scene {scene_index} ({scene_mood} mood, {scene_type} type).
    Adjacent scenes had {adjacent_mood} mood. Brand: {brand_name}.
    Mismatch: color temperature contrast ({asset_color} asset in {scene_color} scene).
    """,
    source_description="asset_removal",
    reference_time=datetime.now(),
    group_id=user_id,
)
```

**Asset reuse (positive signal):**
```python
await graphiti.add_episode(
    name=f"asset_reused_{asset_id}",
    episode_body=f"""
    Asset '{asset_briefing}' was reused in project '{project_name}'
    (previously used in {previous_projects}). 
    This is the {reuse_count}th time this asset has been selected.
    Brand: {brand_name}. Scene context: {scene_mood} {scene_type}.
    """,
    source_description="asset_reuse",
    reference_time=datetime.now(),
    group_id=user_id,
)
```

### Querying Graphiti

```python
# What transitions work for this brand's nostalgic content?
results = await graphiti.search(
    query="What transitions work for nostalgic brand ads?",
    group_ids=[user_id],
)

# Does this user override profile detection?
results = await graphiti.search(
    query="Does this user override the auto-detected editing profile?",
    group_ids=[user_id],
)

# What visual style does this brand prefer?
results = await graphiti.search(
    query=f"What visual style and color temperature does {brand_name} prefer?",
    group_ids=[user_id],
)
```

Graphiti returns temporal facts with validity windows. "McDonald's prefers dissolve transitions for nostalgic content (valid since 2026-04-15)." If a later episode contradicts this, the old fact gets invalidated automatically.

---

## 7. Search: Graph-Filtered Vector Ranking

Embeddings live on Neo4j Asset nodes. One query does filtering + ranking:

```cypher
// Find assets for a nostalgic brand ad scene
// Penalize-not-exclude: a rejected asset can still win if semantically strong
MATCH (a:Asset {userId: $userId})
WHERE a.mood IN ['nostalgic', 'warm', 'calm']

// Count positive signals (reuse = user liked it)
OPTIONAL MATCH (a)-[kept:USED_IN]->(:Project)
WHERE kept.wasKept = true
WITH a, count(kept) AS reuseCount

// Count negative signals (removals from SIMILAR mood scenes, scoped to brand)
OPTIONAL MATCH (a)-[removed:REMOVED_FROM]->(p:Project)
WHERE removed.sceneContext.mood IN ['nostalgic', 'warm']
  AND p.brandId = $brandId  // scope to THIS brand, not all brands
WITH a, reuseCount, count(removed) AS removalCount

// Vector similarity
WITH a, reuseCount, removalCount,
     vector.similarity.cosine(a.embedding, $sceneDescriptionEmbedding) AS semanticScore

// Combined score: semantic + reuse bonus - removal penalty
// Removal is a soft penalty (0.08 per removal), not a blacklist
// Strong semantic match (0.9) can overcome 2 past removals (0.16 penalty)
WITH a, semanticScore + (reuseCount * 0.05) - (removalCount * 0.08) AS finalScore
WHERE semanticScore > 0.4  // lower threshold — let the scoring decide, not the filter
RETURN a.assetId, a.briefing, finalScore, reuseCount, removalCount
ORDER BY finalScore DESC
LIMIT 5
```

**Why penalize-not-exclude:** An asset removed from one nostalgic scene might be perfect for another. The blue crayon was wrong for sand but right for ocean. Removal is scoped to the current brand (different brands have different tolerances) and is a score penalty, not a filter. A strong semantic match can overcome past removals.

This query:
1. Filters by user ownership and mood match
2. Excludes assets previously rejected from similar scenes
3. Boosts assets that were kept in past projects
4. Ranks by semantic similarity to the scene description
5. Returns top 5 with briefings (enough for Director to decide)

Pipeline then fetches the winner's R2 URL from MongoDB by assetId.

---

## 8. Pipeline Integration Points

### Where the graph gets WRITTEN TO

| Pipeline event | Neo4j write | Graphiti episode |
|---------------|-------------|-----------------|
| Asset upload complete | Asset node created | — |
| 5-Track analysis done | Asset node updated (briefing, embedding, attributes) | — |
| Project created | Project node created | — |
| Finalize complete | Scene nodes created (version N) | — |
| Director complete | Scene nodes updated (decisions applied) | — |
| User overrides a decision | Scene node updated (decision changed) | Override episode |
| User removes asset from timeline | REMOVED_FROM edge created | Removal episode |
| User adds asset to timeline | USED_IN edge created | Reuse episode (if reused) |
| User defines/updates brand | — | Brand DNA episode |
| Project published | Project node updated (outcome) | Outcome episode |

### Where the graph gets READ FROM

| Pipeline stage | Neo4j query | Graphiti query |
|---------------|-------------|----------------|
| Profile Detection | — | "What profile does this user/brand prefer?" |
| Director Step 0 (asset search) | Graph-filtered vector search for matching footage | "What assets work for this brand's content type?" |
| Director Step 3 (transitions) | — | "What transitions work for this brand + mood?" |
| Director Step 3 (filter selection) | — | "What visual style does this brand prefer?" |
| Storyboard generation | — | "What composition style does this brand use?" |
| Quality Review | Scene version history comparison | — |

---

## 9. Existing Code Reuse

| Existing code | Status | Graph integration |
|--------------|--------|-------------------|
| `upload-service.ts` | ✅ Works | Add QStash dispatch to Neo4j writer after R2 upload |
| `asset-briefing.ts` | ✅ Works | Briefing text → Asset node's `briefing` field |
| `five-track-analysis.ts` | ✅ Works for AI-gen | Analysis results → Asset node attributes + embedding |
| `asset-search-service.ts` | ❌ Rewrite | Replace with Neo4j graph-filtered vector search |
| `asset-resolver.ts` | ✅ Works | No change — still resolves URLs from MongoDB |
| `asset-analysis/route.ts` | ⚠️ Unwired | Wire as QStash worker triggered by upload |
| `profile-detection-service.ts` | ✅ Works | Add Graphiti query for user preference boost |
| `continuity-service.ts` | ⚠️ Text-only | Feed Scene node attributes instead of text descriptions |
| `project-service.ts` | ✅ Works | Add Neo4j Project node write after MongoDB create |
| `segment-extractor.tsx` | ⚠️ Orphaned UI | Wire to Asset node's USED_IN edge with trim data |

---

## 10. Infrastructure

```
┌─────────────────────────────────────────────────┐
│                   Vercel (Next.js)               │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Pipeline │  │ Director │  │ API Routes    │  │
│  │ Routes   │  │ Agent    │  │ (brand, asset)│  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       │              │                │          │
│  ┌────▼──────────────▼────────────────▼───────┐  │
│  │         Graph Service Layer                │  │
│  │  ┌─────────────┐  ┌────────────────────┐   │  │
│  │  │ Neo4j Client│  │ Graphiti Client    │   │  │
│  │  │ (Cypher)    │  │ (episodes + search)│   │  │
│  │  └──────┬──────┘  └────────┬───────────┘   │  │
│  └─────────┼──────────────────┼───────────────┘  │
│            │                  │                   │
└────────────┼──────────────────┼───────────────────┘
             │                  │
    ┌────────▼──────────────────▼────────┐
    │     Neo4j Aura (shared database)   │
    │                                    │
    │  Direct-write nodes:               │
    │  Asset, Project, Scene, Profile    │
    │                                    │
    │  Graphiti-managed nodes:           │
    │  Entity, Episodic, RELATES_TO     │
    │  (brand DNA, preferences, patterns)│
    │                                    │
    │  Vector index on Asset.embedding   │
    └────────────────────────────────────┘

    ┌────────────────────────────────────┐
    │  MongoDB Atlas (source of truth)   │
    │  media_assets, projects,           │
    │  storyboards, users, asset_analyses│
    │  + graphSyncStatus field           │
    └────────────────────────────────────┘

    ┌────────────────────────────────────┐
    │  QStash (sync dispatcher)          │
    │  MongoDB write → Neo4j write       │
    │  Retries on failure                │
    └────────────────────────────────────┘

    ┌────────────────────────────────────┐
    │  Cloudflare R2 (file storage)      │
    │  Actual video/image/audio bytes    │
    │  Accessed via CDN proxy URLs       │
    └────────────────────────────────────┘
```

---

## 11. Build Order

```
Phase 1: Foundation (this sprint)
├── 1a. Graph service layer (Neo4j client + Graphiti client wrapper)
├── 1b. Asset node writer (triggered by upload via QStash)
├── 1c. Wire asset-analysis worker to trigger on upload
├── 1d. Asset node enrichment (briefing + embedding after 5-Track)
└── 1e. Graph-filtered vector search (replace asset-search-service)

Phase 2: Project intelligence
├── 2a. Project + Scene node writers (on finalize + Director complete)
├── 2b. Scene versioning (git-style, version per Director run)
├── 2c. USED_IN / REMOVED_FROM edge writers (user timeline actions)
└── 2d. Profile node seeding (54 profiles as static nodes)

Phase 3: Graphiti episodes
├── 3a. Brand DNA episodes (brand creation/update)
├── 3b. Project outcome episodes (on publish/archive)
├── 3c. User override episodes (real-time decision tracking)
├── 3d. Asset removal episodes (contextual rejection signals)
└── 3e. Graphiti query integration into Director + Profile Detection

Phase 4: Pipeline intelligence
├── 4a. Director queries Graphiti for brand transition preferences
├── 4b. Profile Detection queries Graphiti for user override patterns
├── 4c. Storyboard queries Graphiti for brand visual style
└── 4d. Feedback loop: project outcomes improve future suggestions
```

---

## 12. Costs (Neo4j Aura Free → Production)

| Phase | Neo4j | Gemini (Graphiti LLM) | QStash |
|-------|-------|----------------------|--------|
| Dev (now) | $0 (Aura Free, 200K nodes) | ~$0.01/episode | Existing plan |
| Early users (10 users, 50 projects) | $0 (still under 200K) | ~$5/month | Existing plan |
| Growth (100 users, 1000 projects) | Migrate to FalkorDB self-hosted (~$10/mo VPS) | ~$30/month | Existing plan |
| Scale (1000+ users) | FalkorDB dedicated ($50-100/mo) | ~$200/month | Scale plan |

---

## 13. What This Enables (User Impact)

**Project #1 for a new brand:** Pipeline operates on defaults. Profile auto-detected. Generic transitions. No asset library.

**Project #10:** System knows the brand prefers warm golden tones, dissolve transitions, E-04 narrative profile. Suggests the user's own B-roll from past projects. Avoids hard-cuts on nostalgic scenes (learned from 3 overrides).

**Project #50:** System is essentially a trained editor for this brand. It knows the visual language, the pacing preferences, which assets get reused, what the user always overrides. Auto mode produces output the user ships without changes.

That's the automatic car that gets smarter with every drive.
