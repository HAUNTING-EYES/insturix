/**
 * Streaming blocks hook for SSE block generation.
 * 
 * Handles Server-Sent Events (SSE) streaming for incremental block generation
 * with validation and reconnection support.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { BlockTree } from "../schemas/canonical";
import { validateBlockTree } from "../schemas/canonical";

interface StreamingEvent {
  event: "block_start" | "block_chunk" | "block_end" | "error" | "done";
  block?: any;
  blockId?: string;
  chunk?: string;
  message?: string;
}

interface UseStreamingBlocksOptions {
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

interface UseStreamingBlocksResult {
  blocks: BlockTree;
  isStreaming: boolean;
  error: Error | null;
}

/**
 * React hook for handling SSE streaming of block generation.
 * 
 * @param url - SSE endpoint URL
 * @param options - Optional callbacks
 * @returns Streaming state and blocks
 */
export function useStreamingBlocks(
  url: string | null,
  options?: UseStreamingBlocksOptions
): UseStreamingBlocksResult {
  const [blocks, setBlocks] = useState<BlockTree>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs for managing streaming state
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 3;
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Block reconstruction state
  const currentBlockRef = useRef<{
    id: string;
    chunks: string[];
    blockData?: any;
  } | null>(null);

  // Parse SSE event
  const parseSSEEvent = useCallback((event: MessageEvent): StreamingEvent | null => {
    try {
      const data = JSON.parse(event.data || "{}");
      return {
        event: event.type as StreamingEvent["event"],
        ...data,
      };
    } catch (e) {
      // Handle heartbeat (no data)
      if (event.type === "message" && !event.data) {
        return null; // Heartbeat, ignore
      }
      return null;
    }
  }, []);

  // Handle block start
  const handleBlockStart = useCallback((event: StreamingEvent) => {
    if (event.block) {
      currentBlockRef.current = {
        id: event.block.id || `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        chunks: [],
        blockData: event.block,
      };
    }
  }, []);

  // Handle block chunk
  const handleBlockChunk = useCallback((event: StreamingEvent) => {
    if (currentBlockRef.current && event.chunk) {
      currentBlockRef.current.chunks.push(event.chunk);
    }
  }, []);

  // Handle block end
  const handleBlockEnd = useCallback((event: StreamingEvent) => {
    if (!currentBlockRef.current) {
      return;
    }

    try {
      // Reconstruct block from chunks
      const chunkText = currentBlockRef.current.chunks.join("");
      let block: any;

      if (currentBlockRef.current.blockData) {
        // Use block data if available
        block = currentBlockRef.current.blockData;
      } else if (chunkText) {
        // Parse from chunks
        block = JSON.parse(chunkText);
      } else {
        return; // No block data
      }

      // Ensure block has ID
      if (!block.id) {
        block.id = currentBlockRef.current.id;
      }

      // Validate block before adding (fail-closed)
      const validatedBlock = validateBlockTree([block])[0];

      // Add block to state (incremental update, not full re-render)
      setBlocks((prevBlocks) => {
        // Check if block already exists (by ID)
        const existingIndex = prevBlocks.findIndex((b) => b.id === validatedBlock.id);
        if (existingIndex >= 0) {
          // Update existing block
          const newBlocks = [...prevBlocks];
          newBlocks[existingIndex] = validatedBlock;
          return newBlocks;
        } else {
          // Add new block
          return [...prevBlocks, validatedBlock];
        }
      });

      // Reset current block
      currentBlockRef.current = null;
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      setError(error);
      if (options?.onError) {
        options.onError(error);
      }
    }
  }, [options]);

  // Handle error event
  const handleErrorEvent = useCallback((event: StreamingEvent) => {
    const errorMessage = event.message || "Streaming error";
    const error = new Error(errorMessage);
    setError(error);
    setIsStreaming(false);
    if (options?.onError) {
      options.onError(error);
    }
  }, [options]);

  // Handle done event
  const handleDone = useCallback(() => {
    setIsStreaming(false);
    if (options?.onComplete) {
      options.onComplete();
    }
  }, [options]);

  // Connect to SSE stream
  const connect = useCallback(() => {
    if (!url) {
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Reset state
    setError(null);
    setIsStreaming(true);
    reconnectAttemptsRef.current = 0;

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      // Handle message events
      eventSource.addEventListener("block_start", (e: MessageEvent) => {
        const event = parseSSEEvent(e);
        if (event) {
          handleBlockStart(event);
        }
      });

      eventSource.addEventListener("block_chunk", (e: MessageEvent) => {
        const event = parseSSEEvent(e);
        if (event) {
          handleBlockChunk(event);
        }
      });

      eventSource.addEventListener("block_end", (e: MessageEvent) => {
        const event = parseSSEEvent(e);
        if (event) {
          handleBlockEnd(event);
        }
      });

      eventSource.addEventListener("error", (e: MessageEvent) => {
        const event = parseSSEEvent(e);
        if (event) {
          handleErrorEvent(event);
        }
      });

      eventSource.addEventListener("done", () => {
        handleDone();
      });

      // Handle connection errors
      eventSource.onerror = () => {
        eventSource.close();

        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 5000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          // Max reconnection attempts reached
          setError(new Error("Failed to connect after multiple attempts"));
          setIsStreaming(false);
        }
      };

      // Handle heartbeat (no event type)
      eventSource.onmessage = (e: MessageEvent) => {
        // Heartbeat events have no data or type
        if (!e.data && !e.type) {
          return; // Ignore heartbeat
        }
      };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      setError(error);
      setIsStreaming(false);
    }
  }, [url, parseSSEEvent, handleBlockStart, handleBlockChunk, handleBlockEnd, handleErrorEvent, handleDone]);

  // Connect on mount or URL change
  useEffect(() => {
    if (url) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [url, connect]);

  return {
    blocks,
    isStreaming,
    error,
  };
}

