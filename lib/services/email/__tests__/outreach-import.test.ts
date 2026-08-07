import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyOutreachContact,
  classifyMailboxType,
  inferJurisdiction,
  OUTREACH_CLASSIFIER_VERSION,
} from "../outreach/classification";
import {
  importOutreachLeads,
  type OutreachContactUpsert,
  type OutreachImportDependencies,
  type OutreachImportLead,
} from "../outreach/import-service";
import type { IOutreachImportCounts } from "@/schemas/OutreachImportBatchSchema";

function createDependencies(options: {
  suppressed?: string[];
  knownCustomers?: string[];
  failOn?: string;
} = {}) {
  const upserted: OutreachContactUpsert[] = [];
  const batches: Array<{
    dryRun: boolean;
    status: string;
    counts: IOutreachImportCounts;
    errors: string[];
  }> = [];
  let connectCalls = 0;

  const dependencies: OutreachImportDependencies = {
    async connect() {
      connectCalls += 1;
    },
    async findSuppressed() {
      return new Set(options.suppressed ?? []);
    },
    async findKnownCustomers() {
      return new Set(options.knownCustomers ?? []);
    },
    async upsertContact(contact) {
      if (options.failOn && contact.normalizedEmail === options.failOn) {
        throw new Error("write rejected");
      }
      upserted.push(contact);
      return "inserted";
    },
    async recordBatch(batch) {
      batches.push({
        dryRun: batch.dryRun,
        status: batch.status,
        counts: batch.counts,
        errors: batch.errors,
      });
    },
    now: () => new Date("2026-08-02T00:00:00.000Z"),
  };

  return {
    dependencies,
    upserted,
    batches,
    connectCalls: () => connectCalls,
  };
}

const OPTIONS = {
  sourceSystem: "twenty",
  sourceLabel: "Agency Intelligence",
  batchId: "batch-test-1",
};

test("Role, corporate and consumer mailboxes are told apart", () => {
  assert.equal(classifyMailboxType("info@agency.com"), "role");
  assert.equal(classifyMailboxType("sales+leads@agency.com"), "role");
  assert.equal(classifyMailboxType("vikram@pathinfotech.com"), "personal_corporate");
  assert.equal(classifyMailboxType("royprime777@gmail.com"), "personal_free");
  assert.equal(classifyMailboxType("not-an-email"), "unknown");
});

test("Jurisdiction comes from domain, then city, then calling code", () => {
  assert.equal(inferJurisdiction({ companyDomain: "agency.co.in" }), "IN");
  assert.equal(inferJurisdiction({ companyDomain: "studio.co.uk" }), "GB");
  assert.equal(inferJurisdiction({ city: "Bhopal" }), "IN");
  assert.equal(inferJurisdiction({ phoneCallingCode: "+91" }), "IN");
  assert.equal(inferJurisdiction({ companyDomain: "agency.com" }), "UNKNOWN");
});

test("Invalid and disposable addresses are blocked, never sendable", () => {
  const invalid = classifyOutreachContact({ email: "no-at-sign" });
  assert.equal(invalid.eligibility, "blocked_or_unknown");
  assert.equal(invalid.blockReason, "invalid_syntax");

  const disposable = classifyOutreachContact({ email: "x@mailinator.com" });
  assert.equal(disposable.eligibility, "blocked_or_unknown");
  assert.equal(disposable.blockReason, "disposable_domain");
});

test("Suppression outranks every other signal", () => {
  const classification = classifyOutreachContact({
    email: "owner@studio.com",
    emailProvenance: "site_personal",
    isSuppressed: true,
  });
  assert.equal(classification.eligibility, "blocked_or_unknown");
  assert.equal(classification.blockReason, "suppressed");
  assert.equal(classification.tier, "D");
});

test("A known customer is never cold-pitched", () => {
  const classification = classifyOutreachContact({
    email: "founder@customer.com",
    emailProvenance: "site_personal",
    isKnownCustomer: true,
  });
  assert.equal(classification.eligibility, "customer_lifecycle_only");
});

