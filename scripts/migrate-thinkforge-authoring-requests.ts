import { config } from 'dotenv';
import { MongoClient } from 'mongodb';
import {
  planThinkForgeAuthoringRequestMigration,
  type LegacyThinkForgeAuthoringSessionRecord,
} from '@/lib/thinkforge/migrations/authoring-request-v1';
import {
  THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD,
  buildThinkForgeAuthoringRequestV1RollbackUpdate,
  createThinkForgeAuthoringRequestV1Backup,
  type ThinkForgeAuthoringRequestV1Backup,
} from '@/lib/thinkforge/migrations/authoring-request-backup-v1';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const databaseName = process.env.THINKFORGE_MONGODB_DB_NAME?.trim() || 'thinkforge_db';
const confirmedDatabase = process.argv.find((value) => value.startsWith('--confirm-db='))?.slice(13);

type MigrationSession = LegacyThinkForgeAuthoringSessionRecord & {
  [THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD]?: ThinkForgeAuthoringRequestV1Backup;
};

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('MONGODB_URI is required');
  if (APPLY && ROLLBACK) throw new Error('Choose either --apply or --rollback');
  if ((APPLY || ROLLBACK) && confirmedDatabase !== databaseName) {
    throw new Error(`Mutation mode requires --confirm-db=${databaseName}`);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();
  try {
    const sessions = client.db(databaseName).collection<MigrationSession>('thinkforge_sessions');
    if (ROLLBACK) {
      const backups = await sessions.find(
        { [THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD]: { $exists: true } },
        { projection: { _id: 1, [THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD]: 1 } },
      ).toArray();
      if (backups.length === 0) throw new Error('No ThinkForge authoring request backups found');
      const result = await sessions.bulkWrite(backups.map((session) => ({
        updateOne: {
          filter: { _id: session._id },
          update: buildThinkForgeAuthoringRequestV1RollbackUpdate(
            session[THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD]!,
          ),
        },
      })), { ordered: false });
      if (result.matchedCount !== backups.length) {
        throw new Error(`Rollback matched ${result.matchedCount}/${backups.length} sessions`);
      }
      const remainingBackups = await sessions.countDocuments({
        [THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD]: { $exists: true },
      });
      if (remainingBackups !== 0) {
        throw new Error(`Rollback left ${remainingBackups} authoring request backups unresolved`);
      }
      console.log(`Restored ${backups.length} ThinkForge authoring request sessions.`);
      return;
    }

    const candidates = await sessions.find(
      { 'projectMeta.authoringRequestMigration.version': { $ne: 1 } },
      { projection: { _id: 1, projectMeta: 1 } },
    ).toArray();
    const plan = planThinkForgeAuthoringRequestMigration(candidates.map((session) => ({
      _id: String(session._id),
      projectMeta: session.projectMeta,
    })));
    console.log(JSON.stringify({ database: databaseName, mode: APPLY ? 'apply' : 'dry-run', ...plan.summary }, null, 2));
    for (const decision of plan.decisions) {
      if (decision.status === 'quarantined') console.warn(`[quarantine] ${decision.sessionId}: ${decision.reason}`);
    }
    if (!APPLY) {
      console.log(`Dry run only. Re-run with --apply --confirm-db=${databaseName} after reviewing quarantines.`);
      return;
    }
    if (plan.decisions.length === 0) {
      console.log('No unmigrated ThinkForge authoring request sessions found.');
      return;
    }

    const capturedAt = new Date();
    const sessionsById = new Map(candidates.map((session) => [String(session._id), session]));
    const backupResult = await sessions.bulkWrite(plan.decisions.map((decision) => {
      const session = sessionsById.get(decision.sessionId);
      if (!session) throw new Error(`Migration source disappeared: ${decision.sessionId}`);
      const projectMeta = session.projectMeta && typeof session.projectMeta === 'object' && !Array.isArray(session.projectMeta)
        ? session.projectMeta as Record<string, unknown>
        : {};
      return {
        updateOne: {
          filter: { _id: session._id, [THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD]: { $exists: false } },
          update: { $set: { [THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD]: createThinkForgeAuthoringRequestV1Backup(projectMeta, capturedAt) } },
        },
      };
    }), { ordered: false });
    if (backupResult.matchedCount !== plan.summary.scanned) {
      throw new Error(`Backup verification failed: ${backupResult.matchedCount}/${plan.summary.scanned}`);
    }

    const appliedAt = new Date();
    await sessions.bulkWrite(plan.decisions.map((decision) => ({
      updateOne: {
        filter: { _id: sessionsById.get(decision.sessionId)!._id },
        update: {
          $set: {
            ...decision.update.$set,
            'projectMeta.authoringRequestMigration.migratedAt': appliedAt,
          },
          ...(Object.keys(decision.update.$unset).length > 0 ? { $unset: decision.update.$unset } : {}),
        },
      },
    })), { ordered: false });

    await sessions.createIndex(
      { 'projectMeta.authoringRequestMigration.version': 1, 'projectMeta.authoringRequestMigration.status': 1 },
      { name: 'thinkforge_authoring_request_migration_status' },
    );
    const ids = candidates.map((session) => session._id);
    const [active, quarantined] = await Promise.all([
      sessions.countDocuments({ _id: { $in: ids }, 'projectMeta.authoringRequestMigration.status': 'active' }),
      sessions.countDocuments({ _id: { $in: ids }, 'projectMeta.authoringRequestMigration.status': 'quarantined' }),
    ]);
    if (active !== plan.summary.active || quarantined !== plan.summary.quarantined) {
      throw new Error(`Verification mismatch: active=${active}, quarantined=${quarantined}`);
    }
    console.log(`Applied and verified ${active} active sessions; ${quarantined} quarantined.`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
