export type ProviderPrivacyClass = 'public' | 'business_confidential' | 'personal' | 'child_data';

export type ProviderRoutePurpose =
  | 'structural'
  | 'creative_authoring'
  | 'eval'
  | 'public_trend'
  | 'private_brand_context';

export interface ProviderPrivacyAuditRecord {
  provider: string;
  model: string;
  routePurpose: ProviderRoutePurpose;
  privacyClass: ProviderPrivacyClass;
  fieldsSent: string[];
  timestamp: string;
  sourcePromptFingerprint: string;
  sentPromptFingerprint?: string;
  sourcePromptLength: number;
  sentPromptLength?: number;
  redactions: string[];
  redactionCount?: number;
  redactionCounts?: Record<string, number>;
  blockReason?: string;
}

export interface ProviderPromptPrivacyInput {
  provider: string;
  model: string;
  routePurpose: ProviderRoutePurpose;
  prompt: string;
  declaredPrivacyClass?: ProviderPrivacyClass;
  fieldsSent?: string[];
  now?: Date | string;
}

export interface ProviderPromptPrivacyDecision {
  allowed: boolean;
  prompt: string;
  audit: ProviderPrivacyAuditRecord;
}

export interface ProviderRoutePrivacyInput {
  provider: string;
  model: string;
  routePurpose: ProviderRoutePurpose;
  privacyClass: ProviderPrivacyClass;
  fieldsSent?: string[];
  now?: Date | string;
}

export interface ProviderRoutePrivacyDecision {
  allowed: boolean;
  audit: ProviderPrivacyAuditRecord;
}

export interface StoragePrivacyInspection {
  privacyClass: ProviderPrivacyClass;
  containsPersonalData: boolean;
  sanitizedText: string;
  redactions: string[];
  redactionCount: number;
  redactionCounts: Record<string, number>;
}

const APPROVED_PRIVATE_PROVIDERS = new Set(['gemini', 'google', 'vertex']);
const NON_APPROVED_EXTERNAL_PROVIDERS = new Set(['deepseek', 'openrouter']);

const CHILD_DATA_PATTERNS = [
  /\bchild\s+(?:data|record|profile|identity|address|email|phone|medical|school)\b/i,
  /\bminor\s+(?:data|record|profile|identity|address|email|phone|medical|school)\b/i,
  /\bunder\s+(?:the\s+)?age\s+of\s+(?:1[0-8]|[0-9])\b/i,
  /\b(?:users?|people|persons?|participants?|students?|children|customers?|patients?)\s+under\s+(?:1[0-8]|[0-9])\b/i,
  /\bage\s*(?:1[0-7]|[0-9])\b/i,
  /\b(?:1[0-7]|[0-9])[-\s]*(?:year|yr)[-\s]?old\b/i,
  /\bstudent\s+(?:record|profile|address|email|phone|medical|data)\b/i,
];

const BUSINESS_CONFIDENTIAL_PATTERNS = [
  /\bbrand\s*vault\b/i,
  /\bbrand\s*dna\b/i,
  /\bbranddna\b/i,
  /\bvoice\s*fingerprint\b/i,
  /\bvoicefingerprint\b/i,
  /\bvoice\s*exemplars?\b/i,
  /\bvoiceexemplars?\b/i,
  /\bdatabank\b/i,
  /<brand_context[\s>]/i,
  /<\/brand_context>/i,
  /\bclient\s+(?:confidential|brief|doc|document|data|strategy|campaign)\b/i,
  /\b(?:nda|non-disclosure|confidential|proprietary|internal strategy|private campaign)\b/i,
  /\b(?:customer list|pipeline|unreleased|revenue model|pricing model)\b/i,
];

const MONTH_NAME_SOURCE = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DOB_VALUE_SOURCE = `(?:\\d{4}[/-]\\d{1,2}[/-]\\d{1,2}|\\d{1,2}[/-]\\d{1,2}[/-](?:\\d{2}|\\d{4})|${MONTH_NAME_SOURCE}\\s+\\d{1,2}(?:st|nd|rd|th)?[,]?\\s+\\d{4}|\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_NAME_SOURCE}[,]?\\s+\\d{4})`;
const DOB_REDACTION_PATTERNS = [
  new RegExp(`\\b((?:date\\s+of\\s+birth|birth\\s*date|dob)\\s*(?:is|:|=|-)\\s*)(${DOB_VALUE_SOURCE})\\b`, 'gi'),
  new RegExp(`\\b((?:born\\s+(?:on\\s+)?))(${DOB_VALUE_SOURCE})\\b`, 'gi'),
];

