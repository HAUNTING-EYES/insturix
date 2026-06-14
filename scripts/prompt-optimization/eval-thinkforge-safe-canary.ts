import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';

import {
  prepareProviderPromptForRoute,
  type ProviderPrivacyAuditRecord,
} from '../../lib/thinkforge/privacy/provider-privacy-gateway';
import { extractRequiredClickatronCreativeSidecar } from '../../lib/thinkforge/utils/clickatron-creative-sidecar';
import {
  buildEvalProviderConfig,
  parseEvalProviders,
  runEvalPrompt,
  type EvalProvider,
  type EvalRunResult,
} from './thinkforge-eval-provider-adapter';

const __dirname = dirname(fileURLToPath(import.meta.url));

type CanaryArea = 'public_trend' | 'generic_draft' | 'clickatron_sidecar';
type ScoreCategory =
  | 'output_quality'
  | 'schema_json_validity'
  | 'forbidden_term_obedience'
  | 'brand_voice_match'
  | 'clickatron_sidecar_completeness';

interface CheckResult {
  category: ScoreCategory;
  name: string;
  pass: boolean;
  detail?: string;
}

export interface CanaryScore {
  passed: number;
  total: number;
  ratio: number;
  checks: CheckResult[];
}

export interface SafeCanaryCase {
  id: string;
  name: string;
  area: CanaryArea;
  prompt: string;
  requiredTerms: string[];
  forbiddenTerms: string[];
  syntheticBrandTerms?: string[];
}

export interface SafeCanaryRunRecord {
  caseId: string;
  caseName: string;
  area: CanaryArea;
  provider: EvalProvider;
  model: string;
  runIndex: number;
  score: CanaryScore;
  latencyMs?: number;
  usage?: EvalRunResult['usage'];
  estimatedCostUsd?: number;
  costEstimateNote?: string;
  privacyAudit?: ProviderPrivacyAuditRecord;
  error?: string;
}

export interface SafeCanaryDecision {
  passed: boolean;
  privacyPassed: boolean;
  qualityPassed: boolean;
  failures: string[];
  deliveryMode: 'artifact_only_no_user_delivery';
}

export const SAFE_CANARY_CASES: SafeCanaryCase[] = [
  {
    id: 'public_trend_meme_repurpose',
    name: 'Public trend ideation: meme repurposing',
    area: 'public_trend',
    prompt: `Use this public trend inbox item: "Teams are joking that every app now has an AI copilot button."
Create 4 concise content angles for a synthetic B2B operations brand named NimbusOps.
Return bullets with: trend hook, brand-fit reason, platform, and expiry window. Do not mention private data.`,
    requiredTerms: ['trend', 'NimbusOps', 'platform', 'expiry'],
    forbiddenTerms: ['Brand Vault', 'voiceFingerprint', 'client document', 'private campaign'],
    syntheticBrandTerms: ['NimbusOps', 'operations'],
  },
  {
    id: 'generic_linkedin_draft',
    name: 'Generic synthetic LinkedIn draft',
    area: 'generic_draft',
    prompt: `Write a LinkedIn post for the synthetic brand "StudioPilot".
Topic: agencies reducing content approval loops before launch week.
Voice: calm operator, specific, no hype.
Use the words "StudioPilot", "agency", "approval", and "calm" in the post.
End with a line that starts exactly with "CTA:".
Avoid the phrase "game-changing".`,
    requiredTerms: ['approval', 'agency', 'CTA'],
    forbiddenTerms: ['game-changing', 'Brand Vault', 'private client'],
    syntheticBrandTerms: ['StudioPilot', 'calm'],
  },
  {
    id: 'clickatron_static_sidecar',
    name: 'Clickatron-ready static post sidecar',
    area: 'clickatron_sidecar',
    prompt: `Create an Instagram text plus image post for the synthetic cafe brand "Lumen Cafe".
Visible copy: short caption about a public Monday-focus meme.
Use the words "Lumen Cafe", "Instagram", and "focus" in the visible copy.
After the visible copy, append exactly one hidden production ThinkForge sidecar comment. Do not use a code fence. Do not rename the markers.
Use this exact wrapper and fill every field with concrete public/synthetic content:
<!-- THINKFORGE_CLICKATRON_EXPORT
{
  "clickatron": {
    "schemaVersion": 1,
    "kind": "single_post_visual",
    "assetIntent": "post_graphic",
    "platform": "instagram",
    "aspectRatio": "4:5",
    "source": {
      "sourceService": "thinkforge",
      "sourceBlockIds": ["AUTO"]
    },
    "userIntent": {
      "visualMode": "text_forward_graphic",
      "wantsCarousel": false
    },
    "creativeBrief": {
      "objective": "Create an Instagram Monday-focus post for Lumen Cafe",
      "coreMessage": "Lumen Cafe helps Monday feel focused",
      "audience": "local cafe guests"
    },
    "renderPlan": {
      "textPolicy": "editable_text_layers",
      "imagePrompt": "Warm cafe table with focused notebook, soft morning light, calm Monday ritual, editorial product photography, 4:5 Instagram composition",
      "textLayers": [
        { "id": "headline", "text": "Monday focus ritual", "role": "headline", "priority": 90 },
        { "id": "brand", "text": "Lumen Cafe", "role": "badge", "priority": 70 }
      ]
    },
    "validation": {
      "status": "ready"
    }
  }
}
END_THINKFORGE_CLICKATRON_EXPORT -->
No private context. Do not use the phrase "viral overnight".`,
    requiredTerms: ['Lumen Cafe', 'Instagram', 'THINKFORGE_CLICKATRON_EXPORT'],
    forbiddenTerms: ['viral overnight', 'Brand Vault', 'customer list'],
    syntheticBrandTerms: ['Lumen Cafe', 'focus'],
  },
];

