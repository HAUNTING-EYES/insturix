import type { CadenceRuleInput } from "./cadence";

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

type CadenceRulesParseResult =
  | { ok: true; rules: CadenceRuleInput[] }
  | { ok: false; error: string };

export function parseCampaignCadenceRules(input: unknown): CadenceRulesParseResult {
  if (input === undefined || input === null) return { ok: true, rules: [] };
  if (!Array.isArray(input)) return fail("cadenceRules must be an array");
  if (input.length > MAX_CAMPAIGN_CADENCE_RULES) {
    return fail(`cadenceRules may include at most ${MAX_CAMPAIGN_CADENCE_RULES} rules`);
  }

  const seenPlatforms = new Set<string>();
  const rules: CadenceRuleInput[] = [];

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

    rules.push({ platform, perWeek, preferredDays });
  }

  return { ok: true, rules };
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