const STREET_SUFFIX_SOURCE = '(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Boulevard|Blvd|Drive|Dr|Court|Ct|Way|Highway|Hwy|Place|Pl|Terrace|Trail|Trl|Circle|Parkway|Pkwy|Marg|Nagar|Colony|Sector)';
const POSTAL_CODE_SOURCE = '(?:\\d{5}(?:-\\d{4})?|\\d{6}|[A-Z]{1,2}\\d[A-Z\\d]?\\s*\\d[A-Z]{2})';
const NUMBERED_STREET_ADDRESS_SOURCE = `\\d+[A-Z]?(?:[-/]\\d+[A-Z]?)?\\s+(?:[\\p{L}\\p{N}'-]+\\s+){0,6}${STREET_SUFFIX_SOURCE}\\.?(?:\\s+(?:NW|NE|SW|SE))?(?:,\\s*[\\p{L}][\\p{L} .'-]{1,30}){0,2}(?:,\\s*[A-Z]{2})?(?:\\s+${POSTAL_CODE_SOURCE})?`;
const UNIT_ADDRESS_SOURCE = `(?:Flat|Apartment|Apt|Suite|Unit|House|Plot)\\s*[A-Z0-9/-]+(?:,\\s*(?:Tower|Building|Block|Floor)\\s*[A-Z0-9/-]+)?(?:,\\s*[\\p{L}\\p{N}][\\p{L}\\p{N} .'-]{1,40}){1,3}(?:\\s+${POSTAL_CODE_SOURCE})?`;
const ADDRESS_VALUE_SOURCE = `(?:${NUMBERED_STREET_ADDRESS_SOURCE}|${UNIT_ADDRESS_SOURCE})`;
const PERSON_NAME_SOURCE = "[\\p{Lu}][\\p{L}'-]+(?:\\s+[\\p{Lu}][\\p{L}'-]+){1,2}";

const REDACTION_RULES: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  {
    name: 'email',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '[REDACTED_EMAIL]',
  },
  {
    name: 'phone',
    pattern: /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  {
    name: 'phone',
    pattern: /(?<!\d)\+\d{1,3}[\s.-]?(?:\d[\s.-]?){8,14}\d(?!\d)/g,
    replacement: '[REDACTED_PHONE]',
  },
  {
    name: 'phone',
    pattern: /\b[6-9]\d{4}[\s.-]?\d{5}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  {
    name: 'tax_id',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[REDACTED_TAX_ID]',
  },
  {
    name: 'aadhaar',
    pattern: /\b\d{4}\s\d{4}\s\d{4}\b/g,
    replacement: '[REDACTED_ID]',
  },
  {
    name: 'pan',
    pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    replacement: '[REDACTED_ID]',
  },
  {
    name: 'person_name',
    pattern: /\b((?:[Ff]ull\s+[Nn]ame|(?:[Uu]ser|[Cc]lient|[Cc]ustomer|[Cc]ontact|[Ee]mployee|[Rr]ecipient|[Pp]atient)\s+[Nn]ame)\s*(?:is|:|=|-)\s*)([\p{L}][\p{L}'-]+(?:\s+[\p{L}][\p{L}'-]+){1,2})\b/gu,
    replacement: '$1[REDACTED_PERSON]',
  },
  {
    name: 'contact_name',
    pattern: new RegExp(`\\b((?:[Cc]ontact|[Ee]mail|[Cc]all|[Dd][Mm])\\s+)(?!To\\s+Action\\b|For\\s+Proposals?\\b)${PERSON_NAME_SOURCE}(?=\\s+(?:at|on|via)\\b|\\s*[,;.]|$)`, 'gu'),
    replacement: '$1[REDACTED_PERSON]',
  },
  ...DOB_REDACTION_PATTERNS.map((pattern) => ({
    name: 'date_of_birth',
    pattern,
    replacement: '$1[REDACTED_DOB]',
  })),
  {
    name: 'street_address',
    pattern: new RegExp(`\\b((?:(?:home|residential|mailing|shipping|billing|street|client|customer|user)\\s+)?address\\s*(?:is|:|=|-)\\s*)(${ADDRESS_VALUE_SOURCE})`, 'giu'),
    replacement: '$1[REDACTED_ADDRESS]',
  },
  {
    name: 'street_address',
    pattern: new RegExp(`\\b((?:(?:ship|send|deliver|mail|courier)(?:\\s+(?:it|this|the\\s+(?:sample|package|document)))?\\s+to|(?:lives?|resides?|located)\\s+at)\\s+)(${ADDRESS_VALUE_SOURCE})`, 'giu'),
    replacement: '$1[REDACTED_ADDRESS]',
  },
];

