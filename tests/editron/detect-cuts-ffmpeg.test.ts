import { describe, expect, it } from 'vitest';
import {
  parseSceneCuts,
  parseDurationMs,
  cutsToDecisionStream,
  detectCutsFfmpeg,
  DEFAULT_SCENE_THRESHOLD,
  type RunFfmpeg,
} from '@/lib/editron/reference-video/detect-cuts-ffmpeg';

/**
 * Fixtures are REAL ffmpeg output captured from `metadata=print` on a downloaded short
 * (8WWvXZUJzhU, 16 cuts) — not an assumed format. Guards the deterministic cut oracle that
 * replaces the LLM for the objective cut-timing contract (Playbook §7).
 */
const REAL_STDOUT = [
  'frame:0    pts:28160   pts_time:1.83333',
  'lavfi.scene_score=0.726533',
  'frame:1    pts:46080   pts_time:3',
  'lavfi.scene_score=0.714579',
  'frame:2    pts:68096   pts_time:4.43333',
  'lavfi.scene_score=0.635250',
  'frame:15   pts:326144  pts_time:21.2333',
  'lavfi.scene_score=0.409999',
].join('\n');

const REAL_STDERR =
  '  Duration: 00:00:22.57, start: 0.000000, bitrate: 723 kb/s\n    Stream #0:0(und): Video: h264 (Main), 360x640, 30 fps';

describe('parseSceneCuts — real metadata=print output', () => {
  it('pairs each pts_time with its following scene_score (ms + score)', () => {
    const cuts = parseSceneCuts(REAL_STDOUT);
    expect(cuts).toHaveLength(4);
    expect(cuts[0]).toEqual({ tMs: 1833, sceneScore: 0.726533 });
    expect(cuts[1]).toEqual({ tMs: 3000, sceneScore: 0.714579 });
    expect(cuts[3]).toEqual({ tMs: 21233, sceneScore: 0.409999 });
  });

  it('returns cuts sorted by time', () => {
    const cuts = parseSceneCuts(REAL_STDOUT);
    expect(cuts.map((c) => c.tMs)).toEqual([...cuts.map((c) => c.tMs)].sort((a, b) => a - b));
  });

  it('keeps a pts_time whose score line is missing (scoreless, not dropped)', () => {
    const cuts = parseSceneCuts('frame:0 pts_time:5\nframe:1 pts_time:9\nlavfi.scene_score=0.5');
    expect(cuts).toEqual([{ tMs: 5000 }, { tMs: 9000, sceneScore: 0.5 }]);
  });

  it('returns [] for empty / non-matching stdout', () => {
    expect(parseSceneCuts('')).toEqual([]);
    expect(parseSceneCuts('no frames here')).toEqual([]);
  });
});

describe('parseDurationMs', () => {
  it('parses the Duration header to ms', () => {
    expect(parseDurationMs(REAL_STDERR)).toBe(22570);
  });
  it('returns null when there is no Duration line', () => {
    expect(parseDurationMs('some other ffmpeg noise')).toBeNull();
  });
});

describe('cutsToDecisionStream', () => {
  it('maps every cut to a transition_hard_cut event with the score as a param', () => {
    const stream = cutsToDecisionStream([{ tMs: 1833, sceneScore: 0.73 }]);
    expect(stream).toEqual([
      { family: 'transition_hard_cut', anchor: { kind: 'none', tMs: 1833 }, params: { sceneScore: 0.73 }, confidence: 1 },
    ]);
  });

  it('omits params when a cut has no score (never fabricates one)', () => {
    const stream = cutsToDecisionStream([{ tMs: 5000 }]);
    expect(stream[0].params).toEqual({});
    expect(stream[0].confidence).toBe(1);
  });
});

describe('detectCutsFfmpeg — orchestration', () => {
  const okRun: RunFfmpeg = async () => ({ code: 0, stdout: REAL_STDOUT, stderr: REAL_STDERR });

  it('returns cuts + duration + threshold from a successful run', async () => {
    const res = await detectCutsFfmpeg('/tmp/v.mp4', { runFfmpeg: okRun });
    expect(res.cuts).toHaveLength(4);
    expect(res.durationMs).toBe(22570);
    expect(res.sceneThreshold).toBe(DEFAULT_SCENE_THRESHOLD);
  });

  it('passes the scene threshold into the ffmpeg filter arg', async () => {
    const calls: string[][] = [];
    const spy: RunFfmpeg = async (args) => {
      calls.push(args);
      return { code: 0, stdout: REAL_STDOUT, stderr: REAL_STDERR };
    };
    await detectCutsFfmpeg('/tmp/v.mp4', { sceneThreshold: 0.45, runFfmpeg: spy });
    expect(calls[0].join(' ')).toContain("select='gt(scene,0.45)'");
    expect(calls[0]).toContain('/tmp/v.mp4');
  });

  it('fails loud on a non-zero ffmpeg exit (never returns [] silently)', async () => {
    const badRun: RunFfmpeg = async () => ({ code: 1, stdout: '', stderr: 'boom' });
    await expect(detectCutsFfmpeg('/tmp/v.mp4', { runFfmpeg: badRun })).rejects.toThrow(/ffmpeg scene detection failed/);
  });

  it('fails loud when the duration is unparseable (cannot trust the cut list)', async () => {
    const noDuration: RunFfmpeg = async () => ({ code: 0, stdout: REAL_STDOUT, stderr: 'no duration here' });
    await expect(detectCutsFfmpeg('/tmp/v.mp4', { runFfmpeg: noDuration })).rejects.toThrow(/no parseable Duration/);
  });
});
