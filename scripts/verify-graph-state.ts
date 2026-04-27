/**
 * Neo4j + Graphiti Verification Script
 *
 * Run AFTER a pipeline test to confirm graph state.
 * Replaces the need to open Neo4j Aura Browser manually.
 *
 * Usage:
 *   npx tsx scripts/verify-graph-state.ts                   # all checks for current user
 *   npx tsx scripts/verify-graph-state.ts --user <userId>   # specific user
 *   npx tsx scripts/verify-graph-state.ts --project <pid>   # focus on one project
 *   npx tsx scripts/verify-graph-state.ts --json            # machine-readable output
 *
 * Loads env from (in order, later overrides earlier):
 *   .env.preview  — primary source for NEO4J_* vars (matches Vercel Preview)
 *   .env.local    — local dev overrides if any
 *
 * Checks performed:
 *   1. Neo4j reachable + driver healthy
 *   2. 54 Profile nodes seeded
 *   3. Indices + constraints present
 *   4. Asset nodes (count, enrichment %, slop flags)
 *   5. Project nodes (latest 5 with profileUsed, qualityScore)
 *   6. Scene nodes per project (active version)
 *   7. USED_IN / REMOVED_FROM edges (counts + samples)
 *   8. Graphiti episodes (count + latest 5 by group_id)
 *   9. Profile detection — was Graphiti consulted?
 *   10. Orphan nodes / dangling relationships
 */

// Load env vars BEFORE importing the Neo4j module (which reads them at module init).
// Order: .env.preview (Vercel Preview snapshot) → .env.local (local overrides) → .env.neo4j (optional)
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.preview' });
dotenvConfig({ path: '.env.local', override: false });
dotenvConfig({ path: '.env.neo4j', override: false }); // dedicated Neo4j-only file if you keep secrets separate

if (!process.env.NEO4J_URI || !process.env.NEO4J_PASSWORD) {
  console.error('\x1b[31m✗ Neo4j env vars not found locally.\x1b[0m');
  console.error('');
  console.error('  Option 1 (recommended):  npx vercel env pull --environment=preview .env.preview');
  console.error('  Option 2:                Create .env.neo4j with NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD / NEO4J_DATABASE');
  console.error('  Credentials reference:   D:\\google downloads\\Neo4j-8e902642-Created-2026-04-26.txt');
  console.error('');
  process.exit(1);
}

import { runCypher, isNeo4jAvailable, closeDriver } from '../lib/editron/db/neo4j';

// ─── CLI Args ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const userIdArg = args.indexOf('--user') > -1 ? args[args.indexOf('--user') + 1] : null;
const projectIdArg = args.indexOf('--project') > -1 ? args[args.indexOf('--project') + 1] : null;
const jsonOutput = args.includes('--json');

// ─── ANSI Colors (only when not JSON) ────────────────────────────

const c = jsonOutput
  ? { ok: '', fail: '', warn: '', dim: '', bold: '', reset: '' }
  : {
      ok: '\x1b[32m',
      fail: '\x1b[31m',
      warn: '\x1b[33m',
      dim: '\x1b[2m',
      bold: '\x1b[1m',
      reset: '\x1b[0m',
    };

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: unknown;
}

const results: CheckResult[] = [];

function log(label: string, status: 'pass' | 'warn' | 'fail', msg: string) {
  const icon = status === 'pass' ? `${c.ok}✓${c.reset}` : status === 'warn' ? `${c.warn}!${c.reset}` : `${c.fail}✗${c.reset}`;
  if (!jsonOutput) console.log(`${icon} ${c.bold}${label}${c.reset} — ${msg}`);
  results.push({ name: label, status, message: msg });
}

function logDetail(line: string) {
  if (!jsonOutput) console.log(`  ${c.dim}${line}${c.reset}`);
}

// ─── Checks ──────────────────────────────────────────────────────

async function check1_Reachability() {
  const ok = await isNeo4jAvailable();
  if (!ok) {
    log('1. Reachability', 'fail', 'Neo4j unreachable. Check NEO4J_URI / NEO4J_PASSWORD env vars.');
    return false;
  }
  log('1. Reachability', 'pass', 'Driver connected, server responding.');
  return true;
}

async function check2_ProfileSeeding() {
  const rows = await runCypher<{ count: number }>('MATCH (p:Profile) RETURN count(p) AS count', {}, 'READ');
  const count = rows[0]?.count ?? 0;
  if (count === 54) {
    log('2. Profile seeding', 'pass', `${count} Profile nodes (all 54 seeded)`);
  } else if (count === 0) {
    log('2. Profile seeding', 'fail', `0 profiles. Run: npx tsx scripts/seed-graph-profiles.ts`);
  } else {
    log('2. Profile seeding', 'warn', `${count}/54 profiles. Re-run seeder.`);
  }
}

