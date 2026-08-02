/**
 * Deterministic classification for cold-outreach leads.
 *
 * This module decides SENDABILITY, not discovery. Email discovery, role/generic
 * labelling, disposable detection and MX checks already run upstream in the
 * enrichment service (insturix-enrichment/app/enrich/decision_maker.py) and its
 * verdicts arrive on the Twenty record as emailSource / emailConfidence /
 * contactCompleteness. We ingest those as provenance and add the layer that does
 * not exist anywhere yet: which sending lane a contact is allowed into.
 *
 * The role local-part and disposable domain sets are mirrored from
 * decision_maker.py so both systems agree on what "role account" means. Changing
 * one without the other makes the two systems disagree about the same address.
 */

import { isValidEmailAddress, normalizeEmailAddress } from "../contact-policy";

/**
 * Bump when classification rules change so stale rows are detectable.
 * v2: compound role tokens, unroutable TLDs, placeholder addresses - added
 * after the first real import showed 39 of 87 "personal" tier-A addresses were
 * functional mailboxes.
 */
export const OUTREACH_CLASSIFIER_VERSION = 2;

export const OUTREACH_ELIGIBILITIES = [
  "manual_outreach",
  "customer_lifecycle_only",
  "ses_marketing_eligible",
  "blocked_or_unknown",
] as const;
export type OutreachEligibility = (typeof OUTREACH_ELIGIBILITIES)[number];

export const OUTREACH_MAILBOX_TYPES = [
  "personal_corporate",
  "personal_free",
  "role",
  "unknown",
] as const;
export type OutreachMailboxType = (typeof OUTREACH_MAILBOX_TYPES)[number];

/** A = send first, D = hold back. Ordering drives cohort selection, nothing else. */
export const OUTREACH_TIERS = ["A", "B", "C", "D"] as const;
export type OutreachTier = (typeof OUTREACH_TIERS)[number];

export const OUTREACH_BLOCK_REASONS = [
  "invalid_syntax",
  "disposable_domain",
  "unroutable_domain",
  "placeholder_address",
  "suppressed",
  "duplicate_in_batch",
] as const;
export type OutreachBlockReason = (typeof OUTREACH_BLOCK_REASONS)[number];

/** Mirrors ROLE_LOCALPARTS in insturix-enrichment/app/enrich/decision_maker.py:17 */
const ROLE_LOCALPARTS = new Set([
  "info", "hello", "contact", "contactus", "sales", "hr", "careers", "career",
  "jobs", "support", "admin", "administrator", "enquiry", "enquiries",
  "inquiry", "inquiries", "team", "office", "mail", "email", "marketing",
  "business", "biz", "hi", "help", "service", "services", "connect", "reach",
  "work", "noreply", "no-reply", "donotreply", "postmaster", "webmaster",
  "billing", "accounts", "accounting", "finance", "legal", "press", "media",
  "partnerships", "partner", "general", "query", "queries",
]);

/**
 * Role tokens that never occur as a human first or last name. Matched against
 * any dot/dash/underscore-separated segment of the local part, so compound
 * functional addresses like "investor.relations@" and "no.support@" are caught.
 *
 * Derived from the first real Twenty import, where 39 of 87 "tier A personal"
 * addresses turned out to be functional boxes. A false positive here only
 * demotes a contact's priority - it is never blocked or rewritten - so the set
 * errs toward catching functional mail.
 */
const ROLE_TOKENS = new Set([
  "info", "hello", "contact", "contactus", "reachus", "reach", "connect",
  "sales", "sale", "presales", "bd", "businessdevelopment", "growth", "grow",
  "outreach", "success", "marketing", "media", "press", "pr",
  "support", "help", "helpdesk", "customercare", "care", "service", "services",
  "admin", "administrator", "office", "team", "management", "operations",
  "hr", "careers", "career", "carrer", "jobs", "job", "recruitment", "cv",
  "hiring", "join", "joinus", "apply",
  "billing", "accounts", "accounting", "finance", "payments", "emandate",
  "invoice", "invoices", "investor", "investors", "legal", "disputes",
  "emaildisputes", "compliance", "obits",
  "noreply", "donotreply", "postmaster", "webmaster", "mailer", "bounce",
  "enquiry", "enquiries", "inquiry", "inquiries", "query", "queries",
  "webmail", "web", "website", "techinfo", "tech", "it", "studio", "agency",
  "general", "main", "mail", "email", "partnerships", "partner", "affiliates",
  "booking", "bookings", "events", "event", "newsletter", "subscribe",
]);

