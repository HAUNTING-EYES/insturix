import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import type { SaasDirectorContract } from '@/lib/editron/saas-explainer/director-contract';
import type { SaasProductEvidencePack } from '@/lib/editron/saas-explainer/product-evidence-pack';
import {
  directorContractToPlan,
  evidencePackToProductModel,
  type ExplainerPlan,
  type ExplainerProductModel,
} from '@/lib/editron/saas-explainer/director-to-plan';
import { scriptScenesToPlan, type ScriptPlanScene } from '@/lib/editron/saas-explainer/script-plan';
import { createExplainerJob } from '@/lib/editron/saas-explainer/explainer-job-service';

/**
 * POST /api/services/editron/saas-explainer/finalize
 *
 * The "Render" exit of the SaaS explainer. Builds the craft-worker inputs and ENQUEUES a job (status `queued`)
 * on the explainer-jobs collection. A separate heavy Node worker (Chromium + Anthropic + AWS) claims it and runs
 * craft → Lambda render, reporting back here. This route does NO heavy work and touches NO existing render code.
 *
 * Accepts three input shapes, in priority order:
 *   1) PREMIUM (primary): { scriptScenes, message, productModel } — the (edited) script beats from the /plan
 *      screen. The plan is rebuilt server-side from the user-approved narration (single source of truth).
 *   2) { plan, productModel } — a pre-built plan passed through directly.
 *   3) LEGACY: { contract, evidencePack, narrationByIndex } — map a director contract into the plan.
 */
export const runtime = 'nodejs';

interface FinalizeBody {
  // --- premium path (edited script from /plan) ---
  scriptScenes?: ScriptPlanScene[];
  productModel?: ExplainerProductModel;
  // --- pre-built plan passthrough ---
  plan?: ExplainerPlan;
  // --- legacy contract path ---
  contract?: SaasDirectorContract;
  evidencePack?: SaasProductEvidencePack;
  narrationByIndex?: Record<number, string>;
  extraProductImageUrls?: string[];
  fps?: number;
  transitionFrames?: number;
  // --- shared ---
  message?: string;
  projectId?: string;
  brandId?: string;
  /** edge-tts voice id for the VO (see vo-voices catalog); defaults to Ava if unknown/omitted. */
  voice?: string;
}

function resolveInputs(
  body: FinalizeBody,
): { ok: true; plan: ExplainerPlan; productModel: ExplainerProductModel } | { ok: false; error: string } {
  // 1) premium: edited script beats + product model
  if (Array.isArray(body.scriptScenes) && body.scriptScenes.length > 0) {
    if (!body.productModel?.brand) return { ok: false, error: 'Missing productModel for scriptScenes path' };
    const plan = scriptScenesToPlan(body.scriptScenes, body.message ?? '');
    if (!plan.scenes.some((s) => s.vo.trim().length > 0)) {
      return { ok: false, error: 'Every scene has empty narration — nothing to render' };
    }
    return { ok: true, plan, productModel: body.productModel };
  }

  // 2) pre-built plan passthrough
  if (body.plan?.scenes?.length) {
    if (!body.productModel?.brand) return { ok: false, error: 'Missing productModel for plan path' };
    return { ok: true, plan: body.plan, productModel: body.productModel };
  }

  // 3) legacy contract path
  if (body.contract?.sequence?.length) {
    if (!body.evidencePack?.visualIdentity) return { ok: false, error: 'Missing product evidence pack' };
    const plan = directorContractToPlan(body.contract, {
      fps: body.fps,
      transitionFrames: body.transitionFrames,
      message: body.message,
      narrationByIndex: body.narrationByIndex,
    });
    const productModel = evidencePackToProductModel(body.evidencePack, body.extraProductImageUrls ?? []);
    return { ok: true, plan, productModel };
  }

  return { ok: false, error: 'Provide scriptScenes+productModel, plan+productModel, or contract+evidencePack' };
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: FinalizeBody;
  try {
    body = (await request.json()) as FinalizeBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const resolved = resolveInputs(body);
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error }, { status: 400 });
  }

  const job = await createExplainerJob({
    userId,
    projectId: body.projectId,
    brandId: body.brandId,
    plan: resolved.plan,
    productModel: resolved.productModel,
    voice: body.voice,
  });

  return NextResponse.json({
    success: true,
    jobId: job._id,
    videoId: job.videoId,
    status: job.status,
    scenes: resolved.plan.scenes.length,
  });
}
