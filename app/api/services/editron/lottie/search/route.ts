/**
 * GET /api/services/editron/lottie/search?q=loading&limit=12
 *
 * Search LottieFiles public API for animated graphics.
 * Returns animation preview URLs and lottie JSON URLs.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') || '';
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '12', 10);
  const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10);

  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    // LottieFiles public search API (no API key needed for basic search)
    const params = new URLSearchParams({
      query: query.trim(),
      page: String(page),
      per_page: String(Math.min(limit, 30)),
    });

    const res = await fetch(`https://lottie.host/api/v1/animations/search?${params}`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      // Fallback: try the legacy lottiefiles.com search
      const legacyRes = await fetch(`https://assets-v2.lottiefiles.com/a/b0e77cc6-1191-11ee-b4e6-97ebaecab9ae/search.json?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
      if (!legacyRes.ok) {
        return NextResponse.json({ results: [], error: `LottieFiles search failed (${res.status})` });
      }
      const legacyData = await legacyRes.json();
      const results = (legacyData.results || legacyData.data || []).map((a: any) => ({
        id: a.id || a.slug,
        title: a.name || a.title || query,
        previewUrl: a.lottie_url || a.preview_url || a.gif_url,
        lottieUrl: a.lottie_url || a.json_url,
        gifUrl: a.gif_url || a.preview_url,
        tags: a.tags || [],
        author: a.author?.name || a.createdBy?.name || 'Unknown',
      })).filter((a: any) => a.lottieUrl);

      return NextResponse.json({ results });
    }

    const data = await res.json();
    const results = (data.data || data.results || []).map((a: any) => ({
      id: a.id || a.hash,
      title: a.name || a.title || query,
      previewUrl: a.preview_url || a.gif_url || a.lottie_url,
      lottieUrl: a.lottie_url || a.json_url || `https://lottie.host/${a.hash}.json`,
      gifUrl: a.gif_url || a.preview_url,
      tags: a.tags || [],
      author: a.created_by?.name || a.author || 'Unknown',
    })).filter((a: any) => a.lottieUrl);

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error('[LottieSearch] Error:', err.message);
    return NextResponse.json({ results: [], error: err.message });
  }
}
