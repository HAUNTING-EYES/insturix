import { describe, expect, it } from 'vitest';

import {
  identityToFingerprintRecognition,
  resolveSoundtrackIdentity,
  SoundtrackIdentityError,
  SOUNDTRACK_IDENTITY_VERSION,
  type AudioRecognizer,
} from '@/lib/editron/reference-video/soundtrack-identity';

const FIXED_NOW = () => new Date('2026-08-06T00:00:00.000Z');
const audio = () => new Uint8Array(Buffer.from('fake-demuxed-audio-bytes', 'utf8'));

describe('R3 soundtrack identity', () => {
  it('returns null (not a fabricated identity) when no recognizer is configured', async () => {
    const result = await resolveSoundtrackIdentity('ref_canon_x', audio(), { now: FIXED_NOW });
    expect(result).toBeNull();
  });

  it('resolves a recognized track into a v1 identity with cue offset + provider receipt', async () => {
    const recognize: AudioRecognizer = async () => ({
      recordingId: 'isrc:USRC17607839',
      title: 'Nightcall',
      artists: ['Kavinsky', 'Lovefoxxx'],
      isrcs: ['USRC17607839'],
      durationMs: 244_000,
      confidence: 0.94,
      cueOffsetMs: 3_200,
      providerName: 'audd',
      providerReceipt: 'audd_receipt_abc123',
      raw: { song_start: 3.2 },
    });
    const result = await resolveSoundtrackIdentity('ref_canon_x', audio(), {
      recognize,
      now: FIXED_NOW,
    });

    expect(result).not.toBeNull();
    expect(result?.version).toBe(SOUNDTRACK_IDENTITY_VERSION);
    expect(result?.referenceAssetId).toBe('ref_canon_x');
    expect(result?.title).toBe('Nightcall');
    expect(result?.artists).toEqual(['Kavinsky', 'Lovefoxxx']);
    expect(result?.isrcs).toEqual(['USRC17607839']);
    expect(result?.confidence).toBe(0.94);
    expect(result?.cueOffsetMs).toBe(3_200);
    expect(result?.provider.name).toBe('audd');
    expect(result?.provider.receipt).toBe('audd_receipt_abc123');
    expect(result?.recognizedAt).toBe('2026-08-06T00:00:00.000Z');
  });

  it('returns null when the recognizer finds no match (soundClass stays unknown)', async () => {
    const recognize: AudioRecognizer = async () => null;
    const result = await resolveSoundtrackIdentity('ref_canon_x', audio(), { recognize });
    expect(result).toBeNull();
  });

  it('normalizes + dedupes ISRCs and clamps confidence to [0,1]', async () => {
    const recognize: AudioRecognizer = async () => ({
      recordingId: 'musicbrainz:rec1',
      title: 'T',
      artists: ['A'],
      isrcs: [' USRC17607839 ', 'USRC17607839', 'garbage'],
      confidence: 2.5,
      cueOffsetMs: null,
      providerName: 'musicbrainz',
      providerReceipt: 'r',
    });
    const result = await resolveSoundtrackIdentity('ref_canon_x', audio(), { recognize, now: FIXED_NOW });
    expect(result?.isrcs).toEqual(['USRC17607839']);
    expect(result?.confidence).toBe(1);
    expect(result?.cueOffsetMs).toBeNull();
  });

  it('fails loud when the recognizer throws', async () => {
    const recognize: AudioRecognizer = async () => {
      throw new Error('upstream 500');
    };
    await expect(resolveSoundtrackIdentity('ref_canon_x', audio(), { recognize }))
      .rejects.toMatchObject({ code: 'recognizer_failed' });
  });

  it('fails loud on missing or oversized audio', async () => {
    await expect(resolveSoundtrackIdentity('ref_canon_x', null, {})).rejects.toMatchObject({ code: 'no_audio' });
    const big = new Uint8Array(70 * 1024 * 1024);
    await expect(resolveSoundtrackIdentity('ref_canon_x', big, { maxRecognitionBytes: 64 * 1024 * 1024 }))
      .rejects.toMatchObject({ code: 'audio_too_large' });
  });

  it('maps identity into the fingerprint recognition contract with a cue offset', () => {
    const identity = {
      version: SOUNDTRACK_IDENTITY_VERSION,
      referenceAssetId: 'ref_canon_x',
      recordingId: 'isrc:USRC17607839',
      title: 'Nightcall',
      artists: ['Kavinsky'],
      isrcs: ['USRC17607839'],
      catalogDurationMs: 244_000,
      confidence: 0.94,
      cueOffsetMs: 3_200,
      provider: { name: 'audd', receipt: 'r' },
      recognizedAt: '2026-08-06T00:00:00.000Z',
    } as const;
    const recognition = identityToFingerprintRecognition(identity);
    expect(recognition).toEqual({
      trackIdentity: 'isrc:USRC17607839',
      soundClass: 'catalog-track',
      playOffsetMs: 3_200,
    });
  });
});
