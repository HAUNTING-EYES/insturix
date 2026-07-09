import { describe, expect, it } from 'vitest';
import { buildLaneBSpeakingShot, type LaneBDeps } from '../../lib/avatar/avatar-lane-b';
import { measureWavDurationSec } from '../../lib/avatar/avatar-audio-fit';

function makeWav(durationSec: number, sampleRate = 24000, channels = 1, bits = 16): Buffer {
  const bytesPerSec = sampleRate * channels * (bits / 8);
  const dataSize = Math.round(bytesPerSec * durationSec);
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(bytesPerSec, 28);
  buf.writeUInt16LE(channels * (bits / 8), 32);
  buf.writeUInt16LE(bits, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

const input = {
  avatarImageRefs: ['ref1.jpg', 'ref2.jpg'],
  voiceSampleUrl: 'https://cdn/sample.wav',
  lineText: 'Hi, I am Nimit, and this is Insturix.',
};

describe('buildLaneBSpeakingShot', () => {
  it('generates the body first, then pads the voice to the body’s actual length', async () => {
    let uploadedWav: Buffer | undefined;
    let shotSpec: { durationSec: number } | undefined;
    let relipInput: { videoDurationSec: number; audioDurationSec: number } | undefined;

    const deps: LaneBDeps = {
      synthesizeVoice: async () => ({ audioUrl: 'https://cdn/raw.wav' }),
      fetchAudioBytes: async () => makeWav(7.3), // measured VO = 7.3s
      uploadAudio: async (wav) => {
        uploadedWav = wav;
        return { audioUrl: 'https://cdn/aligned.wav' };
      },
      generateShot: async (spec) => {
        shotSpec = spec;
        // Kling i2v snaps 8s → 10s; the adapter reports the actual length.
        return { videoUrl: 'https://cdn/body.mp4', modelUsed: 'kling-2.6-i2v', durationSec: 10, hasNativeAudio: false };
      },
      relip: async (r) => {
        relipInput = r;
        return { videoUrl: 'https://cdn/final.mp4' };
      },
      measureVideoDurationSec: async () => 10, // body's real length
    };

    const result = await buildLaneBSpeakingShot(input, deps);

    expect(result.status).toBe('done');
    expect(result.videoUrl).toBe('https://cdn/final.mp4');
    // Requested ceil(7.3)=8; body actually came out 10 (Kling snap) → shot locks to 10.
    expect(shotSpec?.durationSec).toBe(8);
    expect(result.durationSec).toBe(10);
    // Voice padded to the body's real length → relip stays in sync, no words cut.
    expect(measureWavDurationSec(uploadedWav!)).toBe(10);
    expect(relipInput?.audioDurationSec).toBe(10);
    expect(relipInput?.videoDurationSec).toBe(10);
  });

  it('fails loud if the body comes out shorter than the voice (would cut words)', async () => {
    await expect(
      buildLaneBSpeakingShot(input, {
        synthesizeVoice: async () => ({ audioUrl: 'https://cdn/raw.wav' }),
        fetchAudioBytes: async () => makeWav(9), // 9s VO
        generateShot: async () => ({ videoUrl: 'https://cdn/body.mp4', modelUsed: 'kling-2.6-i2v', durationSec: 5, hasNativeAudio: false }),
        measureVideoDurationSec: async () => 5, // body only 5s < 9s VO
        uploadAudio: async () => ({ audioUrl: 'x' }),
        relip: async () => ({ videoUrl: 'x' }),
      }),
    ).rejects.toThrow(/shorter than the voice/);
  });

  it('stops at needs_fit without spending on body/relip when the line overruns', async () => {
    let shotCalled = false;
    let relipCalled = false;

    const result = await buildLaneBSpeakingShot(input, {
      synthesizeVoice: async () => ({ audioUrl: 'https://cdn/raw.wav' }),
      fetchAudioBytes: async () => makeWav(11), // 11s VO — over the 10s shot cap
      generateShot: async (spec) => {
        shotCalled = true;
        return { videoUrl: 'x', modelUsed: 'seedance-2.0-r2v', durationSec: spec.durationSec, hasNativeAudio: true };
      },
      relip: async () => {
        relipCalled = true;
        return { videoUrl: 'x' };
      },
    });

    expect(result.status).toBe('needs_fit');
    expect(result.fit.action).toBe('rewrite');
    expect(result.videoUrl).toBeUndefined();
    expect(shotCalled).toBe(false);
    expect(relipCalled).toBe(false);
  });

  it('stages a scene/wardrobe reference from the user photos and animates that', async () => {
    let stagedFrom: string[] | undefined;
    let shotRefs: string[] | undefined;
    const result = await buildLaneBSpeakingShot(
      { ...input, stageReference: { scenePrompt: 'in a modern office, black blazer' } },
      {
        synthesizeVoice: async () => ({ audioUrl: 'https://cdn/raw.wav' }),
        fetchAudioBytes: async () => makeWav(6),
        stageReference: async (s) => {
          stagedFrom = s.sourceImageUrls;
          return { imageUrl: 'https://cdn/staged.png' };
        },
        generateShot: async (spec) => {
          shotRefs = spec.avatarImageRefs;
          return { videoUrl: 'https://cdn/body.mp4', modelUsed: 'kling-2.6-i2v', durationSec: 10, hasNativeAudio: false };
        },
        measureVideoDurationSec: async () => 10,
        uploadAudio: async () => ({ audioUrl: 'https://cdn/aligned.wav' }),
        relip: async () => ({ videoUrl: 'https://cdn/final.mp4' }),
      },
    );
    expect(result.status).toBe('done');
    expect(stagedFrom).toEqual(input.avatarImageRefs); // staged from the user's photos
    expect(shotRefs).toEqual(['https://cdn/staged.png']); // animated the staged reference, not the raw photos
  });

  it('rejects empty inputs loudly', async () => {
    await expect(buildLaneBSpeakingShot({ ...input, lineText: '   ' })).rejects.toThrow(/non-empty line/);
    await expect(buildLaneBSpeakingShot({ ...input, avatarImageRefs: [] })).rejects.toThrow(/reference image/);
  });
});
