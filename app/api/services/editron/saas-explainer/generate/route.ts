import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  createSaasExplainerProject,
  SaasExplainerGenerationError,
} from "@/lib/editron/saas-explainer/generator";
import { validateSaasExplainerIntakePayload } from "@/lib/editron/saas-explainer/intake";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON.", code: "invalid_json" },
      { status: 400 },
    );
  }

  const validation = validateSaasExplainerIntakePayload(body);
  if (!validation.ok) {
    return NextResponse.json(validation.body, { status: validation.status });
  }

  try {
    const result = await createSaasExplainerProject({
      userId,
      input: validation.input,
      productUrl: validation.productUrl,
      referenceVideo: validation.referenceVideo,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SaasExplainerGenerationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code, details: error.details },
        { status: error.status },
      );
    }

    console.error("[saas-explainer-generate] failed", error);
    return NextResponse.json(
      { success: false, error: "Failed to create SaaS explainer project.", code: "saas_explainer_generation_failed" },
      { status: 500 },
    );
  }
}
