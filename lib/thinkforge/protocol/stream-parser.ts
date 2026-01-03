/**
 * Stream Parser - Parse AI output streams for protocol tags
 * 
 * Processes agent output streams to extract:
 * - Script updates (<script_update> tags)
 * - Thinking content (<thinking> tags)
 * - Clean chat responses
 * 
 * AI output is untrusted input - this parser validates and sanitizes.
 */

import { OUTPUT_TAGS, extractScriptUpdate, stripThinking, hasScriptUpdate } from './output-tags';

/**
 * Result of parsing a complete AI response
 */
export interface ParsedResponse {
  /** Clean text response (without tags) */
  text: string;
  /** Script content if found */
  scriptUpdate: string | null;
  /** Whether a script update was present */
  hasScriptUpdate: boolean;
  /** Thinking/reasoning content if found */
  thinking: string | null;
  /** Raw unparsed content */
  raw: string;
}

/**
 * Parse a complete AI response string
 */
export function parseResponse(content: string): ParsedResponse {
  const scriptUpdate = extractScriptUpdate(content);
  const thinkingMatch = content.match(
    new RegExp(`${escapeRegex(OUTPUT_TAGS.THINKING.open)}([\\s\\S]*?)${escapeRegex(OUTPUT_TAGS.THINKING.close)}`)
  );
  
  // Remove all tags to get clean text
  let text = content;
  
  // Remove thinking tags
  text = stripThinking(text);
  
  // Remove script_update tags (content goes elsewhere)
  text = text.replace(
    new RegExp(`${escapeRegex(OUTPUT_TAGS.SCRIPT_UPDATE.open)}[\\s\\S]*?${escapeRegex(OUTPUT_TAGS.SCRIPT_UPDATE.close)}`),
    ''
  );
  
  // Remove metadata tags
  text = text.replace(
    new RegExp(`${escapeRegex(OUTPUT_TAGS.METADATA.open)}[\\s\\S]*?${escapeRegex(OUTPUT_TAGS.METADATA.close)}`),
    ''
  );
  
  return {
    text: text.trim(),
    scriptUpdate,
    hasScriptUpdate: scriptUpdate !== null,
    thinking: thinkingMatch ? thinkingMatch[1].trim() : null,
    raw: content,
  };
}

/**
 * State for streaming parser
 */
interface StreamParserState {
  buffer: string;
  scriptUpdateStarted: boolean;
  scriptUpdateContent: string;
  thinkingStarted: boolean;
  thinkingContent: string;
}

/**
 * Streaming parser that processes chunks incrementally
 */
export class StreamParser {
  private state: StreamParserState = {
    buffer: '',
    scriptUpdateStarted: false,
    scriptUpdateContent: '',
    thinkingStarted: false,
    thinkingContent: '',
  };
  
  /**
   * Process a chunk of streaming data
   * Returns text to display (without tags being accumulated)
   */
  processChunk(chunk: string): {
    displayText: string;
    scriptUpdateInProgress: boolean;
    scriptUpdateComplete: boolean;
  } {
    this.state.buffer += chunk;
    
    let displayText = '';
    let scriptUpdateComplete = false;
    
    // Check for script_update start
    if (!this.state.scriptUpdateStarted) {
      const startIndex = this.state.buffer.indexOf(OUTPUT_TAGS.SCRIPT_UPDATE.open);
      if (startIndex !== -1) {
        // Output text before the tag
        displayText += this.state.buffer.slice(0, startIndex);
        this.state.buffer = this.state.buffer.slice(startIndex + OUTPUT_TAGS.SCRIPT_UPDATE.open.length);
        this.state.scriptUpdateStarted = true;
      }
    }
    
    // If we're inside a script_update, look for the end
    if (this.state.scriptUpdateStarted) {
      const endIndex = this.state.buffer.indexOf(OUTPUT_TAGS.SCRIPT_UPDATE.close);
      if (endIndex !== -1) {
        // Found the end
        this.state.scriptUpdateContent += this.state.buffer.slice(0, endIndex);
        this.state.buffer = this.state.buffer.slice(endIndex + OUTPUT_TAGS.SCRIPT_UPDATE.close.length);
        this.state.scriptUpdateStarted = false;
        scriptUpdateComplete = true;
      } else {
        // Still accumulating
        this.state.scriptUpdateContent += this.state.buffer;
        this.state.buffer = '';
      }
    } else {
      // Not in a tag - this is display text
      // But check for partial tag starts to avoid cutting tags
      const partialTagCheck = this.checkPartialTag(this.state.buffer);
      if (partialTagCheck.safeLength > 0) {
        displayText += this.state.buffer.slice(0, partialTagCheck.safeLength);
        this.state.buffer = this.state.buffer.slice(partialTagCheck.safeLength);
      }
    }
    
    // Strip thinking tags from display text
    displayText = stripThinking(displayText);
    
    return {
      displayText,
      scriptUpdateInProgress: this.state.scriptUpdateStarted,
      scriptUpdateComplete,
    };
  }
  
