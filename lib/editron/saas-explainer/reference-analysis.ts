import type { NormalizedSaasExplainerIntake } from "@/lib/editron/saas-explainer/intake";
import {
  resolveCanonicalSaasReferenceSourceV1,
  SaasReferenceIngestErrorV1,
} from "@/lib/editron/saas-explainer/reference-ingest-owner-v1";
import type { SaasReferenceStyleAnalysis } from "@/lib/editron/reference-video/saas-reference-video-analyzer";

export type SaasExplainerReferenceResult =
  | {
      ok: true;
      editDNA?: unknown;
      analysis?: SaasExplainerReferenceSummary;
    }
  | {
      ok: false;
      status: number;
      code: string;
      error: string;
      details?: unknown;
    };

export interface SaasExplainerReferenceSummary {
  status: "accepted";
  sourceKind: string;
  confidence: number;
  analysisModel: string;
  gateModel: string;
  cacheStatus: "hit" | "miss";
  evaluationWindowSec?: number;
  styleBrief: SaasExplainerReferenceStyleBrief;
}

export interface SaasExplainerReferenceStyleBrief {
  summary: string;
  category: string;
  pacing: string;
  uiTreatment: string;
  visualLanguage: string[];
  typography: string;
  colorPalette: string[];
  motion: string;
  transferBoundaries: string[];
}

