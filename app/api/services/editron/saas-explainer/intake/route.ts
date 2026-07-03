import { NextRequest, NextResponse } from "next/server";

import {
  MAX_SAAS_EXPLAINER_DURATION_SEC,
  summarizeTextPresence,
  validateSaasExplainerIntakePayload,
} from "@/lib/editron/saas-explainer/intake";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Request body must be valid JSON.",
        code: "invalid_json",
      },
      { status: 400 },
    );
  }

  const validation = validateSaasExplainerIntakePayload(body);
  if (!validation.ok) {
    return NextResponse.json(validation.body, { status: validation.status });
  }

  const { input, productUrl, referenceVideo } = validation;
  const hasProductSource = Boolean(productUrl || input.productName);

  return NextResponse.json({
    success: true,
    mode: "saas_explainer",
    status: "ready_for_generation",
    intake: {
      hasProductSource,
      productUrl,
      productName: input.productName,
      audience: input.audience,
      outcome: summarizeTextPresence(input.outcome),
      script: summarizeTextPresence(input.script),
      durationSec: input.durationSec,
      aspectRatio: input.aspectRatio,
      brandId: input.brandId,
      referenceVideo: input.referenceVideoUrl
        ? {
            provided: true,
            kind: referenceVideo?.sourceKind ?? "unknown",
            url: input.referenceVideoUrl,
          }
        : { provided: false },
    },
    referencePolicy: {
      mainFootageRequired: false,
      acceptedReferenceTypes: ["mp4", "mov", "webm", "youtube"],
      maxEvaluationDurationSec: MAX_SAAS_EXPLAINER_DURATION_SEC,
      gate: "glm_5_frame_saas_gate",
    },
    next: {
      action: "generate_saas_explainer_project",
      plannedEndpoint: "/api/services/editron/saas-explainer/generate",
    },
  });
}
