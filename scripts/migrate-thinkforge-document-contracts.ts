import { config } from 'dotenv';
import { MongoClient, MongoServerError, type ObjectId } from 'mongodb';
import {
  planThinkForgeDocumentContractMigration,
  type LegacyThinkForgeDocumentRecord,
  type LegacyThinkForgeSessionRecord,
} from '@/lib/thinkforge/migrations/document-contract-v1';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const dbName = process.env.THINKFORGE_MONGODB_DB_NAME?.trim() || 'thinkforge_db';
const BACKUP_COLLECTION = 'thinkforge_scripts_document_contract_v1_backup';
type ThinkForgeDocumentBackupRecord = {
  _id: ObjectId | string;
  capturedAt: Date;
  source: LegacyThinkForgeDocumentRecord & Record<string, unknown>;
};
const confirmedDatabase = process.argv
  .find((argument) => argument.startsWith('--confirm-db='))
  ?.slice('--confirm-db='.length);

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('MONGODB_URI is required');
  if (APPLY && ROLLBACK) throw new Error('Choose either --apply or --rollback');
  if ((APPLY || ROLLBACK) && confirmedDatabase !== dbName) {
    throw new Error(`Mutation mode requires --confirm-db=${dbName}`);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();
  try {
    const database = client.db(dbName);
    if (ROLLBACK) {
      const backups = await database.collection<ThinkForgeDocumentBackupRecord>(BACKUP_COLLECTION).find({}).toArray();
      if (backups.length === 0) throw new Error(`No rollback records found in ${BACKUP_COLLECTION}`);

      const restoreResult = await database.collection<LegacyThinkForgeDocumentRecord>('thinkforge_scripts').bulkWrite(
        backups.map((backup) => ({
          replaceOne: {
            filter: { _id: backup._id },
            replacement: backup.source,
            upsert: false,
          },
        })),
        { ordered: false },
      );
      if (restoreResult.matchedCount !== backups.length) {
        throw new Error(`Rollback matched ${restoreResult.matchedCount}/${backups.length} records`);
      }
      try {
        await database.collection('thinkforge_scripts').dropIndex('uniq_active_thinkforge_document');
      } catch (error) {
        if (!(error instanceof MongoServerError) || error.code !== 27) throw error;
      }
      console.log(`Restored ${backups.length} ThinkForge documents from ${BACKUP_COLLECTION}.`);
      return;
    }

    const documents = await database.collection<LegacyThinkForgeDocumentRecord>('thinkforge_scripts')
      .find({}, {
        projection: {
          _id: 1,
          sessionId: 1,
          scriptId: 1,
          title: 1,
          documentType: 1,
          contentContract: 1,
        },
      })
      .toArray();
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
    const plan = planThinkForgeDocumentContractMigration({ documents, sessions });
    const activeDecisions = plan.decisions.filter((decision) => decision.status === 'active');
    const countBy = (values: string[]) => Object.fromEntries(
      Array.from(new Set(values)).sort().map((value) => [value, values.filter((item) => item === value).length]),
    );

    console.log(JSON.stringify({
      database: dbName,
      mode: APPLY ? 'apply' : 'dry-run',
      backupCollection: BACKUP_COLLECTION,
      ...plan.summary,
      bySource: countBy(activeDecisions.map((decision) => decision.source)),
      byDocumentType: countBy(activeDecisions.map((decision) => decision.update.documentType)),
      quarantineReasons: countBy(
        plan.decisions
          .filter((decision) => decision.status === 'quarantined')
          .map((decision) => decision.reason),
      ),
    }, null, 2));
    for (const decision of plan.decisions.filter((item) => item.status === 'quarantined')) {
      console.warn(`[quarantine] ${String(decision.recordId)}: ${decision.reason}`);
    }

    if (!APPLY) {
      console.log(`Dry run only. Re-run with --apply --confirm-db=${dbName} after reviewing quarantines.`);
      return;
    }

    const migratedAt = new Date();
    await database.collection('thinkforge_scripts').aggregate([
      {
        $project: {
          _id: 1,
          capturedAt: { $literal: migratedAt },
          source: '$$ROOT',
        },
      },
      {
        $merge: {
          into: BACKUP_COLLECTION,
          on: '_id',
          whenMatched: 'keepExisting',
          whenNotMatched: 'insert',
        },
      },
    ]).toArray();
    const backedUpCount = await database.collection<ThinkForgeDocumentBackupRecord>(BACKUP_COLLECTION).countDocuments({
      _id: { $in: plan.decisions.map((decision) => decision.recordId) },
    });
    if (backedUpCount !== plan.summary.scanned) {
      throw new Error(`Backup verification failed: ${backedUpCount}/${plan.summary.scanned} records`);
    }

    if (plan.decisions.length > 0) {
      await database.collection<LegacyThinkForgeDocumentRecord>('thinkforge_scripts').bulkWrite(
        plan.decisions.map((decision) => ({
          updateOne: {
            filter: { _id: decision.recordId },
            update: {
              $set: {
                ...decision.update,
                'documentContractMigration.migratedAt': migratedAt,
              },
            },
          },
        })),
        { ordered: false },
      );
    }

    await database.collection('thinkforge_scripts').createIndex(
      { sessionId: 1, scriptId: 1 },
      {
        name: 'uniq_active_thinkforge_document',
        unique: true,
        partialFilterExpression: { recordStatus: 'active' },
      },
    );

    const [activeCount, quarantinedCount] = await Promise.all([
      database.collection('thinkforge_scripts').countDocuments({ recordStatus: 'active' }),
      database.collection('thinkforge_scripts').countDocuments({ recordStatus: 'quarantined' }),
    ]);
    if (activeCount !== plan.summary.active || quarantinedCount !== plan.summary.quarantined) {
      throw new Error(`Verification mismatch: active=${activeCount}, quarantined=${quarantinedCount}`);
    }
    console.log(
      `Applied and verified ${activeCount} active records; ${quarantinedCount} quarantined; ${backedUpCount} backed up.`,
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
