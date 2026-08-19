import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCurrentWriterOutputBinding } from '@/lib/thinkforge/persistence/writer-output-binding';
import { createCurrentScriptSidecarBinding } from '@/lib/thinkforge/persistence/script-sidecar-binding';
import { resolveSceneShotPlan } from '@/lib/thinkforge/production/resolve-scene-shot-plan';
import {
  createApprovedShootKitSnapshot,
  verifyApprovedShootKitSnapshot,
} from '@/lib/thinkforge/production/shoot-kit-snapshot';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createProjectLink: vi.fn(),
  findLinkBySessionId: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  saveApprovedShootKitSnapshot: vi.fn(),
  setSessionProductionConfiguration: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/shared/project-links', () => ({
  createProjectLink: mocks.createProjectLink,
  findLinkBySessionId: mocks.findLinkBySessionId,
}));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getScript: mocks.getScript,
  getSession: mocks.getSession,
  saveApprovedShootKitSnapshot: mocks.saveApprovedShootKitSnapshot,
  setSessionProductionConfiguration: mocks.setSessionProductionConfiguration,
}));

const profile = {
  version: 1,
  spaces: [],
  equipment: [],
  people: {
    performersAvailable: 1,
    cameraOperatorsAvailable: 0,
    assistantsAvailable: 0,
    selfShoot: true,
  },
  constraints: {
    currency: 'USD',
    maxIncrementalSpend: 0,
    rentalAllowed: false,
    purchaseAllowed: false,
    maxLocationChanges: 0,
    transportMode: 'none',
    accessibility: [],
    safety: [],
  },
  preferences: {
    defaultPlanTier: 'no-spend',
    prioritize: ['cost', 'setup-time'],
    householdSubstitutionsAllowed: true,
  },
  provenance: {},
};

const settings = { aspectRatio: '16:9', tier: 'no-spend' };