async function check3_Indices() {
  const rows = await runCypher<{ name: string; type: string; entityType: string }>(
    'SHOW INDEXES YIELD name, type, entityType',
    {},
    'READ',
  );
  const expected = ['asset_id', 'project_id', 'scene_id', 'profile_id', 'asset_user', 'scene_project', 'scene_version', 'project_user', 'asset_embedding'];
  const found = rows.map((r) => r.name);
  const missing = expected.filter((e) => !found.includes(e));
  if (missing.length === 0) {
    log('3. Indices/constraints', 'pass', `All ${expected.length} indices present (vector + lookups + uniques)`);
  } else {
    log('3. Indices/constraints', 'warn', `Missing: ${missing.join(', ')}`);
  }
}

async function check4_AssetNodes() {
  const filter = userIdArg ? 'WHERE a.userId = $userId' : '';
  const params = userIdArg ? { userId: userIdArg } : {};
  const rows = await runCypher<{ total: number; enriched: number; slop: number }>(
    `MATCH (a:Asset) ${filter}
     RETURN count(a) AS total,
            count(CASE WHEN a.embedding IS NOT NULL THEN 1 END) AS enriched,
            count(CASE WHEN size(a.slopFlags) > 0 THEN 1 END) AS slop`,
    params,
    'READ',
  );
  const { total, enriched, slop } = rows[0] ?? { total: 0, enriched: 0, slop: 0 };
  const pct = total === 0 ? 0 : Math.round((enriched / total) * 100);
  const scope = userIdArg ? `for user ${userIdArg.slice(0, 12)}…` : '(all users)';

  if (total === 0) {
    log('4. Asset nodes', 'warn', `No Asset nodes ${scope}. Upload + analysis hasn't fired yet.`);
  } else if (pct < 50) {
    log('4. Asset nodes', 'warn', `${total} assets ${scope}, only ${enriched} (${pct}%) enriched. 5-Track may have failed.`);
  } else {
    log('4. Asset nodes', 'pass', `${total} assets ${scope} (${enriched} enriched / ${pct}%, ${slop} flagged slop)`);
  }
}

async function check5_ProjectNodes() {
  const filter = userIdArg ? 'WHERE p.userId = $userId' : '';
  const params = userIdArg ? { userId: userIdArg } : {};
  const rows = await runCypher<{
    projectId: string;
    profileUsed: string | null;
    profileOverridden: boolean;
    qualityScore: number | null;
    sceneCount: number;
    outcome: string;
    currentVersion: number;
    createdAt: string;
  }>(
    `MATCH (p:Project) ${filter}
     RETURN p.projectId AS projectId, p.profileUsed AS profileUsed,
            p.profileOverridden AS profileOverridden, p.qualityScore AS qualityScore,
            p.sceneCount AS sceneCount, p.outcome AS outcome,
            p.currentVersion AS currentVersion, p.createdAt AS createdAt
     ORDER BY p.createdAt DESC LIMIT 5`,
    params,
    'READ',
  );
  if (rows.length === 0) {
    log('5. Project nodes', 'warn', `No Project nodes${userIdArg ? ' for user' : ''}. Finalize hasn't dispatched yet.`);
    return;
  }
  log('5. Project nodes', 'pass', `${rows.length} most recent project(s)`);
  for (const p of rows) {
    const dirRun = p.profileUsed ? `${c.ok}Director ran${c.reset}` : `${c.warn}no Director${c.reset}`;
    const qScore = p.qualityScore != null ? `${p.qualityScore}/100` : 'no score';
    logDetail(`${p.projectId} → profile=${p.profileUsed ?? '?'} v${p.currentVersion} ${dirRun} q=${qScore} scenes=${p.sceneCount} outcome=${p.outcome}`);
    if (p.profileOverridden) logDetail(`  ↳ profile was overridden by user`);
  }
}

