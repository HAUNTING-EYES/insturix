/**
 * Imports cold-outreach leads into the Insturix-owned outreach contact store.
 *
 * Source-agnostic: it takes already-normalised leads, so the Twenty adapter, a
 * CSV/XLSX upload or any other source can feed the same classification and audit
 * path. Dry run is the default everywhere - an import that writes without being
 * asked to is how a bad lead list reaches production.
 *
 * Dependencies are injected (matching lifecycle-service.ts) so the whole flow is
 * testable without a database.
 */

import {
  classifyOutreachContact,
  repairEncodedEmail,
  type OutreachClassification,
} from "./classification";
import { normalizeEmailAddress } from "../contact-policy";
import type { IOutreachImportCounts } from "@/schemas/OutreachImportBatchSchema";

export interface OutreachImportLead {
  email: string;
  companyName?: string;
  companyDomain?: string;
  contactName?: string;
  jobTitle?: string;
  city?: string;
  phoneCallingCode?: string;
  emailProvenance?: string;
  emailConfidence?: number;
  contactCompleteness?: string;
  sourceRecordId?: string;
  sourceLabel?: string;
  sourceUrl?: string;
}

export interface OutreachContactUpsert extends OutreachClassification {
  email: string;
  companyName?: string;
  companyDomain?: string;
  contactName?: string;
  jobTitle?: string;
  city?: string;
  emailProvenance?: string;
  emailConfidence?: number;
  contactCompleteness?: string;
  sourceSystem: string;
  sourceRecordId?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  importBatchId: string;
}

export interface OutreachImportDependencies {
  connect(): Promise<unknown>;
  /** Normalised addresses with an ACTIVE suppression of any scope. */
  findSuppressed(normalizedEmails: string[]): Promise<Set<string>>;
  /** Normalised addresses belonging to a registered user or consented contact. */
  findKnownCustomers(normalizedEmails: string[]): Promise<Set<string>>;
  upsertContact(contact: OutreachContactUpsert): Promise<"inserted" | "updated">;
  recordBatch(batch: {
    batchId: string;
    sourceSystem: string;
    sourceLabel?: string;
    dryRun: boolean;
    status: "completed" | "failed";
    counts: IOutreachImportCounts;
    errors: string[];
    startedAt: Date;
    completedAt: Date;
  }): Promise<void>;
  now(): Date;
}

export interface OutreachImportOptions {
  sourceSystem: string;
  sourceLabel?: string;
  batchId: string;
  /** Defaults to true. Nothing is written unless this is explicitly false. */
  dryRun?: boolean;
}

export interface OutreachImportReport {
  batchId: string;
  dryRun: boolean;
  counts: IOutreachImportCounts;
  errors: string[];
  /** Every classified row, so a dry run can be inspected before writing. */
  classified: OutreachContactUpsert[];
}

function emptyCounts(): IOutreachImportCounts {
  return {
    examined: 0,
    withEmail: 0,
    imported: 0,
    updated: 0,
    skippedDuplicate: 0,
    blockedInvalid: 0,
    blockedDisposable: 0,
    blockedUnroutable: 0,
    blockedPlaceholder: 0,
    blockedSuppressed: 0,
    customerLifecycleOnly: 0,
    tierA: 0,
    tierB: 0,
    tierC: 0,
    tierD: 0,
  };
}

function countTier(counts: IOutreachImportCounts, tier: string): void {
  if (tier === "A") counts.tierA += 1;
  else if (tier === "B") counts.tierB += 1;
  else if (tier === "C") counts.tierC += 1;
  else counts.tierD += 1;
}

