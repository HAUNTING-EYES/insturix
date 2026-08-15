/**
 * GET /api/services/editron/sfx-library/search?q=whoosh&limit=12
 *
 * Search Freesound for verified CC0 sound effects. These URLs are previews;
 * renderable assets require controlled server-side ingest.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';

import { handleSfxLibrarySearch } from '@/lib/pipeline/sfx-library-route-handlers';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return handleSfxLibrarySearch(request, {
    authenticate: auth,
    apiKey: process.env.FREESOUND_API_KEY,
    fetchImpl: fetch,
  });
}
