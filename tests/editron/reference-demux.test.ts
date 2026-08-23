import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildReferenceCanonicalEnvelope,
  demuxReferenceVideo,
  ReferenceDemuxError,
  DEMUX_RECEIPT_VERSION,
  REFERENCE_ENVELOPE_VERSION,
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
    uploadSizeDelta?: number;
  }) {
    const uploaded: Array<{ fileName: string; contentType: string; userId: string }> = [];
    const videoBytes = opts.videoBytes === undefined ? Buffer.alloc(512, 0xab) : opts.videoBytes;
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
        uploadFile: async (filePath, fileName, contentType, userId) => {
          uploaded.push({ fileName, contentType, userId });
          return {
            storageKey: `r2/${fileName}`,
            size: (await stat(filePath)).size + (opts.uploadSizeDelta ?? 0),
          };
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
      });
      expect(uploaded).toHaveLength(2);
      expect(uploaded[0].fileName).toContain('ref_abc123-v-');
      expect(uploaded[1].fileName).toContain('ref_abc123-a-');
      expect(uploaded.every(u => u.userId === 'user_1')).toBe(true);
      expect(receipt.audio).toEqual(
        expect.objectContaining({
          present: true,
          contentType: 'audio/mp4',
          sha256: createHash('sha256').update(Buffer.alloc(200, 0xcd)).digest('hex'),
        }),
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

  it('fails loud when ffmpeg produces no video artifact', async () => {
    const { dir, p } = await makeSource(Buffer.alloc(10));
    try {
      await expect(runDemux({ sourcePath: p, videoBytes: null, audioBytes: null }))
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

  it('does not reject a non-empty artifact through an invented byte threshold', async () => {
    const { dir, p } = await makeSource();
    try {
      const { receipt } = await runDemux({ sourcePath: p, videoBytes: Buffer.from([1]) });
      expect(receipt.video.size).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails loud when the upload receipt size does not match the streamed file', async () => {
    const { dir, p } = await makeSource();
    try {
      await expect(runDemux({ sourcePath: p, uploadSizeDelta: 1 }))
        .rejects.toMatchObject({ code: 'upload_failed' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('kills the active ffmpeg process and returns a stable cancellation error', async () => {
    const { dir, p } = await makeSource();
    const controller = new AbortController();
    let killed = false;
    let reportSpawned: (() => void) | undefined;
    const spawned = new Promise<void>((resolve) => { reportSpawned = resolve; });
    const spawnProcess = () => {
      const proc = new EventEmitter() as FakeProcess;
      proc.stderr = new EventEmitter();
      proc.kill = () => {
        killed = true;
        setImmediate(() => proc.emit('exit', 9));
      };
      reportSpawned?.();
      return proc as ReturnType<typeof import('node:child_process').spawn>;
    };
    try {
      const pending = demuxReferenceVideo({
        referenceAssetId: 'ref_cancel', userId: 'user_1', sourcePath: p,
        sourceKind: 'asset', abortSignal: controller.signal,
      }, {
        spawnProcess,
        readDurationMs: async () => 1_000,
        uploadFile: async () => {
          throw new Error('upload must not run after cancellation');
        },
      });
      await spawned;
      controller.abort();
      await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
      expect(killed).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('R1-B canonical reference envelope', () => {
  const receipt = {
    version: DEMUX_RECEIPT_VERSION,
    referenceAssetId: 'ref_abc123',
    userId: 'user_1',
    createdAt: '2026-08-05T00:00:00.000Z',
    durationMs: 12_345,
    video: {
      key: 'r2/v.mp4',
      size: 100,
      contentType: 'video/mp4',
      sha256: 'a'.repeat(64),
    },
    audio: {
      key: 'r2/a.m4a',
      size: 200,
      contentType: 'audio/mp4',
      sha256: 'b'.repeat(64),
      present: true,
    },
    source: {
      path: '/tmp/src.mp4',
      kind: 'asset' as const,
      label: 'Match Edit Ref',
      sourceSha256: 'c'.repeat(64),
    },
  };

  it('builds a v1 envelope from a demux receipt (audio present)', () => {
    const envelope = buildReferenceCanonicalEnvelope(receipt, 'preview-waveform-only');
    expect(envelope.version).toBe(REFERENCE_ENVELOPE_VERSION);
    expect(envelope.contentHash).toBe('c'.repeat(64));
    expect(envelope.audioUsageMode).toBe('preview-waveform-only');
    expect(envelope.demux).toEqual({
      version: DEMUX_RECEIPT_VERSION,
      demuxedAt: '2026-08-05T00:00:00.000Z',
      durationMs: 12_345,
      videoSha256: 'a'.repeat(64),
      audioSha256: 'b'.repeat(64),
      audioPresent: true,
    });
  });

  it('carries the export-attested audio usage mode through (Constraint #7)', () => {
    const envelope = buildReferenceCanonicalEnvelope(receipt, 'export-attested');
    expect(envelope.audioUsageMode).toBe('export-attested');
    expect(envelope.demux?.audioPresent).toBe(true);
  });

  it('produces null audio fields when the receipt has no audio track', () => {
    const noAudio = { ...receipt, audio: null };
    const envelope = buildReferenceCanonicalEnvelope(noAudio, 'preview-waveform-only');
    expect(envelope.demux?.audioPresent).toBe(false);
    expect(envelope.demux?.audioSha256).toBeNull();
  });
});
