import type { SaasExplainerBrandContext } from "@/lib/editron/saas-explainer/brand-context";
import type { NormalizedSaasExplainerIntake } from "@/lib/editron/saas-explainer/intake";
import type { SaasExplainerReferenceStyleBrief } from "@/lib/editron/saas-explainer/reference-analysis";
import { TTS_VOICES, type TTSVoice } from "@/lib/pipeline/tts-service";

export type SaasExplainerVoiceContentType =
  | "dramatic"
  | "narration"
  | "conversational"
  | "energetic"
  | "social";

export interface SaasExplainerVoiceProfile {
  schemaVersion: "saas-brand-voice/v1";
  voiceId: string;
  provider: TTSVoice["provider"];
  providerVoiceId: string;
  contentType: SaasExplainerVoiceContentType;
  direction: {
    tone: string[];
    delivery: string;
    pacing: string;
    favor: string[];
    avoid: string[];
  };
  evidence: {
    source: SaasExplainerBrandContext["metadata"]["source"];
    acceptedProfile: boolean;
    signalPaths: string[];
    referenceInfluence: string[];
  };
  rationale: string[];
}

interface ResolveSaasExplainerVoiceProfileInput {
  brandContext: SaasExplainerBrandContext;
  input: NormalizedSaasExplainerIntake;
  referenceStyleBrief?: SaasExplainerReferenceStyleBrief;
}

const DEFAULT_SAAS_VOICE_ID = "kokoro-bella";

export function resolveSaasExplainerVoiceProfile(
  input: ResolveSaasExplainerVoiceProfileInput,
): SaasExplainerVoiceProfile {
  const signals = input.brandContext.voiceSignals;
  const formality = signalOrDefault(signals?.defaultFormality, 0.58);
  const assertiveness = signalOrDefault(signals?.assertiveness, 0.6);
  const warmth = signalOrDefault(signals?.warmth, 0.52);
  const jargon = signalOrDefault(signals?.jargonDensity, 0.58);
  const humor = signalOrDefault(signals?.humor, 0.25);
  const pace = signalOrDefault(input.brandContext.brandInputs.pacePreference, 0.55);
  const contentType = resolveContentType({
    formality,
    warmth,
    pace,
    referencePacing: input.referenceStyleBrief?.pacing,
    aspectRatio: input.input.aspectRatio,
  });
  const voice = voiceById(resolveVoiceId({ assertiveness, formality, warmth, jargon, humor, pace }));
  const tone = resolveToneTags({ assertiveness, formality, warmth, jargon, humor });
  const favor = uniqueStrings([
    ...(signals?.recurringPhrases ?? []),
    ...(signals?.hookArchetypes ?? []),
  ]).slice(0, 6);
  const avoid = uniqueStrings(signals?.killList ?? []).slice(0, 8);
  const referenceInfluence = referenceInfluenceFrom(input.referenceStyleBrief);
  const signalPaths = signals?.signalPaths ?? [];
  const acceptedProfile = input.brandContext.metadata.acceptedProfile;

  return {
    schemaVersion: "saas-brand-voice/v1",
    voiceId: voice.id,
    provider: voice.provider,
    providerVoiceId: voice.providerVoiceId,
    contentType,
    direction: {
      tone,
      delivery: [
        "Product-led SaaS narration",
        tone.length ? tone.join(", ") : "clear and confident",
        "keep claims grounded in visible product proof",
      ].join("; "),
      pacing: pacingLabel(contentType),
      favor,
      avoid,
    },
    evidence: {
      source: input.brandContext.metadata.source,
      acceptedProfile,
      signalPaths,
      referenceInfluence,
    },
    rationale: resolveRationale({
      acceptedProfile,
      voice,
      contentType,
      signalsPresent: signalPaths.length > 0,
      referenceInfluence,
    }),
  };
}

