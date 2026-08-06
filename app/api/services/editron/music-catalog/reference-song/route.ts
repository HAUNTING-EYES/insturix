/**
 * GET /api/services/editron/music-catalog/reference-song?projectId=...
 *
 * The "play that exact song" bridge. Reads the project's stored R3 soundtrack
 * identity (from referenceVideoAnalysis.soundtrackIdentity) + the R5 rhythm,
 * matches it against the licensed catalog, and returns a picker payload for the
 * Sounds panel References view.
 *
 * Preview/discovery only — assigning happens through the existing
 * music-catalog ingest + background-music routes (rights + attestation
 * enforced there, Constraint #7).
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { EpidemicMusicCatalogProvider } from '@/lib/editron/music-catalog/epidemic-provider';
import { matchReferenceSongToCatalog } from '@/lib/editron/music-catalog/reference-song-matcher';
import type { SoundtrackIdentity } from '@/lib/editron/reference-video/soundtrack-identity';

export const runtime = 'nodejs';

const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;
const MAX_IDENTITY_FIELDS = 64 * 1024;

interface ReferenceSongPayload {
  success: boolean;
  referenceAudio?: {
    hasIdentity: boolean;
    identity?: {
      recordingId: string;
      title: string;
      artists: string[];
      isrcs: string[];
      cueOffsetMs: number | null;
      provider: string;
      confidence: number;
    };
    rhythm?: { bpm: number | null; cutsPerMinute: number; durationMs: number | null };
  };
  match?: Awaited<ReturnType<typeof matchReferenceSongToCatalog>>;
  error?: string;
  code?: string;
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get('projectId')?.trim();
  if (!projectId || !PROJECT_ID_PATTERN.test(projectId)) {
    return NextResponse.json({ success: false, error: 'Valid projectId is required', code: 'INVALID_PROJECT' }, { status: 400 });
  }

  let project: {
    referenceVideoAnalysis?: {
      soundtrackIdentity?: SoundtrackIdentity | null;
      canonicalFingerprint?: { audio?: { bpm?: number | null } };
      adaptivePlan?: { rhythm?: { avgCutsPerMinute?: number; bpm?: number | null }; sourceDurationMs?: number };
    } | null;
  } | null;
  try {
    const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    project = await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId, userId },
      { projection: { referenceVideoAnalysis: 1 } },
    ) as typeof project;
  } catch {
    return NextResponse.json({ success: false, error: 'Project lookup failed', code: 'PROJECT_LOOKUP_FAILED' }, { status: 500 });
  }

  if (!project) {
    return NextResponse.json({ success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' }, { status: 404 });
  }
  const analysis = project.referenceVideoAnalysis ?? null;
  const identity = analysis?.soundtrackIdentity ?? null;
  const plan = analysis?.adaptivePlan ?? null;
  const audio = analysis?.canonicalFingerprint?.audio ?? null;

  const payload: ReferenceSongPayload = {
    success: true,
    referenceAudio: {
      hasIdentity: Boolean(identity),
      ...(identity && {
        identity: {
          recordingId: identity.recordingId,
          title: identity.title,
          artists: identity.artists,
          isrcs: identity.isrcs,
          cueOffsetMs: identity.cueOffsetMs,
          provider: identity.provider?.name ?? 'unknown',
          confidence: identity.confidence,
        },
      }),
      ...(plan && {
        rhythm: {
          bpm: plan.rhythm?.bpm ?? audio?.bpm ?? null,
          cutsPerMinute: plan.rhythm?.avgCutsPerMinute ?? 0,
          durationMs: plan.sourceDurationMs ?? null,
        },
      }),
    },
  };

  if (!identity) {
    payload.code = 'NO_REFERENCE_IDENTITY';
    return NextResponse.json(payload, { status: 200 });
  }
  if (JSON.stringify(identity).length > MAX_IDENTITY_FIELDS) {
    return NextResponse.json({ success: false, error: 'Stored identity too large', code: 'IDENTITY_TOO_LARGE' }, { status: 400 });
  }

  try {
    const provider = new EpidemicMusicCatalogProvider();
    payload.match = await matchReferenceSongToCatalog(identity, { provider });
  } catch {
    payload.match = null;
    payload.code = 'CATALOG_MATCH_FAILED';
  }
  return NextResponse.json(payload, { status: 200 });
}