function postRequest(url: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function storedDocument(sessionId: string, scriptId: string) {
  return {
    _id: `stored_${scriptId}`,
    sessionId,
    scriptId,
    title: 'Verified document',
    content: 'One useful, exact document.',
    blocks: [{
      id: 'block_1',
      kind: 'paragraph',
      content: [{ type: 'text', text: 'One useful, exact document.', styles: {} }],
    }],
    metadata: {},
    version: 1,
  };
}

function productionSidecar() {
  return {
    sidecarVersion: 1,
    characters: [{ id: 'host', name: 'Host', role: 'host' }],
    overallMusicPrompt: '',
    characterDescriptions: {},
    colorPalette: [],
    environmentNotes: '',
    suggestedProfileCategory: 'production-mode',
    sourceRefs: [],
    scenes: [{
      title: 'Evidence',
      narration: 'Show the evidence without changing the claim.',
      visualDescription: 'The evidence remains readable in a stable medium shot.',
      videoMotionPrompt: '',
      audioDescription: '',
      musicDescription: '',
      sfxDescription: '',
      durationSeconds: 8,
      mood: 'serious',
      imageQualityTokens: '',
      videoQualityTokens: '',
      generationUnitId: 'unit_evidence',
      primaryVisualForUnit: true,
      sceneType: 'continuous',
      assetRecommendation: 'ai-video',
      lines: [{
        text: 'Show the evidence without changing the claim.',
        speakerId: 'host',
        onCamera: false,
        delivery: 'voiceover',
        sourceRefs: [],
      }],
      charactersPresent: ['host'],
      sourceRefs: [],
      shotIntent: {
        narrativePurpose: 'Make the evidence legible.',
        emotionalBeat: 'Measured confidence.',
        energy: 0.4,
        visualPriority: 'The evidence in frame.',
        action: 'still',
        desiredFraming: 'medium',
        desiredAngle: 'eye-level',
        desiredMovement: 'static',
        simultaneousPerformers: 0,
        spokenAudio: false,
        performance: [],
        continuity: { wardrobe: [], props: [], previousSceneIds: [] },
      },
    }],
  };
}

function productionDocument(sessionId: string, scriptId: string) {
  const document = storedDocument(sessionId, scriptId);
  const sidecar = productionSidecar();
  return {
    ...document,
    metadata: {
      writerOutput: {
        sidecarVersion: 1,
        scriptSidecar: sidecar,
        sidecarBinding: createCurrentScriptSidecarBinding({
          documentContent: document.content,
          documentVersion: document.version,
          sidecar,
        }),
      },
    },
  };
}

const productionProfile = {
  ...profile,
  equipment: [
    { id: 'phone', label: 'Phone', category: 'camera', kind: 'phone', availability: 'owned' },
    { id: 'tripod', label: 'Tripod', category: 'support', kind: 'tripod', availability: 'owned' },
  ],
};

function boundPostDocument(status: 'current' | 'stale' = 'current') {
  const content = status === 'current' ? 'Current post copy.' : 'Edited post copy.';
  const writerOutput = {
    writerType: 'post',
    visualPrompts: { singleImagePrompt: 'A precise evidence-led editorial visual.' },
  };
  const current = createCurrentWriterOutputBinding({
    documentContent: 'Current post copy.',
    documentVersion: 1,
    writerOutput,
  });
  return {
    ...storedDocument('session_canonical', 'post_1'),
    content,
    version: status === 'current' ? 1 : 2,
    metadata: {
      writerOutput: {
        ...writerOutput,
        artifactBinding: status === 'current'
          ? current
          : {
              ...current,
              status: 'stale',
              staleReason: 'content_changed_without_fresh_writer_output',
              staleAtVersion: 2,
            },
      },
    },
  };
}

describe('ThinkForge Clickatron document identity', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_member', orgId: 'org_1' });
    mocks.findLinkBySessionId.mockResolvedValue({
      universalId: 'project_link_1',
      brandId: 'brand_1',
      sourceScriptId: 'script_1',
    });
  });

  it('rejects a whitespace document ID before session or project-link work', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/clickatron-context/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/clickatron-context',
      { sessionId: 'session_alias', scriptId: '   ' },
    ));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'scriptId is required' });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.findLinkBySessionId).not.toHaveBeenCalled();
  });

  it('uses org authorization and canonical session identity throughout the handoff', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_1' },
    });
    mocks.getScript.mockResolvedValue(storedDocument('session_canonical', 'script_1'));
    const { POST } = await import('@/app/api/services/thinkforge/clickatron-context/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/clickatron-context',
      {
        sessionId: 'session_alias',
        scriptId: 'script_1',
        kind: 'single',
        platform: 'linkedin',
      },
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('session_alias', 'user_member', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'script_1');
    expect(mocks.findLinkBySessionId).toHaveBeenCalledWith('user_member', 'session_canonical');
    expect(payload.context).toMatchObject({
      sourceSessionId: 'session_canonical',
      sourceScriptId: 'script_1',
    });
    expect(payload.operation).toBe('preview');
  });

  it('keeps preview read-only when no project link exists', async () => {
    mocks.findLinkBySessionId.mockResolvedValue(null);
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_1' },
    });
    mocks.getScript.mockResolvedValue(storedDocument('session_canonical', 'script_1'));
    const { POST } = await import('@/app/api/services/thinkforge/clickatron-context/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/clickatron-context',
      { sessionId: 'session_alias', scriptId: 'script_1', operation: 'preview' },
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.operation).toBe('preview');
    expect(payload.context.universalId).toBeUndefined();
    expect(payload.handoffState).toMatchObject({
      status: 'needs_user_input',
      canSendToClickatron: false,
      isBlocked: true,
    });
    expect(mocks.createProjectLink).not.toHaveBeenCalled();
  });

  it('creates a missing project link only for a ready explicit commit', async () => {
    mocks.findLinkBySessionId.mockResolvedValue(null);
    mocks.createProjectLink.mockResolvedValue({
      universalId: 'project_link_committed',
      brandId: 'brand_1',
      sourceScriptId: 'post_1',
    });
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_1' },
    });
    mocks.getScript.mockResolvedValue(boundPostDocument());
    const { POST } = await import('@/app/api/services/thinkforge/clickatron-context/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/clickatron-context',
      { sessionId: 'session_alias', scriptId: 'post_1', operation: 'commit' },
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.operation).toBe('commit');
    expect(payload.context.universalId).toBe('project_link_committed');
    expect(payload.handoffState).toMatchObject({ status: 'ready', canSendToClickatron: true });
    expect(mocks.createProjectLink).toHaveBeenCalledWith('user_member', expect.objectContaining({
      sessionId: 'session_canonical',
      sourceScriptId: 'post_1',
      brandId: 'brand_1',
    }));
  });

  it('does not create a project link for a blocked explicit commit', async () => {
    mocks.findLinkBySessionId.mockResolvedValue(null);
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_1' },
    });
    mocks.getScript.mockResolvedValue(storedDocument('session_canonical', 'script_1'));
    const { POST } = await import('@/app/api/services/thinkforge/clickatron-context/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/clickatron-context',
      { sessionId: 'session_alias', scriptId: 'script_1', operation: 'commit' },
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.handoffState).toMatchObject({ status: 'needs_user_input', canSendToClickatron: false });
    expect(payload.context.universalId).toBeUndefined();
    expect(mocks.createProjectLink).not.toHaveBeenCalled();
  });

  it('does not create a project link when the exact document is missing', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {},
    });
    mocks.getScript.mockResolvedValue(null);
    const { POST } = await import('@/app/api/services/thinkforge/clickatron-context/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/clickatron-context',
      { sessionId: 'session_alias', scriptId: 'missing_script' },
    ));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'ThinkForge document not found' });
    expect(mocks.findLinkBySessionId).not.toHaveBeenCalled();
    expect(mocks.createProjectLink).not.toHaveBeenCalled();
  });

  it('rejects stale hidden prompts before creating or reading a project link', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_1' },
    });
    mocks.getScript.mockResolvedValue(boundPostDocument('stale'));
    const { POST } = await import('@/app/api/services/thinkforge/clickatron-context/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/clickatron-context',
      { sessionId: 'session_alias', scriptId: 'post_1', kind: 'single', platform: 'linkedin' },
    ));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'writer-output-stale' });
    expect(mocks.findLinkBySessionId).not.toHaveBeenCalled();
    expect(mocks.createProjectLink).not.toHaveBeenCalled();
  });

  it('admits a writer prompt only when its document binding is current', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_1' },
    });
    mocks.getScript.mockResolvedValue(boundPostDocument());
    const { POST } = await import('@/app/api/services/thinkforge/clickatron-context/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/clickatron-context',
      { sessionId: 'session_alias', scriptId: 'post_1', kind: 'single', platform: 'linkedin' },
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.context.sessionDraft.prompt).toContain('precise evidence-led editorial visual');
    expect(payload.handoffState).toMatchObject({ status: 'ready', canSendToClickatron: true });
    expect(payload.handoffState.payloadPreview.prompt).toContain('precise evidence-led editorial visual');
  });
});