  /**
   * Check for partial tag at end of buffer
   * Returns how much of the buffer is safe to output
   */
  private checkPartialTag(buffer: string): { safeLength: number; potentialTag: boolean } {
    const tags = [
      OUTPUT_TAGS.SCRIPT_UPDATE.open,
      OUTPUT_TAGS.THINKING.open,
      OUTPUT_TAGS.METADATA.open,
    ];
    
    // Check if buffer ends with start of any tag
    for (const tag of tags) {
      for (let i = 1; i < tag.length; i++) {
        const partial = tag.slice(0, i);
        if (buffer.endsWith(partial)) {
          return {
            safeLength: buffer.length - partial.length,
            potentialTag: true,
          };
        }
      }
    }
    
    return { safeLength: buffer.length, potentialTag: false };
  }
  
  /**
   * Get accumulated script update content
   */
  getScriptUpdate(): string | null {
    return this.state.scriptUpdateContent || null;
  }
  
  /**
   * Get final result after stream ends
   */
  finalize(): ParsedResponse {
    // Flush any remaining buffer
    const remaining = this.state.buffer;
    this.state.buffer = '';
    
    const fullContent = remaining + 
      (this.state.scriptUpdateContent ? OUTPUT_TAGS.SCRIPT_UPDATE.open + this.state.scriptUpdateContent + OUTPUT_TAGS.SCRIPT_UPDATE.close : '');
    
    return parseResponse(fullContent);
  }
  
  /**
   * Reset parser state
   */
  reset(): void {
    this.state = {
      buffer: '',
      scriptUpdateStarted: false,
      scriptUpdateContent: '',
      thinkingStarted: false,
      thinkingContent: '',
    };
  }
}

/**
 * Create a transform stream that parses agent output
 */
export function createParsingStream(): {
  writable: WritableStream<string>;
  readable: ReadableStream<string>;
  getResult: () => ParsedResponse | null;
} {
  const parser = new StreamParser();
  let finalResult: ParsedResponse | null = null;
  let fullText = '';
  
  const { readable, writable } = new TransformStream<string, string>({
    transform(chunk, controller) {
      fullText += chunk;
      const result = parser.processChunk(chunk);
      if (result.displayText) {
        controller.enqueue(result.displayText);
      }
    },
    flush(controller) {
      finalResult = parseResponse(fullText);
    },
  });
  
  return {
    writable,
    readable,
    getResult: () => finalResult,
  };
}

/**
 * Async generator that parses a stream and yields display text
 */
export async function* parseStream(
  stream: AsyncGenerator<string, void, unknown>
): AsyncGenerator<string, ParsedResponse, unknown> {
  const parser = new StreamParser();
  let fullText = '';
  
  for await (const chunk of stream) {
    fullText += chunk;
    const result = parser.processChunk(chunk);
    if (result.displayText) {
      yield result.displayText;
    }
  }
  
  return parseResponse(fullText);
}

/**
 * Helper to escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
