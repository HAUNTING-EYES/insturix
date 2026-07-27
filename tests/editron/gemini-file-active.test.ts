import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForGeminiFileActive } from '@/lib/editron/services/gemini-file-active';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('gemini file activation polling', () => {
  it('returns immediately when the upload result is already active', async () => {
    const getFile = vi.fn();

    const result = await waitForGeminiFileActive({
      fileManager: { getFile },
      fileName: 'files/ready',
      initialState: 'ACTIVE',
      label: 'test',
      sleep: async () => {},
    });

    expect(result).toMatchObject({ active: true, attempts: 0, waitedMs: 0 });
    expect(getFile).not.toHaveBeenCalled();
  });

  it('waits past the old 90s ceiling for medium and large Files API uploads', async () => {
    const states = [...Array(31).fill('PROCESSING'), 'ACTIVE'];
    const getFile = vi.fn(async () => ({ state: states.shift() ?? 'ACTIVE' }));

    const result = await waitForGeminiFileActive({
      fileManager: { getFile },
      fileName: 'files/slow-video',
      initialState: 'PROCESSING',
      label: 'test',
      fileSizeBytes: 150 * 1024 * 1024,
      sleep: async () => {},
    });

    expect(result.active).toBe(true);
    expect(result.waitedMs).toBeGreaterThan(90_000);
    expect(getFile).toHaveBeenCalledTimes(32);
  });

  it('times out with evidence instead of polling forever', async () => {
    vi.stubEnv('EDITRON_GEMINI_FILE_ACTIVE_TIMEOUT_MS', '35000');
    const getFile = vi.fn(async () => ({ state: 'PROCESSING' }));

    const result = await waitForGeminiFileActive({
      fileManager: { getFile },
      fileName: 'files/stuck',
      initialState: 'PROCESSING',
      label: 'test',
      sleep: async () => {},
    });

    expect(result).toMatchObject({
      active: false,
      state: 'PROCESSING',
      reason: 'timeout',
      waitedMs: 35_000,
    });
  });

  it('stops polling when Gemini reports a terminal failed file state', async () => {
    const getFile = vi.fn(async () => ({ state: 'FAILED' }));

    const result = await waitForGeminiFileActive({
      fileManager: { getFile },
      fileName: 'files/failed-video',
      initialState: 'PROCESSING',
      label: 'test',
      sleep: async () => {},
    });

    expect(result).toMatchObject({
      active: false,
      state: 'FAILED',
      reason: 'terminal-state',
      attempts: 1,
      waitedMs: 3_000,
    });
  });

  it('fails deterministically when Gemini omits the file name needed for polling', async () => {
    const result = await waitForGeminiFileActive({
      fileManager: { getFile: vi.fn() },
      initialState: 'PROCESSING',
      label: 'test',
      sleep: async () => {},
    });

    expect(result).toEqual({
      active: false,
      state: 'PROCESSING',
      attempts: 0,
      waitedMs: 0,
      reason: 'missing-file-name',
    });
  });
});