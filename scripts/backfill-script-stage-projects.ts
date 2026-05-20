/**
 * Backfill script: Create lightweight Editron projects for ThinkForge sessions
 * that never exported to storyboard, making them visible in the dashboard "Script" column.
 *
 * Logic:
 *   1. Read all sessions from thinkforge_db.thinkforge_sessions
 *   2. For each session, check if an Editron project already exists (sourceSessionId match)
 *   3. Check if a project_link already exists for this session
 *   4. If the link has storyboardIds → session already progressed → skip
 *   5. If no Editron project exists → create lightweight project + project_link
 *
 * Idempotent — safe to run multiple times. Skips sessions that already have projects.
 *
 * Usage:
 *   MONGODB_URI=... MONGODB_DB_NAME=editron_prev npx tsx scripts/backfill-script-stage-projects.ts --dry-run
 *   MONGODB_URI=... MONGODB_DB_NAME=editron_prod npx tsx scripts/backfill-script-stage-projects.ts
 */

import { MongoClient } from 'mongodb';
import { nanoid } from 'nanoid';

const DRY_RUN = process.argv.includes('--dry-run');
const THINKFORGE_DB = 'thinkforge_db';

async function main() {
  const uri = process.env.MONGODB_URI;
  const editronDbName = process.env.EDITRON_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME;

  if (!uri || !editronDbName) {
    console.error('ERROR: Set MONGODB_URI and MONGODB_DB_NAME environment variables.');
    process.exit(1);
  }

  console.log(`Connecting...`);
  console.log(`  ThinkForge DB: ${THINKFORGE_DB}`);
  console.log(`  Editron DB:    ${editronDbName}`);
  console.log(`  Mode:          ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const client = new MongoClient(uri);
  await client.connect();

  const tfDb = client.db(THINKFORGE_DB);
  const editronDb = client.db(editronDbName);

  const sessions = tfDb.collection('thinkforge_sessions');
  const projects = editronDb.collection('projects');
  const projectLinks = editronDb.collection('project_links');

  // Get all ThinkForge sessions
  const cursor = sessions.find(
    {},
    { projection: { _id: 1, userId: 1, projectMeta: 1, orgId: 1, createdAt: 1, updatedAt: 1 } },
  );

  let scanned = 0;
  let created = 0;
  let skipped = 0;
  let alreadyProgressed = 0;
  let errors = 0;

  for await (const doc of cursor) {
    scanned++;
    const sessionId = String(doc._id);
    const userId = doc.userId as string;
    const projectMeta = (doc.projectMeta || {}) as any;
    const orgId = doc.orgId as string | undefined;

    if (!userId) {
      console.warn(`  SKIP: Session ${sessionId} has no userId`);
      skipped++;
      continue;
    }

    // Check if Editron project already exists for this session
    const existingProject = await projects.findOne({ userId, sourceSessionId: sessionId });
    if (existingProject) {
      skipped++;
      continue;
    }

    // Check if a project_link exists with storyboards (session already progressed)
    const existingLink = await projectLinks.findOne({ userId, sessionId });
    if (existingLink && existingLink.storyboardIds?.length > 0) {
      alreadyProgressed++;
      continue;
    }

    // Session never exported — create lightweight project + link
    const projectId = `proj_${nanoid(12)}`;
    const title = projectMeta.title || projectMeta.topic || 'Untitled Script';
    const now = new Date();

    const project = {
      projectId,
      userId,
      name: title,
      overlays: [],
      aspectRatio: '16:9',
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 0,
      visibility: orgId ? 'org' : 'private',
      pipelineStage: 'script',
      projectStatus: 'active',
      sourceSessionId: sessionId,
      ...(orgId ? { orgId } : {}),
      ...(projectMeta.brandId ? { brandId: projectMeta.brandId } : {}),
      createdAt: doc.createdAt || now,
      updatedAt: doc.updatedAt || now,
    };

    if (DRY_RUN) {
      console.log(`  WOULD CREATE: project ${projectId} for session ${sessionId} ("${title}")`);
    } else {
      try {
        await projects.insertOne(project);

        // Create project_link if one doesn't exist yet
        if (!existingLink) {
          const link = {
            universalId: `plink_${nanoid(12)}`,
            userId,
            sessionId,
            storyboardIds: [],
            projectIds: [projectId],
            videoIds: [],
            ...(projectMeta.brandId ? { brandId: projectMeta.brandId } : {}),
            schemaVersion: 1,
            createdAt: now,
            updatedAt: now,
          };
          await projectLinks.insertOne(link);
        } else {
          // Link exists but has no storyboards — just add projectId
          await projectLinks.updateOne(
            { universalId: existingLink.universalId },
            { $addToSet: { projectIds: projectId }, $set: { updatedAt: now } },
          );
        }

        console.log(`  CREATED: project ${projectId} for session ${sessionId} ("${title}")`);
      } catch (err: any) {
        console.error(`  ERROR for session ${sessionId}: ${err.message}`);
        errors++;
        continue;
      }
    }
    created++;
  }

  console.log('\n--- Summary ---');
  console.log(`Scanned:             ${scanned} ThinkForge sessions`);
  console.log(`Created:             ${created} script-stage projects`);
  console.log(`Skipped (existing):  ${skipped} (already have Editron project)`);
  console.log(`Already progressed:  ${alreadyProgressed} (have storyboard — in Edit+ stage)`);
  console.log(`Errors:              ${errors}`);
  if (DRY_RUN) console.log('\n(DRY RUN — no changes written)');

  await client.close();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
