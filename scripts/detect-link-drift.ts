/**
 * Drift detection: Find entities missing from the project_links chain.
 *
 * Usage:
 *   MONGODB_URI=... MONGODB_DB_NAME=editron_prod npx tsx scripts/detect-link-drift.ts
 *   MONGODB_URI=... MONGODB_DB_NAME=editron_prod npx tsx scripts/detect-link-drift.ts --exit-code
 *
 * This script is read-only. Use backfill-project-links.ts for repair work.
 */

import { MongoClient } from 'mongodb';

const EXIT_CODE_ON_DRIFT = process.argv.includes('--exit-code');
const SAMPLE_LIMIT = Number(process.env.LINK_DRIFT_SAMPLE_LIMIT || 20);
const BRAND_LEARNING_CONSUMER = 'brand-learning-worker';
const BRAND_EVENT_DRIFT_MINUTES = Number(process.env.BRAND_EVENT_DRIFT_MINUTES || 15);

type AnyDoc = Record<string, any>;
type Counter = {
  label: string;
  drift: number;
  total: number;
};

const counters: Counter[] = [];

function cleanId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && (value as any)._bsontype === 'ObjectId') {
    return String(value);
  }
  return null;
}

function idArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(cleanId).filter((id): id is string => Boolean(id))
    : [];
}

function nestedValue(doc: AnyDoc, path: string): unknown {
  return path.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as AnyDoc)[part];
  }, doc);
}

function collectIds(doc: AnyDoc, paths: string[]): string[] {
  const ids = new Set<string>();
  for (const path of paths) {
    const value = nestedValue(doc, path);
    if (Array.isArray(value)) {
      for (const item of value) {
        const id = cleanId(item);
        if (id) ids.add(id);
      }
      continue;
    }

    const id = cleanId(value);
    if (id) ids.add(id);
  }
  return [...ids];
}

function missingFieldList(doc: AnyDoc, fields: string[]): string[] {
  return fields.filter((field) => idArray(doc[field]).length === 0);
}

function logSample(lines: string[], message: string) {
  if (lines.length < SAMPLE_LIMIT) lines.push(message);
}