export class ProviderPrivacyGateError extends Error {
  constructor(public readonly audit: ProviderPrivacyAuditRecord) {
    super(`Provider privacy gate blocked ${audit.provider}/${audit.routePurpose}: ${audit.blockReason}`);
    this.name = 'ProviderPrivacyGateError';
  }
}

function classifyPromptData(
  prompt: string,
  timestamp: string,
  personalRedactionCount: number,
): ProviderPrivacyClass {
  if (matchesAny(prompt, CHILD_DATA_PATTERNS) || containsChildDateOfBirth(prompt, timestamp)) return 'child_data';
  if (matchesAny(prompt, BUSINESS_CONFIDENTIAL_PATTERNS)) return 'business_confidential';
  if (personalRedactionCount > 0) return 'personal';
  return 'public';
}

function redactPersonalData(prompt: string): {
  prompt: string;
  redactions: string[];
  redactionCount: number;
  redactionCounts: Record<string, number>;
} {
  let redacted = prompt;
  const redactionCounts: Record<string, number> = {};

  for (const rule of REDACTION_RULES) {
    const matchCount = redacted.match(rule.pattern)?.length ?? 0;
    if (matchCount === 0) continue;
    redacted = redacted.replace(rule.pattern, rule.replacement);
    redactionCounts[rule.name] = (redactionCounts[rule.name] ?? 0) + matchCount;
  }

  return {
    prompt: redacted,
    redactions: Object.keys(redactionCounts),
    redactionCount: Object.values(redactionCounts).reduce((total, count) => total + count, 0),
    redactionCounts,
  };
}

/**
 * Inspect data before persistence without making a provider-routing decision.
 * Callers own the storage policy; this function supplies one deterministic
 * classification and a redacted representation without retaining raw values.
 */
export function inspectDataForStorage(input: {
  text: string;
  declaredPrivacyClass?: ProviderPrivacyClass;
  now?: Date | string;
}): StoragePrivacyInspection {
  const timestamp = normalizeTimestamp(input.now);
  const personalRedaction = redactPersonalData(input.text);
  const privacyClass = mostSensitivePrivacyClass(
    input.declaredPrivacyClass ?? 'public',
    classifyPromptData(input.text, timestamp, personalRedaction.redactionCount),
  );
  return {
    privacyClass,
    containsPersonalData: personalRedaction.redactionCount > 0,
    sanitizedText: personalRedaction.prompt,
    redactions: personalRedaction.redactions,
    redactionCount: personalRedaction.redactionCount,
    redactionCounts: personalRedaction.redactionCounts,
  };
}

