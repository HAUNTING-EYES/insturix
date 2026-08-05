import { describe, expect, it } from 'vitest';

import {
  enrichReferenceWithMeasuredEvidence,
  type ReferenceEnrichmentInput,
} from '@/lib/editron/reference-video/enrich-reference-evidence';
import { createAuddRecognizer, isAuddConfigured } from '@/lib/editron/reference-video/audd-recognizer';

const input: ReferenceEnrichmentInput = {
  userId: 'user_1',
  referenceAssetId: 'ref_canon_x',
  audioArtifact: { key: 'r2/ref_canon_x-a-demo.m4a', contentType: 'audio/mp4' },
};

describe('R2/R3 worker enrichment', () => {
  it('skips entirely when there is no demuxed audio artifact', async () => {
    const out = await enrichReferenceWithMeasuredEvidence({
      ...input,
      audioArtifact: null,
    });
    expect(out.soundtrackIdentity).toBeUndefined();
    expect(out.audioEvidence).toBeUndefined();
    expect(out.warnings).toEqual([]);
  });

  it('records an audio fetch failure loudly without throwing', async () => {
    const out = await enrichReferenceWithMeasuredEvidence(input, {
      fetchAudioBytes: async () => {
        throw new Error('presign failed');
      },
      recognize: async () => null,
    });
    expect(out.warnings).toContainEqual(
      expect.objectContaining({ code: 'audio_fetch_failed', source: 'fetch' }),
    );
  });

  it('attaches a recognized soundtrack identity + audio beats/silence evidence', async () => {
    const primary = new Float32Array(16_000); // 1s of silence at 16k — decodable PCM
    const out = await enrichReferenceWithMeasuredEvidence(input, {
      fetchAudioBytes: async () => new Uint8Array(Buffer.from('fake-audio-bytes', 'utf8')),
      decodeAudio: async () => ({ channelData: [primary], sampleRate: 16_000 }),
      recognize: async () => ({
        recordingId: 'isrc:USRC17607839',
        title: 'Nightcall',
        artists: ['Kavinsky'],
        isrcs: ['USRC17607839'],
        confidence: 0.94,
        cueOffsetMs: 3_200,
        providerName: 'audd',
        providerReceipt: 'audd_receipt_abc123',
      }),
    });

    expect(out.soundtrackIdentity).toEqual({
      trackIdentity: 'isrc:USRC17607839',
      soundClass: 'catalog-track',
      playOffsetMs: 3_200,
    });
    expect(out.audioEvidence).toBeDefined();
    // beats evidence present (the real detector emits a bpm, defaulting on silence)
    expect((out.audioEvidence as Record<string, unknown>).beats).toMatchObject({ beats: expect.any(Array) });
    expect(out.warnings).toEqual([]);
  });

  it('returns identity=undefined when recognizer finds no match (audio evidence still measured)', async () => {
    const primary = new Float32Array(16_000);
    const out = await enrichReferenceWithMeasuredEvidence(input, {
      fetchAudioBytes: async () => new Uint8Array(Buffer.from('x', 'utf8')),
      decodeAudio: async () => ({ channelData: [primary], sampleRate: 16_000 }),
      recognize: async () => null,
    });
    expect(out.soundtrackIdentity).toBeUndefined();
    expect(out.audioEvidence).toBeDefined();
  });

  it('surfaces a recognizer failure as a warning (evidence survives)', async () => {
    const primary = new Float32Array(16_000);
    const out = await enrichReferenceWithMeasuredEvidence(input, {
      fetchAudioBytes: async () => new Uint8Array(Buffer.from('x', 'utf8')),
      decodeAudio: async () => ({ channelData: [primary], sampleRate: 16_000 }),
      recognize: async () => {
        throw new Error('audd 500');
      },
    });
    expect(out.soundtrackIdentity).toBeUndefined();
    expect(out.warnings).toContainEqual(expect.objectContaining({ code: 'recognizer_failed', source: 'soundtrack' }));
  });
});

describe('AudD recognizer client', () => {
  it('isAuddConfigured is false without AUDD_API_TOKEN', () => {
    const prev = process.env.AUDD_API_TOKEN;
    delete process.env.AUDD_API_TOKEN;
    expect(isAuddConfigured()).toBe(false);
    if (prev !== undefined) process.env.AUDD_API_TOKEN = prev;
  });

  it('returns null (no identity) when no token given — never fabricates', async () => {
    const recognize = createAuddRecognizer({ apiToken: '' });
    expect(await recognize(new Uint8Array(4))).toBeNull();
  });

  it('maps an AudD match into RecognizedTrack with cue offset + receipt', async () => {
    const recognize = createAuddRecognizer({
      apiToken: 'test_token',
      fetchImpl: async () => new Response(JSON.stringify({
        status: 'success',
        result: {
          song_id: 'S.445060',
          title: 'Nightcall',
          artist: 'Kavinsky',
          score: 0.985,
          song_start: 3.2,
          track: { isrc: 'USRC17607839', duration: 244, artists: [{ name: 'Kavinsky' }] },
        },
      }), { status: 200 }),
    });

    const track = await recognize(new Uint8Array(8));
    expect(track).not.toBeNull();
    expect(track?.title).toBe('Nightcall');
    expect(track?.artists).toContain('Kavinsky');
    expect(track?.cueOffsetMs).toBe(3_200);
    expect(track?.providerName).toBe('audd');
    expect(track?.providerReceipt).toBe('S.445060');
  });

  it('returns null on AudD "not found" (no result object)', async () => {
    const recognize = createAuddRecognizer({
      apiToken: 'test_token',
      fetchImpl: async () => new Response(JSON.stringify({ status: 'not_found' }), { status: 200 }),
    });
    expect(await recognize(new Uint8Array(4))).toBeNull();
  });

  it('throws on upstream non-2xx', async () => {
    const recognize = createAuddRecognizer({
      apiToken: 'test_token',
      fetchImpl: async () => new Response('err', { status: 500 }),
    });
    await expect(recognize(new Uint8Array(4))).rejects.toThrow(/HTTP 500/);
  });
});
