import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThinkForgeBrandAuthorityError } from '@/lib/thinkforge/context/brand-authoring-context';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectToDatabase: vi.fn(),
  findOne: vi.fn(),
  resolveCalosGenerationRoute: vi.fn(),
  getGenerator: vi.fn(),
  calosScope: vi.fn(),
  checkCredits: vi.fn(),
  createLinkedThinkForgeSession: vi.fn(),
  resolveCalosWriterContext: vi.fn(),
  deduct: vi.fn(),
  refund: vi.fn(),
  generator: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/schemas/ConnectToDatabase', () => ({ default: mocks.connectToDatabase }));
vi.mock('@/schemas/calos-deliverable', () => ({ default: { findOne: mocks.findOne } }));
vi.mock('@/lib/calos/generate/route-map', () => ({
  resolveCalosGenerationRoute: mocks.resolveCalosGenerationRoute,
  UnsupportedCalosFormatError: class UnsupportedCalosFormatError extends Error {},
}));
vi.mock('@/lib/calos/generate/contract', () => ({ getGenerator: mocks.getGenerator }));
vi.mock('@/lib/calos/scope', () => ({ calosScope: mocks.calosScope }));
vi.mock('@/lib/services/creditsMiddleware', () => ({ checkCredits: mocks.checkCredits }));
vi.mock('@/lib/calos/generate/register', () => ({}));
vi.mock('@/lib/calos/generate/generators/_brand-brief', () => ({
  resolveCalosWriterContext: mocks.resolveCalosWriterContext,
  CalosAuthoringContractError: class CalosAuthoringContractError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
      this.name = 'CalosAuthoringContractError';
    }
  },
}));
vi.mock('@/lib/calos/create-thinkforge-session', () => ({
  createLinkedThinkForgeSession: mocks.createLinkedThinkForgeSession,
}));

function request(): Request {
  return new Request('http://localhost/api/services/calos/generate', {
    method: 'POST',
    body: JSON.stringify({ brandId: 'brand_b', deliverableId: 'deliverable_1' }),
  });
}

const artifact = {
  content: 'A generated CalOS post.',
  documentType: 'social_post',
  contentContract: {
    version: 1,
    documentKind: 'post',
    outputKind: 'social_post',
    artifactType: 'social_post',
  },
  briefSnapshot: { output: { platform: 'linkedin', targetDurationSec: null } },
  authoringContextSnapshot: {
    version: 1,
    resolvedAt: '2026-08-16T00:00:00.000Z',
    scope: { kind: 'organization', brandId: 'brand_b' },
    brand: { brandId: 'brand_b' },
    retrieval: { projectFactIds: [], globalFactIds: [], interactionPatternTypes: [] },
    writingKnowledgeVersion: 'writing-knowledge-v3',
  },
  signalTrace: { outputFormat: 'social_post' },
  writerOutput: {
    writerType: 'post',
    contentAnalysis: { qualityScore: 96 },
    hashtags: [],
    visualPrompts: { singleImagePrompt: 'A brand-safe launch scene.' },
    sourceLedger: { ledgerVersion: 1, entries: [] },
    writerMetadata: { platform: 'linkedin' },
  },
};

