/**
 * Read adapter for the Twenty CRM.
 *
 * Twenty runs as a local service (default http://localhost:3000) and is NOT
 * reachable from the deployed app, so anything using this adapter runs locally
 * and writes its results to MongoDB Atlas, which both sides can reach.
 *
 * Read-only by design: pulling leads must never mutate the CRM. Write-back of
 * replies and meetings is a separate, explicit path.
 */

const DEFAULT_BASE_URL = "http://localhost:3000";
const PAGE_SIZE = 60;
// Twenty paginates by cursor; this only bounds a runaway loop if the API ever
// returns hasNextPage forever. 500 pages x 60 = 30,000 records.
const MAX_PAGES = 500;

export interface TwentyCompanyLead {
  recordId: string;
  companyName: string;
  companyDomain?: string;
  email?: string;
  additionalEmails: string[];
  emailProvenance?: string;
  emailConfidence?: number;
  contactCompleteness?: string;
  city?: string;
  addressCountry?: string;
  phoneCallingCode?: string;
  sourceLabel?: string;
  leadStatus?: string;
  linkedinUrl?: string;
}

interface TwentyLinkField {
  primaryLinkLabel?: string | null;
  primaryLinkUrl?: string | null;
}

interface TwentyEmailsField {
  primaryEmail?: string | null;
  additionalEmails?: unknown;
}

interface TwentyPhonesField {
  primaryPhoneNumber?: string | null;
  primaryPhoneCallingCode?: string | null;
}

interface TwentyAddressField {
  addressCity?: string | null;
  addressCountry?: string | null;
}

interface TwentyCompanyRecord {
  id: string;
  name?: string | null;
  deletedAt?: string | null;
  domainName?: TwentyLinkField | null;
  linkedinLink?: TwentyLinkField | null;
  emailSupplement?: TwentyEmailsField | null;
  emailSource?: string | null;
  emailConfidence?: number | null;
  contactCompleteness?: string | null;
  city?: string | null;
  address?: TwentyAddressField | null;
  primaryPhone?: TwentyPhonesField | null;
  sourceSystem?: string | null;
  leadStatus?: string | null;
}

interface TwentyCompaniesResponse {
  data?: { companies?: TwentyCompanyRecord[] };
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
}

export interface TwentyClientOptions {
  baseUrl?: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Reduce a website link to a bare hostname for jurisdiction and throttling. */
export function hostnameFromUrl(value?: string | null): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(candidate).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return undefined;
  }
}

export function mapCompanyRecord(
  record: TwentyCompanyRecord
): TwentyCompanyLead {
  const additional = Array.isArray(record.emailSupplement?.additionalEmails)
    ? (record.emailSupplement?.additionalEmails as unknown[])
        .map((entry) => text(entry))
        .filter((entry): entry is string => Boolean(entry))
    : [];

  return {
    recordId: record.id,
    companyName: text(record.name) ?? "",
    companyDomain:
      hostnameFromUrl(record.domainName?.primaryLinkUrl) ??
      hostnameFromUrl(record.domainName?.primaryLinkLabel),
    email: text(record.emailSupplement?.primaryEmail),
    additionalEmails: additional,
    emailProvenance: text(record.emailSource),
    emailConfidence:
      typeof record.emailConfidence === "number"
        ? record.emailConfidence
        : undefined,
    contactCompleteness: text(record.contactCompleteness),
    city: text(record.city) ?? text(record.address?.addressCity),
    addressCountry: text(record.address?.addressCountry),
    phoneCallingCode: text(record.primaryPhone?.primaryPhoneCallingCode),
    sourceLabel: text(record.sourceSystem),
    leadStatus: text(record.leadStatus),
    linkedinUrl: text(record.linkedinLink?.primaryLinkUrl),
  };
}

export class TwentyReadClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TwentyClientOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("A Twenty API key is required.");
    }
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiKey = options.apiKey.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Pull every non-deleted company, following Twenty's cursor pagination. */
  async listCompanies(): Promise<TwentyCompanyLead[]> {
    const leads: TwentyCompanyLead[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(`${this.baseUrl}/rest/companies`);
      url.searchParams.set("limit", String(PAGE_SIZE));
      // snake_case is required here: Twenty ignores an unknown camelCase
      // "startingAfter" and silently returns the first page again.
      if (cursor) url.searchParams.set("starting_after", cursor);

      const response = await this.fetchImpl(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Twenty request failed (${response.status} ${response.statusText}).`
        );
      }

      const payload = (await response.json()) as TwentyCompaniesResponse;
      const records = payload.data?.companies ?? [];
      for (const record of records) {
        if (record.deletedAt) continue;
        leads.push(mapCompanyRecord(record));
      }

      if (!payload.pageInfo?.hasNextPage || records.length === 0) {
        return leads;
      }
      const nextCursor = payload.pageInfo.endCursor ?? undefined;
      // Fail loud instead of silently re-reading page 1 forever.
      if (!nextCursor || nextCursor === cursor) {
        throw new Error("Twenty pagination stalled: no advancing cursor.");
      }
      cursor = nextCursor;
    }

    throw new Error(
      `Twenty pagination exceeded ${MAX_PAGES} pages; aborting to avoid a runaway read.`
    );
  }
}