describe('ThinkForge Shoot Kit document identity', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_member', orgId: 'org_1' });
  });

  it('rejects a missing GET document ID before session access', async () => {
    const { GET } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan?sessionId=session_alias&scriptId=%20',
    ));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Missing scriptId' });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
  });

  it('rejects a missing POST document ID before session access or mutation', async () => {
    const { GET, POST } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        sessionId: 'session_alias',
        scriptId: '   ',
        expectedDocumentVersion: 1,
        profile,
        settings,
      },
    ));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Invalid production request');
    expect(payload.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['scriptId'] }),
    ]));
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.setSessionProductionConfiguration).not.toHaveBeenCalled();
  });

  it('reads the exact document through the authorized canonical session', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {
        productionCapabilityProfile: profile,
        productionShotSettings: settings,
      },
    });
    mocks.getScript.mockResolvedValue(storedDocument('session_canonical', 'script_1'));
    const { GET } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan?sessionId=session_alias&scriptId=script_1',
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('session_alias', 'user_member', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'script_1');
    expect(payload).toMatchObject({ status: 'needs-user-input', plan: null });
  });

  it('does not persist production settings until exact document ownership is proven', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {},
    });
    mocks.getScript.mockResolvedValue(null);
    const route = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await route.POST(postRequest(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        sessionId: 'session_alias',
        scriptId: 'missing_script',
        expectedDocumentVersion: 1,
        profile,
        settings,
      },
    ));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Document not found' });
    expect(mocks.getSession).toHaveBeenCalledWith('session_alias', 'user_member', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'missing_script');
    expect(mocks.setSessionProductionConfiguration).not.toHaveBeenCalled();
  });

  it('persists reusable production defaults without fabricating an approved snapshot', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {
        brandId: 'brand_preserved',
        selectedTrend: { candidate: { candidateId: 'trend_preserved' } },
      },
    });
    mocks.getScript.mockResolvedValue(storedDocument('session_canonical', 'script_1'));
    mocks.setSessionProductionConfiguration.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
    });
    const route = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await route.POST(postRequest(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        sessionId: 'session_alias',
        scriptId: 'script_1',
        expectedDocumentVersion: 1,
        profile,
        settings,
      },
    ));

    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('session_alias', 'user_member', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'script_1');
    expect(mocks.setSessionProductionConfiguration).toHaveBeenCalledWith(
      'session_canonical',
      { capabilityProfile: profile, shotSettings: settings },
    );
    expect(mocks.saveApprovedShootKitSnapshot).not.toHaveBeenCalled();

    const dbSource = readFileSync('lib/thinkforge/services/db.ts', 'utf8');
    expect(dbSource).toContain("'projectMeta.productionCapabilityProfile': input.capabilityProfile");
    expect(dbSource).toContain("'projectMeta.productionShotSettings': input.shotSettings");
    expect(dbSource).toContain("'metadata.approvedShootKitSnapshot': snapshot");
    expect(dbSource).toContain("'metadata.writerOutput.sidecarBinding.sidecarHash': input.expectedSidecarHash");
    expect(dbSource).not.toContain('export async function updateSession(');
  });

  it('rejects approval when the viewed document version is stale', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {},
    });
    mocks.getScript.mockResolvedValue({
      ...storedDocument('session_canonical', 'script_1'),
      version: 3,
    });
    const route = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await route.POST(postRequest(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        sessionId: 'session_alias',
        scriptId: 'script_1',
        expectedDocumentVersion: 2,
        profile,
        settings,
      },
    ));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reason: 'document-version-conflict',
      currentVersion: 3,
    });
    expect(mocks.setSessionProductionConfiguration).not.toHaveBeenCalled();
    expect(mocks.saveApprovedShootKitSnapshot).not.toHaveBeenCalled();
  });

  it('persists and returns an approved snapshot for the exact bound document', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {},
    });
    mocks.getScript.mockResolvedValue(productionDocument('session_canonical', 'script_1'));
    mocks.saveApprovedShootKitSnapshot.mockResolvedValue({
      ok: true,
      script: productionDocument('session_canonical', 'script_1'),
    });
    mocks.setSessionProductionConfiguration.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
    });
    const route = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await route.POST(postRequest(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        sessionId: 'session_alias',
        scriptId: 'script_1',
        expectedDocumentVersion: 1,
        profile: productionProfile,
        settings,
      },
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: 'ready',
      documentVersion: 1,
      approval: { status: 'approved', approvedBy: 'user_member' },
    });
    expect(mocks.saveApprovedShootKitSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session_canonical',
      scriptId: 'script_1',
      expectedVersion: 1,
      expectedContent: 'One useful, exact document.',
      snapshot: expect.objectContaining({ status: 'approved' }),
    }));

    const approvedSnapshot = mocks.saveApprovedShootKitSnapshot.mock.calls[0]![0].snapshot;
    const approvedDocument = productionDocument('session_canonical', 'script_1');
    (approvedDocument.metadata as Record<string, unknown>).approvedShootKitSnapshot = approvedSnapshot;
    mocks.getScript.mockResolvedValue(approvedDocument);
    const readResponse = await route.GET(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan?sessionId=session_alias&scriptId=script_1',
    ));

    expect(readResponse.status).toBe(200);
    expect(await readResponse.json()).toMatchObject({
      status: 'ready',
      documentVersion: 1,
      approval: {
        status: 'approved',
        snapshotHash: approvedSnapshot.snapshotHash,
      },
    });
  });
});

