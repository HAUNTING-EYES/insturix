import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThinkForgeBrandAuthorityError } from '@/lib/thinkforge/context/brand-authoring-context';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectToDatabase: vi.fn(),
  findOne: vi.fn(),
  serviceForFormat: vi.fn(),
  getGenerator: vi.fn(),
  calosScope: vi.fn(),
  checkCredits: vi.fn(),
  createLinkedThinkForgeSession: vi.fn(),
  resolveCalosWriterContext: vi.fn(),
  deduct: vi.fn(),
  generator: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/schemas/ConnectToDatabase', () => ({ default: mocks.connectToDatabase }));
vi.mock('@/schemas/calos-deliverable', () => ({ default: { findOne: mocks.findOne } }));
vi.mock('@/lib/calos/generate/route-map', () => ({ serviceForFormat: mocks.serviceForFormat }));
vi.mock('@/lib/calos/generate/contract', () => ({ getGenerator: mocks.getGenerator }));
vi.mock('@/lib/calos/scope', () => ({ calosScope: mocks.calosScope }));
vi.mock('@/lib/services/creditsMiddleware', () => ({ checkCredits: mocks.checkCredits }));
vi.mock('@/lib/calos/generate/register', () => ({}));
vi.mock('@/lib/calos/generate/generators/_brand-brief', () => ({
  resolveCalosWriterContext: mocks.resolveCalosWriterContext,
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

describe('CalOS generation authoring preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.calosScope.mockReturnValue({ orgId: 'org_1', brandId: 'brand_b' });
    mocks.findOne.mockResolvedValue({
      campaignId: 'campaign_1',
      platform: 'linkedin',
      card: { id: 'deliverable_1', contentFormat: 'linkedin_post', title: 'Launch post', details: 'Use launch proof.' },
      save: mocks.save,
    });
    mocks.serviceForFormat.mockReturnValue('thinkforge');
    mocks.getGenerator.mockReturnValue(mocks.generator);
    mocks.resolveCalosWriterContext.mockResolvedValue({
      projectMeta: { brandId: 'brand_b' },
      snapshot: { version: 1, brand: { brandId: 'brand_b' } },
      signalTrace: { outputFormat: 'social_post' },
    });
    mocks.checkCredits.mockResolvedValue({ allowed: true, deduct: mocks.deduct });
    mocks.generator.mockResolvedValue({ ok: true, assetText: 'A generated CalOS post.' });
    mocks.createLinkedThinkForgeSession.mockResolvedValue('session_linked');
    mocks.save.mockResolvedValue(undefined);
  });

  it('resolves once before charging and forwards that exact context to the generator', async () => {
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
      format: 'linkedin_post',
      authoringContextSnapshot: { version: 1, brand: { brandId: 'brand_b' } },
      signalTrace: { outputFormat: 'social_post' },
    }));
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
});
