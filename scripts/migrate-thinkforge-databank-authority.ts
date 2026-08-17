import { config } from 'dotenv';
import { MongoClient, type ClientSession, type Filter } from 'mongodb';
import {
  THINKFORGE_DATABANK_AUTHORITY_MIGRATION_VERSION,
  planDataBankAuthorityMigration,
  type LegacyDataBankRecord,
  type LegacyDataBankSessionRecord,
} from '@/lib/thinkforge/migrations/databank-authority-v1';
import {
  THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD,
  buildDataBankAuthorityV1RollbackUpdate,
  createDataBankAuthorityV1Backup,
  type DataBankAuthorityV1Backup,
} from '@/lib/thinkforge/migrations/databank-authority-backup-v1';
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

const MIGRATION_NAME = 'thinkforge_databank_authority';
const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const mode = resolveMigrationMode({ apply: APPLY, rollback: ROLLBACK });
const operator = resolveMigrationOperator(mode, process.argv.slice(2));
const runId = resolveMigrationRunId(process.argv.slice(2));
const dbName = process.env.THINKFORGE_MONGODB_DB_NAME?.trim() || 'thinkforge_db';
const confirmedDatabase = process.argv
  .find((argument) => argument.startsWith('--confirm-db='))
  ?.slice('--confirm-db='.length);

const DATABANK_PLANNING_PATHS = [
  'sessionId',
  'userId',
  'type',
  'scope',
  'memoryScope',
  'brandId',
  'provenanceStatus',
  'title',
  'content',
  'sourceUrl',
  'tags',
] as const;

type MigrationRecord = LegacyDataBankRecord & {
  dataBankAuthorityV1Backup?: DataBankAuthorityV1Backup;
};

interface DataBankWorkItem {
  decision: ReturnType<typeof planDataBankAuthorityMigration>['decisions'][number];
  backup: DataBankAuthorityV1Backup;
  sourceFields: ThinkForgeMigrationCasField[];
}

function countBy(values: string[]) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]),
  );
}

function sourcePaths(record: MigrationRecord, backup: DataBankAuthorityV1Backup): string[] {
  return [...new Set([
    ...Object.keys(record).filter((path) => path !== '_id' && path !== THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD),
    ...DATABANK_PLANNING_PATHS,
    ...Object.keys(backup.fields),
  ])];
}

