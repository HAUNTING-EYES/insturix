import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import {
  materializeScriptSidecarV3,
  ScriptWriterSidecarV3ModelSchema,
} from '@/lib/thinkforge/schemas/script-sidecar-v3';
import { mixedPresenterCutawayTreatment } from '@/tests/fixtures/thinkforge-video-treatment';

const mocks = vi.hoisted(() => {
  class MockAuthorityError extends Error {
    readonly code: string;

    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }

  return {
    MockAuthorityError,
    auth: vi.fn(),
    getScript: vi.fn(),
    getSession: vi.fn(),
    requireCurrentPersistedScriptSidecar: vi.fn(),
  };
});

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getScript: mocks.getScript,
  getSession: mocks.getSession,
}));
vi.mock('@/lib/thinkforge/persistence/script-sidecar-reader', () => ({
  requireCurrentPersistedScriptSidecar: mocks.requireCurrentPersistedScriptSidecar,
  ThinkForgeScriptSidecarAuthorityError: mocks.MockAuthorityError,
}));

function sidecar() {
  return materializeScriptSidecarV3({
    treatment: mixedPresenterCutawayTreatment,
    identityPolicy: { mode: 'ordinary' },
    modelSidecar: ScriptWriterSidecarV3ModelSchema.parse({
      sidecarVersion: 3,
      spokenTextSource: 'beat-lines',
      characters: [{ id: 'model_host', name: 'Host', role: 'host' }],
      acts: [{
        id: 'model_act',
        title: 'Opening',
        narrativePurpose: 'Open with a host and a concurrent visual counterpoint.',
        narrativeScenes: [{
          id: 'model_scene',
          title: 'Opening claim',
          narrativePurpose: 'Reveal the process while the host holds the argument.',
          durationIntentSeconds: 12,
          charactersPresent: ['model_host'],
          sourceRefs: ['src_brief'],
          beats: [{
            id: 'model_beat',
            kind: 'mixed',
            narrativePurpose: 'Carry dialogue and counterpoint together.',
            durationIntentSeconds: 12,
            lines: [{
              id: 'model_line',
              text: 'The cost is visible long before the handoff that caused it.',
              speakerId: 'model_host',
              languageCode: 'en',
              onCamera: true,
              delivery: 'sync-dialogue',
              sourceRefs: ['src_brief'],
            }],
            treatmentVisualEvents: [
              { treatmentEventId: 'event_host_claim' },
              { treatmentEventId: 'event_process_cutaway' },
            ],
            sourceRefs: ['src_brief'],
          }],
        }],
      }],
      sourceRefs: ['src_brief'],
    }),
  });
}

describe('ThinkForge AV script presentation route', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.getScript.mockReset();
    mocks.getSession.mockReset();
    mocks.requireCurrentPersistedScriptSidecar.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.getSession.mockResolvedValue({ _id: 'session_canonical' });
    const currentSidecar = sidecar();
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      title: 'A visible cost',
      content: 'The cost is visible long before the handoff that caused it.',
      contentContract: createThinkForgeWriterContract('video_script'),
      metadata: { writerOutput: { videoTreatment: mixedPresenterCutawayTreatment } },
      version: 3,
    });
    mocks.requireCurrentPersistedScriptSidecar.mockReturnValue({
      readResult: { sourceVersion: 3, sidecar: currentSidecar },
      rawSidecar: currentSidecar,
      binding: { documentHash: 'a'.repeat(64), sidecarHash: 'b'.repeat(64) },
    });
  });

  it('returns an authenticated V3 semantic projection with concurrent visual layers', async () => {
    const { GET } = await import('@/app/api/services/thinkforge/script/av-presentation/route');
    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/script/av-presentation?sessionId=session_alias&scriptId=script_1',
    ));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: 'available',
      document: { title: 'A visible cost', version: 3 },
    });
    expect(body.acts[0].scenes[0].beats[0].visualLayers).toHaveLength(2);
    expect(JSON.stringify(body)).not.toContain('inputFingerprint');
    expect(JSON.stringify(body)).not.toContain('treatmentId');
    expect(mocks.getSession).toHaveBeenCalledWith('session_alias', 'user_1', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'script_1');
  });

  it('keeps a stale AV plan out of the browser instead of returning its old treatment', async () => {
    mocks.requireCurrentPersistedScriptSidecar.mockImplementation(() => {
      throw new mocks.MockAuthorityError('script-sidecar-stale');
    });
    const { GET } = await import('@/app/api/services/thinkforge/script/av-presentation/route');
    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/script/av-presentation?sessionId=session_alias&scriptId=script_1',
    ));

    expect(await response.json()).toMatchObject({
      status: 'stale',
      code: 'script-sidecar-stale',
    });
  });

  it('does not call sidecar authority for a post or carousel document', async () => {
    mocks.getScript.mockResolvedValue({
      _id: 'post_1',
      title: 'A social post',
      content: 'Post copy',
      contentContract: createThinkForgeWriterContract('social_post'),
      metadata: {},
      version: 1,
    });
    const { GET } = await import('@/app/api/services/thinkforge/script/av-presentation/route');
    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/script/av-presentation?sessionId=session_alias&scriptId=post_1',
    ));

    expect(await response.json()).toMatchObject({
      status: 'not_applicable',
      code: 'document_not_video_script',
    });
    expect(mocks.requireCurrentPersistedScriptSidecar).not.toHaveBeenCalled();
  });

  it('fails visibly when a current V3 sidecar has no persisted treatment', async () => {
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      title: 'A broken semantic script',
      content: 'Script content',
      contentContract: createThinkForgeWriterContract('video_script'),
      metadata: { writerOutput: {} },
      version: 3,
    });
    const { GET } = await import('@/app/api/services/thinkforge/script/av-presentation/route');
    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/script/av-presentation?sessionId=session_alias&scriptId=script_1',
    ));

    expect(await response.json()).toMatchObject({
      status: 'invalid_contract',
      code: 'video_treatment_missing',
    });
  });
});
