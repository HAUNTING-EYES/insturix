/**
 * Seed Neo4j with 54 Edit Profile nodes.
 *
 * Run: npx tsx scripts/seed-graph-profiles.ts
 *
 * Idempotent — uses MERGE, safe to re-run.
 * Also creates all Neo4j indices and constraints on first run.
 *
 * Requires env vars: NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE
 */

import { EDIT_PROFILES } from '../lib/editron/data/edit-profiles';
import {
  createIndicesAndConstraints,
  seedProfileNodes,
  type ProfileNode,
} from '../lib/editron/services/graph-service';
import { closeDriver } from '../lib/editron/db/neo4j';

async function main() {
  console.log('Creating Neo4j indices and constraints...');
  const indexResult = await createIndicesAndConstraints();
  if (!indexResult.ok) {
    console.error('Failed to create indices:', indexResult.error);
    process.exit(1);
  }
  console.log('Indices ready.');

  const profiles: ProfileNode[] = Object.values(EDIT_PROFILES).map((p) => ({
    profileId: p.profileId,
    name: p.name,
    category: p.category,
    cutsPerMinLow: p.cutsPerMinRange[0],
    cutsPerMinHigh: p.cutsPerMinRange[1],
    defaultTransition: p.defaultTransition,
    filterPreset: p.filterPresetId,
    captionStyle: p.captionStyle,
    bgmDuckLevel: p.bgmDuckLevel,
  }));

  console.log(`Seeding ${profiles.length} profiles...`);
  const seedResult = await seedProfileNodes(profiles);
  if (!seedResult.ok) {
    console.error('Failed to seed profiles:', seedResult.error);
    process.exit(1);
  }

  console.log(`Done. ${profiles.length} profiles seeded in Neo4j.`);
  await closeDriver();
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