export function prepareProviderPromptForRoute(input: ProviderPromptPrivacyInput): ProviderPromptPrivacyDecision {
  const provider = normalizeProvider(input.provider);
  const timestamp = normalizeTimestamp(input.now);
  const personalRedaction = redactPersonalData(input.prompt);
  const privacyClass = mostSensitivePrivacyClass(
    input.declaredPrivacyClass ?? 'public',
    classifyPromptData(input.prompt, timestamp, personalRedaction.redactionCount),
  );
  const sourcePromptFingerprint = fingerprintPrompt(input.prompt);
  const isApprovedPrivateProvider = APPROVED_PRIVATE_PROVIDERS.has(provider);
  const isNonApprovedExternalProvider = NON_APPROVED_EXTERNAL_PROVIDERS.has(provider) || !isApprovedPrivateProvider;
  let promptToSend = input.prompt;
  let redactions: string[] = [];
  let redactionCount = 0;
  let redactionCounts: Record<string, number> = {};
  const blockReason = resolveBlockReason({
    provider,
    routePurpose: input.routePurpose,
    privacyClass,
    isApprovedPrivateProvider,
    isNonApprovedExternalProvider,
    canRedactPersonalData: true,
  });

  const shouldRedactPersonalData = privacyClass === 'personal'
    && (isNonApprovedExternalProvider || input.routePurpose === 'public_trend');
  if (!blockReason && shouldRedactPersonalData) {
    promptToSend = personalRedaction.prompt;
    redactions = personalRedaction.redactions;
    redactionCount = personalRedaction.redactionCount;
    redactionCounts = personalRedaction.redactionCounts;
  }

  const allowed = !blockReason;
  const fieldsSent = allowed ? normalizeAuditFieldNames(input.fieldsSent ?? ['prompt']) : [];
  const audit: ProviderPrivacyAuditRecord = {
    provider,
    model: input.model,
    routePurpose: input.routePurpose,
    privacyClass,
    fieldsSent,
    timestamp,
    sourcePromptFingerprint,
    sourcePromptLength: input.prompt.length,
    redactions,
    redactionCount,
    redactionCounts,
    blockReason,
  };

  if (allowed) {
    audit.sentPromptFingerprint = fingerprintPrompt(promptToSend);
    audit.sentPromptLength = promptToSend.length;
  }

  return {
    allowed,
    prompt: allowed ? promptToSend : '',
    audit,
  };
}

export function assertProviderPromptAllowed(input: ProviderPromptPrivacyInput): ProviderPromptPrivacyDecision {
  const decision = prepareProviderPromptForRoute(input);
  if (!decision.allowed) {
    throw new ProviderPrivacyGateError(decision.audit);
  }
  return decision;
}

export function prepareProviderRouteForPrivacy(input: ProviderRoutePrivacyInput): ProviderRoutePrivacyDecision {
  const provider = normalizeProvider(input.provider);
  const isApprovedPrivateProvider = APPROVED_PRIVATE_PROVIDERS.has(provider);
  const isNonApprovedExternalProvider = NON_APPROVED_EXTERNAL_PROVIDERS.has(provider) || !isApprovedPrivateProvider;
  const blockReason = resolveBlockReason({
    provider,
    routePurpose: input.routePurpose,
    privacyClass: input.privacyClass,
    isApprovedPrivateProvider,
    isNonApprovedExternalProvider,
    canRedactPersonalData: false,
  });
  const allowed = !blockReason;

  return {
    allowed,
    audit: {
      provider,
      model: input.model,
      routePurpose: input.routePurpose,
      privacyClass: input.privacyClass,
      fieldsSent: allowed ? normalizeAuditFieldNames(input.fieldsSent ?? []) : [],
      timestamp: normalizeTimestamp(input.now),
      sourcePromptFingerprint: 'route-only',
      sentPromptFingerprint: allowed ? 'route-only' : undefined,
      sourcePromptLength: 0,
      sentPromptLength: allowed ? 0 : undefined,
      redactions: [],
      redactionCount: 0,
      redactionCounts: {},
      blockReason,
    },
  };
}

export function assertProviderRouteAllowed(input: ProviderRoutePrivacyInput): ProviderRoutePrivacyDecision {
  const decision = prepareProviderRouteForPrivacy(input);
  if (!decision.allowed) {
    throw new ProviderPrivacyGateError(decision.audit);
  }
  return decision;
}

function resolveBlockReason(args: {
  provider: string;
  routePurpose: ProviderRoutePurpose;
  privacyClass: ProviderPrivacyClass;
  isApprovedPrivateProvider: boolean;
  isNonApprovedExternalProvider: boolean;
  canRedactPersonalData: boolean;
}): string | undefined {
  if (args.privacyClass === 'child_data') {
    return 'child_data_requires_dpdp_review';
  }

  if (args.routePurpose === 'structural' && args.isNonApprovedExternalProvider) {
    return 'structural_route_requires_approved_provider';
  }

  if (args.routePurpose === 'private_brand_context' && !args.isApprovedPrivateProvider) {
    return 'private_brand_context_requires_approved_provider';
  }

  if (args.isNonApprovedExternalProvider && args.privacyClass === 'business_confidential') {
    return 'business_confidential_context_blocked_for_non_approved_provider';
  }

  if (args.isNonApprovedExternalProvider && args.privacyClass === 'personal' && !args.canRedactPersonalData) {
    return 'personal_context_requires_prompt_redaction_gateway';
  }

  if (args.routePurpose === 'creative_authoring' && args.isNonApprovedExternalProvider) {
    return 'creative_authoring_non_approved_provider_requires_canary_approval';
  }

  if (args.routePurpose === 'public_trend' && args.privacyClass !== 'public' && args.privacyClass !== 'personal') {
    return 'public_trend_route_requires_public_or_redactable_context';
  }

  return undefined;
}

