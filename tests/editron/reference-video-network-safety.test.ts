import { describe, expect, it } from 'vitest';

import {
  assertPublicReferenceDnsResolution,
  isUnsafeReferenceHostname,
} from '../../lib/editron/reference-video/reference-video-network-safety';

describe('reference video network safety', () => {
  it('accepts public dual-stack CDN resolution', async () => {
    await expect(assertPublicReferenceDnsResolution('scontent.example.com', async () => [
      { address: '31.13.70.52', family: 4 },
      { address: '2a03:2880:f20d:c4:face:b00c:0:43fe', family: 6 },
    ])).resolves.toEqual({ ok: true });
  });

  it('fails closed when any DNS answer is private or reserved', async () => {
    await expect(assertPublicReferenceDnsResolution('mixed.example.com', async () => [
      { address: '31.13.70.52', family: 4 },
      { address: 'fc00::1', family: 6 },
    ])).resolves.toMatchObject({ ok: false });
  });

  it('rejects private, mapped-private, and documentation IPv6 literals', () => {
    expect(isUnsafeReferenceHostname('::1')).toBe(true);
    expect(isUnsafeReferenceHostname('fc00::1')).toBe(true);
    expect(isUnsafeReferenceHostname('::ffff:127.0.0.1')).toBe(true);
    expect(isUnsafeReferenceHostname('2001:db8::1')).toBe(true);
  });

  it('accepts a public IPv6 literal', () => {
    expect(isUnsafeReferenceHostname('2a03:2880:f20d:c4:face:b00c:0:43fe')).toBe(false);
  });
});