/**
 * Placeholder identities that appear in scraped data as sample or template
 * content. These are never real mailboxes and always bounce.
 */
const PLACEHOLDER_LOCAL_PARTS = new Set([
  "janedoe", "jane.doe", "johndoe", "john.doe", "firstname", "lastname",
  "firstnamelastname", "firstname.lastname", "yourname", "your.name",
  "name", "example", "test", "testing", "sample", "demo", "user",
  "someone", "somebody", "youremail", "your.email", "emailaddress",
]);

/**
 * Domains that can never receive internet mail. RFC 2606 reserves test/example/
 * invalid/localhost; RFC 6762 reserves .local for multicast DNS. A real case in
 * the first import was "dhruv@dhruvs-macbook-air.local" - a laptop hostname
 * scraped from a mail header, which would hard bounce every time.
 */
const UNROUTABLE_TLDS = new Set([
  "local", "localhost", "invalid", "test", "example", "internal", "lan", "home",
]);

/** Mirrors DISPOSABLE_DOMAINS in insturix-enrichment/app/enrich/decision_maker.py:27 */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "yopmail.com",
  "temp-mail.org", "throwaway.email", "trashmail.com", "getnada.com",
  "tempmail.com", "fakeinbox.com", "sharklasers.com", "maildrop.cc",
  "dispostable.com", "mailnesia.com", "tempr.email",
]);

/**
 * Consumer mailbox providers. A lead here is often a real owner (common for small
 * Indian agencies), so this is NOT a block - it is a deliverability signal. Cold
 * volume into consumer inboxes is the fastest way to burn a young sending domain,
 * so these are tiered last rather than excluded.
 */
const FREE_MAILBOX_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in",
  "yahoo.co.uk", "ymail.com", "hotmail.com", "hotmail.co.uk", "outlook.com",
  "live.com", "msn.com", "aol.com", "icloud.com", "me.com", "mac.com",
  "rediffmail.com", "protonmail.com", "proton.me", "zoho.com", "gmx.com",
  "mail.com", "yandex.com",
]);

/** Email provenance values the enrichment service writes to Twenty's emailSource. */
const VERIFIED_EMAIL_SOURCES = new Set([
  "site_personal", "site_generic", "osint_domain", "osint_whois",
]);

const TLD_JURISDICTIONS: ReadonlyArray<[string, string]> = [
  [".co.in", "IN"], [".in", "IN"],
  [".co.uk", "GB"], [".uk", "GB"],
  [".com.au", "AU"], [".au", "AU"],
  [".ca", "CA"], [".us", "US"],
  [".ae", "AE"], [".sg", "SG"],
  [".de", "EU"], [".fr", "EU"], [".es", "EU"], [".it", "EU"],
  [".nl", "EU"], [".ie", "EU"], [".pl", "EU"], [".se", "EU"], [".eu", "EU"],
];

const INDIAN_CITIES = new Set([
  "delhi", "new delhi", "mumbai", "bengaluru", "bangalore", "hyderabad",
  "chennai", "kolkata", "pune", "ahmedabad", "jaipur", "surat", "lucknow",
  "bhopal", "indore", "noida", "gurgaon", "gurugram", "chandigarh", "kochi",
  "coimbatore", "nagpur", "vadodara", "thane", "patna", "bhubaneswar",
]);

export interface OutreachClassificationInput {
  email: string;
  /** Twenty emailSource - enrichment provenance, empty when the row came from a workbook. */
  emailProvenance?: string;
  companyDomain?: string;
  city?: string;
  phoneCallingCode?: string;
  /** True when this address matches a known Insturix user or consented contact. */
  isKnownCustomer?: boolean;
  /** True when an active suppression exists for this address. */
  isSuppressed?: boolean;
}

