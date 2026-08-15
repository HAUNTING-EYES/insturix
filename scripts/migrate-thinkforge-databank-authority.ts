import { config } from 'dotenv';
import { MongoClient } from 'mongodb';
import {
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

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const dbName = process.env.THINKFORGE_MONGODB_DB_NAME?.trim() || 'thinkforge_db';
const confirmedDatabase = process.argv
  .find((argument) => argument.startsWith('--confirm-db='))
  ?.slice('--confirm-db='.length);

type MigrationRecord = LegacyDataBankRecord & {
  dataBankAuthorityV1Backup?: DataBankAuthorityV1Backup;
};

function countBy(values: string[]) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]),
  );
}

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
    const dataBank = database.collection<MigrationRecord>('thinkforge_databank');
    if (ROLLBACK) {
      const backups = await dataBank.find(
        { [THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD]: { $exists: true } },
        { projection: { _id: 1, [THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD]: 1 } },
      ).toArray();
      if (backups.length === 0) throw new Error('No in-record DataBank authority backups found');
      const result = await dataBank.bulkWrite(backups.map((record) => ({
        updateOne: {
          filter: { _id: record._id },
          update: buildDataBankAuthorityV1RollbackUpdate(
            record[THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD] as DataBankAuthorityV1Backup,
          ),
        },
      })), { ordered: false });
      if (result.matchedCount !== backups.length) {
        throw new Error(`Rollback matched ${result.matchedCount}/${backups.length} records`);
      }
      const remaining = await dataBank.countDocuments({
        [THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD]: { $exists: true },
      });
      if (remaining !== 0) throw new Error(`Rollback left ${remaining} backups unresolved`);
      console.log(`Restored ${backups.length} DataBank records from in-record backups.`);
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
    const plan = planDataBankAuthorityMigration({ records, sessions });
    const quarantineReasons = plan.decisions
      .filter((decision) => decision.status === 'quarantined')
      .map((decision) => decision.reason ?? 'unknown');
    console.log(JSON.stringify({
      database: dbName,
      mode: APPLY ? 'apply' : 'dry-run',
      backupField: THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD,
      ...plan.summary,
      quarantineReasons: countBy(quarantineReasons),
    }, null, 2));
    for (const decision of plan.decisions.filter((item) => item.status === 'quarantined')) {
      console.warn(`[quarantine] ${String(decision.recordId)}: ${decision.reason}`);
    }
    if (!APPLY) {
      console.log(`Dry run only. Re-run with --apply --confirm-db=${dbName} after reviewing quarantines.`);
      return;
    }
    if (records.length === 0) {
      console.log('No unmigrated DataBank records found.');
      return;
    }

    const migratedAt = new Date();
    const recordsById = new Map(records.map((record) => [String(record._id), record]));
    await dataBank.bulkWrite(plan.decisions.map((decision) => {
      const record = recordsById.get(String(decision.recordId));
      if (!record) throw new Error(`Migration source disappeared: ${String(decision.recordId)}`);
      return {
        updateOne: {
          filter: {
            _id: decision.recordId,
            [THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD]: { $exists: false },
          },
          update: {
            $set: {
              [THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD]: createDataBankAuthorityV1Backup(
                record,
                migratedAt,
              ),
            },
          },
        },
      };
    }), { ordered: false });
    const backedUp = await dataBank.countDocuments({
      _id: { $in: plan.decisions.map((decision) => decision.recordId) },
      [THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD]: { $exists: true },
    });
    if (backedUp !== plan.summary.scanned) {
      throw new Error(`Backup verification failed: ${backedUp}/${plan.summary.scanned} records`);
    }

    await dataBank.bulkWrite(plan.decisions.map((decision) => ({
      updateOne: {
        filter: { _id: decision.recordId },
        update: {
          $set: {
            ...decision.update.$set,
            'dataBankAuthorityMigration.migratedAt': migratedAt,
            updatedAt: migratedAt,
          },
          $unset: decision.update.$unset,
        },
      },
    })), { ordered: false });

    const ids = plan.decisions.map((decision) => decision.recordId);
    const [active, quarantined] = await Promise.all([
      dataBank.countDocuments({
        _id: { $in: ids },
        'dataBankAuthorityMigration.version': 1,
        'dataBankAuthorityMigration.status': 'active',
        lifecycleStatus: 'active',
        provenanceStatus: 'verified',
      }),
      dataBank.countDocuments({
        _id: { $in: ids },
        'dataBankAuthorityMigration.version': 1,
        'dataBankAuthorityMigration.status': 'quarantined',
        lifecycleStatus: 'superseded',
        provenanceStatus: 'quarantined',
      }),
    ]);
    if (active !== plan.summary.active || quarantined !== plan.summary.quarantined) {
      throw new Error(`Verification mismatch: active=${active}, quarantined=${quarantined}`);
    }
    console.log(`Applied and verified ${active} active, ${quarantined} quarantined, ${backedUp} backed up.`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
