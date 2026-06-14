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
  blockReason?: string;
}

export interface ProviderPromptPrivacyInput {
  provider: string;
  model: string;
  routePurpose: ProviderRoutePurpose;
  prompt: string;
  fieldsSent?: string[];
  now?: Date | string;
}

export interface ProviderPromptPrivacyDecision {
  allowed: boolean;
  prompt: string;
  audit: ProviderPrivacyAuditRecord;
}

const APPROVED_PRIVATE_PROVIDERS = new Set(['gemini', 'google', 'vertex']);
const NON_APPROVED_EXTERNAL_PROVIDERS = new Set(['deepseek', 'openrouter']);

const CHILD_DATA_PATTERNS = [
  /\bchild\s+(?:data|record|profile|identity|address|email|phone|medical|school)\b/i,
  /\bminor\s+(?:data|record|profile|identity|address|email|phone|medical|school)\b/i,
  /\bunder\s*1[0-7]\b/i,
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

const PERSONAL_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b\d{4}\s\d{4}\s\d{4}\b/,
  /\b[A-Z]{5}\d{4}[A-Z]\b/,
  /\b(?:user|client|customer)\s+(?:name|email|phone|address|dob|date of birth)\b/i,
  /\b(?:contact|email|call|reach|dm)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/,
];

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
    name: 'contact_name',
    pattern: /\b(contact|email|call|reach|dm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/gi,
    replacement: '$1 [REDACTED_PERSON]',
  },
];

export class ProviderPrivacyGateError extends Error {
  constructor(public readonly audit: ProviderPrivacyAuditRecord) {
    super(`Provider privacy gate blocked ${audit.provider}/${audit.routePurpose}: ${audit.blockReason}`);
    this.name = 'ProviderPrivacyGateError';
  }
}

export function isProviderPrivacyGateError(error: unknown): error is ProviderPrivacyGateError {
  return error instanceof ProviderPrivacyGateError;
}

export function classifyPromptData(prompt: string): ProviderPrivacyClass {
  if (matchesAny(prompt, CHILD_DATA_PATTERNS)) return 'child_data';
  if (matchesAny(prompt, BUSINESS_CONFIDENTIAL_PATTERNS)) return 'business_confidential';
  if (matchesAny(prompt, PERSONAL_PATTERNS)) return 'personal';
  return 'public';
}

export function redactPersonalData(prompt: string): { prompt: string; redactions: string[] } {
  let redacted = prompt;
  const redactions: string[] = [];

  for (const rule of REDACTION_RULES) {
    const before = redacted;
    redacted = redacted.replace(rule.pattern, rule.replacement);
    if (redacted !== before) redactions.push(rule.name);
  }

  return { prompt: redacted, redactions: Array.from(new Set(redactions)) };
}

export function prepareProviderPromptForRoute(input: ProviderPromptPrivacyInput): ProviderPromptPrivacyDecision {
  const provider = normalizeProvider(input.provider);
  const privacyClass = classifyPromptData(input.prompt);
  const sourcePromptFingerprint = fingerprintPrompt(input.prompt);
  const isApprovedPrivateProvider = APPROVED_PRIVATE_PROVIDERS.has(provider);
  const isNonApprovedExternalProvider = NON_APPROVED_EXTERNAL_PROVIDERS.has(provider) || !isApprovedPrivateProvider;
  const timestamp = normalizeTimestamp(input.now);
  let promptToSend = input.prompt;
  let redactions: string[] = [];
  const blockReason = resolveBlockReason({
    provider,
    routePurpose: input.routePurpose,
    privacyClass,
    isApprovedPrivateProvider,
    isNonApprovedExternalProvider,
  });

  if (!blockReason && isNonApprovedExternalProvider && privacyClass === 'personal') {
    const redacted = redactPersonalData(promptToSend);
    promptToSend = redacted.prompt;
    redactions = redacted.redactions;
  }

  const allowed = !blockReason;
  const fieldsSent = allowed ? input.fieldsSent ?? ['prompt'] : [];
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

function resolveBlockReason(args: {
  provider: string;
  routePurpose: ProviderRoutePurpose;
  privacyClass: ProviderPrivacyClass;
  isApprovedPrivateProvider: boolean;
  isNonApprovedExternalProvider: boolean;
}): string | undefined {
  if (args.privacyClass === 'child_data') {
    return 'child_data_requires_dpdp_review';
  }

  if (args.routePurpose === 'private_brand_context' && !args.isApprovedPrivateProvider) {
    return 'private_brand_context_requires_approved_provider';
  }

  if (args.isNonApprovedExternalProvider && args.privacyClass === 'business_confidential') {
    return 'business_confidential_context_blocked_for_non_approved_provider';
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

function normalizeTimestamp(value: Date | string | undefined): string {
  if (typeof value === 'string') return value;
  return (value ?? new Date()).toISOString();
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function fingerprintPrompt(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}:${value.length}`;
}
