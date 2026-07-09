import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

import { validateSaasExplainerIntakePayload } from '@/lib/editron/saas-explainer/intake';
import { buildSaasExplainerScriptPlan } from '@/lib/editron/saas-explainer/script-plan';
import { SaasExplainerGenerationError } from '@/lib/editron/saas-explainer/generator';
import { CreditsService } from '@/lib/services/creditsService';

/**
 * POST /api/services/editron/saas-explainer/plan
 *
 * The "Script" step of the PREMIUM SaaS explainer. Takes the same intake as /generate but produces ONLY an
 * editable script + the craft-worker plan/model (no draft Editron project). The client shows the script on the
 * script screen (select / change / regenerate), then posts the edited beats to /finalize to enqueue the render.
 *
 * Bills one `script_import` credit (the ScriptDraftAgent + parse is a real LLM pass), same as the generator.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Request body must be valid JSON.', code: 'invalid_json' },
      { status: 400 },
    );
  }

  const validation = validateSaasExplainerIntakePayload(body);
  if (!validation.ok) {
    return NextResponse.json(validation.body, { status: validation.status });
  }

  // Bill the script generation up front (refund on failure) so a failed LLM pass doesn't cost the user.
  const creditResult = await CreditsService.deductCredits(userId, 'pipeline', 'script_import', { quantity: 1 });
  if (!creditResult.success) {
    return NextResponse.json(
      { success: false, error: creditResult.error || 'Not enough credits to script this explainer.', code: 'insufficient_credits' },
      { status: 402 },
    );
  }

  try {
    const result = await buildSaasExplainerScriptPlan({
      userId,
      orgId,
      input: validation.input,
      productUrl: validation.productUrl,
    });
    return NextResponse.json({
      success: true,
      scenes: result.scenes,
      productModel: result.productModel,
      directorContract: result.directorContract,
      productEvidencePack: result.productEvidencePack,
      message: result.message,
      ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
    });
  } catch (error) {
    await CreditsService.refundCredits(
      userId,
      1,
      'SaaS explainer scripting failed before producing a usable script.',
      { service: 'pipeline', action: 'script_import' },
    ).catch(() => {});

    if (error instanceof SaasExplainerGenerationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code, details: error.details },
        { status: error.status },
      );
    }
    console.error('[saas-explainer-plan] failed', error);
    return NextResponse.json(
      { success: false, error: 'Failed to script the SaaS explainer.', code: 'saas_explainer_plan_failed' },
      { status: 500 },
    );
  }
}