function resolveVoiceId(input: {
  assertiveness: number;
  formality: number;
  warmth: number;
  jargon: number;
  humor: number;
  pace: number;
}): string {
  if (input.humor >= 0.65 || (input.warmth >= 0.62 && input.pace >= 0.72)) return "kokoro-jessica";
  if (input.assertiveness >= 0.72 && input.formality >= 0.65) return "kokoro-michael";
  if (input.formality >= 0.72 || input.jargon >= 0.7) return "kokoro-liam";
  if (input.warmth >= 0.72 && input.formality <= 0.58) return "kokoro-eric";
  if (input.warmth >= 0.66) return "kokoro-heart";
  if (input.pace >= 0.72) return "kokoro-nova";
  return DEFAULT_SAAS_VOICE_ID;
}

function resolveContentType(input: {
  formality: number;
  warmth: number;
  pace: number;
  referencePacing?: string;
  aspectRatio: NormalizedSaasExplainerIntake["aspectRatio"];
}): SaasExplainerVoiceContentType {
  const reference = input.referencePacing?.toLowerCase() ?? "";
  if (input.aspectRatio === "9:16" || input.pace >= 0.72 || /\b(fast|snappy|rapid|social|short)\b/.test(reference)) {
    return "energetic";
  }
  if (input.pace <= 0.34 || /\b(slow|dramatic|cinematic|building)\b/.test(reference)) return "dramatic";
  if (input.warmth >= 0.66 || input.formality <= 0.45 || /\b(conversational|friendly)\b/.test(reference)) {
    return "conversational";
  }
  return "narration";
}

function resolveToneTags(input: {
  assertiveness: number;
  formality: number;
  warmth: number;
  jargon: number;
  humor: number;
}): string[] {
  const tags: string[] = [];
  if (input.assertiveness >= 0.62) tags.push("confident");
  else if (input.assertiveness <= 0.38) tags.push("understated");
  if (input.warmth >= 0.62) tags.push("warm");
  else if (input.warmth <= 0.38) tags.push("precise");
  if (input.formality >= 0.62) tags.push("professional");
  else if (input.formality <= 0.42) tags.push("conversational");
  if (input.jargon >= 0.62) tags.push("technical");
  else if (input.jargon <= 0.38) tags.push("plainspoken");
  if (input.humor >= 0.62) tags.push("lightly witty");
  return tags.length ? tags : ["clear", "product-led"];
}

function resolveRationale(input: {
  acceptedProfile: boolean;
  voice: TTSVoice;
  contentType: SaasExplainerVoiceContentType;
  signalsPresent: boolean;
  referenceInfluence: string[];
}): string[] {
  const rationale = [
    `Resolved ${input.voice.id} from approved SaaS voice catalog.`,
    `TTS pacing contentType=${input.contentType}.`,
  ];
  if (input.acceptedProfile && input.signalsPresent) {
    rationale.push("Accepted Brand Vault voice signals influenced voice and pacing.");
  } else {
    rationale.push("No accepted Brand Vault voice signals were available; deterministic SaaS default was used.");
  }
  if (input.referenceInfluence.length > 0) {
    rationale.push("Reference style influenced pacing only, not provider voice identity.");
  }
  return rationale;
}

function voiceById(id: string): TTSVoice {
  return TTS_VOICES.find((voice) => voice.id === id) ?? TTS_VOICES.find((voice) => voice.id === DEFAULT_SAAS_VOICE_ID)!;
}

function signalOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp01(value) : fallback;
}

function referenceInfluenceFrom(styleBrief?: SaasExplainerReferenceStyleBrief): string[] {
  if (!styleBrief) return [];
  return [
    styleBrief.pacing ? `pacing:${styleBrief.pacing}` : undefined,
    styleBrief.motion ? `motion:${styleBrief.motion}` : undefined,
  ].filter((value): value is string => Boolean(value)).slice(0, 2);
}

function pacingLabel(contentType: SaasExplainerVoiceContentType): string {
  switch (contentType) {
    case "dramatic":
      return "measured demo narration, roughly 100-120 WPM";
    case "conversational":
      return "natural walkthrough pace, roughly 140-160 WPM";
    case "energetic":
    case "social":
      return "snappy product-demo pace, roughly 160-180 WPM";
    case "narration":
    default:
      return "clear explainer narration, roughly 130-150 WPM";
  }
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}