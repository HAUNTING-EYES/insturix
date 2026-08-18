import { config } from 'dotenv';
import { MongoClient, MongoServerError, type ClientSession, type Filter } from 'mongodb';
import {
  THINKFORGE_DOCUMENT_MIGRATION_VERSION,
  planThinkForgeDocumentContractMigration,
  type LegacyThinkForgeDocumentRecord,
  type LegacyThinkForgeSessionRecord,
} from '@/lib/thinkforge/migrations/document-contract-v1';
import {
  THINKFORGE_DOCUMENT_BACKUP_FIELD,
  buildThinkForgeDocumentV1RollbackUpdate,
  resolveThinkForgeDocumentV1Backup,
  type ThinkForgeDocumentV1Backup,
} from '@/lib/thinkforge/migrations/document-contract-backup-v1';
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

const MIGRATION_NAME = 'thinkforge_document_contracts';
const UNIQUE_DOCUMENT_INDEX = 'uniq_active_thinkforge_document';
const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const mode = resolveMigrationMode({ apply: APPLY, rollback: ROLLBACK });
const operator = resolveMigrationOperator(mode, process.argv.slice(2));
const runId = resolveMigrationRunId(process.argv.slice(2));
const dbName = process.env.THINKFORGE_MONGODB_DB_NAME?.trim() || 'thinkforge_db';
const confirmedDatabase = process.argv
  .find((argument) => argument.startsWith('--confirm-db='))
  ?.slice('--confirm-db='.length);

const DOCUMENT_SOURCE_PATHS = [
  'sessionId',
  'scriptId',
  'title',
  'documentType',
  'contentContract',
  'recordStatus',
  'documentContractMigration',
] as const;
const DOCUMENT_ROLLBACK_PATHS = DOCUMENT_SOURCE_PATHS.filter((path) => path !== 'sessionId');

type ThinkForgeMigrationDocument = LegacyThinkForgeDocumentRecord & {
  documentContractV1Backup?: unknown;
  documentContractMigration?: unknown;
  recordStatus?: unknown;
};

interface DocumentWorkItem {
  decision: ReturnType<typeof planThinkForgeDocumentContractMigration>['decisions'][number];
  backup: ThinkForgeDocumentV1Backup;
  reusedBackup: boolean;
  sourceFields: ThinkForgeMigrationCasField[];
}

async function createUniqueDocumentIndex(client: MongoClient): Promise<void> {
  await client.db(dbName).collection('thinkforge_scripts').createIndex(
    { sessionId: 1, scriptId: 1 },
    {
      name: UNIQUE_DOCUMENT_INDEX,
      unique: true,
      partialFilterExpression: { recordStatus: 'active' },
    },
  );
}

