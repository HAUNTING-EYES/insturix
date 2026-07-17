import { describe, expect, it } from 'vitest';
import {
  detectPlatform,
  extractPlatformId,
  normalizePlatformUrl,
  buildDedupeIdentity,
  dedupeKeys,
  dedupeKey,
  sameSource,
} from '@/lib/ledger/dedupe';

// Real 11-char YouTube ids (case matters).
const YT_A = 'dQw4w9WgXcQ';
const YT_B = '9bZkp7q19f0';
const IG_A = 'C8xYz_1AbCd';

describe('detectPlatform', () => {
  it('recognizes the platforms', () => {
    expect(detectPlatform('https://www.youtube.com/watch?v=' + YT_A)).toBe('youtube');
    expect(detectPlatform('https://youtu.be/' + YT_A)).toBe('youtube');
    expect(detectPlatform('https://m.youtube.com/shorts/' + YT_A)).toBe('youtube');
    expect(detectPlatform('https://www.instagram.com/reel/' + IG_A)).toBe('instagram');
    expect(detectPlatform('https://www.tiktok.com/@u/video/123')).toBe('tiktok');
    expect(detectPlatform('https://example.com/article')).toBe('web');
    expect(detectPlatform('not a url')).toBe('web');
  });
});

describe('extractPlatformId — YouTube', () => {
  it('extracts the 11-char id across url shapes, case preserved', () => {
    expect(extractPlatformId('https://www.youtube.com/watch?v=' + YT_A)).toBe(YT_A);
    expect(extractPlatformId('https://youtu.be/' + YT_A + '?si=abc')).toBe(YT_A);
    expect(extractPlatformId('https://youtube.com/shorts/' + YT_A)).toBe(YT_A);
    expect(extractPlatformId('https://youtube.com/embed/' + YT_A)).toBe(YT_A);
    expect(extractPlatformId('https://www.youtube.com/watch?v=' + YT_A + '&t=30s&list=PLx')).toBe(YT_A);
  });
  it('returns null when there is no id', () => {
    expect(extractPlatformId('https://www.youtube.com/')).toBeNull();
  });
});

describe('extractPlatformId — Instagram / TikTok', () => {
  it('extracts the IG shortcode from reel/reels/p/tv and username-prefixed paths', () => {
    expect(extractPlatformId('https://www.instagram.com/reel/' + IG_A + '/')).toBe(IG_A);
    expect(extractPlatformId('https://www.instagram.com/reels/' + IG_A)).toBe(IG_A);
    expect(extractPlatformId('https://www.instagram.com/p/' + IG_A + '/')).toBe(IG_A);
    expect(extractPlatformId('https://www.instagram.com/somebrand/reel/' + IG_A + '/')).toBe(IG_A);
  });
  it('extracts the TikTok numeric id', () => {
    expect(extractPlatformId('https://www.tiktok.com/@creator/video/7412345678901234567')).toBe(
      '7412345678901234567',
    );
  });
});

describe('normalizePlatformUrl', () => {
  it('lowercases host, drops www/query/fragment/trailing slash, preserves path case', () => {
    expect(normalizePlatformUrl('https://WWW.YouTube.com/watch?v=' + YT_A + '&t=30s#frag')).toBe(
      'https://youtube.com/watch',
    );
    expect(normalizePlatformUrl('https://www.instagram.com/reel/' + IG_A + '/')).toBe(
      'https://instagram.com/reel/' + IG_A,
    );
    expect(normalizePlatformUrl('example.com/Article/')).toBe('https://example.com/Article');
  });
  it('returns the trimmed original when unparseable', () => {
    expect(normalizePlatformUrl('   ::: not a url :::   ')).toBe('::: not a url :::');
  });
});

describe('buildDedupeIdentity', () => {
  it('fills platform + platformId + normalizedUrl from a url', () => {
    const id = buildDedupeIdentity({ url: 'https://youtu.be/' + YT_A });
    expect(id).toEqual({
      normalizedUrl: 'https://youtu.be/' + YT_A,
      platform: 'youtube',
      platformId: YT_A,
    });
  });
  it('carries a chromaprint for user files', () => {
    const id = buildDedupeIdentity({ chromaprint: 'AQADtMkS' });
    expect(id).toEqual({ chromaprint: 'AQADtMkS' });
  });
});

describe('sameSource — SAFETY: merge only on a genuine same-dimension match', () => {
  it('merges the same video across youtu.be and watch?v=', () => {
    const a = buildDedupeIdentity({ url: 'https://youtu.be/' + YT_A });
    const b = buildDedupeIdentity({ url: 'https://www.youtube.com/watch?v=' + YT_A + '&t=30s' });
    expect(sameSource(a, b)).toBe(true);
  });
  it('merges the same IG shortcode served under /reel/ and /p/', () => {
    const a = buildDedupeIdentity({ url: 'https://www.instagram.com/reel/' + IG_A + '/' });
    const b = buildDedupeIdentity({ url: 'https://www.instagram.com/p/' + IG_A + '/' });
    expect(sameSource(a, b)).toBe(true);
  });
  it('does NOT merge two different ids', () => {
    const a = buildDedupeIdentity({ url: 'https://youtu.be/' + YT_A });
    const b = buildDedupeIdentity({ url: 'https://youtu.be/' + YT_B });
    expect(sameSource(a, b)).toBe(false);
  });
  it('does NOT merge case-different ids (ids are case-sensitive)', () => {
    const a = buildDedupeIdentity({ url: 'https://youtu.be/' + YT_A });
    const b = buildDedupeIdentity({ url: 'https://youtu.be/' + YT_A.toLowerCase() });
    expect(sameSource(a, b)).toBe(false);
  });
  it('merges identical chromaprints and splits different ones', () => {
    expect(sameSource({ chromaprint: 'X' }, { chromaprint: 'X' })).toBe(true);
    expect(sameSource({ chromaprint: 'X' }, { chromaprint: 'Y' })).toBe(false);
  });
  it('does NOT merge across kinds (url-only vs chromaprint-only)', () => {
    const a = buildDedupeIdentity({ url: 'https://example.com/a' });
    const b = buildDedupeIdentity({ chromaprint: 'Z' });
    expect(sameSource(a, b)).toBe(false);
  });
});

describe('dedupeKeys / dedupeKey', () => {
  it('orders id > url > chromaprint and dedupeKey returns the strongest', () => {
    const id = { normalizedUrl: 'https://youtu.be/' + YT_A, platform: 'youtube' as const, platformId: YT_A, chromaprint: 'fp' };
    expect(dedupeKeys(id)).toEqual([
      'id:youtube:' + YT_A,
      'url:https://youtu.be/' + YT_A,
      'fp:fp',
    ]);
    expect(dedupeKey(id)).toBe('id:youtube:' + YT_A);
  });
  it('returns [] / null for an empty identity', () => {
    expect(dedupeKeys({})).toEqual([]);
    expect(dedupeKey({})).toBeNull();
  });
});
