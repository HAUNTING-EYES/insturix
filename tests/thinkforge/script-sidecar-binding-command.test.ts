import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCurrentScriptSidecarBinding,
  verifyScriptSidecarBinding,
} from '@/lib/thinkforge/persistence/script-sidecar-binding';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import { SCRIPT_SIDECAR_V2_VERSION } from '@/lib/thinkforge/schemas/script-sidecar-v2';

const dbMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  getScript: vi.fn(),
  saveScriptWithVersion: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  getSession: dbMock.getSession,
  getScript: dbMock.getScript,
  saveScriptWithVersion: dbMock.saveScriptWithVersion,
}));

import { applyCommand } from '@/lib/thinkforge/services/command-service';

const contract = createThinkForgeWriterContract('video_script');

function sidecar(lineText = 'The narrator explains the operating decision.') {
  return {
    sidecarVersion: SCRIPT_SIDECAR_V2_VERSION,
    spokenTextSource: 'beat-lines' as const,
    characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' as const }],
    acts: [{
      id: 'act_1',
      title: 'Opening',
      narrativePurpose: 'Frame the operating decision.',
      narrativeScenes: [{
        id: 'scene_1',
        title: 'The decision',
        narrativePurpose: 'Explain why the decision matters.',
        charactersPresent: [],
        sourceRefs: [],
        beats: [{
          id: 'beat_1',
          kind: 'voiceover' as const,
          narrativePurpose: 'Deliver the explanation.',
          lines: [{
            id: 'line_1',
            text: lineText,
            speakerId: 'narrator',
            onCamera: false,
            delivery: 'voiceover' as const,
            sourceRefs: [],
          }],
          sourceRefs: [],
        }],
      }],
    }],
    sourceRefs: [],
  };
}

function block(text: string) {
  return {
    id: 'block_1',
    kind: 'paragraph' as const,
    content: [{ type: 'text' as const, text, styles: {} }],
  };
}

function existingDocument(input: {
  content: string;
  version: number;
  binding?: unknown;
}) {
  const scriptSidecar = sidecar();
  return {
    _id: 'mongo_script_1',
    sessionId: 'session_1',
    scriptId: 'script_1',
    title: 'Bound script',
    content: input.content,
    blocks: [block(input.content)],
    metadata: {
      source: 'ai',
      writerOutput: {
        writerType: 'script',
        visualPrompts: { scenePrompts: ['An editorial operating-decision scene.'] },
        sidecarVersion: SCRIPT_SIDECAR_V2_VERSION,
        scriptSidecar,
        ...(input.binding !== undefined ? { sidecarBinding: input.binding } : {}),
      },
    },
    documentType: 'video_script',
    contentContract: contract,
    version: input.version,
    createdAt: new Date('2026-08-16T00:00:00Z'),
    updatedAt: new Date('2026-08-16T00:00:00Z'),
  };
}

async function replace(input: {
  content: string;
  version: number;
  source: 'user' | 'ai';
  metadata?: Record<string, unknown>;
  title?: string;
}) {
  return applyCommand({
    type: 'ReplaceDocument',
    sessionId: 'session_1',
    baseVersion: input.version,
    source: input.source,
    payload: {
      scriptId: 'script_1',
      title: input.title ?? 'Bound script',
      content: input.content,
      blocks: [block(input.content)],
      documentType: 'video_script',
      contentContract: contract,
      metadata: input.metadata,
    },
  }, 'user_1');
}

function savedMetadata(): Record<string, any> {
  return dbMock.saveScriptWithVersion.mock.calls.at(-1)?.[1]?.metadata ?? {};
}

