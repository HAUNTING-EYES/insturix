import type { InferenceMetadata } from '../../shared/signals';
import type { ThinkForgeContentSignalProfile } from './content-signal-resolver';

export interface ThinkForgeSignalTrace {
  outputFormat: string;
  platform?: string;
  goal: string;
  angle: string;
  audience?: string;
  tone?: string;
  enforcedConstraints: {
    targetLength?: ThinkForgeContentSignalProfile['profile']['constraints']['target_length'];
    ctaType?: ThinkForgeContentSignalProfile['profile']['constraints']['cta_type'];
    platformConstraints?: Record<string, unknown>;
    brandVoiceId?: string;
  };
  selectedIntent: {
    proofPoints: string[];
    forbiddenTerms: string[];
    structuralHints: string[];
    visualNeeds: string[];
    clickatron: ThinkForgeContentSignalProfile['intent']['clickatron'];
  };
  sourceSummary: ThinkForgeContentSignalProfile['sources'];
  provenanceSummary: Array<{
    signal: string;
    source: InferenceMetadata['source'];
    confidence?: number;
    resolvedFrom?: string;
  }>;
  warnings: string[];
}

export function buildThinkForgeSignalTrace(
  resolved: ThinkForgeContentSignalProfile,
): ThinkForgeSignalTrace {
  const constraints = resolved.profile.constraints;
  return {
    outputFormat: constraints.output_format,
    ...(resolved.intent.platform ? { platform: resolved.intent.platform } : {}),
    goal: resolved.intent.goal,
    angle: resolved.intent.angle,
    ...(resolved.intent.audience ? { audience: resolved.intent.audience } : {}),
    ...(resolved.intent.tone ? { tone: resolved.intent.tone } : {}),
    enforcedConstraints: {
      ...(constraints.target_length ? { targetLength: constraints.target_length } : {}),
      ...(constraints.cta_type ? { ctaType: constraints.cta_type } : {}),
      ...(constraints.platform_constraints ? { platformConstraints: constraints.platform_constraints } : {}),
      ...(constraints.brand_voice_id ? { brandVoiceId: constraints.brand_voice_id } : {}),
    },
    selectedIntent: {
      proofPoints: [...resolved.intent.proofPoints],
      forbiddenTerms: [...resolved.intent.forbiddenTerms],
      structuralHints: [...resolved.intent.structuralHints],
      visualNeeds: [...resolved.intent.visualNeeds],
      clickatron: resolved.intent.clickatron,
    },
    sourceSummary: resolved.sources,
    provenanceSummary: summarizeProvenance(resolved.profile._inference_metadata),
    warnings: [...resolved.warnings],
  };
}

function summarizeProvenance(
  metadata: Record<string, InferenceMetadata> | undefined,
): ThinkForgeSignalTrace['provenanceSummary'] {
  if (!metadata) return [];

  return Object.entries(metadata)
    .map(([signal, entry]) => ({
      signal,
      source: entry.source,
      ...(typeof entry.confidence === 'number' ? { confidence: entry.confidence } : {}),
      ...(entry.resolvedFrom ? { resolvedFrom: entry.resolvedFrom } : {}),
    }))
    .sort((a, b) => a.signal.localeCompare(b.signal));
}
