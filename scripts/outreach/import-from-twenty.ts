/**
 * Import cold-outreach leads from the local Twenty CRM into Insturix.
 *
 * Twenty is only reachable on this machine, so this runs locally and writes to
 * MongoDB Atlas, which the deployed app also reads.
 *
 * Usage:
 *   npx tsx scripts/outreach/import-from-twenty.ts             # dry run (default)
 *   npx tsx scripts/outreach/import-from-twenty.ts --apply     # write contacts
 *   npx tsx scripts/outreach/import-from-twenty.ts --limit=50  # cap rows examined
 *
 * Credentials come from the environment or the operator secret file; nothing is
 * ever hardcoded here.
 *   TWENTY_API_KEY or TWENTY_API_KEY_FILE (default D:\salesos\secrets\twenty-api-key.current)
 *   TWENTY_BASE_URL (default http://localhost:3000)
 *   MONGODB_URI / MONGODB_DB_NAME from .env.local
 */

import { config } from "dotenv";
import { readFileSync } from "node:fs";

import { importOutreachLeads, type OutreachImportLead } from "../../lib/services/email/outreach/import-service";
import { createMongoImportDependencies } from "../../lib/services/email/outreach/mongo-dependencies";
import { TwentyReadClient } from "../../lib/services/email/outreach/twenty-source";

config({ path: ".env.local" });

const DEFAULT_KEY_FILE = "D:\\salesos\\secrets\\twenty-api-key.current";

function readApiKey(): string {
  const inlineKey = process.env.TWENTY_API_KEY?.trim();
  if (inlineKey) return inlineKey;

  const keyFile = process.env.TWENTY_API_KEY_FILE?.trim() || DEFAULT_KEY_FILE;
  try {
    return readFileSync(keyFile, "utf8").trim();
  } catch {
    throw new Error(
      `No Twenty API key. Set TWENTY_API_KEY, or TWENTY_API_KEY_FILE pointing at a readable file (tried ${keyFile}).`
    );
  }
}

function parseLimit(): number | undefined {
  const raw = process.argv.find((argument) => argument.startsWith("--limit="));
  if (!raw) return undefined;
  const value = Number.parseInt(raw.split("=")[1] ?? "", 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("--limit must be a positive integer.");
  }
  return value;
}

function batchId(apply: boolean): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `twenty-${apply ? "apply" : "dryrun"}-${stamp}`;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const limit = parseLimit();

  const client = new TwentyReadClient({
    apiKey: readApiKey(),
    baseUrl: process.env.TWENTY_BASE_URL,
  });

  console.log("Reading companies from Twenty...");
  const companies = await client.listCompanies();
  console.log(`Read ${companies.length} companies.`);

  const withEmail = companies.filter((company) => Boolean(company.email));
  const selected = limit ? withEmail.slice(0, limit) : withEmail;

  const leads: OutreachImportLead[] = selected.map((company) => ({
    email: company.email as string,
    companyName: company.companyName,
    companyDomain: company.companyDomain,
    city: company.city,
    phoneCallingCode: company.phoneCallingCode,
    emailProvenance: company.emailProvenance,
    emailConfidence: company.emailConfidence,
    contactCompleteness: company.contactCompleteness,
    sourceRecordId: company.recordId,
    sourceLabel: company.sourceLabel,
  }));

  const report = await importOutreachLeads(
    leads,
    {
      sourceSystem: "twenty",
      sourceLabel: "twenty_companies",
      batchId: batchId(apply),
      dryRun: !apply,
    },
    createMongoImportDependencies()
  );

  const { counts } = report;
  console.log(`\n=== ${report.dryRun ? "DRY RUN" : "APPLIED"} — batch ${report.batchId} ===`);
  console.log(`examined ................. ${counts.examined}`);
  console.log(`with an email ............ ${counts.withEmail}`);
  console.log(`duplicates skipped ....... ${counts.skippedDuplicate}`);
  console.log(`blocked: invalid ......... ${counts.blockedInvalid}`);
  console.log(`blocked: disposable ...... ${counts.blockedDisposable}`);
  console.log(`blocked: suppressed ...... ${counts.blockedSuppressed}`);
  console.log(`customer lifecycle only .. ${counts.customerLifecycleOnly}`);
  console.log(`\ncohort tiers (sendable, best first)`);
  console.log(`  A verified corporate ... ${counts.tierA}`);
  console.log(`  B unverified/role ...... ${counts.tierB}`);
  console.log(`  C role, no provenance .. ${counts.tierC}`);
  console.log(`  D consumer mailbox ..... ${counts.tierD}`);
  console.log(`\nwritten: ${counts.imported} inserted, ${counts.updated} updated`);

  if (report.errors.length > 0) {
    console.error(`\n${report.errors.length} error(s):`);
    for (const error of report.errors.slice(0, 20)) console.error(`  ${error}`);
    process.exitCode = 1;
  }

  if (report.dryRun) {
    console.log("\nNothing was written. Re-run with --apply to persist.");
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