export function validateCanaryCaseSafety(testCase: SafeCanaryCase, providers: EvalProvider[] = ['deepseek', 'openrouter']) {
  return providers.map((provider) => {
    const model = provider === 'openrouter'
      ? 'deepseek/deepseek-chat'
      : provider === 'deepseek'
        ? 'deepseek-v4-flash'
        : 'gemini-2.5-flash';
    const decision = prepareProviderPromptForRoute({
      provider,
      model,
      routePurpose: 'eval',
      prompt: testCase.prompt,
      fieldsSent: ['prompt'],
    });

    if (!decision.allowed || decision.audit.privacyClass !== 'public' || decision.audit.redactions.length > 0) {
      throw new Error(`Unsafe safe-canary case ${testCase.id} for ${provider}: ${decision.audit.blockReason ?? decision.audit.privacyClass}`);
    }

    return decision.audit;
  });
}

export function scoreSafeCanaryOutput(output: string, testCase: SafeCanaryCase): CanaryScore {
  const checks: CheckResult[] = [];
  const add = (category: ScoreCategory, name: string, pass: boolean, detail?: string) => checks.push({ category, name, pass, detail });
  const normalized = output.toLowerCase();

  add('output_quality', 'minimum_length', output.trim().length >= 220, `length=${output.trim().length}`);
  add('output_quality', 'required_terms_present', testCase.requiredTerms.every((term) => normalized.includes(term.toLowerCase())));
  add('forbidden_term_obedience', 'forbidden_terms_absent', testCase.forbiddenTerms.every((term) => !normalized.includes(term.toLowerCase())));

  if (testCase.syntheticBrandTerms?.length) {
    add('brand_voice_match', 'synthetic_brand_terms_present', testCase.syntheticBrandTerms.every((term) => normalized.includes(term.toLowerCase())));
  }

  if (testCase.area === 'clickatron_sidecar') {
    const sidecar = extractClickatronSidecar(output);
    add('schema_json_validity', 'sidecar_json_valid', Boolean(sidecar));
    add('clickatron_sidecar_completeness', 'has_image_prompt', words(sidecar?.renderPlan?.imagePrompt).length >= 8);
    add('clickatron_sidecar_completeness', 'has_editable_text_layers', Array.isArray(sidecar?.renderPlan?.textLayers) && sidecar.renderPlan.textLayers.length >= 2);
    add(
      'clickatron_sidecar_completeness',
      'has_static_asset_contract',
      sidecar?.kind === 'single_post_visual'
        && sidecar.assetIntent === 'post_graphic'
        && sidecar.platform === 'instagram'
        && sidecar.aspectRatio === '4:5',
    );
  } else {
    add('schema_json_validity', 'no_json_required_for_text_case', true);
    add('clickatron_sidecar_completeness', 'sidecar_not_required', true);
  }

  const passed = checks.filter((check) => check.pass).length;
  return { passed, total: checks.length, ratio: passed / checks.length, checks };
}

