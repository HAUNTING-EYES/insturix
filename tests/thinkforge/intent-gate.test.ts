import { describe, expect, it, vi } from 'vitest';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('@/lib/thinkforge/agents/model-factory', () => ({
  createModelByTier: vi.fn(),
  ModelTier: { Structural: 'structural' },
}));
vi.mock('@/lib/thinkforge/services/provider-cost-telemetry', () => ({
  readAiSdkUsage: vi.fn(),
  recordThinkForgeDirectCost: vi.fn(),
}));

import {
  classifyIntentFast,
  fastIntentHeuristic,
} from '@/lib/thinkforge/intent/intent-gate';

const scriptContext = {
  editorFocused: false,
  hasSelection: false,
  workspaceMode: 'script' as const,
  lastUserAction: 'chat_send',
};

describe('ThinkForge intent gate lexical boundaries', () => {
  it('routes an explicit create request as a draft when later prose says editorial and research', () => {
    const result = classifyIntentFast(
      'Create a seven-minute documentary. Use this editorial framework as guidance, not measured research.',
      null,
      true,
      scriptContext,
    );

    expect(result).toMatchObject({
      intent: 'draft',
      scope: 'document',
      usedFallback: false,
    });
    expect(result.signals).toContain('draft_signal');
    expect(result.signals).not.toContain('edit_signal');
    expect(result.signals).not.toContain('hybrid');
  });

  it('does not treat verbs embedded inside other words as commands', () => {
    const result = fastIntentHeuristic({
      userMessage: 'Editorial creation and finding patterns',
      hasScript: true,
      hasSelection: false,
      context: scriptContext,
    });

    expect(result).toBeNull();
  });

  it('preserves explicit edit and mixed-command routing', () => {
    expect(classifyIntentFast('Edit this section.', null, true, scriptContext)).toMatchObject({
      intent: 'edit',
      scope: 'section',
    });
    expect(classifyIntentFast(
      'Create a new draft and refine the existing outline.',
      null,
      true,
      scriptContext,
    )).toMatchObject({
      intent: 'hybrid',
      scope: 'section',
    });
  });

  it('continues to recognize standalone multiword research commands', () => {
    expect(classifyIntentFast('Look up current trends.', null, false, scriptContext)).toMatchObject({
      intent: 'research',
    });
  });
});
