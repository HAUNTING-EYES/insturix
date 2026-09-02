import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
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

  it('resolves undo from the latest AI edit checkpoint and refuses redo without a replay receipt chain', () => {
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
      status: 'no-checkpoint',
      action: 'redo',
    });
    expect(redo.checkpointId).toBeUndefined();
    expect(redo.useWith).toBeUndefined();
    expect(formatChatAiEditRestoreTargetForPrompt(undo)).toContain('checkpointId=ckpt_latest_before');
    expect(formatChatAiEditRestoreTargetForPrompt(undo)).toContain('Call restore_ai_edit_checkpoint');
    expect(formatChatAiEditRestoreTargetForPrompt(redo)).toContain('receipt-bound replay chain');
  });

  it('refuses redo after an undo restore because that restore does not create a replay receipt chain', () => {
    const history = [{
      role: 'assistant',
      content: 'Restored the previous checkpoint',
      checkpointIds: ['ckpt_before_restore', 'ckpt_after_restore'],
      toolResults: [{ toolName: 'restore_ai_edit_checkpoint', result: JSON.stringify({ status: 'success' }) }],
    }];

    const redo = resolveChatAiEditRestoreTarget(history, { userMessage: 'redo it' });

    expect(redo).toMatchObject({
      status: 'no-checkpoint',
      action: 'redo',
    });
    expect(redo.checkpointId).toBeUndefined();
    expect(redo.useWith).toBeUndefined();
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