export interface OutreachClassification {
  normalizedEmail: string;
  eligibility: OutreachEligibility;
  mailboxType: OutreachMailboxType;
  tier: OutreachTier;
  jurisdiction: string;
  hasVerifiedProvenance: boolean;
  /** True when a scraping artifact was repaired; keeps the rewrite auditable. */
  emailRepaired: boolean;
  blockReason?: OutreachBlockReason;
  classifierVersion: number;
}

function emailDomain(normalizedEmail: string): string {
  return normalizedEmail.slice(normalizedEmail.lastIndexOf("@") + 1);
}

function emailLocalPart(normalizedEmail: string): string {
  return normalizedEmail.slice(0, normalizedEmail.lastIndexOf("@"));
}

export function classifyMailboxType(normalizedEmail: string): OutreachMailboxType {
  if (!isValidEmailAddress(normalizedEmail)) return "unknown";

  const localPart = emailLocalPart(normalizedEmail);
  // Strip a plus-tag before matching so "sales+leads@" still reads as a role box.
  const baseLocalPart = localPart.split("+")[0];
  if (ROLE_LOCALPARTS.has(baseLocalPart)) return "role";

  // A functional address is often compound ("investor.relations", "no.support"),
  // so check each segment rather than only the whole local part.
  const segments = baseLocalPart.split(/[._-]+/).filter(Boolean);
  if (segments.some((segment) => ROLE_TOKENS.has(segment))) return "role";

  // "sales1@", "info2@" - a role word with a trailing counter.
  if (segments.some((segment) => ROLE_TOKENS.has(segment.replace(/\d+$/, "")))) {
    return "role";
  }

  // A local part carrying a domain ("vedantrusty.com@wix-domains.com") or the
  // company's own name is a registrar/scrape artifact, not a person.
  if (/\.(com|in|org|net|co|io)$/i.test(baseLocalPart)) return "role";

  return FREE_MAILBOX_DOMAINS.has(emailDomain(normalizedEmail))
    ? "personal_free"
    : "personal_corporate";
}

/**
 * Repairs percent-encoding artifacts left by HTML scraping.
 *
 * Real example from the first import: "%20info@growmoredigitally.in" - an
 * encoded leading space. Sending to it hard-bounces, and hard bounces are what
 * destroy a young domain's sending reputation.
 *
 * Deliberately conservative: decode, trim, and accept ONLY if the result is a
 * valid address. It never invents a local part, so a genuinely odd address such
 * as "a%20b@x.com" decodes to something invalid and gets blocked rather than
 * silently rewritten into somebody else's mailbox.
 */
export function repairEncodedEmail(value: string): {
  email: string;
  wasRepaired: boolean;
  /** Carries an encoding artifact we could not resolve - must not be sent to. */
  unrepairableArtifact: boolean;
} {
  const trimmed = value.trim();
  if (!/%[0-9a-f]{2}/i.test(trimmed)) {
    return { email: trimmed, wasRepaired: false, unrepairableArtifact: false };
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return { email: trimmed, wasRepaired: false, unrepairableArtifact: true };
  }

  const candidate = decoded.trim();
  if (isValidEmailAddress(normalizeEmailAddress(candidate))) {
    return { email: candidate, wasRepaired: true, unrepairableArtifact: false };
  }

  // "%" is legal in a local part, so the raw address would pass syntax checks
  // and then bounce. Quarantine it instead of shipping a known-bad address.
  return { email: trimmed, wasRepaired: false, unrepairableArtifact: true };
}

/**
 * Best-effort jurisdiction for downstream GDPR/DPDP handling. Returns "UNKNOWN"
 * rather than guessing - an unknown jurisdiction is a prompt to check, a wrong
 * one silently applies the wrong consent rules.
 */
