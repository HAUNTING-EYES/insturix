import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  CHAT_TOOL_REGISTRY,
  formatChatToolReceipt,
  getChatToolCompletionLabel,
  getChatToolMetadata,
  shouldReloadProjectAfterTool,
} from '@/lib/editron/agent/chat-tool-registry';

const CHAT_TOOL_SOURCE_FILES = [
  'lib/editron/agent/tools.ts',
  'lib/editron/agent/chat-transcript-tools.ts',
  'lib/editron/agent/chat-visual-tools.ts',
  'lib/editron/agent/chat-audio-tools.ts',
  'lib/editron/agent/chat-asset-tools.ts',
];

function extractDeclaredChatToolNames(): string[] {
  return CHAT_TOOL_SOURCE_FILES.flatMap((file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    return [...source.matchAll(/name:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
  }).filter((toolName, index, names) => names.indexOf(toolName) === index);
}

describe('chat tool registry', () => {
  it('matches every declared callable Editron chat tool exactly', () => {
    const toolNames = extractDeclaredChatToolNames();
    const registeredNames = Object.keys(CHAT_TOOL_REGISTRY);
    const missing = toolNames.filter((toolName: string) => !getChatToolMetadata(toolName));
    const registryOnly = registeredNames.filter((toolName) => !toolNames.includes(toolName));

    expect({ missing, registryOnly }).toEqual({ missing: [], registryOnly: [] });
  });

  it('keeps visual inspection reachable when visual resolvers hand it off', () => {
    const toolsSource = readFileSync(join(process.cwd(), 'lib/editron/agent/tools.ts'), 'utf8');
    const returnBlockStart = toolsSource.indexOf('  return [');
    const returnBlockEnd = toolsSource.indexOf('  ].map((toolInstance) => wrapToolWithEnvelope(toolInstance));');
    const returnBlock = toolsSource.slice(returnBlockStart, returnBlockEnd);

    expect(returnBlockStart).toBeGreaterThanOrEqual(0);
    expect(returnBlockEnd).toBeGreaterThan(returnBlockStart);
    expect(returnBlock).toContain('visualInspectFrame,');
    expect(returnBlock).not.toContain('// visualInspectFrame');
  });

  it('marks mutating tools as project-reload tools', () => {
    const mutatingWithoutReload = Object.values(CHAT_TOOL_REGISTRY)
      .filter((metadata) => metadata.mutatesProject && !metadata.requiresProjectReload)
      .map((metadata) => metadata.name);

    const restoreMetadata = getChatToolMetadata('restore_ai_edit_checkpoint');

    expect(mutatingWithoutReload).toEqual([]);
    expect(shouldReloadProjectAfterTool('add_overlay')).toBe(true);
    expect(shouldReloadProjectAfterTool('restore_ai_edit_checkpoint')).toBe(true);
    expect(shouldReloadProjectAfterTool('read_project_file')).toBe(false);
    expect(restoreMetadata).toMatchObject({
      mutatesProject: true,
      requiresProjectReload: true,
      riskLevel: 'high',
    });
  });

  it('uses honest completion labels for read-only versus mutating tools', () => {
    expect(getChatToolCompletionLabel('get_timeline_view')).toBe('checked');
    expect(getChatToolCompletionLabel('find_transcript_moment')).toBe('checked');
    expect(getChatToolCompletionLabel('resolve_transcript_edit')).toBe('checked');
    expect(getChatToolCompletionLabel('cut_section')).toBe('done');
    expect(getChatToolCompletionLabel('add_overlay')).toBe('done');
  });

  it('keeps the live agent prompt wired to resolver-to-mutator workflows', () => {
    const agentSource = readFileSync(join(process.cwd(), 'lib/editron/agent/agent-graph.ts'), 'utf8');

    expect(agentSource).toContain('MANDATORY MOMENT-RESOLUTION WORKFLOWS');
    expect(agentSource).toContain('Never stop after only read-only tools when the user asked for an edit');
    expect(agentSource).toContain('resolve_transcript_edit({ query: "X", action: "cut_after_phrase" })');
    expect(agentSource).toContain('immediately call');
    expect(agentSource).toContain('cut_section');
    expect(agentSource).toContain('A successful edit turn must include at least one mutating tool call');
  });
  it('has labels and receipt text for registered tools', () => {
    const incomplete = Object.values(CHAT_TOOL_REGISTRY)
      .filter((metadata) => !metadata.label || !metadata.shortLabel || !formatChatToolReceipt(metadata.name))
      .map((metadata) => metadata.name);

    expect(incomplete).toEqual([]);
  });
});
