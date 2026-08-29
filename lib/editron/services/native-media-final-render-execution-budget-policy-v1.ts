import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET' as const;
export const NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_POLICY_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_POLICY_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_COST_RECEIPT_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_COST_RECEIPT_V1' as const;

const DECIMAL = /^(0|[1-9][0-9]*)$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_DECIMAL_DIGITS = 40;

export interface NativeMediaFinalRenderExecutionBudgetRateV1 {
  nanoUsdNumerator: string;
  unitsDenominator: string;
}

export interface NativeMediaFinalRenderExecutionBudgetPolicyV1 {
  version: typeof NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_POLICY_VERSION_V1;
  authority: 'FINANCE_OWNED_EXACT_RENDER_EXECUTION_BUDGET_POLICY';
  ownerId: typeof NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1;
  ownerVersion: string;
  currency: 'USD';
  billingQuantum: 'NANOUSD';
  effectiveAt: string;
  expiresAt: string;
  formula: Readonly<{
    kind: 'CEIL_EACH_EXACT_METER_THEN_SUM_V1';
    encodedFrameAttempt: NativeMediaFinalRenderExecutionBudgetRateV1;
    artifactByteWritten: NativeMediaFinalRenderExecutionBudgetRateV1;
    artifactByteVerified: NativeMediaFinalRenderExecutionBudgetRateV1;
  }>;
  policySha256: string;
}

export interface NativeMediaFinalRenderExecutionBudgetUsageV1 {
  encodedFrameAttempts: string;
  artifactBytesWritten: string;
  artifactBytesVerified: string;
  usageEvidenceSha256: string;
}

export interface NativeMediaFinalRenderExecutionBudgetCostReceiptV1 {
  version: typeof NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_COST_RECEIPT_VERSION_V1;
  authority: 'FINANCE_POLICY_METERING_NO_WALLET_OR_PROJECT_MUTATION';
  ownerId: typeof NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1;
  ownerVersion: string;
  policySha256: string;
  usage: Readonly<NativeMediaFinalRenderExecutionBudgetUsageV1>;
  meterCostsNanoUsd: Readonly<{
    encodedFrameAttempts: string;
    artifactBytesWritten: string;
    artifactBytesVerified: string;
  }>;
  totalCostNanoUsd: string;
  receiptSha256: string;
}