export function inferJurisdiction(input: {
  companyDomain?: string;
  emailDomain?: string;
  city?: string;
  phoneCallingCode?: string;
}): string {
  const domains = [input.companyDomain, input.emailDomain]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLowerCase());

  for (const domain of domains) {
    for (const [suffix, jurisdiction] of TLD_JURISDICTIONS) {
      if (domain.endsWith(suffix)) return jurisdiction;
    }
  }

  const city = input.city?.trim().toLowerCase();
  if (city && INDIAN_CITIES.has(city)) return "IN";

  const callingCode = input.phoneCallingCode?.replace(/[^0-9]/g, "");
  if (callingCode === "91") return "IN";
  if (callingCode === "44") return "GB";
  if (callingCode === "1") return "US";

  return "UNKNOWN";
}

/**
 * Tier ranks how safe a contact is to send to FIRST. It combines mailbox type
 * with whether the address was actually discovered and validated by the
 * enrichment service versus imported from a workbook with no provenance.
 */
function assignTier(
  mailboxType: OutreachMailboxType,
  hasVerifiedProvenance: boolean
): OutreachTier {
  if (mailboxType === "personal_free") return "D";
  if (mailboxType === "personal_corporate") {
    return hasVerifiedProvenance ? "A" : "B";
  }
  if (mailboxType === "role") {
    return hasVerifiedProvenance ? "B" : "C";
  }
  return "D";
}

export function classifyOutreachContact(
  input: OutreachClassificationInput
): OutreachClassification {
  const repaired = repairEncodedEmail(input.email);
  const normalizedEmail = normalizeEmailAddress(repaired.email);
  const mailboxType = classifyMailboxType(normalizedEmail);
  const hasVerifiedProvenance = VERIFIED_EMAIL_SOURCES.has(
    (input.emailProvenance ?? "").trim()
  );
  const jurisdiction = inferJurisdiction({
    companyDomain: input.companyDomain,
    emailDomain: isValidEmailAddress(normalizedEmail)
      ? emailDomain(normalizedEmail)
      : undefined,
    city: input.city,
    phoneCallingCode: input.phoneCallingCode,
  });

  const base = {
    normalizedEmail,
    mailboxType,
    jurisdiction,
    hasVerifiedProvenance,
    emailRepaired: repaired.wasRepaired,
    classifierVersion: OUTREACH_CLASSIFIER_VERSION,
  };

  const blocked = (
    blockReason: OutreachBlockReason
  ): OutreachClassification => ({
    ...base,
    eligibility: "blocked_or_unknown",
    tier: "D",
    blockReason,
  });

  if (repaired.unrepairableArtifact || !isValidEmailAddress(normalizedEmail)) {
    return blocked("invalid_syntax");
  }

  const domain = emailDomain(normalizedEmail);
  if (DISPOSABLE_DOMAINS.has(domain)) return blocked("disposable_domain");

  // A reserved or private TLD cannot receive internet mail; sending guarantees
  // a hard bounce, and hard bounces are what wreck a young domain's reputation.
  if (UNROUTABLE_TLDS.has(domain.slice(domain.lastIndexOf(".") + 1))) {
    return blocked("unroutable_domain");
  }

  const localPart = emailLocalPart(normalizedEmail).split("+")[0];
  if (
    PLACEHOLDER_LOCAL_PARTS.has(localPart) ||
    PLACEHOLDER_LOCAL_PARTS.has(localPart.replace(/[._-]/g, ""))
  ) {
    return blocked("placeholder_address");
  }
  // Suppression outranks every other signal: a bounce or complaint means this
  // address must never receive another send from any lane.
  if (input.isSuppressed) return blocked("suppressed");

  // An existing customer or consented contact is never cold-pitched. Their mail
  // stays on the lifecycle/marketing lanes that already have their consent.
  if (input.isKnownCustomer) {
    return { ...base, eligibility: "customer_lifecycle_only", tier: "D" };
  }

  // INVARIANT: a cold lead can never be promoted to ses_marketing_eligible here.
  // That state requires recorded consent and is only ever set by the consent
  // capture path. Cold import produces manual_outreach and nothing else.
  return {
    ...base,
    eligibility: "manual_outreach",
    tier: assignTier(mailboxType, hasVerifiedProvenance),
  };
}
