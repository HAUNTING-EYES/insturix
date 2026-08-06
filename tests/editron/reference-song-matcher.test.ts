import { describe, expect, it } from 'vitest';

import {
  matchReferenceSongToCatalog,
  scoreReferenceMatch,
  REFERENCE_SONG_MATCHER_VERSION,
  type ReferenceSongMatcherDeps,
} from '@/lib/editron/music-catalog/reference-song-matcher';
import type { MusicCatalogTrack } from '@/lib/editron/music-catalog/types';
import type { SoundtrackIdentity } from '@/lib/editron/reference-video/soundtrack-identity';

function track(over: Partial<MusicCatalogTrack>): MusicCatalogTrack {
  return {
    provider: 'epidemic-sound',
    providerTrackId: 't1',
    title: 'Nightcall',
    artists: ['Kavinsky'],
    featuredArtists: [],
    durationMs: 244_000,
    bpm: 120,
    moods: [],
    genres: [],
    vocalType: 'none',
    hasVocals: false,
    explicit: null,
    catalogAvailability: 'preview-only',
    rightsStatus: 'unverified',
    renderEligibility: 'requires-entitlement-and-ingest',
    ...over,
  };
}

function identity(over: Partial<SoundtrackIdentity> = {}): SoundtrackIdentity {
  return {
    version: 'editron-r3-soundtrack-identity-v1',
    referenceAssetId: 'ref_1',
    recordingId: 'isrc:USRC17607839',
    title: 'Nightcall',
    artists: ['Kavinsky'],
    isrcs: ['USRC17607839'],
    catalogDurationMs: 244_000,
    confidence: 0.94,
    cueOffsetMs: 3_200,
    provider: { name: 'audd', receipt: 'rcpt' },
    recognizedAt: 't',
    ...over,
  };
}

function fakeProvider(tracks: MusicCatalogTrack[]): NonNullable<ReferenceSongMatcherDeps['provider']> {
  return {
    name: 'epidemic-sound',
    available: () => true,
    search: async () => ({ provider: 'epidemic-sound', tracks, pagination: { limit: 20, offset: 0, nextOffset: null } }),
  };
}

describe('reference-song → catalog matcher', () => {
  it('returns null when there is no reference identity', async () => {
    const result = await matchReferenceSongToCatalog(null, { provider: fakeProvider([]) });
    expect(result).toBeNull();
  });

  it('flags same-song via exact ISRC when the catalog carries it', async () => {
    const catalog = [track({ providerTrackId: 'e1', isrc: 'USRC17607839' })];
    const result = await matchReferenceSongToCatalog(identity(), { provider: fakeProvider(catalog) });
    expect(result?.version).toBe(REFERENCE_SONG_MATCHER_VERSION);
    expect(result?.sameSong?.isrc).toBe('USRC17607839');
    expect(result?.sameSong?.candidate.providerTrackId).toBe('e1');
    expect(result?.strategy).toBe('isrc-exact');
    expect(result?.matched).toBe(true);
  });

  it('falls back to title+artist search when the identity has no ISRC', async () => {
    const id = identity({ isrcs: [] });
    const catalog = [track({ providerTrackId: 'e2' })]; // same title/artist, no isrc
    const result = await matchReferenceSongToCatalog(id, { provider: fakeProvider(catalog) });
    expect(result?.strategy).toBe('title-artist');
    expect(result?.candidates[0].providerTrackId).toBe('e2');
  });

  it('ranks exact-ISRC above title-only matches', () => {
    expect(scoreReferenceMatch(track({ isrc: 'USRC17607839' }), identity())).toBe(2);
    expect(scoreReferenceMatch(track({ isrc: 'XXXXXXXX', title: 'Nightcall', artists: ['Kavinsky'] }), identity())).toBe(1);
    expect(scoreReferenceMatch(track({ isrc: 'XXXXXXXX', title: 'Nightcall', artists: ['SomeoneElse'] }), identity())).toBe(0.5);
    expect(scoreReferenceMatch(track({ isrc: 'XXXXXXXX', title: 'Other', artists: ['Other'] }), identity())).toBe(0);
  });

  it('returns empty candidates when the catalog has no match at all', async () => {
    const result = await matchReferenceSongToCatalog(identity(), { provider: fakeProvider([]) });
    expect(result?.matched).toBe(false);
    expect(result?.candidates).toEqual([]);
    expect(result?.sameSong).toBeUndefined();
    expect(result?.identity.title).toBe('Nightcall');
  });

  it('surfaces weak candidates for the picker without claiming a same-song match', async () => {
    // Catalog has a track (rovided) but no ISRC/title overlap — shown for the
    // user to judge, but not flagged as "this is the song".
    const catalog = [track({ title: 'CompletelyDifferent', artists: ['X'], isrc: 'YYYYYYYYYYYY' })];
    const result = await matchReferenceSongToCatalog(identity(), { provider: fakeProvider(catalog) });
    expect(result?.matched).toBe(true); // candidates exist
    expect(result?.candidates.length).toBe(1);
    expect(result?.sameSong).toBeUndefined();
  });

  it('is deterministic for identical inputs', async () => {
    const catalog = [track({ isrc: 'USRC17607839' }), track({ providerTrackId: 'z', title: 'Z', artists: ['A'] })];
    const a = await matchReferenceSongToCatalog(identity(), { provider: fakeProvider(catalog) });
    const b = await matchReferenceSongToCatalog(identity(), { provider: fakeProvider(catalog) });
    expect(a).toEqual(b);
  });
});
