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

const SELECTED_EDITORIAL_ANGLE = buildThinkForgeIdeaAngle({
  ideaId: 'idea_approval_ownership',
  title: 'The Invisible Approval Queue',
  strategicPurpose: 'Show operators why unnamed approval ownership delays every launch.',
  creativeTreatment: 'Follow one launch card through a visible chain of handoffs and decisions.',
});

type SessionPayload = {
  sessionId?: string;
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
  contentContract?: {
    outputKind?: string;
    carouselSlideCount?: number;
  } | null;
};

type ClickatronContextPayload = {
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
type ThinkForgeWriterType = 'post' | 'script';
type ThinkForgeOutputKind = 'social_post' | 'carousel' | 'video_script';
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

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required ThinkForge E2E environment variable: ${name}`);
  return value;
}

function requireWriterFixture(): ThinkForgeBrowserFixture {
  const fixture = requireEnv('THINKFORGE_E2E_WRITER_FIXTURE');
  if (fixture === 'post' || fixture === 'carousel' || fixture === 'script') return fixture;
  throw new Error(`Unsupported ThinkForge browser fixture: ${fixture}`);
}

function observeBrowserFailures(page: Page): string[] {
  const failures: string[] = [];
  const add = (message: string) => {
    if (!failures.includes(message)) failures.push(message);
  };

  page.on('pageerror', (error) => add(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') add(`console.error: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) {
      add(`server response: ${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  return failures;
}

async function fetchBrowserJson<T>(
  page: Page,
  pathname: string,
  method: 'GET' | 'POST',
  data?: unknown,
): Promise<T> {
  const response = await page.evaluate(async ({ pathname, method, data }) => {
    const result = await fetch(pathname, {
      method,
      headers: data === undefined ? undefined : { 'content-type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: result.status, body: await result.text() };
  }, { pathname, method, data });

  expect(response.status, `Expected ${method} ${pathname} to succeed: ${response.body.slice(0, 500)}`).toBe(200);
  return JSON.parse(response.body) as T;
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

async function readGeneratedScriptUpdate(response: Response): Promise<{
  scriptId: string;
  version: number;
  eventTypes: string[];
}> {
  const body = await response.text();
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

test.describe('ThinkForge authenticated authoring provenance', () => {
  test.beforeAll(async () => {
    await clerkSetup({
      publishableKey: requireEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'),
      secretKey: requireEnv('CLERK_SECRET_KEY'),
      dotenv: false,
    });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await clerk.loaded({ page });
    await clerk.signIn({ page, emailAddress: requireEnv('THINKFORGE_E2E_USER_EMAIL') });
    await page.waitForFunction(() => Boolean(window.Clerk?.session));
    await page.goto('/dashboard/thinkforge', { waitUntil: 'domcontentloaded' });
    await fetchBrowserJson(page, '/api/services/thinkforge/sessions/metadata?limit=1&offset=0', 'GET');
  });

  test('binds the QA brand and preserves the fixture authoring contract across workspace and Clickatron handoff', async ({ page }) => {
    if (process.env.THINKFORGE_E2E_MODE !== '1') {
      throw new Error('ThinkForge browser tests require THINKFORGE_E2E_MODE=1.');
    }

    const brandId = requireEnv('THINKFORGE_E2E_BRAND_ID');
    const runId = requireEnv('THINKFORGE_E2E_RUN_ID');
    const fixture = requireWriterFixture();
    const sessionName = `TF E2E ${runId} ${Date.now()}`;
    const browserFailures = observeBrowserFailures(page);

    const scenario = fixture === 'script'
      ? {
          format: '7-minute YouTube video script',
          platform: 'YouTube',
          prompt: 'Create a seven-minute montage-driven YouTube documentary with sparse voiceover about making approval ownership visible before a campaign launch.',
          authoringRequest: createThinkForgeAuthoringRequest({
            contentContract: createThinkForgeWriterContract('video_script'),
            platformSurface: { id: 'youtube' },
            publishingSurface: 'youtube_video',
            targetDurationSec: 420,
          }),
          expectedWriterType: 'script' as const,
          expectedOutputKind: 'video_script' as const,
          expectedPlatformId: 'youtube',
          expectedPlatform: 'youtube',
          expectedVisibleContent: 'Scene 1: The Invisible Queue',
          expectedStoredContent: '## Scene 1: The Invisible Queue',
        }
      : fixture === 'carousel'
        ? {
            format: 'LinkedIn carousel',
            platform: 'linkedin',
            prompt: 'Create a five-slide LinkedIn carousel about making approval ownership visible before a campaign launch.',
            authoringRequest: createThinkForgeAuthoringRequest({
              contentContract: createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 }),
              platformSurface: { id: 'linkedin' },
              publishingSurface: 'linkedin_document_carousel',
              postControls: createDefaultThinkForgePostControls(),
            }),
            expectedWriterType: 'post' as const,
            expectedOutputKind: 'carousel' as const,
            expectedPlatformId: 'linkedin',
            expectedPlatform: 'LinkedIn document carousel',
            expectedVisibleContent: 'Make approval ownership visible before a campaign launch',
            expectedStoredContent: 'Make approval ownership visible before a campaign launch',
          }
        : {
            format: 'LinkedIn post',
            platform: 'linkedin',
            prompt: 'Create a LinkedIn post about making approval ownership visible before a campaign launch.',
            authoringRequest: createThinkForgeAuthoringRequest({
              contentContract: createThinkForgeWriterContract('social_post'),
              platformSurface: { id: 'linkedin' },
              publishingSurface: 'linkedin_post',
              postControls: createDefaultThinkForgePostControls(),
            }),
            expectedWriterType: 'post' as const,
            expectedOutputKind: 'social_post' as const,
            expectedPlatformId: 'linkedin',
            expectedPlatform: 'LinkedIn post',
            expectedVisibleContent: 'Make approval ownership visible before a campaign launch',
            expectedStoredContent: 'Make approval ownership visible before a campaign launch',
          };

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

    const clickatronContext = await fetchBrowserJson<ClickatronContextPayload>(
      page,
      '/api/services/thinkforge/clickatron-context',
      'POST',
      fixture === 'carousel'
        ? {
            sessionId,
            scriptId,
            title: 'QA carousel provenance handoff',
            userVisualChoices: { kind: 'carousel', platform: 'linkedin', aspectRatio: '1:1', slideCount: 5 },
          }
        : { sessionId, scriptId, title: 'QA provenance handoff' },
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
      expect(creativeSpec?.kind).toBe('single_post_visual');
      expect(creativeSpec?.validation?.status).toBe('needs_user_input');
    } else {
      expect(creativeSpec?.kind).toBe('single_post_visual');
      expect(creativeSpec?.validation?.status).toBe('ready');
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
});
