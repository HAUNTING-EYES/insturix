import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  CHAT_TOOL_REGISTRY,
  formatChatToolReceipt,
  getChatToolMetadata,
  shouldReloadProjectAfterTool,
} from '@/lib/editron/agent/chat-tool-registry';

describe('chat tool registry', () => {
  it('covers every tool declared by the Editron chat agent source', () => {
    const toolsSource = readFileSync(join(process.cwd(), 'lib/editron/agent/tools.ts'), 'utf8');
    const toolNames = [...toolsSource.matchAll(/name:\s*['"]([^'"]+)['"]/g)]
      .map((match) => match[1])
      .filter((toolName, index, names) => names.indexOf(toolName) === index);
    const missing = toolNames
      .filter((toolName: string) => !getChatToolMetadata(toolName));

    expect(missing).toEqual([]);
  });

  it('marks mutating tools as project-reload tools', () => {
    const mutatingWithoutReload = Object.values(CHAT_TOOL_REGISTRY)
      .filter((metadata) => metadata.mutatesProject && !metadata.requiresProjectReload)
      .map((metadata) => metadata.name);

    expect(mutatingWithoutReload).toEqual([]);
    expect(shouldReloadProjectAfterTool('add_overlay')).toBe(true);
    expect(shouldReloadProjectAfterTool('read_project_file')).toBe(false);
  });

  it('has labels and receipt text for registered tools', () => {
    const incomplete = Object.values(CHAT_TOOL_REGISTRY)
      .filter((metadata) => !metadata.label || !metadata.shortLabel || !formatChatToolReceipt(metadata.name))
      .map((metadata) => metadata.name);

    expect(incomplete).toEqual([]);
  });
});
