import { expect, test, type Page } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';

type SessionPayload = {
  sessionId?: string;
  projectMeta?: {
    brandId?: string;
    brandBinding?: {
      version?: number;
      brandId?: string;
      scope?: string;
      boundAt?: string;
    };
  };
};

type CurrentScriptPayload = {
  script?: {
    content?: string;
    metadata?: {
      authoringContextSnapshot?: {
        brand?: {
          brandId?: string;
          recordId?: string;
          profileUpdatedAt?: string;
          profileFingerprint?: string;
        };
      };
      writerOutput?: {
        writerType?: string;
        contentAnalysis?: { qualityScore?: number };
        writerMetadata?: {
          platform?: string;
          charCount?: number;
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

async function readCurrentScript(page: Page, sessionId: string): Promise<CurrentScriptPayload> {
  return fetchBrowserJson<CurrentScriptPayload>(
    page,
    '/api/services/thinkforge/script/current',
    'POST',
    { sessionId },
  );
}

async function readScriptBlocks(page: Page, sessionId: string): Promise<ScriptBlocksPayload> {
  return fetchBrowserJson<ScriptBlocksPayload>(
    page,
    `/api/services/thinkforge/script/blocks?sessionId=${encodeURIComponent(sessionId)}&scriptId=default`,
    'GET',
  );
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
          format: '60-second video script',
          platform: 'youtube-shorts',
          prompt: 'Create a 60-second video script about making approval ownership visible before a campaign launch.',
          expectedWriterType: 'script',
          expectedVisibleContent: 'Scene 1: Approval workflow beat 1',
          expectedStoredContent: '## Scene 1: Approval workflow beat 1',
        }
      : fixture === 'carousel'
        ? {
            format: 'LinkedIn carousel',
            platform: 'linkedin',
            prompt: 'Create a five-slide LinkedIn carousel about making approval ownership visible before a campaign launch.',
            expectedWriterType: 'post',
            expectedVisibleContent: 'Most LinkedIn content teams lose hours every week',
            expectedStoredContent: 'Most LinkedIn content teams lose hours every week',
          }
        : {
            format: 'LinkedIn post',
          platform: 'linkedin',
          prompt: 'Create a LinkedIn post about making approval ownership visible before a campaign launch.',
          expectedWriterType: 'post',
          expectedVisibleContent: 'Most LinkedIn content teams lose hours every week',
          expectedStoredContent: 'Most LinkedIn content teams lose hours every week',
          };

    const created = await fetchBrowserJson<SessionPayload>(
      page,
      '/api/services/thinkforge/session',
      'POST',
      {
        projectMeta: {
          brandId,
          sessionName,
          idea: 'A concrete operational artifact for a controlled ThinkForge browser test.',
          purpose: 'Prove session brand authority and persisted authoring provenance.',
          style: 'Direct and practical',
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
      version: 1,
      brandId,
    });
    expect(created.projectMeta?.brandBinding?.boundAt).toBeTruthy();

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

    await expect(page.getByText(scenario.expectedVisibleContent, { exact: false }).first()).toBeVisible();

    await expect.poll(async () => {
      const persisted = await readCurrentScript(page, sessionId!);
      return persisted.script?.metadata?.writerOutput?.writerType;
    }, { timeout: 25_000 }).toBe(scenario.expectedWriterType);

    const persisted = await readCurrentScript(page, sessionId!);
    const persistedBlocks = await readScriptBlocks(page, sessionId!);
    expect(persisted.script?.content).toContain(scenario.expectedStoredContent);
    expect(persisted.script?.metadata?.writerOutput?.writerType).toBe(scenario.expectedWriterType);
    expect(persisted.script?.metadata?.writerOutput?.contentAnalysis?.qualityScore).toBe(92);
    expect(persisted.script?.metadata?.writerOutput?.writerMetadata).toMatchObject(
      fixture === 'script' ? { platform: 'youtube-shorts' } : { platform: 'linkedin' },
    );
    expect(persisted.script?.metadata?.authoringContextSnapshot?.brand).toMatchObject({ brandId });
    expect(persisted.script?.metadata?.authoringContextSnapshot?.brand?.recordId).toEqual(expect.any(String));
    expect(persisted.script?.metadata?.authoringContextSnapshot?.brand?.profileUpdatedAt).toEqual(expect.any(String));
    expect(persisted.script?.metadata?.authoringContextSnapshot?.brand?.profileFingerprint).toMatch(/^[a-f0-9]{64}$/);

    await page.goto('/dashboard/thinkforge', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Library' })).toBeVisible();
    await page.getByRole('button', { name: 'Library' }).click({ force: true });
    await page.getByText(sessionName, { exact: true }).click();
    await expect(page.getByText(scenario.expectedVisibleContent, { exact: false }).first()).toBeVisible();

    const clickatronContext = await fetchBrowserJson<ClickatronContextPayload>(
      page,
      '/api/services/thinkforge/clickatron-context',
      'POST',
      fixture === 'carousel'
        ? {
            sessionId,
            title: 'QA carousel provenance handoff',
            userVisualChoices: { kind: 'carousel', platform: 'linkedin', aspectRatio: '1:1', slideCount: 3 },
          }
        : { sessionId, title: 'QA provenance handoff' },
    );
    const provenance = clickatronContext.context?.metadata?.thinkforge?.authoringProvenance;
    expect(clickatronContext.context?.brandId).toBe(brandId);
    expect(provenance).toMatchObject({
      version: 1,
      brand: {
        brandId,
        recordId: persisted.script?.metadata?.authoringContextSnapshot?.brand?.recordId,
        profileFingerprint: persisted.script?.metadata?.authoringContextSnapshot?.brand?.profileFingerprint,
      },
    });
    expect(JSON.stringify(clickatronContext.context?.metadata)).not.toContain('projectFactIds');
    expect(JSON.stringify(clickatronContext.context?.metadata)).not.toContain('globalFactIds');

    const creativeSpec = clickatronContext.context?.metadata?.clickatron?.creativeSpec;
    if (fixture === 'carousel') {
      expect(persistedBlocks.contentContract).toMatchObject({ outputKind: 'carousel', carouselSlideCount: 5 });
      expect(creativeSpec?.kind).toBe('carousel');
      expect(creativeSpec?.renderPlan?.slides).toHaveLength(3);
      expect(creativeSpec?.renderPlan?.slides?.every((slide: { imagePrompt?: string }) => Boolean(slide.imagePrompt))).toBe(true);
      expect(creativeSpec?.validation?.status).toBe('ready');
    } else if (fixture === 'script') {
      expect(creativeSpec?.kind).toBe('single_post_visual');
      expect(creativeSpec?.validation?.status).toBe('needs_user_input');
    } else {
      expect(creativeSpec?.kind).toBe('single_post_visual');
      expect(creativeSpec?.validation?.status).toBe('ready');
    }

    expect(browserFailures, `ThinkForge browser failures:\n${browserFailures.join('\n')}`).toEqual([]);
  });
});
