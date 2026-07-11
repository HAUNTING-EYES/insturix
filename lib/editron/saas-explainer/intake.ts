import { isIP } from "node:net";

import { z } from "zod";

import {
  type ReferenceVideoAutoEditUrlValidationResult,
  validateReferenceVideoUrlForAutoEditIntake,
} from "@/lib/editron/reference-video/reference-video-source";

export const MAX_SAAS_EXPLAINER_DURATION_SEC = 120;

export const saasExplainerIntakeSchema = z.object({
  productUrl: z.string().trim().url().optional().or(z.literal("")),
  productName: z.string().trim().max(120).optional().or(z.literal("")),
  audience: z.string().trim().max(500).optional().or(z.literal("")),
  outcome: z.string().trim().max(1200).optional().or(z.literal("")),
  script: z.string().trim().max(12000).optional().or(z.literal("")),
  durationSec: z.number().int().min(15).max(MAX_SAAS_EXPLAINER_DURATION_SEC).default(60),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  brandId: z.string().trim().max(160).optional().or(z.literal("")),
  referenceVideoUrl: z.string().trim().url().optional().or(z.literal("")),
});

export type SaasExplainerIntake = z.infer<typeof saasExplainerIntakeSchema>;

export interface NormalizedSaasExplainerIntake extends SaasExplainerIntake {
  productUrl?: string;
  productName?: string;
  audience?: string;
  outcome?: string;
  script?: string;
  brandId?: string;
  referenceVideoUrl?: string;
}

export type ValidReferenceVideoInput = Extract<ReferenceVideoAutoEditUrlValidationResult, { ok: true }>;

export type SaasExplainerIntakeValidationResult =
  | {
      ok: true;
      input: NormalizedSaasExplainerIntake;
      productUrl?: string;
      referenceVideo?: ValidReferenceVideoInput;
    }
  | {
      ok: false;
      status: number;
      body: {
        success: false;
        error: string;
        code: string;
        details?: unknown;
      };
    };

export function normalizePublicProductUrl(raw?: string): string | undefined {
  if (!raw) return undefined;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }

  if (!["http:", "https:"].includes(url.protocol)) return undefined;
  if (isLocalHostname(url.hostname)) return undefined;
  url.hash = "";
  return url.toString();
}

export function validateSaasExplainerIntakePayload(raw: unknown): SaasExplainerIntakeValidationResult {
  const parsed = saasExplainerIntakeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: "Invalid SaaS explainer brief.",
        code: "invalid_saas_explainer_brief",
        details: parsed.error.flatten(),
      },
    };
  }

  const input = normalizeIntake(parsed.data);
  if (!input.outcome && !input.script && !input.brandId) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: "Add a goal, script, or Brand Vault brand before creating a SaaS explainer.",
        code: "empty_saas_explainer_source",
      },
    };
  }

  const productUrl = normalizePublicProductUrl(input.productUrl);
  if (input.productUrl && !productUrl) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: "Product URL must be a public http(s) URL.",
        code: "invalid_product_url",
      },
    };
  }

  let referenceVideo: ValidReferenceVideoInput | undefined;
  if (input.referenceVideoUrl) {
    const referenceResult = validateReferenceVideoUrlForAutoEditIntake(input.referenceVideoUrl);
    if (!referenceResult.ok) {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          error: referenceResult.diagnostics[0] || "Reference video URL is not supported.",
          code: referenceResult.reason,
          details: referenceResult.diagnostics,
        },
      };
    }
    referenceVideo = referenceResult;
  }

  return { ok: true, input: { ...input, productUrl }, productUrl, referenceVideo };
}

export function buildSaasExplainerProjectSummary(
  input: NormalizedSaasExplainerIntake,
  productUrl?: string,
  referenceLabel?: string,
  referenceStyleEvidence?: string,
): string {
  return [
    `Create a ${input.durationSec}s SaaS explainer in ${input.aspectRatio}.`,
    `Product: ${input.productName || productUrl || "SaaS product"}.`,
    `Outcome: ${input.outcome || "Turn the product context into a clear product-led explainer."}.`,
    input.audience ? `Audience: ${input.audience}.` : null,
    input.script ? "User script/source copy is provided and should be respected." : null,
    referenceLabel ? `Style reference: ${referenceLabel}.` : null,
    referenceStyleEvidence ? `Reference style evidence (directional only):\n${referenceStyleEvidence}` : null,
    referenceStyleEvidence ? "Do not copy the reference video's exact layouts, logos, claims, wording, or proprietary assets." : null,
    "Product-demo moments should stay clear, readable, and high-intent; do not obscure UI proof with excessive motion.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSaasExplainerAuthorPrompt(
  input: NormalizedSaasExplainerIntake,
  productUrl?: string,
  referenceLabel?: string,
  referenceStyleEvidence?: string,
): string {
  return [
    buildSaasExplainerProjectSummary(input, productUrl, referenceLabel, referenceStyleEvidence),
    "Write a complete SaaS explainer script with scene-by-scene structure, narration, and concrete visual direction.",
    // This is a VOICEOVER-DRIVEN explainer: the spoken line IS the deliverable for every scene (each scene is
    // rendered with its narration as the voiceover). EVERY scene MUST have a spoken VO line — write a **VO:**
    // line for each scene. Do NOT make any scene silent / Text-Overlay-only; even hook, feature-demo, UI-proof,
    // and CTA beats are narrated aloud. On-screen text is in ADDITION to the voiceover, never instead of it.
    "HARD RULE — every scene must include spoken voiceover: write a **VO:** line for EVERY scene, including the " +
      "hook, feature/UI-demo, proof, and CTA. Never leave a scene silent or text-overlay-only; on-screen text " +
      "is additive to the voiceover, not a replacement. A scene with no spoken words is invalid for this explainer.",
    "Prefer real product-demo beats, UI callouts, problem-to-solution flow, proof moments, and a concise CTA.",
    "Do not invent unverifiable metrics, customer names, integrations, or claims.",
    input.script ? `User-provided source script/copy:\n${input.script}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function summarizeTextPresence(value?: string): { provided: boolean; length: number } {
  const text = value?.trim() ?? "";
  return { provided: text.length > 0, length: text.length };
}

function normalizeIntake(input: SaasExplainerIntake): NormalizedSaasExplainerIntake {
  return {
    ...input,
    productUrl: emptyToUndefined(input.productUrl),
    productName: emptyToUndefined(input.productName),
    audience: emptyToUndefined(input.audience),
    outcome: emptyToUndefined(input.outcome),
    script: emptyToUndefined(input.script),
    brandId: emptyToUndefined(input.brandId),
    referenceVideoUrl: emptyToUndefined(input.referenceVideoUrl),
  };
}

function emptyToUndefined(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(lower)) return true;
  if (lower.endsWith(".local") || lower.endsWith(".localhost")) return true;
  if (isIP(lower)) {
    return lower.startsWith("10.") || lower.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(lower);
  }
  return false;
}
