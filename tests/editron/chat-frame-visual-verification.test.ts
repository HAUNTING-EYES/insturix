import { describe, expect, it, vi } from 'vitest';

import type { ChatFrameEvidence } from '@/lib/editron/agent/chat-frame-evidence';
import { verifyChatFrameVisualMatch } from '@/lib/editron/services/chat-frame-visual-verification';

const JPEG_DATA_URL = `data:image/jpeg;base64,${Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
]).toString('base64')}`;

function evidence(overrides: Partial<ChatFrameEvidence> = {}): ChatFrameEvidence {
  return {
    frame: 549,
    question: 'Verify canonical visual match for: garment sketch being measured',
    dataUrl: JPEG_DATA_URL,
    width: 960,
    height: 540,
    capturedAtMs: 1_000_000,
    source: 'editor-rendered-frame',
    ...overrides,
  };
}

describe('chat frame visual verification', () => {
  it('returns an auditable confirmation with normalized placement', async () => {
    const generate = vi.fn(async () => JSON.stringify({
      targetVisible: true,
      matchQuality: 'clear-semantic',
      evidence: 'A hand uses a ruler on a garment sketch.',
      reasoning: 'The ruler, hand, and sketch are directly visible.',
      boundingBox: { x: 0.18, y: 0.2, width: 0.62, height: 0.55 },
    }));

    const result = await verifyChatFrameVisualMatch({
      query: 'garment sketch being measured',
      evidence: evidence(),
      candidateContext: 'sketchbook, ruler, hand, marker',
    }, {
      generate,
      model: 'test-vision-model',
    });

    expect(result).toMatchObject({
      status: 'confirmed',
      frame: 549,
      frames: [549],
      query: 'garment sketch being measured',
      provider: 'gemini',
      model: 'test-vision-model',
      matchQuality: 'clear-semantic',
      boundingBox: {
        x: 0.18,
        y: 0.2,
        width: 0.62,
        height: 0.55,
        units: 'normalized',
      },
    });
    expect(result.receiptId).toMatch(/^frame-visual-[a-f0-9]{24}$/);
    expect(generate).toHaveBeenCalledOnce();
  });

  it('rejects related-but-unconfirmed pixels and never returns placement', async () => {
    const result = await verifyChatFrameVisualMatch({
      query: 'garment sketch being measured',
      evidence: evidence(),
    }, {
      generate: async () => JSON.stringify({
        targetVisible: false,
        matchQuality: 'partial',
        evidence: 'A sketch is visible, but no measuring action is visible.',
        reasoning: 'The requested action is not directly shown.',
        boundingBox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      }),
    });

    expect(result).toMatchObject({
      status: 'rejected',
      matchQuality: 'partial',
    });
    expect(result.boundingBox).toBeUndefined();
  });

  it('retries one malformed provider response within the same verification deadline', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce('not-json')
      .mockResolvedValueOnce(JSON.stringify({
        targetVisible: true,
        matchQuality: 'exact',
        evidence: 'The garment sketch and measuring ruler are directly visible.',
        reasoning: 'The requested object and action are both present in the frame.',
      }));

    const result = await verifyChatFrameVisualMatch({
      query: 'garment sketch being measured',
      evidence: evidence(),
    }, { generate });

    expect(result.status).toBe('confirmed');
    expect(generate).toHaveBeenNthCalledWith(1, expect.any(Array), 1);
    expect(generate).toHaveBeenNthCalledWith(2, expect.any(Array), 2);
  });

  it('verifies temporal events from ordered rendered frames and receipts every frame', async () => {
    const generate = vi.fn(async (parts: Array<{ text?: string; inlineData?: unknown }>) => {
      expect(parts[0]?.text).toContain('chronological sequence');
      expect(parts.filter((part) => part.inlineData)).toHaveLength(3);
      return JSON.stringify({
        targetVisible: true,
        matchQuality: 'exact',
        evidence: 'The subject grows smaller while more of the artisan and workspace become visible.',
        reasoning: 'Across the ordered frames, the camera visibly pulls back from macro to medium framing.',
      });
    });

    const result = await verifyChatFrameVisualMatch({
      query: 'camera pulls back from a macro view to reveal the artisan',
      evidence: evidence({
        frame: 443,
        question: 'Verify canonical visual match for: camera pulls back from a macro view to reveal the artisan',
        contextFrames: [
          { frame: 412, dataUrl: JPEG_DATA_URL, width: 960, height: 540 },
          { frame: 472, dataUrl: JPEG_DATA_URL, width: 960, height: 540 },
        ],
      }),
    }, { generate });

    expect(result).toMatchObject({
      status: 'confirmed',
      frame: 443,
      frames: [412, 443, 472],
      matchQuality: 'exact',
    });
    expect(result.receiptId).toMatch(/^frame-visual-[a-f0-9]{24}$/);
  });

  it('fails after two malformed responses without leaking provider output', async () => {
    const sensitiveProviderOutput = 'not-json-secret-provider-payload';
    const generate = vi.fn(async () => sensitiveProviderOutput);

    let failure: unknown;
    try {
      await verifyChatFrameVisualMatch({
        query: 'garment sketch being measured',
        evidence: evidence(),
      }, { generate });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('after 2 attempt(s)');
    expect((failure as Error).message).toContain('sha256=');
    expect((failure as Error).message).not.toContain(sensitiveProviderOutput);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('refuses evidence captured for a different query', async () => {
    await expect(verifyChatFrameVisualMatch({
      query: 'a bird flying',
      evidence: evidence(),
    }, {
      generate: vi.fn(),
    })).rejects.toThrow('different visual query');
  });
});
