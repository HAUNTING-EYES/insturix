import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Db } from 'mongodb';

import {
  assertStage25ProjectServiceConflictProductProofReceiptV1,
  executeStage25ProjectServiceConflictProductProofV1,
  type Stage25ProjectServiceConflictProbeStoreV1,
} from '../lib/editron/research/open-ended-planner/stage25-project-service-conflict-product-proof-v1';
import type { Project } from '../lib/editron/services/project-service';

const repoRoot = process.cwd();
const uri = required('STAGE25_PROJECTSERVICE_MONGODB_URI');
const databaseName = required('STAGE25_PROJECTSERVICE_MONGODB_DB_NAME');
assertLoopbackMongo(uri, databaseName);

process.env.MONGODB_URI = uri;
process.env.MONGODB_DB_NAME = databaseName;
process.env.EDITRON_MONGODB_DB_NAME = databaseName;

const createdAt = new Date().toISOString();
const compactTime = createdAt.replace(/[-:.TZ]/g, '');
const executionId = `conflict-mongo-${compactTime}`;
const userId = `stage25_conflict_${compactTime}`;
const projectIdPrefix = `s25-conflict-${compactTime}`;
const projectIds = [
  `${projectIdPrefix}-disjoint`,
  `${projectIdPrefix}-overlap`,
  `${projectIdPrefix}-locks`,
  `${projectIdPrefix}-invalid-inputs`,
  `${projectIdPrefix}-stale-evidence`,
];
const outputRoot = path.resolve(
  repoRoot,
  '.calibration-temp',
  'open-ended-planner-v2',
  'stage25-project-service-conflict-product-v1',
  executionId,
);

const mongodb = await import('../lib/editron/db/mongodb');
const { projectService } = await import('../lib/editron/services/project-service');
const { client, db } = await mongodb.connectToDatabase();

try {
  const [buildInfo, serverStatus, sourceCommit, projectServiceSha256,
    proofOwnerSha256, runnerSha256] = await Promise.all([
    db.command({ buildInfo: 1 }),
    db.command({ serverStatus: 1 }),
    Promise.resolve(execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim()),
    sha256File(path.resolve(repoRoot, 'lib/editron/services/project-service.ts')),
    sha256File(path.resolve(
      repoRoot,
      'lib/editron/research/open-ended-planner/stage25-project-service-conflict-product-proof-v1.ts',
    )),
    sha256File(path.resolve(
      repoRoot,
      'scripts/run-stage25-project-service-conflict-mongo-proof-v1.ts',
    )),
  ]);
  const serverVersion = textField(buildInfo, 'version');
  const storageEngine = nestedTextField(serverStatus, 'storageEngine', 'name');
  const store = mongoProbeStore(db, mongodb.COLLECTIONS.PROJECTS);
  const receipt = await executeStage25ProjectServiceConflictProductProofV1({
    owner: projectService,
    store,
    environment: {
      persistenceKind: 'REAL_MONGODB_SINGLE_NODE',
      topology: 'LOOPBACK_STANDALONE_MONGOD',
      serverVersion,
      storageEngine,
      sourceCommit,
      projectServiceSha256,
      proofOwnerSha256,
      runnerSha256,
    },
    executionId,
    createdAt,
    userId,
    projectIdPrefix,
  });
  assertStage25ProjectServiceConflictProductProofReceiptV1(receipt);

  await mkdir(path.dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot, { recursive: false });
  const receiptPath = path.resolve(outputRoot, 'receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  const receiptFileSha256 = await sha256File(receiptPath);
  console.log(JSON.stringify({
    assessment: receipt.assessment,
    receiptSha256: receipt.receiptSha256,
    receiptFileSha256,
    gateCount: receipt.gates.length,
    allGatesPass: receipt.gates.every(({ status }) => status === 'PASS'),
    persistenceKind: receipt.execution.environment.persistenceKind,
    serverVersion,
    storageEngine,
    evidenceRoot: outputRoot,
  }, null, 2));
} finally {
  await db.collection(mongodb.COLLECTIONS.PROJECTS).deleteMany({
    userId,
    projectId: { $in: projectIds },
  });
  await client.close();
}

function mongoProbeStore(
  db: Db,
  collectionName: string,
): Stage25ProjectServiceConflictProbeStoreV1 {
  const collection = db.collection<Project>(collectionName);
  return {
    installProject: async (project) => {
      const prior = await collection.countDocuments({
        projectId: project.projectId,
        userId: project.userId,
      });
      if (prior !== 0) throw new Error('STAGE25_CONFLICT_FIXTURE_ID_COLLISION');
      await collection.insertOne(structuredClone(project));
    },
    readProject: async (userId, projectId) => collection.findOne({ userId, projectId }),
    deleteProjects: async (userId, projectIds) => {
      await collection.deleteMany({ userId, projectId: { $in: [...projectIds] } });
    },
    countProjects: (userId, projectIds) => collection.countDocuments({
      userId,
      projectId: { $in: [...projectIds] },
    }),
  };
}

function assertLoopbackMongo(uriValue: string, dbName: string): void {
  if (!/^mongodb:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/i.test(uriValue)
    || !/^editron_stage25_conflict_[a-z0-9_]{8,80}$/.test(dbName)) {
    throw new Error(
      'Stage 2.5 conflict proof requires a loopback Mongo URI and a dedicated editron_stage25_conflict_* database.',
    );
  }
}

function textField(value: unknown, field: string): string {
  if (!isRecord(value) || typeof value[field] !== 'string' || !value[field]) {
    throw new Error(`STAGE25_CONFLICT_MONGODB_${field.toUpperCase()}_MISSING`);
  }
  return value[field];
}

function nestedTextField(value: unknown, owner: string, field: string): string {
  if (!isRecord(value) || !isRecord(value[owner])) {
    throw new Error(`STAGE25_CONFLICT_MONGODB_${owner.toUpperCase()}_MISSING`);
  }
  return textField(value[owner], field);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Stage 2.5 conflict proof missing ${name}`);
  return value;
}

async function sha256File(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
