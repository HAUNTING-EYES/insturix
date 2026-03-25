/**
 * GET /api/services/editron/lottie/search?q=loading&limit=12
 *
 * Search for Lottie animations via LottieFiles public GraphQL API.
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
    // LottieFiles public GraphQL API (no auth needed for search)
    const graphqlQuery = {
      query: `
        query SearchPublicAnimations($query: String!, $first: Int, $after: String) {
          searchPublicAnimations(query: $query, first: $first, after: $after) {
            edges {
              node {
                id
                name
                lottieUrl
                gifUrl
                jsonUrl
                createdBy {
                  name
                  avatarUrl
                }
              }
            }
            totalCount
          }
        }
      `,
      variables: {
        query: query.trim(),
        first: Math.min(limit, 30),
        after: page > 1 ? String((page - 1) * limit) : null,
      },
    };

    const res = await fetch('https://graphql.lottiefiles.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(graphqlQuery),
    });

    if (!res.ok) {
      console.error(`[LottieSearch] GraphQL error: ${res.status}`);
      // Fallback: use lottie.host search
      return await searchLottieHost(query, limit);
    }

    const data = await res.json();
    const edges = data?.data?.searchPublicAnimations?.edges || [];

    const results = edges.map((edge: any) => {
      const node = edge.node;
      return {
        id: node.id,
        title: node.name || query,
        previewUrl: node.gifUrl || node.lottieUrl,
        lottieUrl: node.lottieUrl || node.jsonUrl,
        gifUrl: node.gifUrl,
        author: node.createdBy?.name || 'Unknown',
      };
    }).filter((a: any) => a.lottieUrl);

    if (results.length > 0) {
      return NextResponse.json({ results });
    }

    // If GraphQL returned nothing, try lottie.host
    return await searchLottieHost(query, limit);
  } catch (err: any) {
    console.error('[LottieSearch] Error:', err.message);
    // Fallback
    return await searchLottieHost(query, limit);
  }
}

async function searchLottieHost(query: string, limit: number): Promise<NextResponse> {
  try {
    // lottie.host has a simple search endpoint
    const res = await fetch(`https://lottie.host/api/search/animations?query=${encodeURIComponent(query)}&per_page=${limit}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      console.error(`[LottieSearch] lottie.host error: ${res.status}`);
      return NextResponse.json({ results: [], error: 'LottieFiles search unavailable' });
    }

    const data = await res.json();
    const items = data.data || data.results || data.animations || [];
    const results = items.map((a: any) => ({
      id: a.id || a.hash || a.slug,
      title: a.name || a.title || query,
      previewUrl: a.gif_url || a.preview_url || a.lottie_url,
      lottieUrl: a.lottie_url || a.json_url || (a.hash ? `https://lottie.host/${a.hash}.json` : ''),
      gifUrl: a.gif_url || a.preview_url || '',
      author: a.created_by?.name || a.author?.name || 'Unknown',
    })).filter((a: any) => a.lottieUrl);

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error('[LottieSearch] Fallback error:', err.message);
    return NextResponse.json({ results: [], error: err.message });
  }
}
