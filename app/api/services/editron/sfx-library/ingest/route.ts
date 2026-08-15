/**
 * POST /api/services/editron/sfx-library/ingest
 *
 * Materialize an exact Freesound result into controlled storage. The client
 * supplies only the provider ID; URL, license and audio claims are re-fetched.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';

import { handleSfxLibraryIngest } from '@/lib/pipeline/sfx-library-route-handlers';
import { ingestFreesoundSfxById } from '@/lib/pipeline/sfx-library-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleSfxLibraryIngest(request, {
    authenticate: auth,
    ingest: ingestFreesoundSfxById,
  });
}