describe('ThinkForge script sidecar content binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.getSession.mockResolvedValue({ _id: 'session_1', userId: 'user_1' });
    dbMock.saveScriptWithVersion.mockImplementation(async (sessionId, script, baseVersion, scriptId) => ({
      ok: true,
      script: { ...script, sessionId, scriptId, version: baseVersion + 1 },
    }));
  });

  it('hashes equivalent Unicode and line endings consistently and detects mismatches', () => {
    const scriptSidecar = sidecar();
    const binding = createCurrentScriptSidecarBinding({
      documentContent: 'Caf\u00e9\r\nLaunch',
      documentVersion: 4,
      sidecar: scriptSidecar,
    });

    expect(verifyScriptSidecarBinding({
      binding,
      documentContent: 'Cafe\u0301\nLaunch',
      documentVersion: 4,
      sidecar: scriptSidecar,
    }).current).toBe(true);
    expect(verifyScriptSidecarBinding({
      binding,
      documentContent: 'Cafe\u0301\nLaunch',
      documentVersion: 5,
      sidecar: scriptSidecar,
    })).toMatchObject({ current: false, reason: 'document_version_mismatch' });
    expect(verifyScriptSidecarBinding({
      binding,
      documentContent: 'Cafe\u0301\nLaunch',
      documentVersion: 4,
      sidecar: sidecar('A different authored line.'),
    })).toMatchObject({ current: false, reason: 'sidecar_hash_mismatch' });
  });

  it('creates a current binding atomically when an AI writer supplies a valid sidecar', async () => {
    dbMock.getScript.mockResolvedValue(null);
    const scriptSidecar = sidecar();
    const result = await replace({
      content: 'Generated script',
      version: 0,
      source: 'ai',
      metadata: {
        writerOutput: {
          writerType: 'script',
          visualPrompts: { scenePrompts: ['An editorial operating-decision scene.'] },
          sidecarVersion: SCRIPT_SIDECAR_V2_VERSION,
          scriptSidecar,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(verifyScriptSidecarBinding({
      binding: savedMetadata().writerOutput.sidecarBinding,
      documentContent: 'Generated script',
      documentVersion: 1,
      sidecar: scriptSidecar,
    }).current).toBe(true);
  });

  it('marks the historical sidecar stale when a user changes visible content and ignores forged metadata', async () => {
    const original = 'Original script';
    const current = createCurrentScriptSidecarBinding({
      documentContent: original,
      documentVersion: 3,
      sidecar: sidecar(),
    });
    dbMock.getScript.mockResolvedValue(existingDocument({ content: original, version: 3, binding: current }));

    await replace({
      content: 'User edited script',
      version: 3,
      source: 'user',
      metadata: { writerOutput: { scriptSidecar: sidecar('Forged'), sidecarBinding: current } },
    });

    expect(savedMetadata().writerOutput.scriptSidecar).toEqual(sidecar());
    expect(savedMetadata().writerOutput.sidecarBinding).toMatchObject({
      status: 'stale',
      staleReason: 'content_changed_without_fresh_sidecar',
      staleAtVersion: 4,
    });
  });

  it('invalidates legacy AI refinement content when no fresh sidecar accompanies the save', async () => {
    const original = 'Original script';
    const current = createCurrentScriptSidecarBinding({
      documentContent: original,
      documentVersion: 2,
      sidecar: sidecar(),
    });
    dbMock.getScript.mockResolvedValue(existingDocument({ content: original, version: 2, binding: current }));

    await replace({
      content: 'Legacy refinement changed the script',
      version: 2,
      source: 'ai',
      metadata: { workflow: 'edit' },
    });

    expect(savedMetadata().writerOutput.sidecarBinding).toMatchObject({ status: 'stale', staleAtVersion: 3 });
  });

  it('rebinds unchanged content to the newly committed document version', async () => {
    const content = 'Unchanged script';
    const current = createCurrentScriptSidecarBinding({
      documentContent: content,
      documentVersion: 5,
      sidecar: sidecar(),
    });
    dbMock.getScript.mockResolvedValue(existingDocument({ content, version: 5, binding: current }));

    await replace({ content, version: 5, source: 'user', title: 'Retitled script' });

    expect(savedMetadata().writerOutput.sidecarBinding).toMatchObject({
      status: 'current',
      boundDocumentVersion: 6,
    });
  });

  it('rejects malformed fresh writer sidecars before persistence', async () => {
    dbMock.getScript.mockResolvedValue(null);
    const result = await replace({
      content: 'Generated script',
      version: 0,
      source: 'ai',
      metadata: {
        writerOutput: {
          writerType: 'script',
          visualPrompts: { scenePrompts: ['An editorial operating-decision scene.'] },
          sidecarVersion: SCRIPT_SIDECAR_V2_VERSION,
          scriptSidecar: { sidecarVersion: SCRIPT_SIDECAR_V2_VERSION, acts: [] },
        },
      },
    });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Invalid writer output metadata') });
    expect(dbMock.saveScriptWithVersion).not.toHaveBeenCalled();
  });
});
