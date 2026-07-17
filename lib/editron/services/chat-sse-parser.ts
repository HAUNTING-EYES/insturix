export interface ChatSseParseError {
  raw: string;
  message: string;
}

export interface ChatSseParseBatch<T> {
  events: T[];
  errors: ChatSseParseError[];
}

const EVENT_BOUNDARY = /(?:\r\n|\r|\n){2}/;
const MAX_PENDING_EVENT_CHARS = 8 * 1024 * 1024;

/**
 * Incrementally decodes JSON Server-Sent Events without assuming that network
 * chunks align with UTF-8 code points or SSE event boundaries.
 */
export class ChatSseJsonParser<T extends Record<string, unknown> = Record<string, unknown>> {
  private readonly decoder = new TextDecoder();
  private pending = '';

  push(chunk: Uint8Array): ChatSseParseBatch<T> {
    return this.consume(this.decoder.decode(chunk, { stream: true }), false);
  }

  finish(): ChatSseParseBatch<T> {
    return this.consume(this.decoder.decode(), true);
  }

  private consume(decoded: string, flush: boolean): ChatSseParseBatch<T> {
    this.pending += decoded;
    const events: T[] = [];
    const errors: ChatSseParseError[] = [];

    while (this.pending.length > 0) {
      const boundary = EVENT_BOUNDARY.exec(this.pending);
      if (!boundary || boundary.index === undefined) break;

      const block = this.pending.slice(0, boundary.index);
      this.pending = this.pending.slice(boundary.index + boundary[0].length);
      parseEventBlock<T>(block, events, errors);
    }

    if (flush && this.pending.trim()) {
      parseEventBlock<T>(this.pending, events, errors);
      this.pending = '';
    } else if (this.pending.length > MAX_PENDING_EVENT_CHARS) {
      errors.push({
        raw: this.pending.slice(0, 1_000),
        message: `SSE event exceeded ${MAX_PENDING_EVENT_CHARS} characters without a boundary.`,
      });
      this.pending = '';
    }

    return { events, errors };
  }
}

function parseEventBlock<T>(
  block: string,
  events: T[],
  errors: ChatSseParseError[],
): void {
  if (!block.trim()) return;

  const dataLines = block
    .split(/\r\n|\r|\n/)
    .filter((line) => line === 'data' || line.startsWith('data:'))
    .map((line) => {
      const value = line === 'data' ? '' : line.slice(5);
      return value.startsWith(' ') ? value.slice(1) : value;
    });

  if (!dataLines.length) return;

  const raw = dataLines.join('\n');
  try {
    events.push(JSON.parse(raw) as T);
  } catch (error: unknown) {
    errors.push({
      raw: raw.slice(0, 1_000),
      message: error instanceof Error ? error.message : 'Invalid JSON SSE event.',
    });
  }
}
