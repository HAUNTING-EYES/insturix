import { createHash } from 'node:crypto';
import { expect, test, type Page, type Response } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import {
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
  type ThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import { buildThinkForgeIdeaAngle, type ThinkForgeIdeaAngle } from '@/lib/thinkforge/schemas/idea-angle';
import { buildThinkToClickHandoffState } from '@/lib/thinkforge/clickatron-handoff-state';
import { buildClickatronSessionFormData } from '@/lib/thinkforge/clickatron-session-payload';
import type { ThinkToClickContext } from '@/lib/thinkforge/clickatron-context';
import type { ThinkForgeBlock } from '@/lib/thinkforge/schemas/thinkforge-block';
import { THINKFORGE_E2E_BRAND_MARKERS } from '@/lib/thinkforge/testing/structured-writer-fixtures';
import {
  resolveThinkForgeBrowserTenantFixture,
  type ThinkForgeBrowserTenantFixture,
} from './thinkforge-browser-fixtures';

const SELECTED_EDITORIAL_ANGLE = buildThinkForgeIdeaAngle({
  ideaId: 'idea_approval_ownership',
  title: 'The Invisible Approval Queue',
  strategicPurpose: 'Show operators why unnamed approval ownership delays every launch.',
  creativeTreatment: 'Follow one launch card through a visible chain of handoffs and decisions.',
});

type SessionPayload = {
  sessionId?: string;
  orgId?: string | null;
  projectMeta?: {
    brandId?: string;
    brandBinding?: {
      version?: number;
      brandId?: string;
      scope?: string;
      orgId?: string | null;
      boundAt?: string;
    };
    authoringRequest?: ThinkForgeAuthoringRequest;
    editorialAngle?: ThinkForgeIdeaAngle;
  };
};

type CurrentScriptPayload = {
  script?: {
    sessionId?: string;
    scriptId?: string;
    content?: string;
    version?: number;
    metadata?: {
      authoringContextSnapshot?: {
        version?: number;
        scope?: {
          kind?: 'personal' | 'organization';
          brandId?: string;
        };
        brand?: {
          brandId?: string;
          recordId?: string;
          profileUpdatedAt?: string;
          profileFingerprint?: string;
        };
        [key: string]: unknown;
      };
      signalTrace?: Record<string, unknown>;
      briefSnapshot?: Record<string, unknown>;
      writerOutput?: {
        writerType?: string;
        contentAnalysis?: { qualityScore?: number };
        writerMetadata?: {
          platform?: string;
          charCount?: number;
        };
        sourceLedger?: Record<string, unknown>;
        profileCompliance?: Record<string, unknown>;
        generationTrace?: unknown;
        scriptSidecar?: {
          sidecarVersion?: number;
          acts?: Array<{
            narrativeScenes?: Array<{
              durationIntentSeconds?: number;
            }>;
          }>;
        };
      };
    };
  } | null;
};

type ScriptBlocksPayload = {
  blocks?: ThinkForgeBlock[];
  contentContract?: {
    outputKind?: string;
    carouselSlideCount?: number;
  } | null;
};

type ClickatronSessionPayload = {
  success?: boolean;
  sessionId?: string;
  variations?: Array<{
    status?: string;
    imageRef?: string;
    metadata?: {
      e2eMediaFixture?: { mode?: string; runId?: string };
    };
  }>;
};

type EditronExportPayload = {
  success?: boolean;
  sceneCount?: number;
  totalDurationSeconds?: number;
  productionManifest?: {
    sourceService?: string;
    sourceSessionId?: string;
    sourceScriptId?: string;
    expectedSceneCount?: number;
    parser?: {
      fallbackUsed?: boolean;
      sidecarUsed?: boolean;
      sidecarVersion?: number;
      sidecarSource?: string;
    };
  };
};

type ClickatronContextPayload = {
  handoffState?: {
    status?: string;
    canSendToClickatron?: boolean;
  };
  context?: {
    brandId?: string;
    metadata?: {
      thinkforge?: {
        authoringProvenance?: {
          version?: number;
          resolvedAt?: string;
          brand?: {
            brandId?: string;
            recordId?: string;
            profileUpdatedAt?: string;
            profileFingerprint?: string;
          };
          writingKnowledgeVersion?: string | null;
        };
      };
      clickatron?: {
        creativeSpec?: {
          kind?: string;
          renderPlan?: {
            slides?: Array<{ imagePrompt?: string }>;
          };
          validation?: { status?: string };
        };
      };
    };
  };
};

type ThinkForgeBrowserFixture = 'post' | 'carousel' | 'script';
type ThinkForgeBrowserFixtureMode = ThinkForgeBrowserFixture | 'auto';
type ThinkForgeWriterType = 'post' | 'script';
type ThinkForgeOutputKind = 'social_post' | 'carousel' | 'video_script';
type ThinkForgeE2EBrandMarker = typeof THINKFORGE_E2E_BRAND_MARKERS[keyof typeof THINKFORGE_E2E_BRAND_MARKERS];
type ThinkForgeBrowserScenario = {
  fixture: ThinkForgeBrowserFixture;
  format: string;
  platform: string;
  prompt: string;
  authoringRequest: ThinkForgeAuthoringRequest;
  expectedWriterType: ThinkForgeWriterType;
  expectedOutputKind: ThinkForgeOutputKind;
  expectedPlatformId: string;
  expectedPlatform: string;
  expectedVisibleContent: string;
  expectedStoredContent: string;
  expectedBrandMarker?: string;
};
type BrowserGenerationTrace = {
  version: number;
  operation: { kind: 'create' | 'edit'; id: string };
  document: {
    sessionId: string;
    scriptId: string;
    expectedVersion: number;
    writerType: ThinkForgeWriterType;
  };
  writer: {
    version: number;
    editorialPlan: Record<string, unknown>;
    editorialPlanHash: string;
    sourceLedgerHash?: string;
    provider: { provider: string; model: string; cacheStatus: string };
  };
  authoringContextSnapshotHash: string;
  signalTraceHash: string;
  productionBriefHash: string;
  sourceLedgerHash: string;
  outputHash: string;
  qualityGate: { status: string; evidenceHash: string };
};

type BrowserClerkHandle = {
  user: {
    getOrganizationMemberships(input?: { limit?: number }): Promise<{
      data: Array<{ organization: { id: string; slug?: string | null } }>;
    }>;
  } | null;
  organization: { id: string; slug?: string | null } | null;
  setActive(input: { organization: string | null }): Promise<void>;
};

type BrowserHttpResponse = {
  status: number;
  body: string;
};

type BrandDiagnosticsPayload = {
  ok?: boolean;
  brandId?: string;
  orgId?: string | null;
  services?: Array<{
    service?: string;
    source?: string;
    hasAcceptedProfile?: boolean;
  }>;
};

type SessionsMetadataPayload = {
  success?: boolean;
  total?: number;
  sessions?: Array<{
    id?: string;
    projectMeta?: { sessionName?: string };
  }>;
};

type BrowserGeneratedArtifact = {
  sessionId: string;
  scriptId: string;
  version: number;
  content: string;
  persisted: CurrentScriptPayload;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required ThinkForge E2E environment variable: ${name}`);
  return value;
}

function resolveBrowserTenantFixture(): ThinkForgeBrowserTenantFixture {
  return resolveThinkForgeBrowserTenantFixture({
    runId: requireEnv('THINKFORGE_E2E_RUN_ID'),
    adminEmail: requireEnv('THINKFORGE_E2E_USER_EMAIL'),
    personalBrandId: requireEnv('THINKFORGE_E2E_BRAND_ID'),
  });
}

async function signInThinkForgeBrowserUser(page: Page, emailAddress: string): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await clerk.loaded({ page });
  await clerk.signIn({ page, emailAddress });
  await page.waitForFunction(() => Boolean(window.Clerk?.session && window.Clerk?.user));
}

async function setActiveClerkOrganization(
  page: Page,
  organizationSlug: string | null,
): Promise<string | null> {
  const organizationId = await page.evaluate(async (expectedSlug) => {
    const clerkClient = window.Clerk as unknown as BrowserClerkHandle;
    if (!clerkClient?.user || typeof clerkClient.setActive !== 'function') {
      throw new Error('ThinkForge E2E requires a loaded Clerk user with setActive support.');
    }

    if (expectedSlug === null) {
      await clerkClient.setActive({ organization: null });
      return null;
    }

    const memberships = await clerkClient.user.getOrganizationMemberships({ limit: 100 });
    const membership = memberships.data.find(({ organization }) => organization.slug === expectedSlug);
    if (!membership) {
      throw new Error(`ThinkForge E2E could not find seeded organization ${expectedSlug}.`);
    }
    await clerkClient.setActive({ organization: membership.organization.id });
    return membership.organization.id;
  }, organizationSlug);

  await page.waitForFunction((expectedOrganizationId) => {
    const clerkClient = window.Clerk as unknown as BrowserClerkHandle;
    return expectedOrganizationId === null
      ? clerkClient.organization === null
      : clerkClient.organization?.id === expectedOrganizationId;
  }, organizationId);
  return organizationId;
}

function requireWriterFixture(): ThinkForgeBrowserFixtureMode {
  const fixture = requireEnv('THINKFORGE_E2E_WRITER_FIXTURE');
  if (fixture === 'post' || fixture === 'carousel' || fixture === 'script' || fixture === 'auto') {
    return fixture;
  }
  throw new Error(`Unsupported ThinkForge browser fixture: ${fixture}`);
}

function buildBrowserScenario(
  fixture: ThinkForgeBrowserFixture,
  requestAware: boolean,
): ThinkForgeBrowserScenario {
  const expectedBrandMarker = requestAware
    ? THINKFORGE_E2E_BRAND_MARKERS.formalPersonal
    : undefined;
  if (fixture === 'script') {
    return {
      fixture,
      format: '7-minute YouTube video script',
      platform: 'YouTube',
      prompt: 'Create a seven-minute montage-driven YouTube documentary with sparse voiceover. Use this supplied editorial framework as the only factual basis: hidden decision ownership can delay a campaign launch; name one decision owner; use one shared review lane; keep status and unresolved choices visible; preserve accepted decisions beside the work; test whether contributors can see the current artifact, owner, and next unresolved choice. Present the framework as practical guidance, not measured research.',
      authoringRequest: createThinkForgeAuthoringRequest({
        contentContract: createThinkForgeWriterContract('video_script'),
        platformSurface: { id: 'youtube' },
        publishingSurface: 'youtube_video',
        targetDurationSec: 420,
      }),
      expectedWriterType: 'script',
      expectedOutputKind: 'video_script',
      expectedPlatformId: 'youtube',
      expectedPlatform: 'youtube',
      expectedVisibleContent: 'The Invisible Queue',
      expectedStoredContent: 'The Invisible Queue',
      expectedBrandMarker,
    };
  }
  if (fixture === 'carousel') {
    return {
      fixture,
      format: 'LinkedIn carousel',
      platform: 'linkedin',
      prompt: 'Create a five-slide LinkedIn carousel about making approval ownership visible before a campaign launch.',
      authoringRequest: createThinkForgeAuthoringRequest({
        contentContract: createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 }),
        platformSurface: { id: 'linkedin' },
        publishingSurface: 'linkedin_document_carousel',
        postControls: createDefaultThinkForgePostControls(),
      }),
      expectedWriterType: 'post',
      expectedOutputKind: 'carousel',
      expectedPlatformId: 'linkedin',
      expectedPlatform: 'LinkedIn document carousel',
      expectedVisibleContent: 'Make approval ownership visible before a campaign launch',
      expectedStoredContent: 'Make approval ownership visible before a campaign launch',
      expectedBrandMarker,
    };
  }
  return {
    fixture,
    format: 'LinkedIn post',
    platform: 'linkedin',
    prompt: 'Create a LinkedIn post about making approval ownership visible before a campaign launch.',
    authoringRequest: createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('social_post'),
      platformSurface: { id: 'linkedin' },
      publishingSurface: 'linkedin_post',
      postControls: createDefaultThinkForgePostControls(),
    }),
    expectedWriterType: 'post',
    expectedOutputKind: 'social_post',
    expectedPlatformId: 'linkedin',
    expectedPlatform: 'LinkedIn post',
    expectedVisibleContent: 'Make approval ownership visible before a campaign launch',
    expectedStoredContent: 'Make approval ownership visible before a campaign launch',
    expectedBrandMarker,
  };
}

function configuredBrowserScenarios(): ThinkForgeBrowserScenario[] {
  const configured = requireWriterFixture();
  const fixtures: ThinkForgeBrowserFixture[] = configured === 'auto'
    ? ['post', 'carousel', 'script']
    : [configured];
  return fixtures.map((fixture) => buildBrowserScenario(fixture, configured === 'auto'));
}

interface ExpectedHttpFailure {
  status: number;
  method: string;
  pathname: string;
}

function observeBrowserFailures(
  page: Page,
  expectedHttpFailures: readonly ExpectedHttpFailure[] = [],
): string[] {
  const failures: string[] = [];
  const add = (message: string) => {
    if (!failures.includes(message)) failures.push(message);
  };

  page.on('pageerror', (error) => add(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Chromium duplicates HTTP failures as URL-less console messages. The
    // response listener below owns status + route classification.
    if (message.text().startsWith('Failed to load resource: the server responded with a status of')) return;
    add(`console.error: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const pathname = new URL(response.url()).pathname;
    const method = response.request().method();
    if (expectedHttpFailures.some((expected) => (
      expected.status === response.status()
      && expected.method === method
      && expected.pathname === pathname
    ))) return;
    add(`server response: ${response.status()} ${method} ${response.url()}`);
  });

  return failures;
}

