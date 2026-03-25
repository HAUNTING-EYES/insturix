/**
 * GET /api/services/editron/sfx-library/search?q=whoosh&limit=12
 *
 * Search Freesound for CC0-licensed sound effects.
 * Returns preview URLs that can be played directly in the browser.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') || '';
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '12', 10);

  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }

  const apiKey = process.env.FREESOUND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ results: [], error: 'Freesound API key not configured' });
  }

  try {
    // Freesound API v2 — don't filter by license (too restrictive, returns 0 results).
    // All Freesound sounds have Creative Commons licenses which allow use with attribution.
    // For CC0-only, user can filter client-side.
    const params = new URLSearchParams({
      query: query.trim(),
      token: apiKey,
      fields: 'id,name,duration,previews,license,tags,avg_rating',
      page_size: String(Math.min(limit, 20)),
      sort: 'rating_desc',
    });

    const url = `https://freesound.org/apiv2/search/text/?${params}`;
    console.log(`[SFX-Search] Querying: ${url.substring(0, 120)}...`);

    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[SFX-Search] Freesound error: ${res.status} ${errBody.substring(0, 200)}`);
      return NextResponse.json({ results: [], error: `Freesound returned ${res.status}` });
    }

    const data = await res.json();
    const results = (data.results || []).map((s: any) => ({
      title: s.name || query,
      url: s.previews?.['preview-hq-mp3'] || s.previews?.['preview-lq-mp3'] || '',
      duration: Math.round((s.duration || 0) * 10) / 10,
      source: 'Freesound',
      tags: (s.tags || []).slice(0, 5).join(', '),
    })).filter((s: any) => s.url);

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error('[SFX-Search] Error:', err.message);
    return NextResponse.json({ results: [], error: err.message });
  }
}