async function assertSessionSourcesUnchanged(input: {
  client: MongoClient;
  session: ClientSession;
  sessions: LegacyThinkForgeSessionRecord[];
  missingSessionIds: string[];
}): Promise<void> {
  const sessionCollection = input.client.db(dbName).collection<LegacyThinkForgeSessionRecord>('thinkforge_sessions');
  if (input.sessions.length > 0) {
    const exactFilters = input.sessions.map((sessionRecord) => buildMigrationCasFilter<LegacyThinkForgeSessionRecord>(
      { _id: sessionRecord._id },
      captureMigrationCasFields(sessionRecord as unknown as Record<string, unknown>, ['projectMeta']),
    ));
    const matched = await sessionCollection.countDocuments(
      { $or: exactFilters } as Filter<LegacyThinkForgeSessionRecord>,
      { session: input.session },
    );
    if (matched !== input.sessions.length) {
      throw new Error(`Document migration session source drift: ${matched}/${input.sessions.length}`);
    }
  }
  if (input.missingSessionIds.length > 0) {
    const appeared = await sessionCollection.countDocuments(
      { _id: { $in: input.missingSessionIds } },
      { session: input.session },
    );
    if (appeared !== 0) throw new Error(`Document migration session source drift: ${appeared} sessions appeared`);
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
    const scripts = database.collection<ThinkForgeMigrationDocument>('thinkforge_scripts');
    reporter = await ThinkForgeMigrationExecutionReporter.create({
      database,
      runId,
      migrationName: MIGRATION_NAME,
      migrationVersion: THINKFORGE_DOCUMENT_MIGRATION_VERSION,
      mode,
      databaseName: dbName,
      operator,
      git: readMigrationGitIdentity(),
    });
    console.log(`Migration run ID: ${reporter.runId}`);

    if (mode === 'rollback') {
      const backups = await scripts.find(
        { [THINKFORGE_DOCUMENT_BACKUP_FIELD]: { $exists: true } },
        {
          projection: {
            _id: 1,
            scriptId: 1,
            title: 1,
            documentType: 1,
            contentContract: 1,
            recordStatus: 1,
            documentContractMigration: 1,
            [THINKFORGE_DOCUMENT_BACKUP_FIELD]: 1,
          },
        },
      ).toArray();
      if (backups.length === 0) throw new Error('No in-record ThinkForge document backups found');
      const sourceHash = hashMigrationValue(backups);
      await reporter.append('planned', {
        counts: { scanned: backups.length },
        hashes: { source: sourceHash, plan: hashMigrationValue(backups.map((record) => record._id)) },
        codes: ['rollback'],
      });

      const workItems = backups.map((record) => {
        const backup = record[THINKFORGE_DOCUMENT_BACKUP_FIELD] as ThinkForgeDocumentV1Backup;
        return {
          record,
          backup,
          sourceFields: [
            ...captureMigrationCasFields(record as unknown as Record<string, unknown>, DOCUMENT_ROLLBACK_PATHS),
            { path: THINKFORGE_DOCUMENT_BACKUP_FIELD, exists: true, value: backup },
          ],
        };
      });

      let droppedUniqueIndex = false;
      try {
        try {
          await scripts.dropIndex(UNIQUE_DOCUMENT_INDEX);
          droppedUniqueIndex = true;
        } catch (error) {
          if (!(error instanceof MongoServerError) || error.code !== 27) throw error;
        }

        await runMigrationTransaction({
          client,
          reporter,
          execute: async (session) => {
            const result = await scripts.bulkWrite(workItems.map(({ record, backup, sourceFields }) => ({
              updateOne: {
                filter: buildMigrationCasFilter<ThinkForgeMigrationDocument>({ _id: record._id }, sourceFields),
                update: buildThinkForgeDocumentV1RollbackUpdate(backup),
              },
            })), { ordered: true, session });
            if (result.matchedCount !== workItems.length) {
              throw new Error(`Rollback source drift: ${result.matchedCount}/${workItems.length} records`);
            }
            const remaining = await scripts.countDocuments({
              _id: { $in: workItems.map(({ record }) => record._id) },
              [THINKFORGE_DOCUMENT_BACKUP_FIELD]: { $exists: true },
            }, { session });
            if (remaining !== 0) throw new Error(`Rollback left ${remaining} in-record backups unresolved`);
            await reporter!.append('rolled_back', {
              counts: { restored: result.matchedCount, remainingBackups: remaining },
              hashes: { source: sourceHash },
            }, session);
          },
        });
      } catch (error) {
        if (droppedUniqueIndex) {
          try {
            await createUniqueDocumentIndex(client);
          } catch (indexError) {
            throw new AggregateError([error, indexError], 'Rollback aborted and the document index could not be restored');
          }
        }
        throw error;
      }
      console.log(`Restored ${workItems.length} ThinkForge documents from in-record backups.`);
      return;
    }

    const documents = await scripts.find({}, {
      projection: {
        _id: 1,
        sessionId: 1,
        scriptId: 1,
        title: 1,
        documentType: 1,
        contentContract: 1,
        recordStatus: 1,
        documentContractMigration: 1,
        [THINKFORGE_DOCUMENT_BACKUP_FIELD]: 1,
      },
    }).toArray();
    const sessionIds = Array.from(new Set(
      documents
        .map((document) => document.sessionId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ));
    const sessions = sessionIds.length > 0
      ? await database.collection<LegacyThinkForgeSessionRecord>('thinkforge_sessions')
          .find({ _id: { $in: sessionIds } }, { projection: { _id: 1, projectMeta: 1 } })
          .toArray()
      : [];
    const foundSessionIds = new Set(sessions.map((session) => session._id));
    const missingSessionIds = sessionIds.filter((sessionId) => !foundSessionIds.has(sessionId));
    const plan = planThinkForgeDocumentContractMigration({ documents, sessions });
    const activeDecisions = plan.decisions.filter((decision) => decision.status === 'active');
    const countBy = (values: string[]) => Object.fromEntries(
      Array.from(new Set(values)).sort().map((value) => [value, values.filter((item) => item === value).length]),
    );
    const sourceHash = hashMigrationValue({ documents, sessions, missingSessionIds });
    const planHash = hashMigrationValue(plan.decisions);
    const backupResolutions = new Map(documents.map((document) => [
      String(document._id),
      resolveThinkForgeDocumentV1Backup(document as Record<string, unknown>, new Date()),
    ]));
    const reusedBackups = [...backupResolutions.values()].filter((resolution) => resolution.reused).length;
    const newBackups = documents.length - reusedBackups;

    console.log(JSON.stringify({
      database: dbName,
      mode,
      runId: reporter.runId,
      backupField: THINKFORGE_DOCUMENT_BACKUP_FIELD,
      reusedBackups,
      newBackups,
      ...plan.summary,
      bySource: countBy(activeDecisions.map((decision) => decision.source)),
      byDocumentType: countBy(activeDecisions.map((decision) => decision.update.documentType)),
      quarantineReasons: countBy(
        plan.decisions
          .filter((decision) => decision.status === 'quarantined')
          .map((decision) => decision.reason),
      ),
    }, null, 2));
    await reporter.append('planned', {
      counts: { ...plan.summary, reusedBackups, newBackups },
      hashes: {
        source: sourceHash,
        plan: planHash,
        quarantineReasons: hashMigrationValue(countBy(
          plan.decisions
            .filter((decision) => decision.status === 'quarantined')
            .map((decision) => decision.reason),
        )),
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
    const documentsById = new Map(documents.map((document) => [String(document._id), document]));
    const workItems: DocumentWorkItem[] = plan.decisions.map((decision) => {
      const document = documentsById.get(String(decision.recordId));
      if (!document) throw new Error(`Migration source disappeared: ${String(decision.recordId)}`);
      const backupResolution = backupResolutions.get(String(decision.recordId));
      if (!backupResolution) throw new Error(`Migration backup plan disappeared: ${String(decision.recordId)}`);
      return {
        decision,
        backup: backupResolution.reused
          ? backupResolution.backup
          : resolveThinkForgeDocumentV1Backup(document as Record<string, unknown>, migratedAt).backup,
        reusedBackup: backupResolution.reused,
        sourceFields: captureMigrationCasFields(document as unknown as Record<string, unknown>, DOCUMENT_SOURCE_PATHS),
      };
    });

    if (workItems.length > 0) {
      await runMigrationTransaction({
        client,
        reporter,
        execute: async (session) => {
          await assertSessionSourcesUnchanged({ client, session, sessions, missingSessionIds });
          const backupItems = workItems.filter((item) => !item.reusedBackup);
          let newlyBackedUp = 0;
          if (backupItems.length > 0) {
            const backupResult = await scripts.bulkWrite(backupItems.map(({ decision, backup, sourceFields }) => ({
              updateOne: {
                filter: buildMigrationCasFilter<ThinkForgeMigrationDocument>(
                  { _id: decision.recordId },
                  [...sourceFields, { path: THINKFORGE_DOCUMENT_BACKUP_FIELD, exists: false }],
                ),
                update: { $set: { [THINKFORGE_DOCUMENT_BACKUP_FIELD]: backup } },
              },
            })), { ordered: true, session });
            newlyBackedUp = backupResult.matchedCount;
            if (newlyBackedUp !== backupItems.length) {
              throw new Error(`Backup source drift: ${newlyBackedUp}/${backupItems.length} records`);
            }
          }
          await reporter!.append('backed_up', {
            counts: {
              backedUp: newlyBackedUp,
              reusedBackups: workItems.length - backupItems.length,
              totalBackups: workItems.length,
            },
            hashes: { source: sourceHash },
          }, session);

          const applyResult = await scripts.bulkWrite(workItems.map(({ decision, backup, sourceFields }) => {
            const { documentContractMigration, ...documentUpdate } = decision.update;
            return {
              updateOne: {
                filter: buildMigrationCasFilter<ThinkForgeMigrationDocument>(
                  { _id: decision.recordId },
                  [...sourceFields, { path: THINKFORGE_DOCUMENT_BACKUP_FIELD, exists: true, value: backup }],
                ),
                update: {
                  $set: {
                    ...documentUpdate,
                    documentContractMigration: { ...documentContractMigration, migratedAt },
                  },
                },
              },
            };
          }), { ordered: true, session });
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

    await createUniqueDocumentIndex(client);
    const ids = workItems.map(({ decision }) => decision.recordId);
    await runMigrationTransaction({
      client,
      reporter,
      execute: async (session) => {
        const [activeCount, quarantinedCount, backedUpCount] = await Promise.all([
          scripts.countDocuments({ _id: { $in: ids }, recordStatus: 'active' }, { session }),
          scripts.countDocuments({ _id: { $in: ids }, recordStatus: 'quarantined' }, { session }),
          scripts.countDocuments({
            _id: { $in: ids },
            [THINKFORGE_DOCUMENT_BACKUP_FIELD]: { $exists: true },
          }, { session }),
        ]);
        if (activeCount !== plan.summary.active || quarantinedCount !== plan.summary.quarantined
          || backedUpCount !== plan.summary.scanned) {
          throw new Error(
            `Verification mismatch: active=${activeCount}, quarantined=${quarantinedCount}, backedUp=${backedUpCount}`,
          );
        }
        await reporter!.append('verified', {
          counts: { active: activeCount, quarantined: quarantinedCount, backedUp: backedUpCount },
          hashes: { source: sourceHash, plan: planHash },
        }, session);
      },
    });
    console.log(
      `Applied and verified ${plan.summary.active} active records; ${plan.summary.quarantined} quarantined; ${plan.summary.scanned} backed up.`,
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
