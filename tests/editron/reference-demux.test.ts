import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  demuxReferenceVideo,
  ReferenceDemuxError,
  DEMUX_RECEIPT_VERSION,
} from '@/lib/editron/reference-video/reference-demux';

type FakeProcess = EventEmitter & {
  kill: (signal?: string) => void;
  stderr?: EventEmitter;
};

/** Writes a fake video/audio payload at the ffmpeg output positions in args. */
function fakeSpawnWithOutputs(videoBytes: Buffer | null, audioBytes: Buffer | null, exitCode = 0) {
  return (args: string[]) => {
    // args: ffmpeg ... -i src ... -an -y videoOut ... -map 0:a? ... -y audioOut
    const videoIdx = args.indexOf('-an') + 2; // -an, -y, videoOut
    const audioIdx = args.lastIndexOf('-y') + 1; // second -y, audioOut
    const proc = new EventEmitter() as FakeProcess;
    proc.kill = () => {
      proc.emit('exit', 9);
    };
    const stderr = new EventEmitter();
    proc.stderr = stderr;
    setImmediate(async () => {
      const videoPath = args[videoIdx];
      const audioPath = args[audioIdx];
      if (videoBytes) await writeFile(videoPath, videoBytes);
      if (audioBytes) await writeFile(audioPath, audioBytes);
      proc.emit('exit', exitCode);
    });
    return proc as ReturnType<typeof import('node:child_process').spawn>;
  };
}

describe('R1-A canonical demux', () => {
  async function makeSource(contents = Buffer.from('fake-video-bytes')) {
    const dir = await mkdtemp(path.join(tmpdir(), 'editron-demux-test-'));
    const p = path.join(dir, 'src.mp4');
    await writeFile(p, contents);
    return { dir, p };
  }

  async function runDemux(opts: {
    sourcePath: string;
    videoBytes?: Buffer | null;
    audioBytes?: Buffer | null;
    exitCode?: number;
    sha256?: (b: Buffer) => string;
  }) {
    const uploaded: Array<{ fileName: string; contentType: string; userId: string }> = [];
    const videoBytes = opts.videoBytes ?? Buffer.alloc(512, 0xab); // >= MIN_VIDEO_BYTES
    const receipt = await demuxReferenceVideo(
      {
        referenceAssetId: 'ref_abc123',
        userId: 'user_1',
        sourcePath: opts.sourcePath,
        sourceKind: 'asset',
        sourceLabel: 'Match Edit Ref',
      },
      {
        spawnProcess: fakeSpawnWithOutputs(videoBytes, opts.audioBytes ?? null, opts.exitCode),
        readDurationMs: async () => 12_345,
        sha256: opts.sha256,
        uploadBuffer: async (file, fileName, contentType, userId) => {
          uploaded.push({ fileName, contentType, userId });
          return { storageKey: `r2/${fileName}`, size: file.byteLength };
        },
      },
    );
    return { receipt, uploaded };
  }

  it('returns a v1 receipt with hashes, duration, source provenance', async () => {
    const { dir, p } = await makeSource();
    try {
      const { receipt } = await runDemux({ sourcePath: p });
      expect(receipt.version).toBe(DEMUX_RECEIPT_VERSION);
      expect(receipt.referenceAssetId).toBe('ref_abc123');
      expect(receipt.userId).toBe('user_1');
      expect(receipt.durationMs).toBe(12_345);
      expect(receipt.video).toMatchObject({ contentType: 'video/mp4', size: 512 });
      expect(receipt.audio).toBeNull();
      expect(receipt.source.kind).toBe('asset');
      expect(receipt.source.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('uploads video AND audio artifacts keyed by the canonical reference id', async () => {
    const { dir, p } = await makeSource();
    try {
      const { receipt, uploaded } = await runDemux({
        sourcePath: p,
        audioBytes: Buffer.alloc(200, 0xcd),
        sha256: (b) => b.toString('hex'),
      });
      expect(uploaded).toHaveLength(2);
      expect(uploaded[0].fileName).toContain('ref_abc123-v-');
      expect(uploaded[1].fileName).toContain('ref_abc123-a-');
      expect(uploaded.every(u => u.userId === 'user_1')).toBe(true);
      expect(receipt.audio).toEqual(
        expect.objectContaining({ present: true, contentType: 'audio/mp4', sha256: Buffer.alloc(200, 0xcd).toString('hex') }),
      );
      expect(receipt.video.key).toBe('r2/ref_abc123-v-Match_Edit_Ref.mp4');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails loud when the source file is unreadable', async () => {
    const missing = path.join(tmpdir(), 'definitely-missing-demux-src.mp4');
    await expect(
      demuxReferenceVideo(
        {
          referenceAssetId: 'ref_x',
          userId: 'user_1',
          sourcePath: missing,
          sourceKind: 'remote-url',
        },
        { spawnProcess: fakeSpawnWithOutputs(null, null), readDurationMs: async () => null },
      ),
    ).rejects.toBeInstanceOf(ReferenceDemuxError);
  });

  it('fails loud on a missing video stream (tiny remux)', async () => {
    const { dir, p } = await makeSource(Buffer.alloc(10));
    try {
      await expect(runDemux({ sourcePath: p, videoBytes: Buffer.alloc(10), audioBytes: null }))
        .rejects.toMatchObject({ code: 'no_video_stream' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails loud when ffmpeg exits non-zero', async () => {
    const { dir, p } = await makeSource();
    try {
      await expect(runDemux({ sourcePath: p, exitCode: 1, videoBytes: null }))
        .rejects.toMatchObject({ code: 'ffmpeg_failed' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
