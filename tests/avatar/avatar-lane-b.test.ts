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
  it('runs the full chain and aligns audio to the locked shot duration', async () => {
    let uploadedWav: Buffer | undefined;
    let shotSpec: { durationSec: number; audioRef?: string } | undefined;
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
        return { videoUrl: 'https://cdn/body.mp4', modelUsed: 'seedance-2.0-r2v', durationSec: spec.durationSec, hasNativeAudio: true };
      },
      relip: async (r) => {
        relipInput = r;
        return { videoUrl: 'https://cdn/final.mp4' };
      },
      measureVideoDurationSec: async () => 8,
    };

    const result = await buildLaneBSpeakingShot(input, deps);

    expect(result.status).toBe('done');
    expect(result.videoUrl).toBe('https://cdn/final.mp4');
    expect(result.durationSec).toBe(8); // ceil(7.3) locked to a whole second
    // Body generated to the locked duration, conditioned on the aligned voice.
    expect(shotSpec?.durationSec).toBe(8);
    expect(shotSpec?.audioRef).toBe('https://cdn/aligned.wav');
    // Audio padded to exactly match the video → relip stays in sync.
    expect(measureWavDurationSec(uploadedWav!)).toBe(8);
    expect(relipInput?.audioDurationSec).toBe(8);
    expect(relipInput?.videoDurationSec).toBe(8);
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

  it('rejects empty inputs loudly', async () => {
    await expect(buildLaneBSpeakingShot({ ...input, lineText: '   ' })).rejects.toThrow(/non-empty line/);
    await expect(buildLaneBSpeakingShot({ ...input, avatarImageRefs: [] })).rejects.toThrow(/reference image/);
  });
});