export function summarizeSafeCanaryRecords(
  records: SafeCanaryRunRecord[],
  threshold = 0.95,
  maxGeminiDelta = 0.02,
): SafeCanaryDecision {
  const failures: string[] = [];
  const privacyPassed = records.every((record) =>
    record.privacyAudit?.privacyClass === 'public'
    && !record.privacyAudit.blockReason
    && record.privacyAudit.fieldsSent.includes('prompt')
    && record.privacyAudit.redactions.length === 0,
  );
  if (!privacyPassed) failures.push('privacy_audit_not_public_or_clean');

  for (const caseId of Array.from(new Set(records.map((record) => record.caseId)))) {
    const geminiAvg = average(records.filter((record) => record.caseId === caseId && record.provider === 'gemini').map((record) => record.score.ratio));
    if (geminiAvg === undefined) {
      failures.push(`${caseId}:missing_gemini_baseline`);
      continue;
    }

    for (const provider of Array.from(new Set(records.filter((record) => record.caseId === caseId && record.provider !== 'gemini').map((record) => record.provider)))) {
      const challengerScores = records.filter((record) => record.caseId === caseId && record.provider === provider).map((record) => record.score.ratio);
      const challengerAvg = average(challengerScores);
      const challengerMin = Math.min(...challengerScores);
      if (challengerAvg === undefined || challengerAvg < threshold || challengerMin < threshold || challengerAvg < geminiAvg - maxGeminiDelta) {
        failures.push(`${caseId}:${provider}:quality_gate_failed`);
      }
    }
  }

  if (records.some((record) => record.error)) failures.push('provider_error_present');

  const qualityPassed = !failures.some((failure) => failure !== 'privacy_audit_not_public_or_clean');
  return {
    passed: privacyPassed && qualityPassed,
    privacyPassed,
    qualityPassed,
    failures,
    deliveryMode: 'artifact_only_no_user_delivery',
  };
}

async function main() {
  dotenv.config({ path: resolve(__dirname, '../../.env.local') });
  const providers = parseEvalProviders(readArg('providers') ?? 'gemini,deepseek');
  const runs = readPositiveIntArg('runs', 2);
  const threshold = readNumberArg('threshold', 0.95);
  const maxGeminiDelta = readNumberArg('max-gemini-delta', 0.02);
  const jsonOut = resolve(process.cwd(), readArg('json-out') ?? `.artifacts/thinkforge-safe-canary/${timestampSlug()}/scoreboard.json`);

  SAFE_CANARY_CASES.forEach((testCase) => validateCanaryCaseSafety(testCase, providers));
  const providerConfigs = providers.map((provider) => buildEvalProviderConfig({ provider, temperature: 0.2, maxOutputTokens: 4096 }));
  const records: SafeCanaryRunRecord[] = [];

  for (const testCase of SAFE_CANARY_CASES) {
    for (const providerConfig of providerConfigs) {
      for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
        try {
          const result = await runEvalPrompt(providerConfig, testCase.prompt);
          records.push({
            caseId: testCase.id,
            caseName: testCase.name,
            area: testCase.area,
            provider: providerConfig.provider,
            model: providerConfig.model,
            runIndex,
            score: scoreSafeCanaryOutput(result.output, testCase),
            latencyMs: result.latencyMs,
            usage: result.usage,
            estimatedCostUsd: result.estimatedCostUsd,
            costEstimateNote: result.costEstimateNote,
            privacyAudit: result.privacyAudit,
          });
        } catch (error) {
          records.push({
            caseId: testCase.id,
            caseName: testCase.name,
            area: testCase.area,
            provider: providerConfig.provider,
            model: providerConfig.model,
            runIndex,
            score: emptyScore(error instanceof Error ? error.message : String(error)),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  const decision = summarizeSafeCanaryRecords(records, threshold, maxGeminiDelta);
  mkdirSync(dirname(jsonOut), { recursive: true });
  writeFileSync(jsonOut, JSON.stringify({ generatedAt: new Date().toISOString(), mode: 'safe_public_canary', decision, records }, null, 2));
  console.log(`Wrote safe canary scoreboard: ${jsonOut}`);
  console.log(`Decision: ${decision.passed ? 'PASS' : 'FAIL'} ${decision.failures.join(', ')}`);
  if (!decision.passed) process.exitCode = 1;
}

function extractClickatronSidecar(output: string) {
  try {
    return extractRequiredClickatronCreativeSidecar(output).exportMeta.clickatron;
  } catch {
    return undefined;
  }
}

const emptyScore = (message: string): CanaryScore => ({
  passed: 0,
  total: 1,
  ratio: 0,
  checks: [{ category: 'output_quality', name: 'provider_call_succeeded', pass: false, detail: message }],
});
const average = (values: number[]): number | undefined =>
  values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;
const words = (value: unknown): string[] => (typeof value === 'string' ? value.trim().split(/\s+/).filter(Boolean) : []);
const argv = process.argv.slice(2);
const readArg = (name: string): string | undefined =>
  argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
function readPositiveIntArg(name: string, fallback: number) {
  const parsed = Number.parseInt(readArg(name) ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function readNumberArg(name: string, fallback: number) {
  const parsed = Number.parseFloat(readArg(name) ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}
const timestampSlug = () => new Date().toISOString().replace(/[:.]/g, '-');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