export async function importOutreachLeads(
  leads: OutreachImportLead[],
  options: OutreachImportOptions,
  dependencies: OutreachImportDependencies
): Promise<OutreachImportReport> {
  const dryRun = options.dryRun !== false;
  const startedAt = dependencies.now();
  const counts = emptyCounts();
  const errors: string[] = [];
  const classified: OutreachContactUpsert[] = [];

  counts.examined = leads.length;
  const withEmail = leads.filter((lead) => Boolean(lead.email?.trim()));
  counts.withEmail = withEmail.length;

  await dependencies.connect();

  // Repair scraping artifacts BEFORE the lookups. Suppression and customer
  // matching key on the final address, so "%20owner@x.com" has to become
  // "owner@x.com" first or a suppressed address would slip through unmatched.
  const prepared = withEmail.map((lead) => ({
    lead,
    normalizedEmail: normalizeEmailAddress(repairEncodedEmail(lead.email).email),
  }));

  const normalizedCandidates = Array.from(
    new Set(prepared.map((entry) => entry.normalizedEmail))
  );
  const [suppressed, knownCustomers] = await Promise.all([
    dependencies.findSuppressed(normalizedCandidates),
    dependencies.findKnownCustomers(normalizedCandidates),
  ]);

  const seenInBatch = new Set<string>();

  for (const { lead, normalizedEmail } of prepared) {

    // Same address on two CRM records: keep the first, count the rest. Skipping
    // here is what stops one agency receiving the same cold email twice.
    if (seenInBatch.has(normalizedEmail)) {
      counts.skippedDuplicate += 1;
      continue;
    }
    seenInBatch.add(normalizedEmail);

    const classification = classifyOutreachContact({
      email: lead.email,
      emailProvenance: lead.emailProvenance,
      companyDomain: lead.companyDomain,
      city: lead.city,
      phoneCallingCode: lead.phoneCallingCode,
      isSuppressed: suppressed.has(normalizedEmail),
      isKnownCustomer: knownCustomers.has(normalizedEmail),
    });

    if (classification.blockReason === "invalid_syntax") counts.blockedInvalid += 1;
    if (classification.blockReason === "disposable_domain") {
      counts.blockedDisposable += 1;
    }
    if (classification.blockReason === "unroutable_domain") {
      counts.blockedUnroutable += 1;
    }
    if (classification.blockReason === "placeholder_address") {
      counts.blockedPlaceholder += 1;
    }
    if (classification.blockReason === "suppressed") counts.blockedSuppressed += 1;
    if (classification.eligibility === "customer_lifecycle_only") {
      counts.customerLifecycleOnly += 1;
    }
    countTier(counts, classification.tier);

    const contact: OutreachContactUpsert = {
      ...classification,
      // Store the repaired address, not the raw scraped one.
      email: repairEncodedEmail(lead.email).email,
      companyName: lead.companyName,
      companyDomain: lead.companyDomain,
      contactName: lead.contactName,
      jobTitle: lead.jobTitle,
      city: lead.city,
      emailProvenance: lead.emailProvenance,
      emailConfidence: lead.emailConfidence,
      contactCompleteness: lead.contactCompleteness,
      sourceSystem: options.sourceSystem,
      sourceRecordId: lead.sourceRecordId,
      sourceLabel: lead.sourceLabel ?? options.sourceLabel,
      sourceUrl: lead.sourceUrl,
      importBatchId: options.batchId,
    };
    classified.push(contact);

    if (dryRun) continue;

    try {
      const outcome = await dependencies.upsertContact(contact);
      if (outcome === "inserted") counts.imported += 1;
      else counts.updated += 1;
    } catch (error) {
      errors.push(
        `${normalizedEmail}: ${
          error instanceof Error ? error.message : "unknown upsert error"
        }`
      );
    }
  }

  const completedAt = dependencies.now();
  await dependencies.recordBatch({
    batchId: options.batchId,
    sourceSystem: options.sourceSystem,
    sourceLabel: options.sourceLabel,
    dryRun,
    status: errors.length > 0 ? "failed" : "completed",
    counts,
    errors,
    startedAt,
    completedAt,
  });

  return { batchId: options.batchId, dryRun, counts, errors, classified };
}
