import { describe, expect, it } from 'vitest';

import {
  beginChatAiEditTransaction,
  completeChatAiEditTransaction,
  isSuccessfulToolResult,
  mutatingSuccessfulToolNames,
} from '@/lib/editron/agent/chat-ai-edit-transactions';

describe('chat AI edit transactions', () => {
  it('detects only successful mutating chat tools', () => {
    expect(mutatingSuccessfulToolNames([
      { toolName: 'read_project_file', result: JSON.stringify({ status: 'success', data: {} }) },
      { toolName: 'add_overlay', result: JSON.stringify({ status: 'success', data: { id: 1 } }) },
      { toolName: 'delete_overlay', result: JSON.stringify({ status: 'error', error: { message: 'nope' } }) },
      { toolName: 'find_transcript_moment', result: JSON.stringify({ status: 'success', data: {} }) },
    ])).toEqual(['add_overlay']);
  });

  it('parses legacy and envelope tool result success deterministically', () => {
    expect(isSuccessfulToolResult(JSON.stringify({ status: 'success', data: {} }))).toBe(true);
    expect(isSuccessfulToolResult(JSON.stringify({ status: 'error', error: { message: 'bad' } }))).toBe(false);
    expect(isSuccessfulToolResult('Error: failed')).toBe(false);
    expect(isSuccessfulToolResult('plain legacy success')).toBe(true);
  });

  it('does not create checkpoints for read-only or failed tool results', async () => {
    const calls: unknown[] = [];
    const transaction = beginChatAiEditTransaction({
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: [{ id: 1, type: 'text', from: 0, durationInFrames: 30 } as any],
    });

    const summary = await completeChatAiEditTransaction({
      transaction,
      toolResults: [
        { toolName: 'get_timeline_view', result: JSON.stringify({ status: 'success', data: {} }) },
        { toolName: 'cut_section', result: JSON.stringify({ status: 'error', error: { message: 'bad range' } }) },
      ],
      checkpointStore: {
        createCheckpoint: async (input: any) => {
          calls.push(input);
          return { ...input, checkpointId: `ckpt_${calls.length}`, timestamp: new Date(), createdAt: new Date() };
        },
      },
      loadProject: async () => ({ overlays: [] } as any),
    });

    expect(summary).toEqual({
      status: 'not-needed',
      mutatingToolNames: [],
      checkpointIds: [],
    });
    expect(calls).toEqual([]);
  });

  it('creates before and after checkpoints around successful mutating tool batches', async () => {
    const calls: any[] = [];
    const beforeOverlay = { id: 1, type: 'text', from: 0, durationInFrames: 30, content: 'before' } as any;
    const afterOverlay = { ...beforeOverlay, content: 'after' };
    const transaction = beginChatAiEditTransaction({
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: [beforeOverlay],
    });
    beforeOverlay.content = 'mutated after snapshot';

    const summary = await completeChatAiEditTransaction({
      transaction,
      toolResults: [
        { toolName: 'add_overlay', result: JSON.stringify({ status: 'success', data: { id: 2 } }) },
        { toolName: 'update_overlay', result: JSON.stringify({ status: 'success', data: { id: 1 } }) },
      ],
      checkpointStore: {
        createCheckpoint: async (input: any) => {
          calls.push(input);
          return { ...input, checkpointId: `ckpt_${input.type}`, timestamp: new Date(), createdAt: new Date() };
        },
      },
      loadProject: async () => ({ overlays: [afterOverlay] } as any),
    });

    expect(summary).toMatchObject({
      status: 'created',
      mutatingToolNames: ['add_overlay', 'update_overlay'],
      checkpointIds: ['ckpt_before-llm', 'ckpt_after-llm'],
      beforeCheckpointId: 'ckpt_before-llm',
      afterCheckpointId: 'ckpt_after-llm',
    });
    expect(calls.map((call) => call.type)).toEqual(['before-llm', 'after-llm']);
    expect(calls[0].overlays).toEqual([{ ...beforeOverlay, content: 'before' }]);
    expect(calls[1].overlays).toEqual([afterOverlay]);
  });
});