export async function analyzeSaasExplainerReference(args: {
  input: NormalizedSaasExplainerIntake;
  userId: string;
  productUrl?: string;
  scriptSummary: string;
  referenceType?: string;
}): Promise<SaasExplainerReferenceResult> {
  if (!args.input.referenceVideoUrl) return { ok: true };

  let source;
  try {
    source = await resolveCanonicalSaasReferenceSourceV1({
      userId: args.userId,
      referenceVideoUrl: args.input.referenceVideoUrl,
    });
  } catch (error) {
    if (!(error instanceof SaasReferenceIngestErrorV1)) throw error;
    return {
      ok: false,
      status: error.status,
      code: error.code,
      error: error.status < 500 ? error.message : "Reference video is unavailable.",
      details: error.diagnostics,
    };
  }

  const [sampler, analyzer, mapper, cache] = await Promise.all([
    import("@/lib/editron/reference-video/reference-frame-sampler"),
    import("@/lib/editron/reference-video/saas-reference-video-analyzer"),
    import("@/lib/editron/reference-video/saas-reference-edit-dna"),
    import("@/lib/editron/reference-video/saas-reference-analysis-cache"),
  ]);

  const brandContext = [args.input.productName, args.productUrl, args.input.audience, args.input.outcome]
    .filter(Boolean)
    .join("\n");
  const cacheKey = cache.buildSaasReferenceAnalysisCacheKey({
    referenceAssetId: source.referenceAssetId,
    durationSec: source.durationSec,
    sourceFingerprint: source.sourceFingerprint || source.videoUrl,
    script: args.scriptSummary,
    brandContext,
    gateModel: analyzer.DEFAULT_GLM_GATE_MODEL,
    analysisModel: analyzer.DEFAULT_GLM_ANALYSIS_MODEL,
  });

  const cached = await cache.readSaasReferenceAnalysisCache(cacheKey);
  if (cached?.status === "accepted") {
    return {
      ok: true,
      editDNA: mapper.mapSaasReferenceAnalysisToEditDNA({
        analysis: cached.analysis,
        gate: cached.gate,
        cacheKey: cached.cacheKey,
        sourceName: source.sourceLabel ?? "Reference Video",
      }),
      analysis: {
        status: "accepted",
        sourceKind: source.sourceKind,
        confidence: cached.gate.confidence,
        analysisModel: cached.analysisModel,
        gateModel: cached.gateModel,
        cacheStatus: "hit",
        evaluationWindowSec: cached.evaluationWindowSec,
        styleBrief: buildReferenceStyleBrief(cached.analysis),
      },
    };
  }
  if (cached?.status === "rejected") {
    return {
      ok: false,
      status: 422,
      code: "reference_not_saas",
      error: cached.diagnostics[0] || "Reference video is not a SaaS explainer/demo.",
      details: cached.diagnostics,
    };
  }

  const frames = await sampler.sampleReferenceVideoFrames({
    videoUrl: source.videoUrl,
    userId: args.userId,
    referenceAssetId: source.referenceAssetId,
    durationSec: source.durationSec,
  });
  const analysis = await analyzer.analyzeSaasReferenceVideo({
    videoUrl: source.videoUrl,
    frameImageUrls: frames.map((frame) => frame.url),
    durationSec: source.durationSec,
    sourceLabel: args.referenceType ?? source.sourceKind,
    script: args.scriptSummary,
    brandContext,
  });

  if (!analysis.ok) {
    if (analysis.reason === "not_a_saas_reference_video") {
      await cache.writeSaasReferenceAnalysisCache({
        status: "rejected",
        cacheKey,
        analyzerCacheKey: analysis.cacheKey,
        referenceAssetId: source.referenceAssetId,
        sourceFingerprint: source.sourceFingerprint,
        gateModel: analyzer.DEFAULT_GLM_GATE_MODEL,
        analysisModel: analyzer.DEFAULT_GLM_ANALYSIS_MODEL,
        reason: "not_a_saas_reference_video",
        diagnostics: analysis.diagnostics,
        gate: analysis.gate,
        gateDecision: analysis.gateDecision,
      });
      return {
        ok: false,
        status: 422,
        code: "reference_not_saas",
        error: "Reference video does not look like a SaaS explainer/demo.",
        details: analysis.diagnostics,
      };
    }
    return {
      ok: false,
      status: 502,
      code: "reference_analysis_failed",
      error: analysis.diagnostics[0] || "Reference analysis failed.",
      details: analysis.diagnostics,
    };
  }

  await cache.writeSaasReferenceAnalysisCache({
    status: "accepted",
    cacheKey,
    analyzerCacheKey: analysis.cacheKey,
    referenceAssetId: source.referenceAssetId,
    sourceFingerprint: source.sourceFingerprint,
    gateModel: analyzer.DEFAULT_GLM_GATE_MODEL,
    analysisModel: analyzer.DEFAULT_GLM_ANALYSIS_MODEL,
    gate: analysis.gate,
    gateDecision: analysis.gateDecision,
    analysis: analysis.analysis,
    evaluationWindowSec: analysis.evaluationWindowSec,
    model: analysis.model,
    usage: analysis.usage,
  });

  return {
    ok: true,
    editDNA: mapper.mapSaasReferenceAnalysisToEditDNA({
      analysis: analysis.analysis,
      gate: analysis.gate,
      cacheKey,
      sourceName: source.sourceLabel ?? "Reference Video",
    }),
    analysis: {
      status: "accepted",
      sourceKind: source.sourceKind,
      confidence: analysis.gate.confidence,
      analysisModel: analyzer.DEFAULT_GLM_ANALYSIS_MODEL,
      gateModel: analyzer.DEFAULT_GLM_GATE_MODEL,
      cacheStatus: "miss",
      evaluationWindowSec: analysis.evaluationWindowSec,
      styleBrief: buildReferenceStyleBrief(analysis.analysis),
    },
  };
}
function buildReferenceStyleBrief(analysis: SaasReferenceStyleAnalysis): SaasExplainerReferenceStyleBrief {
  return {
    summary: analysis.summary,
    category: analysis.saasCategory,
    pacing: [
      analysis.styleSignals.pacing.speed,
      analysis.styleSignals.pacing.cutRhythm,
      analysis.styleSignals.pacing.attentionPattern,
    ].join("; "),
    uiTreatment: [
      `${analysis.styleSignals.uiTreatment.density} UI density`,
      analysis.styleSignals.uiTreatment.framing,
      analysis.styleSignals.uiTreatment.screenshotTreatment,
    ].join("; "),
    visualLanguage: analysis.styleSignals.visualLanguage.slice(0, 6),
    typography: [
      analysis.styleSignals.typography.weight,
      analysis.styleSignals.typography.hierarchy,
      analysis.styleSignals.typography.motion,
    ].join("; "),
    colorPalette: analysis.styleSignals.color.palette.slice(0, 6),
    motion: [
      analysis.styleSignals.motion.transitionStyle,
      ...analysis.styleSignals.motion.cameraMoves.slice(0, 4),
      ...analysis.styleSignals.motion.microInteractions.slice(0, 4),
    ].join("; "),
    transferBoundaries: analysis.styleSignals.brandTransferBoundaries.slice(0, 6),
  };
}