describe('CalOS generation authoring preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.calosScope.mockReturnValue({ orgId: 'org_1', brandId: 'brand_b' });
    mocks.findOne.mockResolvedValue({
      campaignId: 'campaign_1',
      platform: 'linkedin',
      card: {
        id: 'deliverable_1',
        contentFormat: 'text',
        title: 'Launch post',
        details: 'Use launch proof.',
      },
      save: mocks.save,
    });
    mocks.resolveCalosGenerationRoute.mockReturnValue({ service: 'thinkforge' });
    mocks.getGenerator.mockReturnValue(mocks.generator);
    mocks.resolveCalosWriterContext.mockResolvedValue({
      projectMeta: { brandId: 'brand_b' },
      snapshot: { version: 1, brand: { brandId: 'brand_b' } },
      signalTrace: { outputFormat: 'social_post' },
    });
    mocks.checkCredits.mockResolvedValue({
      allowed: true,
      deduct: mocks.deduct,
      refund: mocks.refund,
    });
    mocks.generator.mockResolvedValue({
      ok: true,
      assetText: artifact.content,
      thinkforgeArtifact: artifact,
    });
    mocks.createLinkedThinkForgeSession.mockResolvedValue('session_linked');
    mocks.save.mockResolvedValue(undefined);
  });

  it('resolves before charging and forwards exact context and artifact', async () => {
    const { POST } = await import('@/app/api/services/calos/generate/route');

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(mocks.resolveCalosWriterContext).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: 'user_1',
      orgId: 'org_1',
      brandId: 'brand_b',
      deliverableId: 'deliverable_1',
    }));
    expect(mocks.resolveCalosWriterContext.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.checkCredits.mock.invocationCallOrder[0]);
    expect(mocks.generator).toHaveBeenCalledWith(expect.objectContaining({
      authoringContext: expect.objectContaining({ projectMeta: { brandId: 'brand_b' } }),
    }));
    expect(mocks.createLinkedThinkForgeSession).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 'brand_b',
      format: 'text',
      platform: 'linkedin',
      artifact,
    }));
    await expect(response.json()).resolves.toMatchObject({
      status: 'generated',
      sessionId: 'session_linked',
    });
  });

  it('returns 422 without charging when a carousel has no slide count', async () => {
    mocks.findOne.mockResolvedValueOnce({
      campaignId: 'campaign_1',
      platform: 'instagram',
      card: {
        id: 'deliverable_1',
        contentFormat: 'carousel',
        title: 'Launch carousel',
        details: 'Use launch proof.',
      },
      save: mocks.save,
    });
    const { CalosAuthoringContractError } = await import(
      '@/lib/calos/generate/generators/_brand-brief'
    );
    mocks.resolveCalosWriterContext.mockRejectedValueOnce(
      new CalosAuthoringContractError(
        'carousel_slide_count_required',
        'Choose the carousel slide count before generation.',
      ),
    );
    const { POST } = await import('@/app/api/services/calos/generate/route');

    const response = await POST(request() as never);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      error: 'Authoring settings incomplete',
      code: 'carousel_slide_count_required',
      message: 'Choose the carousel slide count before generation.',
    });
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.generator).not.toHaveBeenCalled();
  });

  it('does not charge or invoke a writer when the selected brand has no accepted profile', async () => {
    mocks.resolveCalosWriterContext.mockRejectedValueOnce(
      new ThinkForgeBrandAuthorityError('brand_profile_unavailable', 'The accepted profile is unavailable.'),
    );
    const { POST } = await import('@/app/api/services/calos/generate/route');

    const response = await POST(request() as never);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      error: 'Brand context unavailable',
      code: 'brand_profile_unavailable',
    });
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.generator).not.toHaveBeenCalled();
  });

  it('refunds and fails when canonical persistence cannot complete', async () => {
    mocks.createLinkedThinkForgeSession.mockRejectedValueOnce(new Error('Version conflict'));
    const { POST } = await import('@/app/api/services/calos/generate/route');

    const response = await POST(request() as never);

    expect(response.status).toBe(502);
    expect(mocks.refund).toHaveBeenCalledWith('Version conflict');
    expect(mocks.save).toHaveBeenCalled();
  });

  it('rejects a visible-copy result that has no canonical artifact', async () => {
    mocks.generator.mockResolvedValueOnce({ ok: true, assetText: 'Orphaned visible copy.' });
    const { POST } = await import('@/app/api/services/calos/generate/route');

    const response = await POST(request() as never);

    expect(response.status).toBe(502);
    expect(mocks.createLinkedThinkForgeSession).not.toHaveBeenCalled();
    expect(mocks.refund).toHaveBeenCalledWith('Generator returned no canonical ThinkForge artifact.');
  });

  it('does not report a drafting carousel as generated', async () => {
    const carouselArtifact = {
      ...artifact,
      documentType: 'carousel',
      contentContract: {
        version: 1,
        documentKind: 'post',
        outputKind: 'carousel',
        artifactType: 'carousel',
      },
    };
    mocks.generator.mockResolvedValueOnce({
      ok: true,
      status: 'drafting',
      assetText: carouselArtifact.content,
      thinkforgeArtifact: carouselArtifact,
    });
    const { POST } = await import('@/app/api/services/calos/generate/route');

    const response = await POST(request() as never);

    await expect(response.json()).resolves.toMatchObject({ status: 'drafting' });
  });
});
