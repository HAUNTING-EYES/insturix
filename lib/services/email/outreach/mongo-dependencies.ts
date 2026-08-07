/**
 * MongoDB-backed dependencies for the outreach importer.
 *
 * Split from import-service.ts so the import logic stays testable without a
 * database, and so the "what counts as suppressed / already a customer" queries
 * live in exactly one place.
 */

import type { OutreachImportDependencies } from "./import-service";

async function models() {
  const [
    { default: connectToDatabase },
    { default: OutreachContact },
    { default: OutreachImportBatch },
    { default: EmailSuppression },
    { default: EmailContact },
    { User },
  ] = await Promise.all([
    import("@/schemas/ConnectToDatabase"),
    import("@/schemas/OutreachContactSchema"),
    import("@/schemas/OutreachImportBatchSchema"),
    import("@/schemas/EmailSuppressionSchema"),
    import("@/schemas/EmailContactSchema"),
    import("@/schemas/user"),
  ]);

  return {
    connectToDatabase,
    OutreachContact,
    OutreachImportBatch,
    EmailSuppression,
    EmailContact,
    User,
  };
}

export function createMongoImportDependencies(): OutreachImportDependencies {
  return {
    async connect() {
      const { connectToDatabase } = await models();
      return connectToDatabase();
    },

    async findSuppressed(normalizedEmails) {
      const { EmailSuppression } = await models();
      // Any ACTIVE suppression blocks outreach, whatever its scope: a topic-level
      // opt-out still means this person asked us to stop emailing them.
      const rows = await EmailSuppression.find({
        normalizedEmail: { $in: normalizedEmails },
        active: true,
      })
        .select("normalizedEmail")
        .lean()
        .exec();
      return new Set(rows.map((row) => row.normalizedEmail));
    },

    async findKnownCustomers(normalizedEmails) {
      const { User, EmailContact } = await models();
      const [users, contacts] = await Promise.all([
        User.find({ email: { $in: normalizedEmails } })
          .select("email")
          .lean()
          .exec(),
        // A contact carrying a userId is a registered customer; one without is a
        // newsletter subscriber, who is still not a cold lead.
        EmailContact.find({ normalizedEmail: { $in: normalizedEmails } })
          .select("normalizedEmail")
          .lean()
          .exec(),
      ]);

      const known = new Set<string>();
      for (const user of users as Array<{ email?: string }>) {
        if (user.email) known.add(user.email.trim().toLowerCase());
      }
      for (const contact of contacts as Array<{ normalizedEmail?: string }>) {
        if (contact.normalizedEmail) known.add(contact.normalizedEmail);
      }
      return known;
    },

    async upsertContact(contact) {
      const { OutreachContact } = await models();
      const result = await OutreachContact.updateOne(
        { normalizedEmail: contact.normalizedEmail },
        {
          $set: {
            email: contact.email,
            companyName: contact.companyName,
            companyDomain: contact.companyDomain,
            contactName: contact.contactName,
            jobTitle: contact.jobTitle,
            city: contact.city,
            jurisdiction: contact.jurisdiction,
            emailProvenance: contact.emailProvenance,
            emailConfidence: contact.emailConfidence,
            contactCompleteness: contact.contactCompleteness,
            hasVerifiedProvenance: contact.hasVerifiedProvenance,
            emailRepaired: contact.emailRepaired,
            eligibility: contact.eligibility,
            mailboxType: contact.mailboxType,
            tier: contact.tier,
            blockReason: contact.blockReason,
            classifierVersion: contact.classifierVersion,
            classifiedAt: new Date(),
            sourceSystem: contact.sourceSystem,
            sourceRecordId: contact.sourceRecordId,
            sourceLabel: contact.sourceLabel,
            sourceUrl: contact.sourceUrl,
            importBatchId: contact.importBatchId,
          },
          // Lifecycle state belongs to the sending system. Re-importing a lead
          // must never reset someone from "replied" back to "new".
          $setOnInsert: {
            normalizedEmail: contact.normalizedEmail,
            status: "new",
            doNotContact: false,
          },
        },
        { upsert: true }
      ).exec();

      return result.upsertedCount > 0 ? "inserted" : "updated";
    },

    async recordBatch(batch) {
      const { OutreachImportBatch } = await models();
      await OutreachImportBatch.updateOne(
        { batchId: batch.batchId },
        {
          $set: {
            sourceSystem: batch.sourceSystem,
            sourceLabel: batch.sourceLabel,
            dryRun: batch.dryRun,
            status: batch.status,
            counts: batch.counts,
            importErrors: batch.errors,
            startedAt: batch.startedAt,
            completedAt: batch.completedAt,
          },
        },
        { upsert: true }
      ).exec();
    },

    now: () => new Date(),
  };
}
