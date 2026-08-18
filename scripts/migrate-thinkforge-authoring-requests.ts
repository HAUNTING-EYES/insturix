import { config } from 'dotenv';
import { MongoClient, type ObjectId } from 'mongodb';
import {
  THINKFORGE_AUTHORING_REQUEST_MIGRATION_VERSION,
  pairThinkForgeAuthoringRequestMigrationSources,
  planThinkForgeAuthoringRequestMigration,
} from '@/lib/thinkforge/migrations/authoring-request-v1';
import {
  THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD,
  buildThinkForgeAuthoringRequestV1RollbackUpdate,
  createThinkForgeAuthoringRequestV1Backup,
  type ThinkForgeAuthoringRequestV1Backup,
} from '@/lib/thinkforge/migrations/authoring-request-backup-v1';
import {
  ThinkForgeMigrationExecutionReporter,
  buildMigrationCasFilter,
  captureMigrationCasFields,
  hashMigrationValue,
  readMigrationGitIdentity,
  recordMigrationFailure,
  resolveMigrationMode,
  resolveMigrationOperator,
  resolveMigrationRunId,
  runMigrationTransaction,
  type ThinkForgeMigrationCasField,
} from '@/lib/thinkforge/migrations/execution-report-v1';

config({ path: '.env.local' });

const MIGRATION_NAME = 'thinkforge_authoring_requests';
const MIGRATION_STATUS_INDEX = 'thinkforge_authoring_request_migration_status';
const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const mode = resolveMigrationMode({ apply: APPLY, rollback: ROLLBACK });
const operator = resolveMigrationOperator(mode, process.argv.slice(2));
const runId = resolveMigrationRunId(process.argv.slice(2));
const databaseName = process.env.THINKFORGE_MONGODB_DB_NAME?.trim() || 'thinkforge_db';
const confirmedDatabase = process.argv
  .find((value) => value.startsWith('--confirm-db='))
  ?.slice('--confirm-db='.length);

type MigrationSession = {
  _id: string | ObjectId;
  projectMeta?: unknown;
  [THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD]?: ThinkForgeAuthoringRequestV1Backup;
};

interface AuthoringRequestWorkItem {
  decision: ReturnType<typeof planThinkForgeAuthoringRequestMigration>['decisions'][number];
  session: MigrationSession;
  backup: ThinkForgeAuthoringRequestV1Backup;
  sourceFields: ThinkForgeMigrationCasField[];
}

function asProjectMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('MONGODB_URI is required');
  if (mode !== 'dry_run' && confirmedDatabase !== databaseName) {
    throw new Error(`Mutation mode requires --confirm-db=${databaseName}`);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  let reporter: ThinkForgeMigrationExecutionReporter | null = null;
  await client.connect();
  try {
    const database = client.db(databaseName);
    const sessions = database.collection<MigrationSession>('thinkforge_sessions');
    reporter = await ThinkForgeMigrationExecutionReporter.create({
      database,
      runId,
      migrationName: MIGRATION_NAME,
      migrationVersion: THINKFORGE_AUTHORING_REQUEST_MIGRATION_VERSION,
      mode,
      databaseName,
      operator,
      git: readMigrationGitIdentity(),
    });
    console.log(`Migration run ID: ${reporter.runId}`);

    if (mode === 'rollback') {
      const backups = await sessions.find(
        { [THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD]: { $exists: true } },
        { projection: { _id: 1, projectMeta: 1, [THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD]: 1 } },
      ).toArray();
      if (backups.length === 0) throw new Error('No ThinkForge authoring request backups found');
      const sourceHash = hashMigrationValue(backups);
      await reporter.append('planned', {
        counts: { scanned: backups.length },
        hashes: { source: sourceHash, plan: hashMigrationValue(backups.map((session) => session._id)) },
        codes: ['rollback'],
      });
      const workItems = backups.map((session) => {
        const backup = session[THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD] as ThinkForgeAuthoringRequestV1Backup;
        return {
          session,
          backup,
          sourceFields: [
            ...captureMigrationCasFields(session as unknown as Record<string, unknown>, ['projectMeta']),
            { path: THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD, exists: true, value: backup },
          ],
        };
      });
      await runMigrationTransaction({
        client,
        reporter,
        execute: async (mongoSession) => {
          const result = await sessions.bulkWrite(workItems.map(({ session, backup, sourceFields }) => ({
            updateOne: {
              filter: buildMigrationCasFilter<MigrationSession>({ _id: session._id }, sourceFields),
              update: buildThinkForgeAuthoringRequestV1RollbackUpdate(backup),
            },
          })), { ordered: true, session: mongoSession });
          if (result.matchedCount !== workItems.length) {
            throw new Error(`Rollback source drift: ${result.matchedCount}/${workItems.length} sessions`);
          }
          const remaining = await sessions.countDocuments({
            _id: { $in: workItems.map(({ session }) => session._id) },
            [THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD]: { $exists: true },
          }, { session: mongoSession });
          if (remaining !== 0) {
            throw new Error(`Rollback left ${remaining} authoring request backups unresolved`);
          }
          await reporter!.append('rolled_back', {
            counts: { restored: result.matchedCount, remainingBackups: remaining },
            hashes: { source: sourceHash },
          }, mongoSession);
        },
      });
      console.log(`Restored ${workItems.length} ThinkForge authoring request sessions.`);
      return;
    }

    const candidates = await sessions.find(
      { 'projectMeta.authoringRequestMigration.version': { $ne: THINKFORGE_AUTHORING_REQUEST_MIGRATION_VERSION } },
      { projection: { _id: 1, projectMeta: 1 } },
    ).toArray();
    const plan = planThinkForgeAuthoringRequestMigration(candidates.map((session) => ({
      _id: String(session._id),
      projectMeta: session.projectMeta,
    })));
    const sourceHash = hashMigrationValue(candidates);
    const planHash = hashMigrationValue(plan.decisions);
    const quarantineReasons = plan.decisions
      .filter((decision) => decision.status === 'quarantined')
      .map((decision) => decision.reason);
    console.log(JSON.stringify({
      database: databaseName,
      mode,
      runId: reporter.runId,
      ...plan.summary,
    }, null, 2));
    await reporter.append('planned', {
      counts: plan.summary,
      hashes: {
        source: sourceHash,
        plan: planHash,
        quarantineReasons: hashMigrationValue(quarantineReasons.sort()),
      },
    });
    for (const decision of plan.decisions) {
      if (decision.status === 'quarantined') console.warn(`[quarantine] ${decision.sessionId}: ${decision.reason}`);
    }
    if (mode === 'dry_run') {
      await reporter.append('verified', {
        counts: { ...plan.summary, targetMutations: 0 },
        hashes: { source: sourceHash, plan: planHash },
        codes: ['dry_run_only'],
      });
      console.log(`Dry run only. Re-run with --apply --confirm-db=${databaseName} --operator=<operator-id> after reviewing quarantines.`);
      return;
    }

    const capturedAt = new Date();
    const workItems: AuthoringRequestWorkItem[] = pairThinkForgeAuthoringRequestMigrationSources(
      candidates,
      plan,
    ).map(({ decision, source: session }) => {
      return {
        decision,
        session,
        backup: createThinkForgeAuthoringRequestV1Backup(asProjectMeta(session.projectMeta), capturedAt),
        sourceFields: captureMigrationCasFields(
          session as unknown as Record<string, unknown>,
          ['projectMeta'],
        ),
      };
    });

    if (workItems.length > 0) {
      await runMigrationTransaction({
        client,
        reporter,
        execute: async (mongoSession) => {
          const backupResult = await sessions.bulkWrite(workItems.map(({ session, backup, sourceFields }) => ({
            updateOne: {
              filter: buildMigrationCasFilter<MigrationSession>(
                { _id: session._id },
                [...sourceFields, { path: THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD, exists: false }],
              ),
              update: { $set: { [THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD]: backup } },
            },
          })), { ordered: true, session: mongoSession });
          if (backupResult.matchedCount !== workItems.length) {
            throw new Error(`Backup source drift: ${backupResult.matchedCount}/${workItems.length} sessions`);
          }
          await reporter!.append('backed_up', {
            counts: { backedUp: backupResult.matchedCount },
            hashes: { source: sourceHash },
          }, mongoSession);

          const appliedAt = new Date();
          const applyResult = await sessions.bulkWrite(workItems.map(({ decision, session, backup, sourceFields }) => ({
            updateOne: {
              filter: buildMigrationCasFilter<MigrationSession>(
                { _id: session._id },
                [...sourceFields, { path: THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD, exists: true, value: backup }],
              ),
              update: {
                $set: {
                  ...decision.update.$set,
                  'projectMeta.authoringRequestMigration.migratedAt': appliedAt,
                },
                ...(Object.keys(decision.update.$unset).length > 0 ? { $unset: decision.update.$unset } : {}),
              },
            },
          })), { ordered: true, session: mongoSession });
          if (applyResult.matchedCount !== workItems.length) {
            throw new Error(`Apply source drift: ${applyResult.matchedCount}/${workItems.length} sessions`);
          }
          await reporter!.append('applied', {
            counts: { applied: applyResult.matchedCount },
            hashes: { plan: planHash },
          }, mongoSession);
        },
      });
    } else {
      await reporter.append('applied', { counts: { applied: 0 }, hashes: { plan: planHash } });
    }

    await sessions.createIndex(
      { 'projectMeta.authoringRequestMigration.version': 1, 'projectMeta.authoringRequestMigration.status': 1 },
      { name: MIGRATION_STATUS_INDEX },
    );
    const ids = workItems.map(({ session }) => session._id);
    await runMigrationTransaction({
      client,
      reporter,
      execute: async (mongoSession) => {
        const [active, quarantined, backedUp] = await Promise.all([
          sessions.countDocuments({
            _id: { $in: ids },
            'projectMeta.authoringRequestMigration.version': THINKFORGE_AUTHORING_REQUEST_MIGRATION_VERSION,
            'projectMeta.authoringRequestMigration.status': 'active',
          }, { session: mongoSession }),
          sessions.countDocuments({
            _id: { $in: ids },
            'projectMeta.authoringRequestMigration.version': THINKFORGE_AUTHORING_REQUEST_MIGRATION_VERSION,
            'projectMeta.authoringRequestMigration.status': 'quarantined',
          }, { session: mongoSession }),
          sessions.countDocuments({
            _id: { $in: ids },
            [THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD]: { $exists: true },
          }, { session: mongoSession }),
        ]);
        if (active !== plan.summary.active || quarantined !== plan.summary.quarantined
          || backedUp !== plan.summary.scanned) {
          throw new Error(`Verification mismatch: active=${active}, quarantined=${quarantined}, backedUp=${backedUp}`);
        }
        await reporter!.append('verified', {
          counts: { active, quarantined, backedUp },
          hashes: { source: sourceHash, plan: planHash },
        }, mongoSession);
      },
    });
    console.log(
      `Applied and verified ${plan.summary.active} active sessions; ${plan.summary.quarantined} quarantined; ${plan.summary.scanned} backed up.`,
    );
  } catch (error) {
    if (reporter) {
      try {
        await recordMigrationFailure(reporter, error);
      } catch (reportError) {
        console.error('[migration-report] Unable to persist failed state', {
          runId: reporter.runId,
          errorClass: reportError instanceof Error ? reportError.name : typeof reportError,
        });
      }
    }
    throw error;
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
