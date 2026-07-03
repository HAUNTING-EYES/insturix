import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

import { editTracedElementWithGlm } from '@/lib/editron/freeform-glm/edit-element';
import { generateFreeformRemotionScene } from '@/lib/editron/freeform-glm/generate-scene';
import {
  isFreeformGlmEnabled,
  parseFreeformRequest,
  readJsonObject,
  type EditElementRouteInput,
  type GenerateSceneRouteInput,
} from '@/lib/editron/freeform-glm/route-request';
import { instrumentFreeformTsx } from '@/lib/editron/freeform-trace/instrument';
import { checkExpensiveRateLimit } from '@/lib/editron/utils/rate-limiter';
import type { FreeformTraceElement } from '@/lib/editron/freeform-trace/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!isFreeformGlmEnabled()) {
      return NextResponse.json(
        { success: false, error: 'Editron freeform GLM is disabled.' },
        { status: 503 },
      );
    }

    const json = await readJsonObject(request);
    if (!json.ok) {
      return NextResponse.json({ success: false, error: json.error }, { status: 400 });
    }

    const parsed = parseFreeformRequest(json.value);
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.error, details: parsed.details ?? [] },
        { status: 400 },
      );
    }

    const rateLimit = await checkExpensiveRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please wait before another freeform GLM request.' },
        { status: 429, headers: { 'X-RateLimit-Reset': String(rateLimit.reset) } },
      );
    }

    if (parsed.data.operation === 'generateScene') {
      return handleGenerateScene(parsed.data);
    }

    return handleEditElement(parsed.data);
  } catch (error) {
    console.error('[editron/freeform] route error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Freeform GLM request failed.' },
      { status: 500 },
    );
  }
}

async function handleGenerateScene(input: GenerateSceneRouteInput) {
  const result = await generateFreeformRemotionScene({
    brief: input.brief,
    brandContext: input.brandContext,
    projectContext: input.projectContext,
    filename: input.filename,
    maxRepairAttempts: input.maxRepairAttempts,
    minJsxElements: input.minJsxElements,
    maxLines: input.maxLines,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        operation: input.operation,
        error: result.reason,
        attempts: result.attempts,
        diagnostics: result.diagnostics,
        context: result.context,
      },
      { status: statusForGlmFailure(result.diagnostics) },
    );
  }

  const instrumented = instrumentFreeformTsx(result.code, { filename: input.filename });
  return NextResponse.json({
    success: true,
    operation: input.operation,
    code: result.code,
    instrumentedCode: instrumented.code,
    elements: instrumented.elements.map(toClientElement),
    trace: {
      fileName: instrumented.fileName,
      elementCount: instrumented.elements.length,
      insertedAttributeCount: instrumented.insertedAttributeCount,
    },
    attempts: result.attempts,
    repaired: result.repaired,
    validation: result.validation,
    context: result.context,
  });
}

async function handleEditElement(input: EditElementRouteInput) {
  const result = await editTracedElementWithGlm({
    elementCode: input.elementCode,
    instruction: input.instruction,
    marker: input.marker,
    expectedTagName: input.expectedTagName,
    allowTagChange: input.allowTagChange,
    brandContext: input.brandContext,
    projectContext: input.projectContext,
    filename: input.filename,
    maxRepairAttempts: input.maxRepairAttempts,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        operation: input.operation,
        error: result.reason,
        attempts: result.attempts,
        diagnostics: result.diagnostics,
        context: result.context,
      },
      { status: statusForGlmFailure(result.diagnostics) },
    );
  }

  return NextResponse.json({
    success: true,
    operation: input.operation,
    replacementCode: result.code,
    attempts: result.attempts,
    repaired: result.repaired,
    validation: result.validation,
    context: result.context,
  });
}

function statusForGlmFailure(diagnostics: readonly { code: string }[]): number {
  return diagnostics.some((diagnostic) => diagnostic.code === 'glm_request_failed') ? 502 : 422;
}

function toClientElement(element: FreeformTraceElement) {
  return {
    eid: element.eid,
    sourceLoc: element.sourceLoc,
    tagName: element.tagName,
    parentEid: element.parentEid,
    childEids: element.childEids,
    editable: element.editable,
    selfClosing: element.selfClosing,
    textPreview: element.textPreview,
  };
}