function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase();
}

function mostSensitivePrivacyClass(
  declared: ProviderPrivacyClass,
  detected: ProviderPrivacyClass,
): ProviderPrivacyClass {
  const rank: Record<ProviderPrivacyClass, number> = {
    public: 0,
    personal: 1,
    business_confidential: 2,
    child_data: 3,
  };
  return rank[detected] > rank[declared] ? detected : declared;
}

function normalizeTimestamp(value: Date | string | undefined): string {
  if (typeof value === 'string') return value;
  return (value ?? new Date()).toISOString();
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function containsChildDateOfBirth(prompt: string, timestamp: string): boolean {
  const referenceDate = new Date(timestamp);
  if (!Number.isFinite(referenceDate.getTime())) return false;

  for (const pattern of DOB_REDACTION_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of prompt.matchAll(pattern)) {
      if (readBirthDateCandidates(match[2], referenceDate.getUTCFullYear())
        .some((birthDate) => ageAtDate(birthDate, referenceDate) < 18)) {
        return true;
      }
    }
  }

  return false;
}

function readBirthDateCandidates(value: string | undefined, currentYear: number): Date[] {
  if (!value) return [];

  const iso = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (iso) return compactValidDates([[Number(iso[1]), Number(iso[2]), Number(iso[3])]]);

  const numeric = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (numeric) {
    const year = normalizeBirthYear(numeric[3], currentYear);
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    if (first > 12) return compactValidDates([[year, second, first]]);
    if (second > 12) return compactValidDates([[year, first, second]]);
    return compactValidDates([[year, first, second], [year, second, first]]);
  }

  const normalized = value.replace(/(\d)(?:st|nd|rd|th)\b/gi, '$1').replace(/,/g, '');
  const monthFirst = normalized.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (monthFirst) {
    const month = readMonthNumber(monthFirst[1]);
    return month ? compactValidDates([[Number(monthFirst[3]), month, Number(monthFirst[2])]]) : [];
  }

  const dayFirst = normalized.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dayFirst) {
    const month = readMonthNumber(dayFirst[2]);
    return month ? compactValidDates([[Number(dayFirst[3]), month, Number(dayFirst[1])]]) : [];
  }

  return [];
}

function normalizeBirthYear(value: string, currentYear: number): number {
  const parsed = Number(value);
  if (value.length === 4) return parsed;
  const currentCentury = Math.floor(currentYear / 100) * 100;
  const candidate = currentCentury + parsed;
  return candidate > currentYear ? candidate - 100 : candidate;
}

function readMonthNumber(value: string): number | undefined {
  const month = value.slice(0, 3).toLowerCase();
  const index = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(month);
  return index >= 0 ? index + 1 : undefined;
}

function compactValidDates(parts: Array<[number, number, number]>): Date[] {
  return parts.flatMap(([year, month, day]) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day
      ? [date]
      : [];
  });
}

function ageAtDate(birthDate: Date, referenceDate: Date): number {
  let age = referenceDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayHasPassed = referenceDate.getUTCMonth() > birthDate.getUTCMonth()
    || (referenceDate.getUTCMonth() === birthDate.getUTCMonth()
      && referenceDate.getUTCDate() >= birthDate.getUTCDate());
  if (!birthdayHasPassed) age -= 1;
  return age;
}

function normalizeAuditFieldNames(fields: string[]): string[] {
  const normalized = fields
    .map((field) => field.trim())
    .filter((field) => /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(field));
  return Array.from(new Set(normalized)).slice(0, 32);
}

function fingerprintPrompt(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}:${value.length}`;
}