describe('approved Shoot Kit snapshot contract', () => {
  it('binds approval to the exact document and rejects a later revision', () => {
    const capabilityProfile = {
      ...profile,
      equipment: [
        { id: 'phone', label: 'Phone', category: 'camera', kind: 'phone', availability: 'owned' },
        { id: 'tripod', label: 'Tripod', category: 'support', kind: 'tripod', availability: 'owned' },
      ],
    };
    const resolution = resolveSceneShotPlan({
      profile: capabilityProfile,
      intent: {
        sceneId: 'scene_1',
        sidecarSceneIndex: 0,
        generationUnitId: 'unit_1',
        durationSec: 8,
        aspectRatio: '16:9',
        narrativePurpose: 'Show the evidence clearly.',
        emotionalBeat: 'Measured confidence.',
        energy: 0.4,
        visualPriority: 'The evidence in frame.',
        action: 'still',
        desiredFraming: 'medium',
        desiredAngle: 'eye-level',
        desiredMovement: 'static',
        simultaneousPerformers: 0,
        spokenAudio: false,
        performance: [],
      },
    });
    expect(resolution.status).toBe('resolved');
    if (resolution.status !== 'resolved') return;

    const snapshot = createApprovedShootKitSnapshot({
      sessionId: 'session_1',
      scriptId: 'script_1',
      sourceDocument: {
        version: 4,
        contentHash: 'a'.repeat(64),
        sidecarHash: 'b'.repeat(64),
      },
      profile: capabilityProfile,
      settings,
      plan: resolution.plan,
      approvedBy: 'user_1',
      approvedAt: new Date('2026-08-17T00:00:00.000Z'),
    });

    expect(verifyApprovedShootKitSnapshot({
      snapshot,
      sessionId: 'session_1',
      scriptId: 'script_1',
      documentVersion: 4,
      documentHash: 'a'.repeat(64),
      sidecarHash: 'b'.repeat(64),
    })).toMatchObject({ current: true });
    expect(verifyApprovedShootKitSnapshot({
      snapshot,
      sessionId: 'session_1',
      scriptId: 'script_1',
      documentVersion: 5,
      documentHash: 'a'.repeat(64),
      sidecarHash: 'b'.repeat(64),
    })).toMatchObject({ current: false, reason: 'document_version_mismatch' });
  });
});