test("Cold import can never produce a marketing-eligible contact", () => {
  const permutations = [
    { email: "a@corp.com", emailProvenance: "site_personal" },
    { email: "info@corp.com", emailProvenance: "site_generic" },
    { email: "b@gmail.com" },
    { email: "c@corp.in", emailProvenance: "osint_whois" },
    { email: "d@corp.com", isKnownCustomer: true },
    { email: "e@corp.com", isSuppressed: true },
  ];

  for (const input of permutations) {
    const classification = classifyOutreachContact(input);
    assert.notEqual(
      classification.eligibility,
      "ses_marketing_eligible",
      `${input.email} must not be marketing eligible without consent`
    );
    assert.equal(classification.classifierVersion, OUTREACH_CLASSIFIER_VERSION);
  }
});

test("Tiers rank verified corporate mailboxes above unverified and consumer ones", () => {
  const tierOf = (input: Parameters<typeof classifyOutreachContact>[0]) =>
    classifyOutreachContact(input).tier;

  assert.equal(
    tierOf({ email: "owner@studio.com", emailProvenance: "site_personal" }),
    "A"
  );
  assert.equal(tierOf({ email: "owner@studio.com" }), "B");
  assert.equal(
    tierOf({ email: "info@studio.com", emailProvenance: "site_generic" }),
    "B"
  );
  assert.equal(tierOf({ email: "info@studio.com" }), "C");
  assert.equal(tierOf({ email: "owner@gmail.com" }), "D");
});

test("Compound functional addresses are recognised as role mailboxes", () => {
  // All observed in the first real Twenty import, misfiled as personal.
  for (const email of [
    "investor.relations@fiserv.com",
    "no.support@digitalswow.com",
    "customercare@algaariart.com",
    "agency.hello@socialx.au",
    "sales1@digitalsindia.com",
    "cv@bigwolfmarketing.co.uk",
    "join@noct.in",
    "helpdesk@rubiq.in",
    "carrer@spacebot.in",
    "vedantrusty.com@wix-domains.com",
  ]) {
    assert.equal(classifyMailboxType(email), "role", `${email} should be role`);
  }
});

test("Genuine personal addresses are not swept up as role mailboxes", () => {
  for (const email of [
    "sankalp@aawarafilms.com",
    "nikhil.talreja@cochamps.co",
    "anas.ansari@globtier.in",
    "saurav.k@webeesocial.com",
    "sarah.resnikoff@barco.com",
    "deepmala@thevisualhouse.in",
  ]) {
    assert.equal(
      classifyMailboxType(email),
      "personal_corporate",
      `${email} should stay personal`
    );
  }
});

test("Unroutable domains and placeholder addresses are blocked", () => {
  // A laptop hostname scraped from a mail header - guaranteed hard bounce.
  const unroutable = classifyOutreachContact({
    email: "dhruv@dhruvs-macbook-air.local",
  });
  assert.equal(unroutable.eligibility, "blocked_or_unknown");
  assert.equal(unroutable.blockReason, "unroutable_domain");

  const placeholder = classifyOutreachContact({ email: "jane.doe@digitotal.in" });
  assert.equal(placeholder.eligibility, "blocked_or_unknown");
  assert.equal(placeholder.blockReason, "placeholder_address");
});

test("Percent-encoded scraping artifacts are repaired, not sent as-is", () => {
  // Real case from the first Twenty import; sending as-is would hard bounce.
  const classification = classifyOutreachContact({
    email: "%20info@growmoredigitally.in",
    emailProvenance: "site_personal",
  });
  assert.equal(classification.normalizedEmail, "info@growmoredigitally.in");
  assert.equal(classification.emailRepaired, true);
  assert.equal(classification.eligibility, "manual_outreach");
});

test("A decode that does not yield a valid address is blocked, never guessed", () => {
  const classification = classifyOutreachContact({ email: "a%20b@studio.com" });
  assert.equal(classification.eligibility, "blocked_or_unknown");
  assert.equal(classification.blockReason, "invalid_syntax");
  assert.equal(classification.emailRepaired, false);
});