async function fetchBrowserJson<T>(
  page: Page,
  pathname: string,
  method: 'GET' | 'POST',
  data?: unknown,
): Promise<T> {
  const response = await fetchBrowserResponse(page, pathname, method, data);

  expect(response.status, `Expected ${method} ${pathname} to succeed: ${response.body.slice(0, 500)}`).toBe(200);
  return JSON.parse(response.body) as T;
}

async function fetchBrowserResponse(
  page: Page,
  pathname: string,
  method: 'GET' | 'POST',
  data?: unknown,
): Promise<BrowserHttpResponse> {
  const response = await page.evaluate(async ({ pathname, method, data }) => {
    const result = await fetch(pathname, {
      method,
      headers: data === undefined ? undefined : { 'content-type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: result.status, body: await result.text() };
  }, { pathname, method, data });
  return response;
}

async function postBrowserFormData<T>(
  page: Page,
  pathname: string,
  formData: FormData,
  idempotencyKey: string,
): Promise<T> {
  const response = await page.request.post(pathname, {
    multipart: formData,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  const body = await response.text();
  expect(response.status(), `Expected POST ${pathname} to succeed: ${body.slice(0, 500)}`).toBe(200);
  return JSON.parse(body) as T;
}

async function readCurrentScript(
  page: Page,
  sessionId: string,
  scriptId: string,
): Promise<CurrentScriptPayload> {
  return fetchBrowserJson<CurrentScriptPayload>(
    page,
    '/api/services/thinkforge/script/current',
    'POST',
    { sessionId, scriptId },
  );
}

async function readScriptBlocks(
  page: Page,
  sessionId: string,
  scriptId: string,
): Promise<ScriptBlocksPayload> {
  return fetchBrowserJson<ScriptBlocksPayload>(
    page,
    `/api/services/thinkforge/script/blocks?sessionId=${encodeURIComponent(sessionId)}&scriptId=${encodeURIComponent(scriptId)}`,
    'GET',
  );
}

async function readGeneratedScriptUpdate(response: Response | string): Promise<{
  scriptId: string;
  version: number;
  eventTypes: string[];
}> {
  const body = typeof response === 'string' ? response : await response.text();
  const events = body
    .split(/\r?\n\r?\n/)
    .flatMap((record) => {
      const data = record
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s?/, ''))
        .join('\n');
      if (!data) return [];
      try {
        return [JSON.parse(data) as Record<string, unknown>];
      } catch (error) {
        throw new Error(`ThinkForge E2E received malformed SSE JSON: ${String(error)}`);
      }
    });
  const update = events.find((event) => event.type === 'script_update');
  const script = update?.script;
  const scriptId = script && typeof script === 'object' && !Array.isArray(script)
    ? (script as Record<string, unknown>).scriptId
    : undefined;
  const version = script && typeof script === 'object' && !Array.isArray(script)
    ? (script as Record<string, unknown>).version
    : undefined;
  if (typeof scriptId !== 'string' || !scriptId.trim()) {
    throw new Error('ThinkForge E2E generation did not emit an exact script_update.script.scriptId.');
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('ThinkForge E2E generation did not emit a positive script_update.script.version.');
  }
  const eventTypes = events.flatMap((event) => typeof event.type === 'string' ? [event.type] : []);
  return { scriptId, version, eventTypes };
}

function requireEvidence<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`ThinkForge E2E is missing ${label}.`);
  }
  return value;
}

function stableSerializeTraceValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '"[undefined]"';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerializeTraceValue).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerializeTraceValue(record[key])}`)
    .join(',')}}`;
}

function hashTraceValue(value: unknown): string {
  return createHash('sha256')
    .update(stableSerializeTraceValue(value).normalize('NFC'))
    .digest('hex');
}

function assertPersistedGenerationTrace(input: {
  persisted: CurrentScriptPayload;
  operationKind: 'create' | 'edit';
  writerType: ThinkForgeWriterType;
  outputKind: ThinkForgeOutputKind;
  platformId: string;
  editorialAngle: ThinkForgeIdeaAngle;
  committedVersion: number;
}): void {
  const script = requireEvidence(input.persisted.script, 'the persisted document');
  const metadata = requireEvidence(script.metadata, 'persisted document metadata');
  const writerOutput = requireEvidence(metadata.writerOutput, 'writer output metadata');
  const trace = requireEvidence(
    writerOutput.generationTrace as BrowserGenerationTrace | undefined,
    'the document generation trace',
  );
  const authoringContextSnapshot = requireEvidence(
    metadata.authoringContextSnapshot,
    'the authoring context snapshot',
  );
  const signalTrace = requireEvidence(metadata.signalTrace, 'the signal trace');
  const briefSnapshot = requireEvidence(metadata.briefSnapshot, 'the production brief snapshot');
  const sourceLedger = requireEvidence(writerOutput.sourceLedger, 'the source ledger');
  const profileCompliance = requireEvidence(
    writerOutput.profileCompliance,
    'profile-compliance evidence',
  );

  expect(trace.version).toBe(1);
  expect(trace.operation).toMatchObject({ kind: input.operationKind, id: expect.any(String) });
  expect(trace.document).toMatchObject({
    sessionId: script.sessionId,
    scriptId: script.scriptId,
    expectedVersion: input.committedVersion,
    writerType: input.writerType,
  });
  expect(script.version).toBeGreaterThanOrEqual(input.committedVersion);
  expect(trace.writer.editorialPlan).toMatchObject({
    version: 2,
    writerKind: input.writerType,
    authoringRequest: {
      contentContract: { outputKind: input.outputKind },
      platformSurface: { id: input.platformId },
    },
    creativeIntent: {
      source: 'selected_angle',
      selectedAngle: input.editorialAngle,
      overridePolicy: 'explicit_current_instruction_only',
    },
  });
  expect(trace.writer.editorialPlanHash).toBe(
    hashTraceValue(trace.writer.editorialPlan),
  );
  expect(trace.writer.provider).toMatchObject({
    model: 'thinkforge-e2e-stub',
    cacheStatus: 'inline',
  });
  expect(trace.authoringContextSnapshotHash).toBe(
    hashTraceValue(authoringContextSnapshot),
  );
  expect(trace.signalTraceHash).toBe(hashTraceValue(signalTrace));
  expect(trace.productionBriefHash).toBe(hashTraceValue(briefSnapshot));
  expect(trace.sourceLedgerHash).toBe(hashTraceValue(sourceLedger));
  expect(trace.writer.sourceLedgerHash).toBe(trace.sourceLedgerHash);
  expect(trace.outputHash).toBe(hashTraceValue(script.content));
  expect(trace.qualityGate).toEqual({
    status: 'passed',
    evidenceHash: hashTraceValue(profileCompliance),
  });
}

