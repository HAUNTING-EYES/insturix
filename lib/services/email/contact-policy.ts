import { createHmac } from "node:crypto";

export const EMAIL_TOPICS = [
  "product_updates",
  "creator_tips",
  "offers",
  "research",
  "lifecycle",
] as const;

export type EmailTopic = (typeof EMAIL_TOPICS)[number];

export const NEWSLETTER_TOPIC: EmailTopic = "product_updates";
export const NEWSLETTER_CONSENT_SOURCE = "newsletter_footer";
export const NEWSLETTER_NOTICE_VERSION = "newsletter-footer-v1";

const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const LOCAL_PART_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmailAddress(email: string): boolean {
  if (
    email.length === 0 ||
    email.length > MAX_EMAIL_LENGTH ||
    /[^\x00-\x7F]/.test(email) ||
    /[\r\n]/.test(email)
  ) {
    return false;
  }

  const separatorIndex = email.lastIndexOf("@");
  if (separatorIndex <= 0 || separatorIndex === email.length - 1) {
    return false;
  }

  const localPart = email.slice(0, separatorIndex);
  const domain = email.slice(separatorIndex + 1);

  if (
    localPart.length > MAX_LOCAL_PART_LENGTH ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !LOCAL_PART_PATTERN.test(localPart)
  ) {
    return false;
  }

  const labels = domain.split(".");
  return (
    labels.length >= 2 &&
    domain.length <= 253 &&
    labels.every((label) => DOMAIN_LABEL_PATTERN.test(label))
  );
}

interface ConsentFingerprintInput {
  ipAddress?: string;
  userAgent?: string;
  secret?: string;
}

export function createConsentRequestFingerprint({
  ipAddress,
  userAgent,
  secret = process.env.EMAIL_CONSENT_AUDIT_SECRET,
}: ConsentFingerprintInput): string | undefined {
  if (!secret || (!ipAddress && !userAgent)) {
    return undefined;
  }

  return createHmac("sha256", secret)
    .update(`${ipAddress?.trim() ?? ""}\n${userAgent?.trim() ?? ""}`)
    .digest("hex");
}
