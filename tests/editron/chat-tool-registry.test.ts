import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';

import { createChatDubbingTools } from '@/lib/editron/agent/chat-dubbing-tools';
import type { ChatDubbingJob } from '@/lib/editron/services/chat-dubbing-job';

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
  'lib/editron/agent/chat-editorial-intent-tools.ts',
  'lib/editron/agent/chat-deep-analysis-tools.ts',
  'lib/editron/agent/chat-dubbing-tools.ts',
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

  it('reloads immediate mutations but waits for durable owners to commit', () => {
    const mutatingWithoutReload = Object.values(CHAT_TOOL_REGISTRY)
      .filter((metadata) => (
        metadata.mutatesProject
        && metadata.mutationCompletion === 'immediate'
        && !metadata.requiresProjectReload
      ))
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
    expect(getChatToolMetadata('dub_selected_dialogue')).toMatchObject({
      mutatesProject: true,
      mutationCompletion: 'durable',
      requiresProjectReload: false,
      executionType: 'generative',
      riskLevel: 'medium',
      turnContract: {
        evidenceStrategy: 'preflight',
        requiredEvidence: ['project-state', 'timeline-state'],
      },
    });
    expect(shouldReloadProjectAfterTool('get_dubbing_job_result')).toBe(true);
  });

  it('uses honest completion labels for read-only versus mutating tools', () => {
    expect(getChatToolCompletionLabel('get_timeline_view')).toBe('checked');
    expect(getChatToolCompletionLabel('find_transcript_moment')).toBe('checked');
    expect(getChatToolCompletionLabel('resolve_transcript_edit')).toBe('checked');
    expect(getChatToolCompletionLabel('cut_section')).toBe('done');
    expect(getChatToolCompletionLabel('add_overlay')).toBe('done');
    expect(getChatToolCompletionLabel('apply_editorial_intent')).toBe('queued');
    expect(getChatToolCompletionLabel('apply_reference_style')).toBe('queued');
    expect(getChatToolCompletionLabel('dub_selected_dialogue')).toBe('queued');
  });

  it('keeps the live agent prompt wired to resolver-to-mutator workflows', () => {
    const agentSource = readFileSync(join(process.cwd(), 'lib/editron/agent/agent-graph.ts'), 'utf8');

    expect(agentSource).toContain('GROUNDED LOCALIZED MUTATION');
    expect(agentSource).toContain('Read-only resolvers do not edit');
    expect(agentSource).toContain('call only the mutating tool named in data.useWith');
    expect(agentSource).toContain('For a visual mutation, call resolve_visual_edit directly');
    expect(agentSource).toContain('Call visual_inspect_frame only when resolve_visual_edit explicitly returns');
    expect(agentSource).toContain('cut_section');
    expect(agentSource).toContain('A successful edit turn must include a declared mutating tool call');
    expect(agentSource).toContain('DURABLE SELECTED-CLIP DUBBING');
    expect(agentSource).toContain('Do not use a generic voiceover');
  });

  it('separates durable mutation ownership from immediate project completion', () => {
    for (const toolName of ['apply_editorial_intent', 'apply_reference_style', 'dub_selected_dialogue'] as const) {
      expect(CHAT_TOOL_REGISTRY[toolName]).toMatchObject({
        mutatesProject: true,
        mutationCompletion: 'durable',
        requiresProjectReload: false,
        postconditions: {
          state: { kind: 'project-state-changed-or-durable-operation-queued' },
        },
      });
    }
    expect(CHAT_TOOL_REGISTRY.add_captions.mutationCompletion).toBe('immediate');
  });

  it('queues revision-bound dubbing and scopes result reads to the current project', async () => {
    const resolveJob = vi.fn(async () => ({ jobId: 'chat_dub_1', created: true, status: 'resolved' as const }));
    const queueJob = vi.fn(async () => ({ status: 'queued' as const, jobId: 'chat_dub_1', messageId: 'msg-1' }));
    const findJob = vi.fn(async () => ({
      _id: 'chat_dub_1',
      projectId: 'another-project',
      status: 'completed',
      progress: { stage: 'commit' },
    } as ChatDubbingJob));
    const tools = createChatDubbingTools(
      { userId: 'user-1', projectId: 'project-1' },
      { resolveJob, queueJob, findJob },
    );
    const dubTool = tools.find((candidate) => candidate.name === 'dub_selected_dialogue');
    const resultTool = tools.find((candidate) => candidate.name === 'get_dubbing_job_result');
    if (!dubTool || !resultTool) throw new Error('Dubbing tools were not declared.');

    const queued = JSON.parse(String(await dubTool.invoke({ overlayId: 17, targetLanguage: 'English' })));
    expect(queued).toMatchObject({ status: 'success', data: { jobId: 'chat_dub_1', status: 'queued' } });
    expect(resolveJob).toHaveBeenCalledWith(expect.objectContaining({
      overlayId: 17,
      userId: 'user-1',
      projectId: 'project-1',
    }));
    expect(queueJob).toHaveBeenCalledWith({ jobId: 'chat_dub_1', userId: 'user-1', projectId: 'project-1' });

    const crossProject = JSON.parse(String(await resultTool.invoke({ jobId: 'chat_dub_1' })));
    expect(crossProject).toMatchObject({ status: 'error', error: expect.stringContaining('not found') });
  });

  it('keeps cardinality in the tool contract instead of a second hardcoded analyzer limiter', () => {
    const agentSource = readFileSync(join(process.cwd(), 'lib/editron/agent/agent-graph.ts'), 'utf8');

    expect(agentSource).not.toContain('RATE_LIMITED_TOOLS');
    expect(agentSource).not.toContain('countToolCallsSinceLastHuman');
    expect(agentSource).toContain('resolve_clip_analysis');
    expect(agentSource).toContain('queue_resolved_clip_analysis');
    expect(agentSource).toContain('get_clip_analysis_result');
    expect(agentSource).toContain('legacy synchronous analyze_clip_audio/analyze_clip_video tools are not available');
  });

  it('has labels and receipt text for registered tools', () => {
    const incomplete = Object.values(CHAT_TOOL_REGISTRY)
      .filter((metadata) => !metadata.label || !metadata.shortLabel || !formatChatToolReceipt(metadata.name))
      .map((metadata) => metadata.name);

    expect(incomplete).toEqual([]);
  });
});