function printSection(label: string, drift: number, total: number, samples: string[]) {
  counters.push({ label, drift, total });
  for (const sample of samples) console.log(sample);
  console.log(`  ${drift} drift / ${total} total\n`);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.EDITRON_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME;

  if (!uri || !dbName) {
    console.error('ERROR: Set MONGODB_URI and MONGODB_DB_NAME environment variables.');
    process.exit(1);
  }

  console.log(`Drift detection on ${dbName}...\n`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const storyboards = db.collection('storyboards');
  const projects = db.collection('projects');
  const renderJobs = db.collection('editron_render_jobs');
  const links = db.collection('project_links');
  const brandEvents = db.collection('brand_events');

  try {
    await checkStoryboardLinks(storyboards, links);
    await checkProjectLinks(projects, links);
    await checkRenderLinks(renderJobs, links);
    await checkProjectLinkShape(links);
    await checkThumbnailLinks(links, brandEvents);
    await checkBrandEvents(brandEvents);

    printSummary();
  } finally {
    await client.close();
  }
}

async function checkStoryboardLinks(storyboards: any, links: any) {
  console.log('--- 1. Storyboards missing project-link wiring ---');
  const finalizedStoryboards = await storyboards
    .find({ projectId: { $exists: true, $nin: [null, ''] } })
    .project({ storyboardId: 1, projectId: 1, userId: 1 })
    .toArray();

  let drift = 0;
  const samples: string[] = [];

  for (const sb of finalizedStoryboards) {
    const storyboardId = cleanId(sb.storyboardId);
    const projectId = cleanId(sb.projectId);
    const userId = cleanId(sb.userId);

    if (!storyboardId || !projectId || !userId) {
      drift++;
      logSample(samples, `  DRIFT: storyboard doc ${sb._id} missing storyboardId/projectId/userId`);
      continue;
    }

    const byStoryboard = await links.findOne({ userId, storyboardIds: storyboardId });
    const byProject = await links.findOne({ userId, projectIds: projectId });

    if (!byStoryboard && !byProject) {
      drift++;
      logSample(samples, `  DRIFT: no link for storyboard ${storyboardId} -> project ${projectId} (user ${userId})`);
      continue;
    }

    if (byProject && !idArray(byProject.storyboardIds).includes(storyboardId)) {
      drift++;
      logSample(samples, `  DRIFT: link ${byProject.universalId} has project ${projectId} but missing storyboard ${storyboardId}`);
    }

    if (byStoryboard && !idArray(byStoryboard.projectIds).includes(projectId)) {
      drift++;
      logSample(samples, `  DRIFT: link ${byStoryboard.universalId} has storyboard ${storyboardId} but missing project ${projectId}`);
    }
  }

  printSection('Storyboards missing project-link wiring', drift, finalizedStoryboards.length, samples);
}

async function checkProjectLinks(projects: any, links: any) {
  console.log('--- 2. Editron projects missing project-link wiring ---');
  const allProjects = await projects
    .find({})
    .project({ projectId: 1, userId: 1, sourceSessionId: 1, sourceScriptId: 1 })
    .toArray();

  let drift = 0;
  const samples: string[] = [];

  for (const project of allProjects) {
    const projectId = cleanId(project.projectId);
    const userId = cleanId(project.userId);
    const sourceSessionId = cleanId(project.sourceSessionId);

    if (!projectId || !userId) {
      drift++;
      logSample(samples, `  DRIFT: project doc ${project._id} missing projectId/userId`);
      continue;
    }

    const byProject = await links.findOne({ userId, projectIds: projectId });
    if (!byProject) {
      const bySession = sourceSessionId
        ? await links.findOne({ userId, sessionId: sourceSessionId })
        : null;

      drift++;
      if (bySession) {
        logSample(samples, `  DRIFT: link ${bySession.universalId} has session ${sourceSessionId} but missing project ${projectId}`);
      } else {
        logSample(samples, `  DRIFT: no link for project ${projectId} (user ${userId}${sourceSessionId ? `, session ${sourceSessionId}` : ', standalone'})`);
      }
      continue;
    }

    if (sourceSessionId && byProject.sessionId !== sourceSessionId) {
      drift++;
      logSample(samples, `  DRIFT: link ${byProject.universalId} has project ${projectId} but missing session ${sourceSessionId}`);
    }
  }

  printSection('Editron projects missing project-link wiring', drift, allProjects.length, samples);
}

async function checkRenderLinks(renderJobs: any, links: any) {
  console.log('--- 3. Completed renders missing videoIds in project links ---');
  const completedRenders = await renderJobs
    .find({ status: { $in: ['done', 'completed', 'success'] } })
    .project({
      _id: 1,
      renderId: 1,
      videoId: 1,
      videoUuid: 1,
      assetId: 1,
      outputAssetId: 1,
      projectId: 1,
      userId: 1,
      output: 1,
      result: 1,
    })
    .toArray();

  let drift = 0;
  const samples: string[] = [];

  for (const job of completedRenders) {
    const userId = cleanId(job.userId);
    const projectId = cleanId(job.projectId);
    const videoIds = collectIds(job, [
      '_id',
      'renderId',
      'videoId',
      'videoUuid',
      'assetId',
      'outputAssetId',
      'output.assetId',
      'output.videoId',
      'result.assetId',
      'result.videoId',
    ]);

    if (!userId || !projectId || videoIds.length === 0) {
      drift++;
      logSample(samples, `  DRIFT: completed render ${job._id} missing userId/projectId/video id candidates`);
      continue;
    }

    const linkedByVideo = await links.findOne({ userId, videoIds: { $in: videoIds } });
    if (linkedByVideo) continue;

    const linkedByProject = await links.findOne({ userId, projectIds: projectId });
    drift++;
    if (linkedByProject) {
      logSample(samples, `  DRIFT: link ${linkedByProject.universalId} has project ${projectId} but missing videoIds ${videoIds.join(', ')}`);
    } else {
      logSample(samples, `  DRIFT: no project link for completed render ${job._id} -> project ${projectId}`);
    }
  }

  printSection('Completed renders missing videoIds in project links', drift, completedRenders.length, samples);
}

async function checkProjectLinkShape(links: any) {
  console.log('--- 4. Project links with malformed or empty ID fields ---');
  const allLinks = await links
    .find({})
    .project({ universalId: 1, userId: 1, sessionId: 1, storyboardIds: 1, projectIds: 1, videoIds: 1, thumbnailIds: 1, createdAt: 1 })
    .toArray();

  let drift = 0;
  const samples: string[] = [];

  for (const link of allLinks) {
    const missingFields = missingFieldList(link, ['storyboardIds', 'projectIds', 'videoIds', 'thumbnailIds']);
    const hasAnyContentId = ['storyboardIds', 'projectIds', 'videoIds', 'thumbnailIds'].some(
      (field) => idArray(link[field]).length > 0,
    );

    if (!Array.isArray(link.storyboardIds) || !Array.isArray(link.projectIds) || !Array.isArray(link.videoIds)) {
      drift++;
      logSample(samples, `  DRIFT: link ${link.universalId} has non-array core ID fields`);
      continue;
    }

    if (!hasAnyContentId) {
      drift++;
      logSample(samples, `  DRIFT: orphan shell ${link.universalId} (user ${link.userId}, created ${link.createdAt})`);
      continue;
    }

    if (missingFields.includes('thumbnailIds')) {
      drift++;
      logSample(samples, `  DRIFT: link ${link.universalId} missing thumbnailIds array`);
    }
  }

  printSection('Project links with malformed or empty ID fields', drift, allLinks.length, samples);
}

async function checkThumbnailLinks(links: any, brandEvents: any) {
  console.log('--- 5. Committed thumbnails missing thumbnailIds in project links ---');
  const thumbnailLinks = await links
    .find({ 'metadata.clickatron.committedThumbnails.0': { $exists: true } })
    .project({ universalId: 1, userId: 1, thumbnailIds: 1, metadata: 1 })
    .toArray();

  let drift = 0;
  const samples: string[] = [];

  for (const link of thumbnailLinks) {
    const thumbnailIds = idArray(link.thumbnailIds);
    const committed = Array.isArray(link.metadata?.clickatron?.committedThumbnails)
      ? link.metadata.clickatron.committedThumbnails
      : [];

    for (const thumbnail of committed) {
      const thumbnailId = cleanId(thumbnail?.thumbnailId);
      if (thumbnailId && !thumbnailIds.includes(thumbnailId)) {
        drift++;
        logSample(samples, `  DRIFT: link ${link.universalId} committed thumbnail ${thumbnailId} but thumbnailIds does not include it`);
      }
    }
  }

  const thumbnailEvents = await brandEvents
    .find({ service: 'clickatron', type: 'thumbnail_created' })
    .project({ eventId: 1, userId: 1, projectId: 1, payload: 1, createdAt: 1 })
    .toArray();

  for (const event of thumbnailEvents) {
    const userId = cleanId(event.userId);
    const thumbnailId = cleanId(event.payload?.thumbnailId);
    if (!userId || !thumbnailId) {
      drift++;
      logSample(samples, `  DRIFT: thumbnail_created event ${event.eventId} missing userId/thumbnailId`);
      continue;
    }

    const byThumbnail = await links.findOne({ userId, thumbnailIds: thumbnailId });
    if (byThumbnail) continue;

    const universalId = cleanId(event.payload?.universalId) || cleanId(event.payload?.sourceContext?.universalId);
    const byUniversal = universalId
      ? await links.findOne({ userId, universalId })
      : null;

    drift++;
    if (byUniversal) {
      logSample(samples, `  DRIFT: link ${universalId} has thumbnail event ${thumbnailId} but missing thumbnailIds entry`);
    } else {
      logSample(samples, `  DRIFT: thumbnail event ${event.eventId} has no linked thumbnailIds entry for ${thumbnailId}`);
    }
  }

  printSection('Committed thumbnails missing thumbnailIds in project links', drift, thumbnailLinks.length + thumbnailEvents.length, samples);
}

async function checkBrandEvents(brandEvents: any) {
  console.log('--- 6. Unprocessed brand_events for brand-learning worker ---');
  const now = new Date();
  const cutoff = new Date(now.getTime() - BRAND_EVENT_DRIFT_MINUTES * 60 * 1000);
  const leasePath = `processingLeases.${BRAND_LEARNING_CONSUMER}`;

  const unprocessed = await brandEvents
    .find({
      createdAt: { $lte: cutoff },
      consumedBy: { $ne: BRAND_LEARNING_CONSUMER },
      $or: [
        { [leasePath]: { $exists: false } },
        { [leasePath]: { $lte: now } },
      ],
    })
    .project({ eventId: 1, service: 1, type: 1, userId: 1, brandId: 1, projectId: 1, createdAt: 1, processingLeases: 1 })
    .toArray();

  const activeLeases = await brandEvents.countDocuments({
    consumedBy: { $ne: BRAND_LEARNING_CONSUMER },
    [leasePath]: { $gt: now },
  });

  const samples: string[] = [];
  for (const event of unprocessed) {
    logSample(
      samples,
      `  DRIFT: brand_event ${event.eventId} ${event.service}/${event.type} unprocessed since ${event.createdAt}`,
    );
  }

  if (activeLeases > 0) {
    logSample(samples, `  INFO: ${activeLeases} events currently leased by ${BRAND_LEARNING_CONSUMER}`);
  }

  printSection('Unprocessed brand_events for brand-learning worker', unprocessed.length, unprocessed.length + activeLeases, samples);
}

function printSummary() {
  console.log('=== SUMMARY ===');
  for (const counter of counters) {
    console.log(`${counter.label}: ${counter.drift}/${counter.total}`);
  }

  const totalDrift = counters.reduce((sum, counter) => sum + counter.drift, 0);
  if (totalDrift === 0) {
    console.log('\nNo drift detected.');
  } else {
    console.log(`\n${totalDrift} total drift items.`);
    console.log('Run backfill-project-links.ts for verified storyboard/project repairs; repair video, thumbnail, and brand_event drift from the reported source records.');
  }

  if (EXIT_CODE_ON_DRIFT && totalDrift > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
