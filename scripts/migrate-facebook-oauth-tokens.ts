/**
 * Encrypt legacy plaintext credentials in User.facebookTokens.
 *
 * Dry-run is the default. Apply mode uses per-secret compare-and-set filters so
 * a concurrent OAuth reconnect cannot be overwritten by a stale migration read.
 *
 *   npx tsx scripts/migrate-facebook-oauth-tokens.ts
 *   npx tsx scripts/migrate-facebook-oauth-tokens.ts --apply
 *   npx tsx scripts/migrate-facebook-oauth-tokens.ts --apply --after-id <id>
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  MongoClient,
  ObjectId,
  type Document,
  type Filter,
  type UpdateFilter,
  type UpdateOptions,
} from "mongodb";

import {
  encryptUserOAuthToken,
  isUserOAuthTokenEnveloped,
} from "../lib/calos/publish/token-crypto";

const USERS_COLLECTION = "users";
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5_000;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

export interface FacebookTokenMigrationRecord {
  _id: unknown;
  facebookTokens?: {
    userAccessToken?: unknown;
    pages?: unknown;
  } | null;
}

export interface FacebookTokenMigrationReport {
  mode: "dry-run" | "apply";
  usersScanned: number;
  usersNeedingMigration: number;
  usersMigrated: number;
  plaintextUserTokens: number;
  plaintextPageTokens: number;
  envelopedTokens: number;
  invalidTokenFields: number;
  unsafePageTokens: number;
  writesAttempted: number;
  tokensMigrated: number;
  compareAndSetMisses: number;
}

type TokenUpdateOne = (
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options?: { arrayFilters?: Array<Record<string, unknown>> },
) => Promise<{ modifiedCount: number }>;

interface MigrationDependencies {
  apply: boolean;
  encrypt: (plaintext: string) => string;
  updateOne: TokenUpdateOne;
}

interface CliOptions {
  apply: boolean;
  limit: number;
  batchSize: number;
  afterId?: string;
}

type TokenOperation =
  | { kind: "user"; plaintext: string }
  | { kind: "page"; pageId: string; plaintext: string };

export async function migrateFacebookTokenRecords(
  records: Iterable<FacebookTokenMigrationRecord>,
  dependencies: MigrationDependencies,
): Promise<FacebookTokenMigrationReport> {
  const report = createReport(dependencies.apply);

  for (const record of records) {
    report.usersScanned += 1;
    const plaintextBefore =
      report.plaintextUserTokens + report.plaintextPageTokens;
    const operations = inspectRecord(record, report);
    const hasPlaintext =
      report.plaintextUserTokens + report.plaintextPageTokens > plaintextBefore;
    if (hasPlaintext) report.usersNeedingMigration += 1;
    if (operations.length === 0) continue;
    if (!dependencies.apply) continue;

    let migratedForUser = 0;
    for (const operation of operations) {
      const encrypted = dependencies.encrypt(operation.plaintext);
      if (!isUserOAuthTokenEnveloped(encrypted)) {
        throw new Error("OAuth token encryption returned an unversioned value");
      }

      report.writesAttempted += 1;
      const result =
        operation.kind === "user"
          ? await dependencies.updateOne(
              {
                _id: record._id,
                "facebookTokens.userAccessToken": operation.plaintext,
              },
              {
                $set: { "facebookTokens.userAccessToken": encrypted },
              },
            )
          : await dependencies.updateOne(
              {
                _id: record._id,
                "facebookTokens.pages": {
                  $elemMatch: {
                    pageId: operation.pageId,
                    pageAccessToken: operation.plaintext,
                  },
                },
              },
              {
                $set: {
                  "facebookTokens.pages.$[page].pageAccessToken": encrypted,
                },
              },
              {
                arrayFilters: [
                  {
                    "page.pageId": operation.pageId,
                    "page.pageAccessToken": operation.plaintext,
                  },
                ],
              },
            );

      if (result.modifiedCount === 1) {
        report.tokensMigrated += 1;
        migratedForUser += 1;
      } else {
        report.compareAndSetMisses += 1;
      }
    }
    if (migratedForUser > 0) report.usersMigrated += 1;
  }

  return report;
}

function inspectRecord(
  record: FacebookTokenMigrationRecord,
  report: FacebookTokenMigrationReport,
): TokenOperation[] {
  const operations: TokenOperation[] = [];
  const facebookTokens = record.facebookTokens;
  if (!facebookTokens || typeof facebookTokens !== "object") {
    report.invalidTokenFields += 1;
    return operations;
  }

  const userTokenState = classifyToken(facebookTokens.userAccessToken);
  if (userTokenState === "plaintext") {
    report.plaintextUserTokens += 1;
    operations.push({
      kind: "user",
      plaintext: facebookTokens.userAccessToken as string,
    });
  } else if (userTokenState === "enveloped") {
    report.envelopedTokens += 1;
  } else {
    report.invalidTokenFields += 1;
  }

  if (!Array.isArray(facebookTokens.pages)) {
    report.invalidTokenFields += 1;
    return operations;
  }

  const pageCandidates: Array<{ pageId: string | null; plaintext: string }> =
    [];
  for (const rawPage of facebookTokens.pages) {
    if (!rawPage || typeof rawPage !== "object") {
      report.invalidTokenFields += 1;
      continue;
    }
    const page = rawPage as Record<string, unknown>;
    const state = classifyToken(page.pageAccessToken);
    if (state === "enveloped") {
      report.envelopedTokens += 1;
      continue;
    }
    if (state === "invalid") {
      report.invalidTokenFields += 1;
      continue;
    }

    report.plaintextPageTokens += 1;
    const pageId =
      typeof page.pageId === "string" && page.pageId.trim()
        ? page.pageId
        : null;
    if (!pageId) report.invalidTokenFields += 1;
    pageCandidates.push({
      pageId,
      plaintext: page.pageAccessToken as string,
    });
  }

  const pageIdCounts = new Map<string, number>();
  for (const candidate of pageCandidates) {
    if (!candidate.pageId) continue;
    pageIdCounts.set(
      candidate.pageId,
      (pageIdCounts.get(candidate.pageId) ?? 0) + 1,
    );
  }
  for (const candidate of pageCandidates) {
    if (!candidate.pageId || (pageIdCounts.get(candidate.pageId) ?? 0) !== 1) {
      report.unsafePageTokens += 1;
      continue;
    }
    operations.push({
      kind: "page",
      pageId: candidate.pageId,
      plaintext: candidate.plaintext,
    });
  }

  return operations;
}

function classifyToken(value: unknown): "plaintext" | "enveloped" | "invalid" {
  if (typeof value !== "string" || !value.trim()) return "invalid";
  return isUserOAuthTokenEnveloped(value) ? "enveloped" : "plaintext";
}

function createReport(apply: boolean): FacebookTokenMigrationReport {
  return {
    mode: apply ? "apply" : "dry-run",
    usersScanned: 0,
    usersNeedingMigration: 0,
    usersMigrated: 0,
    plaintextUserTokens: 0,
    plaintextPageTokens: 0,
    envelopedTokens: 0,
    invalidTokenFields: 0,
    unsafePageTokens: 0,
    writesAttempted: 0,
    tokensMigrated: 0,
    compareAndSetMisses: 0,
  };
}

async function runDatabaseMigration(options: CliOptions): Promise<void> {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri || !dbName) {
    throw new Error("MONGODB_URI and MONGODB_DB_NAME must be set");
  }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const collection = client.db(dbName).collection(USERS_COLLECTION);
    const query: Document = {
      facebookTokens: { $exists: true, $ne: null },
    };
    if (options.afterId) query._id = { $gt: new ObjectId(options.afterId) };

    const records = await collection
      .find(query, {
        projection: {
          _id: 1,
          "facebookTokens.userAccessToken": 1,
          "facebookTokens.pages.pageId": 1,
          "facebookTokens.pages.pageAccessToken": 1,
        },
      })
      .sort({ _id: 1 })
      .batchSize(options.batchSize)
      .limit(options.limit + 1)
      .toArray();

    const selectedRecords = records.slice(0, options.limit);
    const report = await migrateFacebookTokenRecords(
      selectedRecords as FacebookTokenMigrationRecord[],
      {
        apply: options.apply,
        encrypt: encryptUserOAuthToken,
        updateOne: async (filter, update, updateOptions) => {
          const result = await collection.updateOne(
            filter as Filter<Document>,
            update as UpdateFilter<Document>,
            updateOptions as UpdateOptions,
          );
          return { modifiedCount: result.modifiedCount };
        },
      },
    );
    const lastId = selectedRecords.at(-1)?._id;

    console.log(
      JSON.stringify(
        {
          database: dbName,
          collection: USERS_COLLECTION,
          limit: options.limit,
          batchSize: options.batchSize,
          afterId: options.afterId ?? null,
          nextAfterId: lastId ? String(lastId) : null,
          hasMore: records.length > options.limit,
          requiresAttention:
            report.compareAndSetMisses > 0 || report.unsafePageTokens > 0,
          ...report,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

function readCliOptions(argv: string[]): CliOptions {
  let apply = false;
  let explicitDryRun = false;
  let limit = DEFAULT_LIMIT;
  let batchSize = DEFAULT_BATCH_SIZE;
  let afterId: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (argument === "--dry-run") {
      explicitDryRun = true;
      continue;
    }
    const [flag, inlineValue] = argument.split("=", 2);
    if (!["--limit", "--batch-size", "--after-id"].includes(flag)) {
      throw new Error(`Unknown argument: ${argument}\n${usage()}`);
    }
    const value = inlineValue ?? argv[++index];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}\n${usage()}`);
    }
    if (flag === "--limit") limit = boundedInteger(flag, value, MAX_LIMIT);
    if (flag === "--batch-size") {
      batchSize = boundedInteger(flag, value, MAX_BATCH_SIZE);
    }
    if (flag === "--after-id") {
      if (!ObjectId.isValid(value)) {
        throw new Error("--after-id must be a 24-character Mongo ObjectId");
      }
      afterId = value;
    }
  }
  if (apply && explicitDryRun) {
    throw new Error("--apply and --dry-run cannot be used together");
  }

  return { apply, limit, batchSize: Math.min(batchSize, limit), afterId };
}

function boundedInteger(flag: string, value: string, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${flag} must be an integer from 1 to ${maximum}`);
  }
  return parsed;
}

function usage(): string {
  return [
    "Usage: npx tsx scripts/migrate-facebook-oauth-tokens.ts [options]",
    "  --dry-run             Audit only (default)",
    "  --apply               Encrypt matching plaintext tokens",
    `  --limit <1-${MAX_LIMIT}>       Users per invocation (default ${DEFAULT_LIMIT})`,
    `  --batch-size <1-${MAX_BATCH_SIZE}> Mongo cursor batch size (default ${DEFAULT_BATCH_SIZE})`,
    "  --after-id <ObjectId>  Resume after the prior nextAfterId",
  ].join("\n");
}

async function main(argv: string[]): Promise<void> {
  if (argv.includes("--help")) {
    console.log(usage());
    return;
  }
  await runDatabaseMigration(readCliOptions(argv));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(
      "Facebook token migration failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exitCode = 1;
  });
}