async function check6_SceneNodes() {
  if (!projectIdArg) {
    const rows = await runCypher<{ projectId: string; activeScenes: number; allVersions: number }>(
      `MATCH (s:Scene) ${userIdArg ? 'MATCH (s)<-[:HAS_SCENE]-(p:Project) WHERE p.userId = $userId' : ''}
       RETURN s.projectId AS projectId,
              count(CASE WHEN s.isActive = true THEN 1 END) AS activeScenes,
              count(s) AS allVersions
       ORDER BY activeScenes DESC LIMIT 5`,
      userIdArg ? { userId: userIdArg } : {},
      'READ',
    );
    if (rows.length === 0) {
      log('6. Scene nodes', 'warn', 'No Scene nodes — finalize/Director scene_batch dispatch missed.');
      return;
    }
    log('6. Scene nodes', 'pass', `Top projects by scene count`);
    for (const r of rows) logDetail(`${r.projectId} → ${r.activeScenes} active / ${r.allVersions} total (across versions)`);
  } else {
    const rows = await runCypher<{ sceneId: string; sceneIndex: number; mood: string; transitionIn: string; transitionOut: string; filterApplied: string }>(
      `MATCH (s:Scene {projectId: $projectId, isActive: true})
       RETURN s.sceneId AS sceneId, s.sceneIndex AS sceneIndex,
              s.mood AS mood, s.transitionIn AS transitionIn,
              s.transitionOut AS transitionOut, s.filterApplied AS filterApplied
       ORDER BY s.sceneIndex`,
      { projectId: projectIdArg },
      'READ',
    );
    if (rows.length === 0) {
      log('6. Scene nodes', 'fail', `No active scenes for ${projectIdArg}`);
      return;
    }
    log('6. Scene nodes', 'pass', `${rows.length} active scene(s) for ${projectIdArg}`);
    for (const r of rows) {
      logDetail(`scene ${r.sceneIndex}: mood=${r.mood ?? '?'} in=${r.transitionIn ?? '-'} out=${r.transitionOut ?? '-'} filter=${r.filterApplied ?? '-'}`);
    }
  }
}

async function check7_AssetEdges() {
  const usedRows = await runCypher<{ count: number }>(
    `MATCH (a:Asset)-[r:USED_IN]->(p:Project) ${userIdArg ? 'WHERE a.userId = $userId' : ''}
     RETURN count(r) AS count`,
    userIdArg ? { userId: userIdArg } : {},
    'READ',
  );
  const removedRows = await runCypher<{ count: number; hardcodedNeutrals: number }>(
    `MATCH (a:Asset)-[r:REMOVED_FROM]->(p:Project) ${userIdArg ? 'WHERE a.userId = $userId' : ''}
     RETURN count(r) AS count,
            count(CASE WHEN r.assetColorTemp = 'neutral' AND r.assetEnergy = 0.5 AND r.assetMood = 'neutral' THEN 1 END) AS hardcodedNeutrals`,
    userIdArg ? { userId: userIdArg } : {},
    'READ',
  );
  const usedCount = usedRows[0]?.count ?? 0;
  const removedCount = removedRows[0]?.count ?? 0;
  const hardcoded = removedRows[0]?.hardcodedNeutrals ?? 0;
  if (usedCount + removedCount === 0) {
    log('7. Asset edges', 'warn', 'No USED_IN/REMOVED_FROM edges. Save hasn\'t diffed yet, or no edits made.');
    return;
  }
  log('7. Asset edges', 'pass', `${usedCount} USED_IN, ${removedCount} REMOVED_FROM`);
  if (hardcoded > 0) {
    logDetail(`${c.warn}⚠${c.reset}  ${hardcoded}/${removedCount} REMOVED_FROM edges have hardcoded neutral context — Rule 23N violation, contextual scoring degenerate`);
  }
}

async function check8_GraphitiEpisodes() {
  // Graphiti uses `EpisodicNode` label; the body is in `e.content` (not `e.body`).
  const groupFilter = userIdArg ? 'WHERE e.group_id = $groupId' : '';
  const rows = await runCypher<{ count: number; brandCount: number; outcomeCount: number; overrideCount: number }>(
    `MATCH (e:EpisodicNode) ${groupFilter}
     RETURN count(e) AS count,
            count(CASE WHEN e.source_description CONTAINS 'brand' THEN 1 END) AS brandCount,
            count(CASE WHEN e.source_description CONTAINS 'project_outcome' OR e.source_description CONTAINS 'director_complete' THEN 1 END) AS outcomeCount,
            count(CASE WHEN e.source_description CONTAINS 'override' THEN 1 END) AS overrideCount`,
    userIdArg ? { groupId: userIdArg } : {},
    'READ',
  );
  const r = rows[0];
  if (!r || r.count === 0) {
    log('8. Graphiti episodes', 'warn', 'No EpisodicNode entries. Worker may not have run, or QStash dispatch failed.');
    return;
  }
  log('8. Graphiti episodes', 'pass', `${r.count} episodes (${r.brandCount} brand, ${r.outcomeCount} outcome, ${r.overrideCount} override)`);

  const samples = await runCypher<{ content: string; sourceDescription: string; validAt: string }>(
    `MATCH (e:EpisodicNode) ${groupFilter}
     RETURN e.content AS content, e.source_description AS sourceDescription, e.valid_at AS validAt
     ORDER BY e.valid_at DESC LIMIT 3`,
    userIdArg ? { groupId: userIdArg } : {},
    'READ',
  );
  for (const s of samples) {
    const snippet = (s.content ?? '').slice(0, 100).replace(/\n/g, ' ');
    logDetail(`[${s.sourceDescription ?? '?'}] ${snippet}…`);
  }
}

