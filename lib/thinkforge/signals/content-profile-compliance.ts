import type { OutputFormat } from '../../shared/signals';
import type { ThinkForgeContentSignalProfile } from './content-signal-resolver';

export type ContentProfileComplianceSeverity = 'critical' | 'warning' | 'info';

export interface ContentProfileComplianceViolation {
  id: string;
  severity: ContentProfileComplianceSeverity;
  message: string;
  location?: string;
}

export interface ContentProfileComplianceResult {
  score: number;
  penalty: number;
  violations: ContentProfileComplianceViolation[];
}

export class ContentProfileComplianceError extends Error {
  readonly violations: readonly ContentProfileComplianceViolation[];

  constructor(violations: readonly ContentProfileComplianceViolation[]) {
    const critical = violations.filter((violation) => violation.severity === 'critical');
    super(`ThinkForge output failed profile compliance: ${critical.map((violation) => violation.id).join(', ')}`);
    this.name = 'ContentProfileComplianceError';
    this.violations = critical;
  }
}

const SCRIPT_LABEL_RE = /(^|\n)\s*(?:#{2,3}\s*\[[0-9:.-]+|(?:\*\*)?(?:VO|On-Camera|Visual|Audio|Scene|Camera|Framing|Motion|Duration|Transition)(?:\s*\*\*)?\s*:)/i;
const INTERNAL_PROFILE_RE = /<content_signal_profile>|<signal_execution_rules>|"_inference_metadata"|THINKFORGE_CLICKATRON_EXPORT/i;

export function evaluateContentProfileCompliance(
  content: string,
  resolved: ThinkForgeContentSignalProfile,
): ContentProfileComplianceResult {
  const violations: ContentProfileComplianceViolation[] = [
    ...detectForbiddenTerms(content, resolved),
    ...detectMissingProofPoints(content, resolved),
    ...detectPlatformLength(content, resolved),
    ...detectFormatMismatch(content, resolved.profile.constraints.output_format),
    ...detectInternalLeakage(content),
    ...detectMissingCTA(content, resolved),
  ];

  const penalty = violations.reduce((total, violation) => total + severityPenalty(violation.severity), 0);
  return {
    score: Math.max(0, 100 - penalty),
    penalty,
    violations,
  };
}

export function formatContentProfileComplianceViolations(
  violations: ContentProfileComplianceViolation[],
): string[] {
  return violations.map((violation) => {
    const location = violation.location ? ` (${violation.location})` : '';
    return `Signal profile: ${violation.message}${location}`;
  });
}

export function shouldAutoRepairContentProfileViolations(
  violations: readonly ContentProfileComplianceViolation[],
): boolean {
  return violations.some((violation) => violation.severity === 'critical');
}

export function assertNoCriticalContentProfileViolations(
  violations: readonly ContentProfileComplianceViolation[],
): void {
  if (shouldAutoRepairContentProfileViolations(violations)) {
    throw new ContentProfileComplianceError(violations);
  }
}

function detectForbiddenTerms(
  content: string,
  resolved: ThinkForgeContentSignalProfile,
): ContentProfileComplianceViolation[] {
  const violations: ContentProfileComplianceViolation[] = [];
  for (const term of resolved.intent.forbiddenTerms) {
    const needle = term.trim();
    if (!needle) continue;
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`, 'i');
    if (pattern.test(content)) {
      violations.push({
        id: 'profile_forbidden_term',
        severity: 'critical',
        message: `Forbidden brand term still appears: "${needle}".`,
        location: firstLineContaining(content, needle),
      });
    }
  }
  return violations;
}

function detectMissingProofPoints(
  content: string,
  resolved: ThinkForgeContentSignalProfile,
): ContentProfileComplianceViolation[] {
  const metrics = resolved.intent.proofPoints
    .map((point) => point.match(/^Metric mentioned in brief:\s*(.+)$/i)?.[1]?.trim())
    .filter((metric): metric is string => Boolean(metric));

  const missingMetrics = metrics
    .filter((metric) => !containsSourceText(content, metric))
    .map((metric) => ({
      id: 'profile_missing_metric_proof',
      severity: 'warning' as const,
      message: `Required metric proof from the resolved profile is missing: "${metric}".`,
    }));

  const requiredClaims = resolved.intent.proofPoints
    .map((point) => point.match(/^Required brief claim:\s*(.+)$/i)?.[1]?.trim())
    .filter((claim): claim is string => Boolean(claim));
  const missingClaims = requiredClaims
    .filter((claim) => !containsSourceText(content, claim))
    .map((claim) => ({
      id: 'profile_missing_required_brief_claim',
      severity: 'critical' as const,
      message: `Explicit brief claim is missing or altered: "${claim}".`,
    }));

  const requiredAudienceAnchors = resolved.intent.proofPoints
    .map((point) => point.match(/^Required audience anchor:\s*(.+)$/i)?.[1]?.trim())
    .filter((audience): audience is string => Boolean(audience));
  const missingAudienceAnchors = requiredAudienceAnchors
    .filter((audience) => !containsSourceText(content, audience))
    .map((audience) => ({
      id: 'profile_missing_required_audience_anchor',
      severity: 'critical' as const,
      message: `Explicit target audience is missing: "${audience}".`,
    }));

  return [...missingMetrics, ...missingClaims, ...missingAudienceAnchors];
}

function detectPlatformLength(
  content: string,
  resolved: ThinkForgeContentSignalProfile,
): ContentProfileComplianceViolation[] {
  const maxCharacters = getMaxCharacters(resolved);
  if (!maxCharacters || content.length <= maxCharacters) return [];

  return [{
    id: 'profile_platform_length_exceeded',
    severity: 'warning',
    message: `Content exceeds the resolved platform character limit (${content.length}/${maxCharacters}).`,
  }];
}

function detectFormatMismatch(
  content: string,
  outputFormat: OutputFormat,
): ContentProfileComplianceViolation[] {
  if (outputFormat === 'social_post' || outputFormat === 'caption') {
    if (SCRIPT_LABEL_RE.test(content)) {
      return [{
        id: 'profile_social_post_contains_script_labels',
        severity: 'critical',
        message: 'Resolved format is social text, but the output contains script or production labels.',
      }];
    }
  }

  if (outputFormat === 'video_script') {
    const hasSceneStructure = /(^|\n)\s*#{2,3}\s*\[[0-9:.-]+/.test(content)
      || /\*\*(?:VO|On-Camera|Visual|Audio|Text|Mood|Transition)\b/i.test(content);
    if (!hasSceneStructure) {
      return [{
        id: 'profile_video_script_missing_scene_structure',
        severity: 'warning',
        message: 'Resolved format is video_script, but the output does not include scene/timing or visual/audio structure.',
      }];
    }
  }

  return [];
}

function detectInternalLeakage(content: string): ContentProfileComplianceViolation[] {
  if (!INTERNAL_PROFILE_RE.test(content)) return [];
  return [{
    id: 'profile_internal_metadata_leaked',
    severity: 'critical',
    message: 'Internal signal/export metadata leaked into the visible draft.',
  }];
}

function detectMissingCTA(
  content: string,
  resolved: ThinkForgeContentSignalProfile,
): ContentProfileComplianceViolation[] {
  const ctaType = resolved.profile.constraints.cta_type;
  if (!ctaType || ctaType === 'none') return [];
  if (/[?]\s*$/.test(content.trim()) || /\b(comment|reply|share|save|follow|book|download|subscribe|learn more|sign up)\b/i.test(content)) {
    return [];
  }

  return [{
    id: 'profile_missing_cta',
    severity: ctaType === 'hard' || ctaType === 'urgent' ? 'warning' : 'info',
    message: `Resolved CTA type is "${ctaType}", but the draft does not include a clear CTA.`,
  }];
}

function getMaxCharacters(resolved: ThinkForgeContentSignalProfile): number | undefined {
  const platformConstraints = resolved.profile.constraints.platform_constraints;
  const max = platformConstraints?.maxCharacters;
  if (typeof max === 'number') return max;

  const target = resolved.profile.constraints.target_length;
  if (target?.unit === 'characters') return target.value;
  return undefined;
}

function firstLineContaining(content: string, needle: string): string | undefined {
  const lowerNeedle = needle.toLowerCase();
  const lines = content.split('\n');
  const index = lines.findIndex((line) => line.toLowerCase().includes(lowerNeedle));
  return index >= 0 ? `line ${index + 1}` : undefined;
}

function containsSourceText(content: string, sourceText: string): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  return normalize(content).includes(normalize(sourceText));
}

function severityPenalty(severity: ContentProfileComplianceSeverity): number {
  if (severity === 'critical') return 30;
  if (severity === 'warning') return 12;
  return 4;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