function authorityPostAuthoringRequest(): ThinkForgeAuthoringRequest {
  return createThinkForgeAuthoringRequest({
    contentContract: createThinkForgeWriterContract('social_post'),
    platformSurface: { id: 'linkedin' },
    publishingSurface: 'linkedin_post',
    postControls: createDefaultThinkForgePostControls(),
  });
}

function authorityPostProjectMeta(brandId: string, sessionName: string) {
  return {
    brandId,
    sessionName,
    idea: SELECTED_EDITORIAL_ANGLE.title,
    purpose: SELECTED_EDITORIAL_ANGLE.strategicPurpose,
    style: SELECTED_EDITORIAL_ANGLE.creativeTreatment,
    editorialAngle: SELECTED_EDITORIAL_ANGLE,
    authoringRequest: authorityPostAuthoringRequest(),
    format: 'LinkedIn post',
    platform: 'linkedin',
    tone: 'blue',
  };
}

async function assertServerBrandContext(input: {
  page: Page;
  expectedOrgId: string | null;
  brandId?: string;
}): Promise<void> {
  const query = input.brandId ? `?brandId=${encodeURIComponent(input.brandId)}` : '';
  const diagnostics = await fetchBrowserJson<BrandDiagnosticsPayload>(
    input.page,
    `/api/brand-vault/diagnostics${query}`,
    'GET',
  );
  expect(diagnostics.ok).toBe(true);
  expect(diagnostics.orgId ?? null).toBe(input.expectedOrgId);
  if (!input.brandId) return;

  expect(diagnostics.brandId).toBe(input.brandId);
  expect(diagnostics.services?.find(({ service }) => service === 'thinkforge')).toMatchObject({
    source: 'brand_vault',
    hasAcceptedProfile: true,
  });
}

async function createAndGenerateBrandPost(input: {
  page: Page;
  brandId: string;
  expectedScope: 'personal' | 'organization';
  expectedOrgId: string | null;
  expectedMarker: ThinkForgeE2EBrandMarker;
  forbiddenMarker: ThinkForgeE2EBrandMarker;
  sessionName: string;
}): Promise<BrowserGeneratedArtifact> {
  const created = await fetchBrowserJson<SessionPayload>(
    input.page,
    '/api/services/thinkforge/session',
    'POST',
    { projectMeta: authorityPostProjectMeta(input.brandId, input.sessionName) },
  );
  const sessionId = requireEvidence(created.sessionId, 'the authority-test session ID');
  expect(created.orgId ?? null).toBe(input.expectedOrgId);
  expect(created.projectMeta?.brandId).toBe(input.brandId);
  expect(created.projectMeta?.brandBinding).toMatchObject({
    version: 2,
    brandId: input.brandId,
    scope: input.expectedScope,
    orgId: input.expectedOrgId,
    boundAt: expect.any(String),
  });

  const generation = await fetchBrowserResponse(
    input.page,
    '/api/services/thinkforge/chat',
    'POST',
    {
      prompt: 'Create a LinkedIn post about making approval ownership visible before a campaign launch.',
      sessionId,
      scriptId: 'default',
      project: { brandId: input.brandId },
    },
  );
  expect(
    generation.status,
    `Expected ThinkForge authority generation to succeed: ${generation.body.slice(0, 500)}`,
  ).toBe(200);
  const update = await readGeneratedScriptUpdate(generation.body);

  await expect.poll(async () => {
    const current = await readCurrentScript(input.page, sessionId, update.scriptId);
    return current.script?.metadata?.writerOutput?.writerType;
  }, { timeout: 25_000 }).toBe('post');

  const persisted = await readCurrentScript(input.page, sessionId, update.scriptId);
  const script = requireEvidence(persisted.script, 'the authority-test persisted post');
  const content = requireEvidence(script.content, 'the authority-test post content');
  const snapshot = requireEvidence(
    script.metadata?.authoringContextSnapshot,
    'the authority-test authoring snapshot',
  );
  expect(content).toContain(input.expectedMarker);
  expect(content).not.toContain(input.forbiddenMarker);
  expect(snapshot).toMatchObject({
    version: 3,
    scope: { kind: input.expectedScope, brandId: input.brandId },
    brand: {
      brandId: input.brandId,
      recordId: expect.any(String),
      profileUpdatedAt: expect.any(String),
      profileFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    },
  });
  assertPersistedGenerationTrace({
    persisted,
    operationKind: 'create',
    writerType: 'post',
    outputKind: 'social_post',
    platformId: 'linkedin',
    editorialAngle: SELECTED_EDITORIAL_ANGLE,
    committedVersion: update.version,
  });

  return {
    sessionId,
    scriptId: update.scriptId,
    version: requireEvidence(script.version, 'the authority-test document version'),
    content,
    persisted,
  };
}