test("Suppression matches the repaired address, not the raw one", async () => {
  const leads: OutreachImportLead[] = [
    { email: "%20owner@studio.com", emailProvenance: "site_personal" },
  ];
  const harness = createDependencies({ suppressed: ["owner@studio.com"] });

  const report = await importOutreachLeads(leads, OPTIONS, harness.dependencies);

  assert.equal(report.counts.blockedSuppressed, 1);
  assert.equal(report.classified[0].eligibility, "blocked_or_unknown");
});

test("Import wires live suppression and customer state into classification", async () => {
  const leads: OutreachImportLead[] = [
    { email: "Owner@Studio.com", emailProvenance: "site_personal" },
    { email: "bounced@studio.com", emailProvenance: "site_personal" },
    { email: "customer@studio.com", emailProvenance: "site_personal" },
  ];
  const harness = createDependencies({
    suppressed: ["bounced@studio.com"],
    knownCustomers: ["customer@studio.com"],
  });

  const report = await importOutreachLeads(leads, OPTIONS, harness.dependencies, );

  const byEmail = new Map(
    report.classified.map((contact) => [contact.normalizedEmail, contact])
  );
  assert.equal(byEmail.get("owner@studio.com")?.eligibility, "manual_outreach");
  assert.equal(
    byEmail.get("bounced@studio.com")?.eligibility,
    "blocked_or_unknown"
  );
  assert.equal(
    byEmail.get("customer@studio.com")?.eligibility,
    "customer_lifecycle_only"
  );
  assert.equal(report.counts.blockedSuppressed, 1);
  assert.equal(report.counts.customerLifecycleOnly, 1);
});

test("Duplicate addresses in one batch are imported once", async () => {
  const leads: OutreachImportLead[] = [
    { email: "info@studio.com", sourceRecordId: "rec-1" },
    { email: "INFO@studio.com", sourceRecordId: "rec-2" },
  ];
  const harness = createDependencies();

  const report = await importOutreachLeads(
    leads,
    OPTIONS,
    harness.dependencies
  );

  assert.equal(report.counts.skippedDuplicate, 1);
  assert.equal(report.classified.length, 1);
  assert.equal(report.classified[0].sourceRecordId, "rec-1");
});

test("Dry run classifies and audits without writing any contact", async () => {
  const leads: OutreachImportLead[] = [
    { email: "owner@studio.com", emailProvenance: "site_personal" },
  ];
  const harness = createDependencies();

  const report = await importOutreachLeads(leads, OPTIONS, harness.dependencies);

  assert.equal(report.dryRun, true);
  assert.equal(harness.upserted.length, 0);
  assert.equal(report.counts.imported, 0);
  assert.equal(report.classified.length, 1);
  assert.equal(harness.batches.length, 1);
  assert.equal(harness.batches[0].dryRun, true);
});

test("An explicit non-dry run writes contacts and counts them", async () => {
  const leads: OutreachImportLead[] = [
    { email: "owner@studio.com", emailProvenance: "site_personal" },
    { email: "info@studio.com" },
  ];
  const harness = createDependencies();

  const report = await importOutreachLeads(
    leads,
    { ...OPTIONS, dryRun: false },
    harness.dependencies
  );

  assert.equal(harness.upserted.length, 2);
  assert.equal(report.counts.imported, 2);
  assert.equal(report.counts.tierA, 1);
  assert.equal(report.counts.tierC, 1);
});

test("A failed write is reported, not swallowed, and marks the batch failed", async () => {
  const leads: OutreachImportLead[] = [
    { email: "owner@studio.com" },
    { email: "broken@studio.com" },
  ];
  const harness = createDependencies({ failOn: "broken@studio.com" });

  const report = await importOutreachLeads(
    leads,
    { ...OPTIONS, dryRun: false },
    harness.dependencies
  );

  assert.equal(report.errors.length, 1);
  assert.match(report.errors[0], /broken@studio\.com/);
  assert.equal(harness.batches[0].status, "failed");
});
