import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';

import { MusicDiscoveryAggregator } from '@/lib/editron/music-discovery/aggregate-provider';
import { AppleMusicDiscoveryProvider } from '@/lib/editron/music-discovery/apple-music-provider';
import { MusicBrainzDiscoveryProvider } from '@/lib/editron/music-discovery/musicbrainz-provider';
import { YouTubeMusicDiscoveryProvider } from '@/lib/editron/music-discovery/youtube-provider';
import { YouTubeMusicTrendEnricher } from '@/lib/editron/music-discovery/youtube-music-trend-enricher';
import { handleMusicDiscoverySearch } from '@/lib/editron/http/music-route-handlers';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const searcher = new MusicDiscoveryAggregator([
    new AppleMusicDiscoveryProvider(),
    new YouTubeMusicDiscoveryProvider(),
    new MusicBrainzDiscoveryProvider(),
  ]);
  const trendEnricher = new YouTubeMusicTrendEnricher();
  return handleMusicDiscoverySearch(request, {
    authenticate: auth,
    searcher,
    enrichTrends: (result) => trendEnricher.enrich(result),
  });
}
