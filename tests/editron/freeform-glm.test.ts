import { describe, expect, it, vi } from 'vitest';

import {
  createOllamaFreeformClient,
  stripCodeFence,
} from '../../lib/editron/freeform-glm/ollama-client';
import type {
  FetchLike,
  FreeformGlmChatRequest,
  FreeformGlmChatResult,
  FreeformGlmClient,
} from '../../lib/editron/freeform-glm/ollama-client';
import {
  generateFreeformRemotionScene,
  validateGeneratedScene,
} from '../../lib/editron/freeform-glm/generate-scene';
import {
  editTracedElementWithGlm,
  validateTracedElementEdit,
} from '../../lib/editron/freeform-glm/edit-element';

type FetchMockArgs = [input: Parameters<FetchLike>[0], init?: Parameters<FetchLike>[1]];

describe('freeform GLM Ollama client', () => {
  it('sends non-streaming Ollama requests with thinking disabled', async () => {
    const fetchMock = vi.fn<FetchMockArgs, ReturnType<FetchLike>>(async () => new Response(JSON.stringify({
      message: { content: '```tsx\nexport const Scene = () => <div />;\n```' },
      done_reason: 'stop',
    }), { status: 200 }));
    const client = createOllamaFreeformClient({
      endpoint: 'http://ollama.test',
      model: 'glm-test',
      fetchImpl: fetchMock as unknown as FetchLike,
    });

    const result = await client.chatCode({
      messages: [{ role: 'user', content: 'make code' }],
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.content : '').toBe('export const Scene = () => <div />;');
    const fetchCall = fetchMock.mock.calls[0]!;
    const request = JSON.parse(String(fetchCall[1]?.body));
    expect(fetchCall[0]).toBe('http://ollama.test/api/chat');
    expect(request).toMatchObject({
      model: 'glm-test',
      stream: false,
      think: false,
      options: { temperature: 0.2, num_predict: 2400 },
    });
  });

  it('strips fenced code without keeping surrounding prose', () => {
    expect(stripCodeFence('Here:\n```tsx\n<div />\n```\nDone')).toBe('<div />');
  });
});

describe('freeform GLM scene validation', () => {
  it('accepts a compact traceable Remotion scene', () => {
    const validation = validateGeneratedScene(validSceneCode(), { filename: 'Scene.tsx' });

    expect(validation.ok).toBe(true);
    expect(validation.elementCount).toBeGreaterThanOrEqual(6);
    expect(validation.facts).toMatchObject({
      hasRemotionImport: true,
      hasExportedComponent: true,
      usesFrame: true,
      usesConfig: true,
      usesAnimationPrimitive: true,
      usesSequencePrimitive: true,
    });
  });

  it('rejects unsafe runtime access and model-owned trace attributes', () => {
    const validation = validateGeneratedScene(
      validSceneCode()
        .replace('<section', '<section data-eid="model_owned"')
        .replace('const opacity =', 'fetch("/leak"); const opacity ='),
    );

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['dangerous_network_fetch', 'model_owned_trace_attrs']),
    );
  });
});

describe('freeform GLM scene generation', () => {
  it('repairs invalid GLM scene output once', async () => {
    const client = scriptedClient([
      'import { AbsoluteFill } from remotion;\nexport const Scene = () => <AbsoluteFill />;',
      validSceneCode(),
    ]);

    const result = await generateFreeformRemotionScene({
      brief: 'Launch board',
      maxRepairAttempts: 1,
    }, client);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.repaired : false).toBe(true);
    expect(client.chatCode).toHaveBeenCalledTimes(2);
  });

  it('fails closed when generation and repair are invalid', async () => {
    const client = scriptedClient([
      'export const Scene = () => <div />;',
      'export const Scene = () => <span />;',
    ]);

    const result = await generateFreeformRemotionScene({
      brief: 'Too small',
      maxRepairAttempts: 1,
    }, client);

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toContain('failed validation');
  });
});

describe('freeform GLM element edits', () => {
  it('accepts a traced element edit that preserves the root marker', () => {
    const validation = validateTracedElementEdit(
      '<h1 data-eid="hero_title" data-source-loc="Scene.tsx:12:4" style={{ color: "white" }}>Ship Faster</h1>',
      {
        marker: { eid: 'hero_title', sourceLoc: 'Scene.tsx:12:4' },
        expectedTagName: 'h1',
      },
    );

    expect(validation.ok).toBe(true);
    expect(validation.rootTagName).toBe('h1');
  });

  it('repairs invalid element edits that dropped trace attributes', async () => {
    const client = scriptedClient([
      '<h1>Ship Faster</h1>',
      '<h1 data-eid="hero_title" data-source-loc="Scene.tsx:12:4">Ship Faster</h1>',
    ]);

    const result = await editTracedElementWithGlm({
      elementCode: '<h1 data-eid="hero_title" data-source-loc="Scene.tsx:12:4">Old</h1>',
      instruction: 'Make the title punchier',
      marker: { eid: 'hero_title', sourceLoc: 'Scene.tsx:12:4' },
      expectedTagName: 'h1',
      maxRepairAttempts: 1,
    }, client);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.repaired : false).toBe(true);
    expect(client.chatCode).toHaveBeenCalledTimes(2);
  });
});

function scriptedClient(outputs: string[]) {
  const queue = [...outputs];
  const chatCode = vi.fn<[FreeformGlmChatRequest], Promise<FreeformGlmChatResult>>(async () => ({
    ok: true as const,
    content: queue.shift() ?? '',
    raw: {},
  }));

  return { chatCode } satisfies FreeformGlmClient & { chatCode: typeof chatCode };
}

function validSceneCode(): string {
  return `
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export const EditronProbeScene = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(frame, [0, durationInFrames - 1], [0.2, 1]);
  const y = interpolate(frame, [0, 30], [24, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#101820', color: 'white', fontFamily: 'Inter, sans-serif' }}>
      <section style={{ padding: 72, opacity }}>
        <Sequence from={0}>
          <div style={{ transform: 'translateY(' + y + 'px)' }}>
            <p style={{ letterSpacing: 2 }}>EDITRON</p>
            <h1>Freeform scenes, safely traced</h1>
            <div style={{ display: 'flex', gap: 16 }}>
              <span>Trace</span>
              <span>Edit</span>
              <span>Render</span>
            </div>
          </div>
        </Sequence>
      </section>
    </AbsoluteFill>
  );
};
`;
}