test.describe('ThinkForge authenticated authoring provenance', () => {
  test.beforeAll(async () => {
    await clerkSetup({
      publishableKey: requireEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'),
      secretKey: requireEnv('CLERK_SECRET_KEY'),
      dotenv: false,
    });
  });

  test.beforeEach(async ({ page }) => {
    await signInThinkForgeBrowserUser(page, requireEnv('THINKFORGE_E2E_USER_EMAIL'));
    await setActiveClerkOrganization(page, null);
    await page.goto('/dashboard/thinkforge', { waitUntil: 'domcontentloaded' });
    await fetchBrowserJson(page, '/api/services/thinkforge/sessions/metadata?limit=1&offset=0', 'GET');
  });

  for (const scenario of configuredBrowserScenarios()) {
    test(`binds the QA brand through ${scenario.fixture} generation, revision, and Clickatron provenance`, async ({ page }) => {
    if (process.env.THINKFORGE_E2E_MODE !== '1') {
      throw new Error('ThinkForge browser tests require THINKFORGE_E2E_MODE=1.');
    }

    const brandId = requireEnv('THINKFORGE_E2E_BRAND_ID');
    const runId = requireEnv('THINKFORGE_E2E_RUN_ID');
    const fixture = scenario.fixture;
    const sessionName = `TF E2E ${runId} ${fixture} ${Date.now()}`;
    const browserFailures = observeBrowserFailures(page, fixture === 'post'
      ? [{ status: 503, method: 'GET', pathname: '/api/services/thinkforge/script/blocks' }]
      : []);

    const created = await fetchBrowserJson<SessionPayload>(
      page,
      '/api/services/thinkforge/session',
      'POST',
      {
        projectMeta: {
          brandId,
          sessionName,
          idea: SELECTED_EDITORIAL_ANGLE.title,
          purpose: SELECTED_EDITORIAL_ANGLE.strategicPurpose,
          style: SELECTED_EDITORIAL_ANGLE.creativeTreatment,
          editorialAngle: SELECTED_EDITORIAL_ANGLE,
          authoringRequest: scenario.authoringRequest,
          format: scenario.format,
          platform: scenario.platform,
          tone: 'blue',
        },
      },
    );
    const sessionId = created.sessionId;
    expect(sessionId).toBeTruthy();
    expect(created.projectMeta?.brandId).toBe(brandId);
    expect(created.projectMeta?.brandBinding).toMatchObject({
      version: 2,
      brandId,
    });
    expect(created.projectMeta?.brandBinding?.boundAt).toBeTruthy();
    expect(created.projectMeta?.authoringRequest).toEqual(scenario.authoringRequest);
    expect(created.projectMeta?.editorialAngle).toEqual(SELECTED_EDITORIAL_ANGLE);

    const libraryButton = page.getByRole('button', { name: 'Library' });
    await expect(libraryButton).toBeVisible();
    await libraryButton.click({ force: true });
    await expect(page.getByText(sessionName, { exact: true })).toBeVisible();
    await page.getByText(sessionName, { exact: true }).click();

    const chatInput = page.getByPlaceholder('Ask the AI to write, edit, or improve your script...');
    await expect(chatInput).toBeVisible();
    const chatResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/services/thinkforge/chat' && response.request().method() === 'POST';
    });
    await chatInput.fill(scenario.prompt);
    await chatInput.press('Enter');
    const completedChatResponse = await chatResponse;
    expect(completedChatResponse.status()).toBe(200);
    expect(await completedChatResponse.finished()).toBeNull();
    const generatedUpdate = await readGeneratedScriptUpdate(completedChatResponse);
    const { scriptId } = generatedUpdate;

    await expect(page.getByText(scenario.expectedVisibleContent, { exact: false }).first()).toBeVisible();

    await expect.poll(async () => {
      const persisted = await readCurrentScript(page, sessionId!, scriptId);
      return persisted.script?.metadata?.writerOutput?.writerType;
    }, { timeout: 25_000 }).toBe(scenario.expectedWriterType);

    const persisted = await readCurrentScript(page, sessionId!, scriptId);
    const persistedBlocks = await readScriptBlocks(page, sessionId!, scriptId);
    expect(persisted.script?.scriptId).toBe(scriptId);
    expect(persisted.script?.content).toContain(scenario.expectedStoredContent);
    expect(persisted.script?.metadata?.writerOutput?.writerType).toBe(scenario.expectedWriterType);
    expect(persisted.script?.metadata?.writerOutput?.contentAnalysis?.qualityScore).toBe(92);
    expect(persisted.script?.metadata?.writerOutput?.writerMetadata).toMatchObject({
      platform: scenario.expectedPlatform,
    });
    if (scenario.expectedBrandMarker) {
      expect(persisted.script?.content).toContain(scenario.expectedBrandMarker);
      await expect(page.getByText(scenario.expectedBrandMarker, { exact: false }).first()).toBeVisible();
    }
    expect(persisted.script?.metadata?.authoringContextSnapshot?.brand).toMatchObject({ brandId });
    expect(persisted.script?.metadata?.authoringContextSnapshot?.brand?.recordId).toEqual(expect.any(String));
    expect(persisted.script?.metadata?.authoringContextSnapshot?.brand?.profileUpdatedAt).toEqual(expect.any(String));
    expect(persisted.script?.metadata?.authoringContextSnapshot?.brand?.profileFingerprint).toMatch(/^[a-f0-9]{64}$/);
    assertPersistedGenerationTrace({
      persisted,
      operationKind: 'create',
      writerType: scenario.expectedWriterType,
      outputKind: scenario.expectedOutputKind,
      platformId: scenario.expectedPlatformId,
      editorialAngle: SELECTED_EDITORIAL_ANGLE,
      committedVersion: generatedUpdate.version,
    });

    if (fixture === 'script') {
      const sidecar = requireEvidence(
        persisted.script?.metadata?.writerOutput?.scriptSidecar,
        'the persisted script sidecar',
      );
      const scenes = sidecar.acts?.flatMap((act) => act.narrativeScenes ?? []) ?? [];
      const durations = scenes.map((scene) => scene.durationIntentSeconds ?? 0);
      expect(sidecar.sidecarVersion).toBe(2);
      expect(scenes).toHaveLength(6);
      expect(durations.reduce((total, duration) => total + duration, 0)).toBe(420);
      expect(new Set(durations).size).toBeGreaterThan(1);
      expect(durations.every((duration) => duration > 0)).toBe(true);
    }

    const initialVersion = requireEvidence(persisted.script?.version, 'the initial document version');

    await page.goto('/dashboard/thinkforge', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Library' })).toBeVisible();
    await page.getByRole('button', { name: 'Library' }).click({ force: true });
    await page.getByText(sessionName, { exact: true }).click();
    await expect(page.getByText(scenario.expectedVisibleContent, { exact: false }).first()).toBeVisible();

    const editInput = page.getByPlaceholder('Ask the AI to write, edit, or improve your script...');
    const editResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/services/thinkforge/chat' && response.request().method() === 'POST';
    });
    await editInput.fill('Edit the entire existing document for tighter phrasing while preserving the approved angle, approval-ownership facts, and existing call to action.');
    await editInput.press('Enter');
    const completedEditResponse = await editResponse;
    expect(completedEditResponse.status()).toBe(200);
    expect(await completedEditResponse.finished()).toBeNull();
    const editedUpdate = await readGeneratedScriptUpdate(completedEditResponse);
    expect(editedUpdate.scriptId).toBe(scriptId);

    await expect.poll(async () => {
      const revised = await readCurrentScript(page, sessionId!, scriptId);
      return revised.script?.version ?? 0;
    }, { timeout: 25_000 }).toBeGreaterThan(initialVersion);

    const revised = await readCurrentScript(page, sessionId!, scriptId);
    expect(revised.script?.content).toContain(scenario.expectedStoredContent);
    assertPersistedGenerationTrace({
      persisted: revised,
      operationKind: 'edit',
      writerType: scenario.expectedWriterType,
      outputKind: scenario.expectedOutputKind,
      platformId: scenario.expectedPlatformId,
      editorialAngle: SELECTED_EDITORIAL_ANGLE,
      committedVersion: editedUpdate.version,
    });

    const clickatronContextRequestBody = fixture === 'carousel'
      ? {
          sessionId,
          scriptId,
          title: 'QA carousel provenance handoff',
          userVisualChoices: { kind: 'carousel', platform: 'linkedin', aspectRatio: '1:1', slideCount: 5 },
        }
      : { sessionId, scriptId, title: 'QA provenance handoff' };
    const clickatronContext = await fetchBrowserJson<ClickatronContextPayload>(
      page,
      '/api/services/thinkforge/clickatron-context',
      'POST',
      clickatronContextRequestBody,
    );
    const provenance = clickatronContext.context?.metadata?.thinkforge?.authoringProvenance;
    const revisedSnapshot = requireEvidence(
      revised.script?.metadata?.authoringContextSnapshot,
      'the revised authoring context snapshot',
    );
    expect(clickatronContext.context?.brandId).toBe(brandId);
    expect(revisedSnapshot.version).toBe(3);
    expect(provenance).toMatchObject({
      version: revisedSnapshot.version,
      resolvedAt: revisedSnapshot.resolvedAt,
      brand: {
        brandId,
        recordId: revisedSnapshot.brand?.recordId,
        profileUpdatedAt: revisedSnapshot.brand?.profileUpdatedAt,
        profileFingerprint: revisedSnapshot.brand?.profileFingerprint,
      },
      writingKnowledgeVersion: revisedSnapshot.writingKnowledgeVersion,
    });
    expect(JSON.stringify(clickatronContext.context?.metadata)).not.toContain('projectFactIds');
    expect(JSON.stringify(clickatronContext.context?.metadata)).not.toContain('globalFactIds');

    const creativeSpec = clickatronContext.context?.metadata?.clickatron?.creativeSpec;
    if (fixture === 'carousel') {
      expect(persistedBlocks.contentContract).toMatchObject({ outputKind: 'carousel', carouselSlideCount: 5 });
      expect(creativeSpec?.kind).toBe('carousel');
      expect(creativeSpec?.renderPlan?.slides).toHaveLength(5);
      expect(creativeSpec?.renderPlan?.slides?.every((slide: { imagePrompt?: string }) => Boolean(slide.imagePrompt))).toBe(true);
      expect(creativeSpec?.validation?.status).toBe('ready');
    } else if (fixture === 'script') {
      expect(creativeSpec).toBeUndefined();
      expect(clickatronContext.handoffState).toMatchObject({
        status: 'missing_sidecar',
        canSendToClickatron: false,
      });
    } else {
      expect(creativeSpec?.kind).toBe('single_post_visual');
      expect(creativeSpec?.validation?.status).toBe('ready');
    }

    if (fixture !== 'script') {
      const committedContextPayload = await fetchBrowserJson<ClickatronContextPayload>(
        page,
        '/api/services/thinkforge/clickatron-context',
        'POST',
        { ...clickatronContextRequestBody, operation: 'commit' },
      );
      const committedContext = requireEvidence(
        committedContextPayload.context,
        'the committed Clickatron handoff context',
      ) as unknown as ThinkToClickContext;
      const revisedBlocks = await readScriptBlocks(page, sessionId!, scriptId);
      const handoffState = buildThinkToClickHandoffState({
        context: committedContext,
        blocks: revisedBlocks.blocks ?? null,
        ...(fixture === 'carousel'
          ? {
              userVisualChoices: {
                kind: 'carousel' as const,
                platform: 'linkedin' as const,
                aspectRatio: '1:1',
                slideCount: 5,
              },
            }
          : {}),
      });
      expect(handoffState.status).toBe('ready');
      expect(handoffState.canSendToClickatron).toBe(true);

      const clickatronSession = await postBrowserFormData<ClickatronSessionPayload>(
        page,
        '/api/services/clickatron/session',
        buildClickatronSessionFormData(handoffState),
        `thinkforge-${runId}-${fixture}-${sessionId}-${scriptId}`,
      );
      const expectedVariationCount = fixture === 'carousel' ? 5 : 1;
      const variations = clickatronSession.variations ?? [];
      expect(clickatronSession.success).toBe(true);
      expect(clickatronSession.sessionId).toEqual(expect.any(String));
      expect(variations).toHaveLength(expectedVariationCount);
      expect(variations.filter((variation) => variation.status === 'completed'))
        .toHaveLength(expectedVariationCount);
      for (const variation of variations) {
        expect(variation.imageRef).toMatch(/^data:image\/png;base64,/);
        expect(variation.metadata?.e2eMediaFixture).toEqual({
          mode: 'completed',
          runId: runId.toLowerCase(),
        });
      }
    }

    if (fixture === 'script') {
      const scriptContent = requireEvidence(revised.script?.content, 'the persisted V2 script content');
      const scriptBlocks = requireEvidence(
        (await readScriptBlocks(page, sessionId!, scriptId)).blocks,
        'the persisted V2 script blocks',
      );
      const editronExport = await fetchBrowserJson<EditronExportPayload>(
        page,
        '/api/services/thinkforge/script/export-for-editron',
        'POST',
        { sessionId, scriptId, blocks: scriptBlocks, plainText: scriptContent, brandId },
      );

      expect(editronExport.success).toBe(true);
      expect(editronExport.sceneCount).toBe(6);
      expect(editronExport.totalDurationSeconds).toBe(420);
      expect(editronExport.productionManifest).toMatchObject({
        sourceService: 'thinkforge',
        sourceSessionId: sessionId,
        sourceScriptId: scriptId,
        expectedSceneCount: 6,
        parser: {
          fallbackUsed: false,
          sidecarUsed: true,
          sidecarVersion: 2,
          sidecarSource: 'stored-script',
        },
      });
    }

    if (fixture === 'post') {
      const documentWriteFailures: string[] = [];
      const recordDocumentWriteFailure = (response: Response) => {
        if (response.status() !== 404 && response.status() !== 409) return;
        const pathname = new URL(response.url()).pathname;
        if (pathname === '/api/commands' || pathname.startsWith('/api/services/thinkforge/script/')) {
          documentWriteFailures.push(`${response.status()} ${response.request().method()} ${pathname}`);
        }
      };
      page.on('response', recordDocumentWriteFailure);

      try {
        const secondChatResponse = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return url.pathname === '/api/services/thinkforge/chat' && response.request().method() === 'POST';
        });
        const secondChatInput = page.getByPlaceholder('Ask the AI to write, edit, or improve your script...');
        await secondChatInput.fill('Create a new LinkedIn post about making campaign handoff ownership visible before launch.');
        await secondChatInput.press('Enter');

        const completedSecondResponse = await secondChatResponse;
        expect(completedSecondResponse.status()).toBe(200);
        expect(await completedSecondResponse.finished()).toBeNull();
        const secondUpdate = await readGeneratedScriptUpdate(completedSecondResponse);
        expect(secondUpdate.scriptId).not.toBe(scriptId);

        const createdEventIndex = secondUpdate.eventTypes.indexOf('script_created');
        const updateEventIndex = secondUpdate.eventTypes.indexOf('script_update');
        expect(createdEventIndex).toBeGreaterThan(-1);
        expect(updateEventIndex).toBeGreaterThan(createdEventIndex);

        const secondPersisted = await readCurrentScript(page, sessionId!, secondUpdate.scriptId);
        expect(secondPersisted.script?.scriptId).toBe(secondUpdate.scriptId);
        expect(secondPersisted.script?.version).toBe(secondUpdate.version);
        expect(secondPersisted.script?.content).toContain(scenario.expectedStoredContent);
        await expect(page.getByText(scenario.expectedVisibleContent, { exact: false }).first()).toBeVisible();

        const blocksRoute = '**/api/services/thinkforge/script/blocks?**';
        let forcedHydrationFailure = false;
        await page.route(blocksRoute, async (route) => {
          const requestUrl = new URL(route.request().url());
          const isTargetDocument = requestUrl.searchParams.get('sessionId') === sessionId
            && requestUrl.searchParams.get('scriptId') === scriptId;
          if (!forcedHydrationFailure && isTargetDocument) {
            forcedHydrationFailure = true;
            await route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'E2E forced document hydration failure' }),
            });
            return;
          }
          await route.continue();
        });

        try {
          const originalDocumentTab = page
            .locator(`[data-document-id=${JSON.stringify(scriptId)}]`)
            .locator('button')
            .first();
          await expect(originalDocumentTab).toBeVisible();
          const failedLoadResponse = page.waitForResponse((response) => {
            const url = new URL(response.url());
            return url.pathname === '/api/services/thinkforge/script/blocks'
              && url.searchParams.get('sessionId') === sessionId
              && url.searchParams.get('scriptId') === scriptId;
          });
          await originalDocumentTab.click();
          expect((await failedLoadResponse).status()).toBe(503);

          const hydrationAlert = page.getByRole('alert').filter({
            hasText: 'E2E forced document hydration failure',
          });
          await expect(hydrationAlert).toBeVisible();

          const recoveredLoadResponse = page.waitForResponse((response) => {
            const url = new URL(response.url());
            return url.pathname === '/api/services/thinkforge/script/blocks'
              && url.searchParams.get('sessionId') === sessionId
              && url.searchParams.get('scriptId') === scriptId;
          });
          await page.getByRole('button', { name: 'Retry loading document' }).click();
          expect((await recoveredLoadResponse).status()).toBe(200);
          await expect(hydrationAlert).not.toBeVisible();
          await expect(page.getByText(scenario.expectedVisibleContent, { exact: false }).first()).toBeVisible();
        } finally {
          await page.unroute(blocksRoute);
        }

        await page.goto('/dashboard/thinkforge', { waitUntil: 'domcontentloaded' });
        await expect(page.getByText(scenario.expectedVisibleContent, { exact: false }).first()).toBeVisible();
        await expect(page.getByText(
          'Create a new LinkedIn post about making campaign handoff ownership visible before launch.',
          { exact: true },
        )).toBeVisible();
        expect(documentWriteFailures).toEqual([]);
      } finally {
        page.off('response', recordDocumentWriteFailure);
      }
    }

    expect(browserFailures, `ThinkForge browser failures:\n${browserFailures.join('\n')}`).toEqual([]);
    });
  }
});

