/**
 * Reference-song → licensed-catalog matcher (the "play that exact song" bridge).
 *
 * Takes the R3-recognized reference identity (stored on the project) and finds
 * licensed-catalog candidates the user can assign to the timeline — mirroring
 * how Instagram lets you pick the trending sound and lay it on your reel.
 *
 * Search strategy (deterministic, provider-agnostic):
 *   1. ISRC exact-match first (most reliable canonical id when both sides have it).
 *   2. Fall back to a title + first-artist term (catalog Relevance search).
 *
 * Constraint #7 is honored here: this is PREVIEW/DISCOVERY only. Assigning a
 * catalog track is done through the existing ingest+assign path, which enforces
 * rights + attestation for export. This module never auto-assigns.
 */

import type { SoundtrackIdentity } from '@/lib/editron/reference-video/soundtrack-identity';
import type { MusicCatalogSearchQuery, MusicCatalogTrack, MusicCatalogProvider } from './types';

export const REFERENCE_SONG_MATCHER_VERSION = 'editron-r3-reference-song-matcher-v1' as const;

export interface ReferenceSongMatchResult {
  version: typeof REFERENCE_SONG_MATCHER_VERSION;
  /** The R3 identity this match was derived from. */
  identity: {
    recordingId: string;
    title: string;
    artists: string[];
    isrcs: string[];
    cueOffsetMs: number | null;
    provider: string;
  };
  /** Licensed-catalog candidates ordered by relevance. Empty when nothing matched. */
  candidates: MusicCatalogTrack[];
  /** The search strategy that produced the candidates. */
  strategy: 'isrc-exact' | 'title-artist' | 'none';
  matched: boolean;
  /** Present when the same ISRC exists in catalog — the strongest "same song" signal. */
  sameSong?: {
    isrc: string;
    candidate: MusicCatalogTrack;
  };
}

export interface ReferenceSongMatcherDeps {
  /** Licensed catalog to search. Must implement available() + search(). */
  provider?: MusicCatalogProvider;
  /** Max candidates to fetch/take. ⚠️ INVENTED — enough for a picker row. */
  limit?: number;
}

const DEFAULT_LIMIT = 6;

/** Build the catalog search query shape from a reference identity. */
export function buildReferenceSongQuery(
  identity: Pick<SoundtrackIdentity, 'title' | 'artists' | 'isrcs'>,
  limit: number,
): MusicCatalogSearchQuery {
  const term = identity.isrcs[0]
    ? identity.isrcs[0]
    : [identity.title, identity.artists[0]].filter(Boolean).join(' ').trim();
  return {
    term,
    limit,
    offset: 0,
    genres: [],
    moods: [],
    vocalTypes: [],
    sort: 'Relevance',
    order: 'asc',
  };
}

/** Score a catalog track toward the reference identity: 2 = exact ISRC, 1 = title+artist overlap, 0 = no signal. */
export function scoreReferenceMatch(
  track: MusicCatalogTrack,
  identity: Pick<SoundtrackIdentity, 'title' | 'artists' | 'isrcs'>,
): number {
  const isrc = track.isrc?.toUpperCase();
  if (isrc && identity.isrcs.some((i) => i.toUpperCase() === isrc)) return 2;
  const titleHit = normalize(track.title) === normalize(identity.title);
  const artistHit = track.artists.some((a) => identity.artists.some((ia) => normalize(ia) === normalize(a)));
  return titleHit && artistHit ? 1 : (titleHit || artistHit ? 0.5 : 0);
}

export async function matchReferenceSongToCatalog(
  identity: SoundtrackIdentity | null,
  deps: ReferenceSongMatcherDeps = {},
): Promise<ReferenceSongMatchResult | null> {
  if (!identity) return null;
  const provider = deps.provider;
  const limit = deps.limit ?? DEFAULT_LIMIT;
  const id = {
    recordingId: identity.recordingId,
    title: identity.title,
    artists: identity.artists,
    isrcs: identity.isrcs,
    cueOffsetMs: identity.cueOffsetMs,
    provider: identity.provider.name,
  };
  if (!provider || !provider.available()) {
    return {
      version: REFERENCE_SONG_MATCHER_VERSION,
      identity: id,
      candidates: [],
      strategy: 'none',
      matched: false,
    };
  }

  // 1. ISRC / title-artist term search.
  const query = buildReferenceSongQuery(identity, limit);
  let tracks: MusicCatalogTrack[] = [];
  try {
    const result = await provider.search(query);
    tracks = result.tracks ?? [];
  } catch {
    return {
      version: REFERENCE_SONG_MATCHER_VERSION,
      identity: id,
      candidates: [],
      strategy: 'none',
      matched: false,
    };
  }

  // 2. Rank by match score, stable sort desc.
  const scored = tracks
    .map((t) => ({ t, score: scoreReferenceMatch(t, identity) }))
    .sort((a, b) => b.score - a.score || a.t.title.localeCompare(b.t.title));

  const candidates = scored.slice(0, limit).map((s) => s.t);
  const sameSong = scored.find((s) => s.score === 2)?.t;

  return {
    version: REFERENCE_SONG_MATCHER_VERSION,
    identity: id,
    candidates,
    strategy: identity.isrcs[0] ? 'isrc-exact' : 'title-artist',
    matched: candidates.length > 0,
    ...(sameSong ? { sameSong: { isrc: identity.isrcs[0], candidate: sameSong } } : {}),
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
