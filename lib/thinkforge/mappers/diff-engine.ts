import type { CommandRequest } from '@/lib/thinkforge/services/command-service';
import type { AgentScriptResponse } from '@/lib/thinkforge/protocol/intent';

export function agentResponseToCommands(
  response: AgentScriptResponse,
  context: {
    sessionId: string;
    scriptId: string;
    baseVersion: number;
  }
): CommandRequest[] {
  const { sessionId, scriptId, baseVersion } = context;

  if (response.mode === 'replace') {
    return [
      {
        type: 'ReplaceDocument',
        sessionId,
        baseVersion,
        source: 'ai',
        payload: {
          scriptId,
          title: response.title,
          blocks: response.blocks,
        },
      },
    ];
  }

  if (response.mode === 'insert') {
    return [
      {
        type: 'InsertBlock',
        sessionId,
        baseVersion,
        source: 'ai',
        payload: {
          scriptId,
          block: response.blocks[0],
        },
      },
    ];
  }

  if (response.mode === 'patch') {
    return response.patches.map((patch) => ({
      type: 'UpdateBlock',
      sessionId,
      baseVersion,
      source: 'ai',
      payload: {
        scriptId,
        blockId: patch.blockId,
        content: patch.content,
      },
    }));
  }

  return [];
}