export function createNativeMediaFinalRenderExecutionBudgetPolicyV1(
  input: Readonly<{
    ownerVersion: string;
    effectiveAt: string;
    expiresAt: string;
    encodedFrameAttempt: NativeMediaFinalRenderExecutionBudgetRateV1;
    artifactByteWritten: NativeMediaFinalRenderExecutionBudgetRateV1;
    artifactByteVerified: NativeMediaFinalRenderExecutionBudgetRateV1;
  }>,
): Readonly<NativeMediaFinalRenderExecutionBudgetPolicyV1> {
  const effectiveAt = timestamp(input.effectiveAt, 'POLICY_EFFECTIVE_AT');
  const expiresAt = timestamp(input.expiresAt, 'POLICY_EXPIRES_AT');
  if (Date.parse(effectiveAt) >= Date.parse(expiresAt)) {
    fail('POLICY_TIME_ORDER_INVALID');
  }
  const rates = {
    encodedFrameAttempt: rate(input.encodedFrameAttempt, 'ENCODED_FRAME_ATTEMPT'),
    artifactByteWritten: rate(input.artifactByteWritten, 'ARTIFACT_BYTE_WRITTEN'),
    artifactByteVerified: rate(input.artifactByteVerified, 'ARTIFACT_BYTE_VERIFIED'),
  };
  if (Object.values(rates).every(({ nanoUsdNumerator }) => nanoUsdNumerator === '0')) {
    fail('POLICY_ALL_RATES_ZERO');
  }
  const material = {
    version: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_POLICY_VERSION_V1,
    authority: 'FINANCE_OWNED_EXACT_RENDER_EXECUTION_BUDGET_POLICY' as const,
    ownerId: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1,
    ownerVersion: identity(input.ownerVersion, 'POLICY_OWNER_VERSION'),
    currency: 'USD' as const,
    billingQuantum: 'NANOUSD' as const,
    effectiveAt,
    expiresAt,
    formula: {
      kind: 'CEIL_EACH_EXACT_METER_THEN_SUM_V1' as const,
      ...rates,
    },
  };
  return deepFreezeEditronJsonV1({
    ...material,
    policySha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertNativeMediaFinalRenderExecutionBudgetPolicyV1(
  value: unknown,
): Readonly<NativeMediaFinalRenderExecutionBudgetPolicyV1> {
  const candidate = record(value, 'POLICY');
  const formula = record(candidate.formula, 'POLICY_FORMULA');
  const rebound = createNativeMediaFinalRenderExecutionBudgetPolicyV1({
    ownerVersion: text(candidate.ownerVersion, 'POLICY_OWNER_VERSION'),
    effectiveAt: text(candidate.effectiveAt, 'POLICY_EFFECTIVE_AT'),
    expiresAt: text(candidate.expiresAt, 'POLICY_EXPIRES_AT'),
    encodedFrameAttempt: rateInput(formula.encodedFrameAttempt),
    artifactByteWritten: rateInput(formula.artifactByteWritten),
    artifactByteVerified: rateInput(formula.artifactByteVerified),
  });
  if (canonicalizeEditronJsonV1(candidate) !== canonicalizeEditronJsonV1(rebound)) {
    fail('POLICY_INVALID');
  }
  return rebound;
}

export function calculateNativeMediaFinalRenderExecutionBudgetCostV1(
  policyInput: unknown,
  usageInput: Readonly<NativeMediaFinalRenderExecutionBudgetUsageV1>,
): Readonly<NativeMediaFinalRenderExecutionBudgetCostReceiptV1> {
  const policy = assertNativeMediaFinalRenderExecutionBudgetPolicyV1(policyInput);
  const usage = normalizeUsage(usageInput);
  const frameCost = meterCost(
    usage.encodedFrameAttempts,
    policy.formula.encodedFrameAttempt,
  );
  const writeCost = meterCost(
    usage.artifactBytesWritten,
    policy.formula.artifactByteWritten,
  );
  const verifyCost = meterCost(
    usage.artifactBytesVerified,
    policy.formula.artifactByteVerified,
  );
  const totalCostNanoUsd = boundedDecimal(
    (frameCost + writeCost + verifyCost).toString(),
    'TOTAL_COST_NANOUSD',
  );
  const material = {
    version: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_COST_RECEIPT_VERSION_V1,
    authority: 'FINANCE_POLICY_METERING_NO_WALLET_OR_PROJECT_MUTATION' as const,
    ownerId: policy.ownerId,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
    usage,
    meterCostsNanoUsd: {
      encodedFrameAttempts: frameCost.toString(),
      artifactBytesWritten: writeCost.toString(),
      artifactBytesVerified: verifyCost.toString(),
    },
    totalCostNanoUsd,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

function normalizeUsage(
  value: Readonly<NativeMediaFinalRenderExecutionBudgetUsageV1>,
): Readonly<NativeMediaFinalRenderExecutionBudgetUsageV1> {
  const candidate = record(value, 'USAGE');
  const normalized = {
    encodedFrameAttempts: boundedDecimal(
      candidate.encodedFrameAttempts,
      'USAGE_ENCODED_FRAME_ATTEMPTS',
    ),
    artifactBytesWritten: boundedDecimal(
      candidate.artifactBytesWritten,
      'USAGE_ARTIFACT_BYTES_WRITTEN',
    ),
    artifactBytesVerified: boundedDecimal(
      candidate.artifactBytesVerified,
      'USAGE_ARTIFACT_BYTES_VERIFIED',
    ),
    usageEvidenceSha256: sha256(candidate.usageEvidenceSha256, 'USAGE_EVIDENCE'),
  };
  if (canonicalizeEditronJsonV1(candidate) !== canonicalizeEditronJsonV1(normalized)) {
    fail('USAGE_INVALID');
  }
  return deepFreezeEditronJsonV1(normalized);
}

function rate(value: unknown, label: string): NativeMediaFinalRenderExecutionBudgetRateV1 {
  const candidate = record(value, `RATE_${label}`);
  const normalized = {
    nanoUsdNumerator: boundedDecimal(candidate.nanoUsdNumerator, `${label}_NUMERATOR`),
    unitsDenominator: positiveDecimal(candidate.unitsDenominator, `${label}_DENOMINATOR`),
  };
  if (canonicalizeEditronJsonV1(candidate) !== canonicalizeEditronJsonV1(normalized)) {
    fail(`RATE_${label}_INVALID`);
  }
  return Object.freeze(normalized);
}

function rateInput(value: unknown): NativeMediaFinalRenderExecutionBudgetRateV1 {
  const candidate = record(value, 'RATE');
  return {
    nanoUsdNumerator: text(candidate.nanoUsdNumerator, 'RATE_NUMERATOR'),
    unitsDenominator: text(candidate.unitsDenominator, 'RATE_DENOMINATOR'),
  };
}

function meterCost(
  units: string,
  pricing: NativeMediaFinalRenderExecutionBudgetRateV1,
): bigint {
  const product = BigInt(units) * BigInt(pricing.nanoUsdNumerator);
  const denominator = BigInt(pricing.unitsDenominator);
  return product === BigInt(0)
    ? BigInt(0)
    : ((product - BigInt(1)) / denominator) + BigInt(1);
}

function boundedDecimal(value: unknown, label: string): string {
  const result = text(value, label);
  if (!DECIMAL.test(result) || result.length > MAX_DECIMAL_DIGITS) fail(`${label}_INVALID`);
  return result;
}

function positiveDecimal(value: unknown, label: string): string {
  const result = boundedDecimal(value, label);
  if (result === '0') fail(`${label}_INVALID`);
  return result;
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  const milliseconds = Date.parse(result);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== result) {
    fail(`${label}_INVALID`);
  }
  return result;
}

function identity(value: unknown, label: string): string {
  const result = text(value, label);
  if (!IDENTITY.test(result)) fail(`${label}_INVALID`);
  return result;
}

function sha256(value: unknown, label: string): string {
  const result = text(value, label);
  if (!SHA256.test(result)) fail(`${label}_INVALID`);
  return result;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  return value;
}

function fail(code: string): never {
  throw new Error(`NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_${code}`);
}
