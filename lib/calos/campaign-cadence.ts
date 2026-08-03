import type { CadenceRuleInput } from "./cadence";
import { isVideoFormat } from "./generate/route-map";
import { formatsFor } from "./planner/playbook";

export const CALOS_CAMPAIGN_PLATFORMS = [
  "linkedin",
  "instagram",
  "youtube",
  "facebook",
  "twitter",
  "tiktok",
] as const;

export const MAX_CAMPAIGN_POSTS_PER_WEEK = 7;
export const MAX_CAMPAIGN_CADENCE_RULES = 20;

export interface CampaignCadenceRule extends CadenceRuleInput {
  format?: string;
  targetDurationSeconds?: number;
}

export function cadenceContentRequirements(
  rule: Pick<CampaignCadenceRule, "format" | "targetDurationSeconds"> | undefined,
): { contentFormat?: string; targetDurationSeconds?: number } {
  return {
    ...(rule?.format ? { contentFormat: rule.format } : {}),
    ...(typeof rule?.targetDurationSeconds === "number"
      ? { targetDurationSeconds: rule.targetDurationSeconds }
      : {}),
  };
}

type CadenceRulesParseResult =
  | { ok: true; rules: CampaignCadenceRule[] }
  | { ok: false; error: string };

export function parseCampaignCadenceRules(input: unknown): CadenceRulesParseResult {
  if (input === undefined || input === null) return { ok: true, rules: [] };
  if (!Array.isArray(input)) return fail("cadenceRules must be an array");
  if (input.length > MAX_CAMPAIGN_CADENCE_RULES) {
    return fail(`cadenceRules may include at most ${MAX_CAMPAIGN_CADENCE_RULES} rules`);
  }

  const seenPlatforms = new Set<string>();
  const rules: CampaignCadenceRule[] = [];

  for (const [index, rawRule] of input.entries()) {
    if (!isRecord(rawRule)) return fail(`cadenceRules[${index}] must be an object`);

    const platform = readPlatform(rawRule.platform, index);
    if (typeof platform !== "string") return fail(platform.error);
    if (seenPlatforms.has(platform)) {
      return fail(`cadenceRules[${index}].platform duplicates ${platform}`);
    }
    seenPlatforms.add(platform);

    const perWeek = readPerWeek(rawRule.perWeek, index);
    if (typeof perWeek !== "number") return fail(perWeek.error);

    const preferredDays = readPreferredDays(rawRule.preferredDays, index);
    if (!Array.isArray(preferredDays)) return fail(preferredDays.error);

    const format = readFormat(rawRule.format, index, platform);
    if (format && typeof format !== "string") return fail(format.error);
    const targetDurationSeconds = readTargetDuration(rawRule.targetDurationSeconds, index, format);
    if (targetDurationSeconds && typeof targetDurationSeconds !== "number") {
      return fail(targetDurationSeconds.error);
    }

    rules.push({
      platform,
      perWeek,
      preferredDays,
      ...(format ? { format } : {}),
      ...(typeof targetDurationSeconds === "number" ? { targetDurationSeconds } : {}),
    });
  }

  return { ok: true, rules };
}

function readFormat(value: unknown, index: number, platform: string): string | undefined | { error: string } {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim()) {
    return { error: `cadenceRules[${index}].format must be a non-empty string` };
  }
  const format = value.trim().toLowerCase();
  const allowed = formatsFor(platform);
  return allowed.includes(format)
    ? format
    : { error: `cadenceRules[${index}].format must be one of: ${allowed.join(", ")}` };
}

function readTargetDuration(
  value: unknown,
  index: number,
  format: string | undefined,
): number | undefined | { error: string } {
  if (value === undefined || value === null || value === "") {
    return format === "long_video"
      ? { error: `cadenceRules[${index}].targetDurationSeconds is required for long_video` }
      : undefined;
  }
  if (!format || !isVideoFormat(format)) {
    return { error: `cadenceRules[${index}].targetDurationSeconds requires a video format` };
  }
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return { error: `cadenceRules[${index}].targetDurationSeconds must be a whole number` };
  }
  const minimum = format === "long_video" ? 300 : 1;
  if (value < minimum || value > 3600) {
    return { error: `cadenceRules[${index}].targetDurationSeconds must be between ${minimum} and 3600` };
  }
  return value;
}

function readPlatform(value: unknown, index: number): string | { error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { error: `cadenceRules[${index}].platform must be a non-empty string` };
  }

  const platform = value.trim().toLowerCase();
  if (platform.length > 40) {
    return { error: `cadenceRules[${index}].platform must be 40 characters or fewer` };
  }
  return platform;
}

function readPerWeek(value: unknown, index: number): number | { error: string } {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return { error: `cadenceRules[${index}].perWeek must be a whole number` };
  }
  if (value < 0 || value > MAX_CAMPAIGN_POSTS_PER_WEEK) {
    return {
      error: `cadenceRules[${index}].perWeek must be between 0 and ${MAX_CAMPAIGN_POSTS_PER_WEEK}`,
    };
  }
  return value;
}

function readPreferredDays(value: unknown, index: number): number[] | { error: string } {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return { error: `cadenceRules[${index}].preferredDays must be an array` };

  const days: number[] = [];
  for (const [dayIndex, day] of value.entries()) {
    if (typeof day !== "number" || !Number.isFinite(day) || !Number.isInteger(day) || day < 0 || day > 6) {
      return { error: `cadenceRules[${index}].preferredDays[${dayIndex}] must be an integer from 0 to 6` };
    }
    days.push(day);
  }

  return [...new Set(days)].sort((a, b) => a - b);
}

function fail(error: string): CadenceRulesParseResult {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