async function assertSessionSourcesUnchanged(input: {
  client: MongoClient;
  session: ClientSession;
  sessions: LegacyDataBankSessionRecord[];
  missingSessionIds: string[];
}): Promise<void> {
  const sessionCollection = input.client.db(dbName).collection<LegacyDataBankSessionRecord>('thinkforge_sessions');
  if (input.sessions.length > 0) {
    const exactFilters = input.sessions.map((sessionRecord) => buildMigrationCasFilter<LegacyDataBankSessionRecord>(
      { _id: sessionRecord._id },
      captureMigrationCasFields(
        sessionRecord as unknown as Record<string, unknown>,
        ['userId', 'orgId', 'projectMeta'],
      ),
    ));
    const matched = await sessionCollection.countDocuments(
      { $or: exactFilters } as Filter<LegacyDataBankSessionRecord>,
      { session: input.session },
    );
    if (matched !== input.sessions.length) {
      throw new Error(`DataBank migration session source drift: ${matched}/${input.sessions.length}`);
    }
  }
  if (input.missingSessionIds.length > 0) {
    const appeared = await sessionCollection.countDocuments(
      { _id: { $in: input.missingSessionIds } },
      { session: input.session },
    );
    if (appeared !== 0) throw new Error(`DataBank migration session source drift: ${appeared} sessions appeared`);
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('MONGODB_URI is required');
  if (mode !== 'dry_run' && confirmedDatabase !== dbName) {
    throw new Error(`Mutation mode requires --confirm-db=${dbName}`);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  let reporter: ThinkForgeMigrationExecutionReporter | null = null;
  await client.connect();
  try {
    const database = client.db(dbName);
    const dataBank = database.collection<MigrationRecord>('thinkforge_databank');
    reporter = await ThinkForgeMigrationExecutionReporter.create({
      database,
      runId,
      migrationName: MIGRATION_NAME,
      migrationVersion: THINKFORGE_DATABANK_AUTHORITY_MIGRATION_VERSION,
      mode,
      databaseName: dbName,
      operator,
      git: readMigrationGitIdentity(),
    });
    console.log(`Migration run ID: ${reporter.runId}`);

    if (mode === 'rollback') {
      const backups = await dataBank.find({
        [THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD]: { $exists: true },
      }).toArray();
      if (backups.length === 0) throw new Error('No in-record DataBank authority backups found');
      const sourceHash = hashMigrationValue(backups);
      await reporter.append('planned', {
        counts: { scanned: backups.length },
        hashes: { source: sourceHash, plan: hashMigrationValue(backups.map((record) => record._id)) },
        codes: ['rollback'],
      });
      const workItems = backups.map((record) => {
        const backup = record[THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD] as DataBankAuthorityV1Backup;
        return {
          record,
          backup,
          sourceFields: [
            ...captureMigrationCasFields(record, Object.keys(backup.fields)),
            { path: THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD, exists: true, value: backup },
          ],
        };
      });
      await runMigrationTransaction({
        client,
        reporter,
        execute: async (session) => {
          const result = await dataBank.bulkWrite(workItems.map(({ record, backup, sourceFields }) => ({
            updateOne: {
              filter: buildMigrationCasFilter<MigrationRecord>({ _id: record._id }, sourceFields),
              update: buildDataBankAuthorityV1RollbackUpdate(backup),
            },
          })), { ordered: true, session });
          if (result.matchedCount !== workItems.length) {
            throw new Error(`Rollback source drift: ${result.matchedCount}/${workItems.length} records`);
          }
          const remaining = await dataBank.countDocuments({
            _id: { $in: workItems.map(({ record }) => record._id) },
            [THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD]: { $exists: true },
          }, { session });
          if (remaining !== 0) throw new Error(`Rollback left ${remaining} DataBank backups unresolved`);
          await reporter!.append('rolled_back', {
            counts: { restored: result.matchedCount, remainingBackups: remaining },
            hashes: { source: sourceHash },
          }, session);
        },
      });
      console.log(`Restored ${workItems.length} DataBank records from in-record backups.`);
      return;
    }

    const records = await dataBank.find({
      [THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD]: { $exists: false },
    }).toArray();
    const sessionIds = [...new Set(records
      .map((record) => record.sessionId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0))];
    const sessions = sessionIds.length > 0
      ? await database.collection<LegacyDataBankSessionRecord>('thinkforge_sessions').find(
          { _id: { $in: sessionIds } },
          { projection: { _id: 1, userId: 1, orgId: 1, projectMeta: 1 } },
        ).toArray()
      : [];
    const foundSessionIds = new Set(sessions.map((session) => session._id));
    const missingSessionIds = sessionIds.filter((sessionId) => !foundSessionIds.has(sessionId));
    const plan = planDataBankAuthorityMigration({ records, sessions });
    const quarantineReasons = plan.decisions
      .filter((decision) => decision.status === 'quarantined')
      .map((decision) => decision.reason ?? 'unknown');
    const sourceHash = hashMigrationValue({ records, sessions, missingSessionIds });
    const planHash = hashMigrationValue(plan.decisions);
    console.log(JSON.stringify({
      database: dbName,
      mode,
      runId: reporter.runId,
      backupField: THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD,
      ...plan.summary,
      quarantineReasons: countBy(quarantineReasons),
    }, null, 2));
    await reporter.append('planned', {
      counts: plan.summary,
      hashes: {
        source: sourceHash,
        plan: planHash,
        quarantineReasons: hashMigrationValue(countBy(quarantineReasons)),
      },
    });
    for (const decision of plan.decisions.filter((item) => item.status === 'quarantined')) {
      console.warn(`[quarantine] ${String(decision.recordId)}: ${decision.reason}`);
    }
    if (mode === 'dry_run') {
      await reporter.append('verified', {
        counts: { ...plan.summary, targetMutations: 0 },
        hashes: { source: sourceHash, plan: planHash },
        codes: ['dry_run_only'],
      });
      console.log(`Dry run only. Re-run with --apply --confirm-db=${dbName} --operator=<operator-id> after reviewing quarantines.`);
      return;
    }

    const migratedAt = new Date();
    const recordsById = new Map(records.map((record) => [String(record._id), record]));
    const workItems: DataBankWorkItem[] = plan.decisions.map((decision) => {
      const record = recordsById.get(String(decision.recordId));
      if (!record) throw new Error(`Migration source disappeared: ${String(decision.recordId)}`);
      const backup = createDataBankAuthorityV1Backup(record, migratedAt);
      return {
        decision,
        backup,
        sourceFields: captureMigrationCasFields(record, sourcePaths(record, backup)),
      };
    });

    if (workItems.length > 0) {
      await runMigrationTransaction({
        client,
        reporter,
        execute: async (session) => {
          await assertSessionSourcesUnchanged({ client, session, sessions, missingSessionIds });
          const backupResult = await dataBank.bulkWrite(workItems.map(({ decision, backup, sourceFields }) => ({
            updateOne: {
              filter: buildMigrationCasFilter<MigrationRecord>(
                { _id: decision.recordId },
                [...sourceFields, { path: THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD, exists: false }],
              ),
              update: { $set: { [THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD]: backup } },
            },
          })), { ordered: true, session });
          if (backupResult.matchedCount !== workItems.length) {
            throw new Error(`Backup source drift: ${backupResult.matchedCount}/${workItems.length} records`);
          }
          await reporter!.append('backed_up', {
            counts: { backedUp: backupResult.matchedCount },
            hashes: { source: sourceHash },
          }, session);

          const applyResult = await dataBank.bulkWrite(workItems.map(({ decision, backup, sourceFields }) => ({
            updateOne: {
              filter: buildMigrationCasFilter<MigrationRecord>(
                { _id: decision.recordId },
                [...sourceFields, { path: THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD, exists: true, value: backup }],
              ),
              update: {
                $set: {
                  ...decision.update.$set,
                  'dataBankAuthorityMigration.migratedAt': migratedAt,
                  updatedAt: migratedAt,
                },
                $unset: decision.update.$unset,
              },
            },
          })), { ordered: true, session });
          if (applyResult.matchedCount !== workItems.length) {
            throw new Error(`Apply source drift: ${applyResult.matchedCount}/${workItems.length} records`);
          }
          await reporter!.append('applied', {
            counts: { applied: applyResult.matchedCount },
            hashes: { plan: planHash },
          }, session);
        },
      });
    } else {
      await reporter.append('applied', { counts: { applied: 0 }, hashes: { plan: planHash } });
    }

    const ids = workItems.map(({ decision }) => decision.recordId);
    await runMigrationTransaction({
      client,
      reporter,
      execute: async (session) => {
        const [active, quarantined, backedUp] = await Promise.all([
          dataBank.countDocuments({
            _id: { $in: ids },
            'dataBankAuthorityMigration.version': THINKFORGE_DATABANK_AUTHORITY_MIGRATION_VERSION,
            'dataBankAuthorityMigration.status': 'active',
            lifecycleStatus: 'active',
            provenanceStatus: 'verified',
          }, { session }),
          dataBank.countDocuments({
            _id: { $in: ids },
            'dataBankAuthorityMigration.version': THINKFORGE_DATABANK_AUTHORITY_MIGRATION_VERSION,
            'dataBankAuthorityMigration.status': 'quarantined',
            lifecycleStatus: 'superseded',
            provenanceStatus: 'quarantined',
          }, { session }),
          dataBank.countDocuments({
            _id: { $in: ids },
            [THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD]: { $exists: true },
          }, { session }),
        ]);
        if (active !== plan.summary.active || quarantined !== plan.summary.quarantined
          || backedUp !== plan.summary.scanned) {
          throw new Error(`Verification mismatch: active=${active}, quarantined=${quarantined}, backedUp=${backedUp}`);
        }
        await reporter!.append('verified', {
          counts: { active, quarantined, backedUp },
          hashes: { source: sourceHash, plan: planHash },
        }, session);
      },
    });
    console.log(
      `Applied and verified ${plan.summary.active} active, ${plan.summary.quarantined} quarantined, ${plan.summary.scanned} backed up.`,
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