async function check9_ProfileDetectionTrace() {
  // Did Graphiti boost a profile recently? Look for projects where profileOverridden=true.
  const rows = await runCypher<{ overrideCount: number; total: number }>(
    `MATCH (p:Project) ${userIdArg ? 'WHERE p.userId = $userId' : ''}
     RETURN count(CASE WHEN p.profileOverridden = true THEN 1 END) AS overrideCount,
            count(p) AS total`,
    userIdArg ? { userId: userIdArg } : {},
    'READ',
  );
  const { overrideCount, total } = rows[0] ?? { overrideCount: 0, total: 0 };
  if (total === 0) {
    log('9. Profile override', 'warn', 'No projects to evaluate.');
    return;
  }
  log('9. Profile override', 'pass', `${overrideCount}/${total} projects had profile overridden (user pivots from auto-detect)`);
}

async function check10_DanglingNodes() {
  const orphans = await runCypher<{ assetsWithoutUser: number; scenesWithoutProject: number; projectsWithoutScenes: number }>(
    `OPTIONAL MATCH (a:Asset) WHERE NOT (a)-[:UPLOADED_BY]->(:User)
     WITH count(a) AS assetsWithoutUser
     OPTIONAL MATCH (s:Scene) WHERE NOT (:Project)-[:HAS_SCENE]->(s)
     WITH assetsWithoutUser, count(s) AS scenesWithoutProject
     OPTIONAL MATCH (p:Project) WHERE NOT (p)-[:HAS_SCENE]->(:Scene)
     RETURN assetsWithoutUser, scenesWithoutProject, count(p) AS projectsWithoutScenes`,
    {},
    'READ',
  );
  const r = orphans[0] ?? { assetsWithoutUser: 0, scenesWithoutProject: 0, projectsWithoutScenes: 0 };
  const total = r.assetsWithoutUser + r.scenesWithoutProject + r.projectsWithoutScenes;
  if (total === 0) {
    log('10. Graph integrity', 'pass', 'No dangling/orphan nodes detected.');
  } else {
    log('10. Graph integrity', 'warn', `${r.assetsWithoutUser} assets w/o user, ${r.scenesWithoutProject} scenes w/o project, ${r.projectsWithoutScenes} projects w/o scenes`);
  }
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  if (!jsonOutput) {
    console.log(`${c.bold}Neo4j + Graphiti State Verification${c.reset}`);
    if (userIdArg) console.log(`${c.dim}Scope: user ${userIdArg}${c.reset}`);
    if (projectIdArg) console.log(`${c.dim}Project: ${projectIdArg}${c.reset}`);
    console.log('');
  }

  try {
    const reachable = await check1_Reachability();
    if (!reachable) {
      if (jsonOutput) console.log(JSON.stringify({ ok: false, results }, null, 2));
      process.exit(1);
    }

    await check2_ProfileSeeding();
    await check3_Indices();
    await check4_AssetNodes();
    await check5_ProjectNodes();
    await check6_SceneNodes();
    await check7_AssetEdges();
    await check8_GraphitiEpisodes();
    await check9_ProfileDetectionTrace();
    await check10_DanglingNodes();

    const failed = results.filter((r) => r.status === 'fail').length;
    const warned = results.filter((r) => r.status === 'warn').length;

    if (jsonOutput) {
      console.log(JSON.stringify({ ok: failed === 0, failedChecks: failed, warnings: warned, results }, null, 2));
    } else {
      console.log('');
      const summary = failed > 0
        ? `${c.fail}${failed} failed${c.reset}, ${c.warn}${warned} warning(s)${c.reset}`
        : warned > 0
          ? `${c.warn}${warned} warning(s)${c.reset}, no failures`
          : `${c.ok}All checks passed${c.reset}`;
      console.log(`${c.bold}Summary:${c.reset} ${summary}`);
    }

    process.exit(failed > 0 ? 2 : 0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${c.fail}Verification crashed:${c.reset} ${msg}`);
    if (err instanceof Error && err.stack) console.error(err.stack.split('\n').slice(0, 4).join('\n'));
    process.exit(1);
  } finally {
    await closeDriver();
  }
}

main();
