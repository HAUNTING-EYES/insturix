import { describe, expect, it } from 'vitest';

import { ChatSseJsonParser } from '@/lib/editron/services/chat-sse-parser';

interface TestEvent extends Record<string, unknown> {
  type: string;
  content?: string;
}

const encoder = new TextEncoder();

function parseChunks(chunks: Uint8Array[]) {
  const parser = new ChatSseJsonParser<TestEvent>();
  const events: TestEvent[] = [];
  const errors: Array<{ message: string }> = [];
  for (const chunk of chunks) {
    const result = parser.push(chunk);
    events.push(...result.events);
    errors.push(...result.errors);
  }
  const final = parser.finish();
  events.push(...final.events);
  errors.push(...final.errors);
  return { events, errors };
}

describe('ChatSseJsonParser', () => {
  it('produces identical events at every possible byte split', () => {
    const raw = [
      'data: {"type":"token","content":"namaste \u{1F64F}"}\n\n',
      'data: {"type":"tool_start","tool":"add_overlay","id":"1"}\n\n',
      'data: {"type":"done","tokensUsed":42}\n\n',
    ].join('');
    const bytes = encoder.encode(raw);
    const expected = parseChunks([bytes]);
    expect(expected.errors).toEqual([]);

    for (let split = 1; split < bytes.length; split += 1) {
      expect(parseChunks([bytes.slice(0, split), bytes.slice(split)])).toEqual(expected);
    }
  });

  it('preserves UTF-8 and event framing when every byte arrives separately', () => {
    const raw = [
      'data: {"type":"token","content":"\u0915\u0940\u092e\u0924 \u0906\u0938\u093e\u0928 \u0939\u0948"}\r\n\r\n',
      'data: {"type":"token","content":"Hinglish bhi"}\r\n\r\n',
    ].join('');
    const bytes = encoder.encode(raw);
    const result = parseChunks(Array.from(bytes, (byte) => Uint8Array.of(byte)));

    expect(result.errors).toEqual([]);
    expect(result.events).toEqual([
      { type: 'token', content: '\u0915\u0940\u092e\u0924 \u0906\u0938\u093e\u0928 \u0939\u0948' },
      { type: 'token', content: 'Hinglish bhi' },
    ]);
  });

  it('dispatches a final event without a trailing blank line', () => {
    const result = parseChunks([
      encoder.encode('data: {"type":"done","tokensUsed":12}'),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.events).toEqual([{ type: 'done', tokensUsed: 12 }]);
  });

  it('supports SSE comments and multi-line data fields', () => {
    const result = parseChunks([
      encoder.encode(': heartbeat\ndata: {"type":"token",\ndata: "content":"hello"}\n\n'),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.events).toEqual([{ type: 'token', content: 'hello' }]);
  });

  it('reports malformed JSON instead of silently dropping the event', () => {
    const result = parseChunks([
      encoder.encode('data: {"type":"token",oops}\n\n'),
    ]);

    expect(result.events).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/JSON|property/i);
  });
});