test.describe.serial('ThinkForge organization brand authority isolation', () => {
  test.skip(
    requireWriterFixture() !== 'auto',
    'Organization isolation requires THINKFORGE_E2E_WRITER_FIXTURE=auto.',
  );

  let organizationArtifact: BrowserGeneratedArtifact | null = null;

  test.beforeAll(async () => {
    await clerkSetup({
      publishableKey: requireEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'),
      secretKey: requireEnv('CLERK_SECRET_KEY'),
      dotenv: false,
    });
  });

  test('binds the seeded organization brand and persists only the warm organization trace', async ({ page }) => {
    const tenant = resolveBrowserTenantFixture();
    const browserFailures = observeBrowserFailures(page);
    await signInThinkForgeBrowserUser(page, tenant.admin.email);
    const organizationId = requireEvidence(
      await setActiveClerkOrganization(page, tenant.organization.slug),
      'the active seeded Clerk organization ID',
    );
    await assertServerBrandContext({
      page,
      brandId: tenant.organizationBrand.brandId,
      expectedOrgId: organizationId,
    });

    organizationArtifact = await createAndGenerateBrandPost({
      page,
      brandId: tenant.organizationBrand.brandId,
      expectedScope: 'organization',
      expectedOrgId: organizationId,
      expectedMarker: THINKFORGE_E2E_BRAND_MARKERS.warmOrganization,
      forbiddenMarker: THINKFORGE_E2E_BRAND_MARKERS.formalPersonal,
      sessionName: `TF E2E ${tenant.runId} organization authority`,
    });
    expect(JSON.stringify(organizationArtifact.persisted.script?.metadata))
      .not.toContain(JSON.stringify(tenant.personalBrand.brandId));
    expect(browserFailures, `ThinkForge org-browser failures:\n${browserFailures.join('\n')}`).toEqual([]);
  });

  test('clears the active organization and keeps the personal brand free of organization leakage', async ({ page }) => {
    const tenant = resolveBrowserTenantFixture();
    const browserFailures = observeBrowserFailures(page);
    await signInThinkForgeBrowserUser(page, tenant.admin.email);
    expect(await setActiveClerkOrganization(page, null)).toBeNull();
    await assertServerBrandContext({
      page,
      brandId: tenant.personalBrand.brandId,
      expectedOrgId: null,
    });

    const personalArtifact = await createAndGenerateBrandPost({
      page,
      brandId: tenant.personalBrand.brandId,
      expectedScope: 'personal',
      expectedOrgId: null,
      expectedMarker: THINKFORGE_E2E_BRAND_MARKERS.formalPersonal,
      forbiddenMarker: THINKFORGE_E2E_BRAND_MARKERS.warmOrganization,
      sessionName: `TF E2E ${tenant.runId} personal authority`,
    });
    expect(JSON.stringify(personalArtifact.persisted.script?.metadata))
      .not.toContain(tenant.organizationBrand.brandId);
    expect(browserFailures, `ThinkForge personal-browser failures:\n${browserFailures.join('\n')}`).toEqual([]);
  });

  test('denies the restricted member before org-brand writer persistence', async ({ page }) => {
    const tenant = resolveBrowserTenantFixture();
    const seededArtifact = requireEvidence(
      organizationArtifact,
      'the admin-created organization artifact from the serial authority phase',
    );
    const browserFailures = observeBrowserFailures(page, [
      { status: 404, method: 'POST', pathname: '/api/services/thinkforge/session' },
      { status: 404, method: 'POST', pathname: '/api/services/thinkforge/chat' },
    ]);
    await signInThinkForgeBrowserUser(page, tenant.restrictedMember.email);
    const organizationId = requireEvidence(
      await setActiveClerkOrganization(page, tenant.organization.slug),
      'the restricted member active organization ID',
    );
    await assertServerBrandContext({ page, expectedOrgId: organizationId });

    const sessionsBefore = await fetchBrowserJson<SessionsMetadataPayload>(
      page,
      '/api/services/thinkforge/sessions/metadata?limit=100&offset=0',
      'GET',
    );
    const deniedSessionName = `TF E2E ${tenant.runId} restricted denial`;
    const deniedSession = await fetchBrowserResponse(
      page,
      '/api/services/thinkforge/session',
      'POST',
      {
        projectMeta: authorityPostProjectMeta(
          tenant.organizationBrand.brandId,
          deniedSessionName,
        ),
      },
    );
    expect(deniedSession.status).toBe(404);
    expect(JSON.parse(deniedSession.body)).toMatchObject({ code: 'brand_not_found' });

    const sessionsAfter = await fetchBrowserJson<SessionsMetadataPayload>(
      page,
      '/api/services/thinkforge/sessions/metadata?limit=100&offset=0',
      'GET',
    );
    expect(sessionsAfter.total).toBe(sessionsBefore.total);
    expect(sessionsAfter.sessions?.some(({ projectMeta }) => (
      projectMeta?.sessionName === deniedSessionName
    ))).toBe(false);

    const persistedBefore = await readCurrentScript(
      page,
      seededArtifact.sessionId,
      seededArtifact.scriptId,
    );
    expect(persistedBefore.script?.version).toBe(seededArtifact.version);
    expect(persistedBefore.script?.content).toBe(seededArtifact.content);

    const deniedGeneration = await fetchBrowserResponse(
      page,
      '/api/services/thinkforge/chat',
      'POST',
      {
        prompt: 'Rewrite this organization post. This request must be denied before writer dispatch.',
        sessionId: seededArtifact.sessionId,
        scriptId: seededArtifact.scriptId,
        project: { brandId: tenant.organizationBrand.brandId },
      },
    );
    expect(deniedGeneration.status).toBe(404);
    expect(JSON.parse(deniedGeneration.body)).toMatchObject({
      error: 'Brand context unavailable',
      code: 'brand_not_found',
    });

    const persistedAfter = await readCurrentScript(
      page,
      seededArtifact.sessionId,
      seededArtifact.scriptId,
    );
    expect(persistedAfter.script?.version).toBe(seededArtifact.version);
    expect(persistedAfter.script?.content).toBe(seededArtifact.content);
    expect(persistedAfter.script?.metadata?.writerOutput?.generationTrace).toEqual(
      persistedBefore.script?.metadata?.writerOutput?.generationTrace,
    );
    expect(browserFailures, `ThinkForge restricted-browser failures:\n${browserFailures.join('\n')}`).toEqual([]);
  });
});
