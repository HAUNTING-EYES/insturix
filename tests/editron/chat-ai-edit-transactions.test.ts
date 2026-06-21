import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  beginChatAiEditTransaction,
  completeChatAiEditTransaction,
  formatChatAiEditRestoreTargetForPrompt,
  resolveChatAiEditRestoreTarget,
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

  it('keeps checkpoint ID slots typed when one checkpoint is skipped', async () => {
    const transaction = beginChatAiEditTransaction({
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: [{ id: 1, type: 'text', from: 0, durationInFrames: 30 } as any],
    });

    const summary = await completeChatAiEditTransaction({
      transaction,
      toolResults: [
        { toolName: 'add_overlay', result: JSON.stringify({ status: 'success', data: { id: 2 } }) },
      ],
      checkpointStore: {
        createCheckpoint: async (input: any) => {
          if (input.type === 'before-llm') return null;
          return { ...input, checkpointId: `ckpt_${input.type}`, timestamp: new Date(), createdAt: new Date() };
        },
      },
      loadProject: async () => ({ overlays: [{ id: 2, type: 'text', from: 30, durationInFrames: 30 }] } as any),
    });

    expect(summary).toMatchObject({
      status: 'created',
      checkpointIds: ['', 'ckpt_after-llm'],
      afterCheckpointId: 'ckpt_after-llm',
    });
    expect(summary.beforeCheckpointId).toBeUndefined();
  });

  it('resolves undo and redo restore targets from the latest AI edit checkpoint', () => {
    const history = [
      {
        role: 'assistant',
        content: 'Added title',
        checkpointIds: ['ckpt_old_before', 'ckpt_old_after'],
        toolResults: [{ toolName: 'add_overlay', result: JSON.stringify({ status: 'success' }) }],
      },
      { role: 'user', content: 'thanks' },
      {
        role: 'assistant',
        content: 'Trimmed the pause',
        checkpointIds: ['ckpt_latest_before', 'ckpt_latest_after'],
        toolResults: [{ toolName: 'cut_section', result: JSON.stringify({ status: 'success' }) }],
      },
    ];

    const undo = resolveChatAiEditRestoreTarget(history, { userMessage: 'undo that AI edit' });
    const redo = resolveChatAiEditRestoreTarget(history, { userMessage: 'redo that edit' });

    expect(undo).toMatchObject({
      status: 'ready',
      action: 'undo',
      checkpointId: 'ckpt_latest_before',
      mutatingToolNames: ['cut_section'],
      useWith: {
        restore_ai_edit_checkpoint: { checkpointId: 'ckpt_latest_before' },
      },
    });
    expect(redo).toMatchObject({
      status: 'ready',
      action: 'redo',
      checkpointId: 'ckpt_latest_after',
    });
    expect(formatChatAiEditRestoreTargetForPrompt(undo)).toContain('checkpointId=ckpt_latest_before');
    expect(formatChatAiEditRestoreTargetForPrompt(undo)).toContain('Call restore_ai_edit_checkpoint');
  });

  it('resolves redo after an undo restore back to the state before that restore', () => {
    const history = [{
      role: 'assistant',
      content: 'Restored the previous checkpoint',
      checkpointIds: ['ckpt_before_restore', 'ckpt_after_restore'],
      toolResults: [{ toolName: 'restore_ai_edit_checkpoint', result: JSON.stringify({ status: 'success' }) }],
    }];

    const redo = resolveChatAiEditRestoreTarget(history, { userMessage: 'redo it' });

    expect(redo).toMatchObject({
      status: 'ready',
      action: 'redo',
      checkpointId: 'ckpt_before_restore',
      mutatingToolNames: ['restore_ai_edit_checkpoint'],
    });
  });

  it('refuses undo when no safe checkpoint target exists', () => {
    const noCheckpoint = resolveChatAiEditRestoreTarget([], { userMessage: 'undo that AI edit' });
    const missingTarget = resolveChatAiEditRestoreTarget([{
      role: 'assistant',
      content: 'Created an edit with only an after snapshot',
      checkpointIds: ['', 'ckpt_after_only'],
      toolResults: [{ toolName: 'add_overlay', result: JSON.stringify({ status: 'success' }) }],
    }], { userMessage: 'undo that AI edit' });

    expect(noCheckpoint).toMatchObject({
      status: 'no-checkpoint',
      action: 'undo',
    });
    expect(noCheckpoint.useWith).toBeUndefined();
    expect(missingTarget).toMatchObject({
      status: 'missing-target',
      action: 'undo',
      afterCheckpointId: 'ckpt_after_only',
    });
    expect(missingTarget.useWith).toBeUndefined();
  });
  it('keeps the live chat stream route wired to the restore resolver context', () => {
    const source = readFileSync(join(process.cwd(), 'app/api/services/editron/chat/stream/route.ts'), 'utf8');

    expect(source).toContain('resolveChatAiEditRestoreTarget');
    expect(source).toContain('formatChatAiEditRestoreTargetForPrompt');
    expect(source).toContain('const restoreTarget = resolveChatAiEditRestoreTarget(history, { userMessage: message });');
    expect(source).toContain('const restoreTargetPrompt = formatChatAiEditRestoreTargetForPrompt(restoreTarget);');
    expect(source).toContain('contextMessage += `\\n\\n${restoreTargetPrompt}`;');
    expect(source.indexOf('formatChatEditContextForPrompt(chatEditContext)')).toBeLessThan(
      source.indexOf('resolveChatAiEditRestoreTarget(history, { userMessage: message })'),
    );
    expect(source.indexOf('resolveChatAiEditRestoreTarget(history, { userMessage: message })')).toBeLessThan(
      source.indexOf('contextMessage += `\\n\\n${restoreTargetPrompt}`;'),
    );
  });
});
