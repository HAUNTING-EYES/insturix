import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import {
  AVScriptProjectionError,
  buildAVScriptPresentation,
} from '@/lib/thinkforge/presentation/av-script-projection';
import {
  requireCurrentPersistedScriptSidecar,
  ThinkForgeScriptSidecarAuthorityError,
} from '@/lib/thinkforge/persistence/script-sidecar-reader';
import { ThinkForgeDocumentContractSchema } from '@/lib/thinkforge/schemas/document-contract';
import { parseVideoTreatment } from '@/lib/thinkforge/schemas/video-treatment';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function documentVersion(script: Awaited<ReturnType<typeof db.getScript>>): number {
  return typeof script?.version === 'number' && Number.isInteger(script.version) && script.version > 0
    ? script.version
    : 0;
}

function presentationState(
  status: 'not_applicable' | 'stale' | 'invalid_contract',
  code: string,
  message: string,
) {
  return NextResponse.json({ status, code, message });
}

/**
 * GET /api/services/thinkforge/script/av-presentation?sessionId=...&scriptId=...
 *
 * The browser receives a semantic AV projection only after the saved document's
 * V3 sidecar binding is current. Raw Brand Vault, source-ledger IDs, hashes,
 * and final Editron form stay server-side.
 */
export async function GET(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  const scriptId = url.searchParams.get('scriptId');
  if (!sessionId || sessionId.trim() !== sessionId) {
    return NextResponse.json({ error: 'A valid sessionId is required' }, { status: 400 });
  }
  if (!scriptId || scriptId.trim() !== scriptId) {
    return NextResponse.json({ error: 'A valid scriptId is required' }, { status: 400 });
  }

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const script = await db.getScript(String(session._id), scriptId);
    if (!script) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    const currentVersion = documentVersion(script);
    if (currentVersion === 0) {
      return presentationState('invalid_contract', 'invalid_document_version', 'This document has no valid saved version.');
    }

    const contentContract = ThinkForgeDocumentContractSchema.safeParse(script.contentContract);
    if (!contentContract.success) {
      return presentationState(
        'not_applicable',
        'document_contract_unavailable',
        'AV Script is available only for a saved video script with a current production contract.',
      );
    }
    if (contentContract.data.outputKind !== 'video_script') {
      return presentationState(
        'not_applicable',
        'document_not_video_script',
        'AV Script is available for video scripts. This document remains editable in its normal writing view.',
      );
    }

    let authority;
    try {
      authority = requireCurrentPersistedScriptSidecar({
        metadata: script.metadata,
        documentContent: typeof script.content === 'string' ? script.content : '',
        documentVersion: currentVersion,
      });
    } catch (error) {
      if (error instanceof ThinkForgeScriptSidecarAuthorityError) {
        const stale = error.code === 'script-sidecar-stale';
        return presentationState(
          stale ? 'stale' : 'invalid_contract',
          error.code,
          stale
            ? 'The script changed after its AV treatment was written. Refresh the script before reading or exporting the AV plan.'
            : 'This video script does not have a valid current AV treatment. Refresh the script before reading or exporting the AV plan.',
        );
      }
      throw error;
    }

    if (!authority || authority.readResult.sourceVersion !== 3) {
      return presentationState(
        'not_applicable',
        'semantic_sidecar_unavailable',
        'AV Script is available for newly generated semantic video scripts. This document remains editable in its normal writing view.',
      );
    }

    const metadata = recordOf(script.metadata) ?? {};
    const writerOutput = recordOf(metadata.writerOutput);
    if (!writerOutput || !Object.prototype.hasOwnProperty.call(writerOutput, 'videoTreatment')) {
      return presentationState(
        'invalid_contract',
        'video_treatment_missing',
        'This video script is missing its saved AV treatment. Refresh the script before opening AV Script.',
      );
    }

    let treatment;
    try {
      treatment = parseVideoTreatment(writerOutput.videoTreatment);
    } catch {
      return presentationState(
        'invalid_contract',
        'video_treatment_invalid',
        'This video script has an invalid saved AV treatment. Refresh the script before opening AV Script.',
      );
    }

    try {
      return NextResponse.json(buildAVScriptPresentation({
        title: typeof script.title === 'string' ? script.title : null,
        documentVersion: currentVersion,
        sidecar: authority.readResult.sidecar,
        treatment,
      }));
    } catch (error) {
      if (error instanceof AVScriptProjectionError) {
        return presentationState('invalid_contract', 'semantic_treatment_mismatch', error.message);
      }
      throw error;
    }
  } catch (error) {
    console.error('[thinkforge:av-presentation] Failed to resolve AV script presentation', error);
    return NextResponse.json({ error: 'Unable to load the AV Script right now.' }, { status: 500 });
  }
}
