import { describe, expect, it, vi } from 'vitest';

import {
  buildChatEvidenceReceipts,
  type ChatToolTurnLedger,
} from '@/lib/editron/agent/chat-tool-execution-policy';
import {
  interceptToolCallForServerPreflight,
  prepareServerTimelinePreflight,
} from '@/lib/editron/agent/chat-tool-server-preflight';

const PROJECT_ID = 'project-preflight';
const REVISION = 'revision-preflight';

function emptyLedger(): ChatToolTurnLedger {
  return { requestedToolNames: [], completedExecutions: [] };
}

function timelineTool(output: string) {
  return {
    name: 'get_timeline_view',
    invoke: vi.fn(async () => output),
  };
}

describe('server-owned chat timeline preflight', () => {
  it('acquires current timeline evidence and pauses a blind visual mutation', async () => {
    const tool = timelineTool(JSON.stringify({
      tracks: [{ id: 'video-1', fromFrame: 0, toFrame: 300 }],
    }));
    const preflight = await prepareServerTimelinePreflight({
      toolCalls: [{ id: 'add-1', name: 'add_overlay', args: { type: 'text', start: 30 } }],
      invokeTimelineView: tool.invoke,
      ledger: emptyLedger(),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    });

    expect(tool.invoke).toHaveBeenCalledTimes(1);
    expect(preflight).toMatchObject({
      targetToolCallIds: ['add-1'],
      source: 'server-inserted',
      status: 'ready',
      evidenceReceipts: [{
        evidenceClass: 'timeline-state',
        projectId: PROJECT_ID,
        projectRevision: REVISION,
        producerTool: 'get_timeline_view',
      }],
    });

    const interception = interceptToolCallForServerPreflight({
      preflight,
      toolCallId: 'add-1',
      toolName: 'add_overlay',
    });
    expect(interception?.evidenceReceipts).toHaveLength(1);
    expect(JSON.parse(interception?.output ?? '{}')).toMatchObject({
      status: 'error',
      data: {
        serverEvidencePreflight: {
          status: 'ready',
          evidenceClass: 'timeline-state',
          source: 'server-inserted',
          evidence: { tracks: [{ id: 'video-1', fromFrame: 0, toFrame: 300 }] },
        },
      },
      error: { code: 'CHAT_TOOL_EVIDENCE_REQUIRED' },
    });
  });

  it('does not execute a same-step mutation before a model-requested read reaches the model', async () => {
    const tool = timelineTool('{}');
    const preflight = await prepareServerTimelinePreflight({
      toolCalls: [
        { id: 'read-1', name: 'get_timeline_view', args: {} },
        { id: 'add-1', name: 'add_overlay', args: { type: 'text' } },
      ],
      invokeTimelineView: tool.invoke,
      ledger: emptyLedger(),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    });

    expect(tool.invoke).not.toHaveBeenCalled();
    expect(preflight).toMatchObject({
      targetToolCallIds: ['add-1'],
      source: 'model-provided',
      status: 'ready',
      evidenceReceipts: [],
    });
    expect(JSON.parse(interceptToolCallForServerPreflight({
      preflight,
      toolCallId: 'add-1',
      toolName: 'add_overlay',
    })?.output ?? '{}')).toMatchObject({
      error: { code: 'CHAT_TOOL_EVIDENCE_REQUIRED' },
      data: { serverEvidencePreflight: { source: 'model-provided' } },
    });
  });

  it('preserves read_project_file as the model-provided timeline producer', async () => {
    const tool = timelineTool('{}');
    const preflight = await prepareServerTimelinePreflight({
      toolCalls: [
        { id: 'read-1', name: 'read_project_file', args: {} },
        { id: 'add-1', name: 'add_overlay', args: { type: 'text' } },
      ],
      invokeTimelineView: tool.invoke,
      ledger: emptyLedger(),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    });

    expect(tool.invoke).not.toHaveBeenCalled();
    expect(preflight).toMatchObject({
      producerTool: 'read_project_file',
      source: 'model-provided',
      targetToolCallIds: ['add-1'],
    });
  });

  it('acquires timeline evidence once for multiple blind visual mutations', async () => {
    const tool = timelineTool(JSON.stringify({ tracks: [] }));
    const preflight = await prepareServerTimelinePreflight({
      toolCalls: [
        { id: 'add-1', name: 'add_overlay', args: { type: 'text' } },
        {
          id: 'shake-1',
          name: 'apply_camera_shake',
          args: { videoOverlayId: 'video-1', targetFrame: 30 },
        },
      ],
      invokeTimelineView: tool.invoke,
      ledger: emptyLedger(),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    });

    expect(tool.invoke).toHaveBeenCalledTimes(1);
    expect(preflight?.targetToolCallIds).toEqual(['add-1', 'shake-1']);
    expect(interceptToolCallForServerPreflight({
      preflight,
      toolCallId: 'add-1',
      toolName: 'add_overlay',
    })?.evidenceReceipts).toHaveLength(1);
    expect(interceptToolCallForServerPreflight({
      preflight,
      toolCallId: 'shake-1',
      toolName: 'apply_camera_shake',
    })?.evidenceReceipts).toHaveLength(0);
  });

  it('does nothing when current timeline evidence already exists', async () => {
    const evidenceReceipts = buildChatEvidenceReceipts({
      toolName: 'get_timeline_view',
      args: {},
      output: '{}',
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    });
    const ledger: ChatToolTurnLedger = {
      requestedToolNames: ['get_timeline_view'],
      completedExecutions: [{
        toolCallId: 'read-1',
        name: 'get_timeline_view',
        args: {},
        output: '{}',
        outcome: 'success',
        evidenceReceipts,
      }],
    };
    const tool = timelineTool('{}');

    expect(await prepareServerTimelinePreflight({
      toolCalls: [{ id: 'add-1', name: 'add_overlay', args: { type: 'text' } }],
      invokeTimelineView: tool.invoke,
      ledger,
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toBeNull();
    expect(tool.invoke).not.toHaveBeenCalled();
  });

  it('fails closed when timeline evidence cannot be acquired', async () => {
    const preflight = await prepareServerTimelinePreflight({
      toolCalls: [{ id: 'add-1', name: 'add_overlay', args: { type: 'text' } }],
      ledger: emptyLedger(),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    });

    expect(preflight).toMatchObject({ status: 'failed' });
    expect(JSON.parse(interceptToolCallForServerPreflight({
      preflight,
      toolCallId: 'add-1',
      toolName: 'add_overlay',
    })?.output ?? '{}')).toMatchObject({
      status: 'error',
      error: { code: 'CHAT_TOOL_SERVER_PREFLIGHT_FAILED' },
    });
  });

  it('does not add timeline work to audio-only mutations', async () => {
    const tool = timelineTool('{}');
    expect(await prepareServerTimelinePreflight({
      toolCalls: [{ id: 'bgm-1', name: 'regenerate_bgm', args: { prompt: 'ambient' } }],
      invokeTimelineView: tool.invoke,
      ledger: emptyLedger(),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toBeNull();
    expect(tool.invoke).not.toHaveBeenCalled();
  });
});
