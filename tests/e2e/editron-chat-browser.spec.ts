import { expect, test, type BrowserContext, type Page } from '@playwright/test';

type JsonRecord = Record<string, unknown>;

interface ChatMessageRecord {
  role?: string;
  content?: string;
}

interface ChatSessionRecord {
  sessionId?: string;
  projectId?: string;
  messages?: ChatMessageRecord[];
}

interface ChatSessionsPayload {
  success?: boolean;
  sessions?: ChatSessionRecord[];
}

interface ProjectPayload {
  success?: boolean;
  project?: JsonRecord;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error('Missing required Editron browser-test environment variable: ' + name);
  }
  return value;
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  parsed.pathname = '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

async function installVercelBypass(
  context: BrowserContext,
  baseUrl: string,
  bypassToken: string | undefined,
): Promise<void> {
  if (!bypassToken) return;

  const origin = new URL(baseUrl).origin;
  await context.route(origin + '/**', async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        'x-vercel-protection-bypass': bypassToken,
        'x-vercel-set-bypass-cookie': 'true',
      },
    });
  });
}

function observeBrowserFailures(page: Page, baseUrl: string): string[] {
  const failures: string[] = [];
  const origin = new URL(baseUrl).origin;
  const add = (message: string) => {
    if (!failures.includes(message)) failures.push(message);
  };

  page.on('pageerror', (error) => {
    add('pageerror: ' + error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') add('console.error: ' + message.text());
  });
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin !== origin) return;
    add(
      'requestfailed: ' +
        request.method() +
        ' ' +
        request.url() +
        ' (' +
        (request.failure()?.errorText || 'unknown') +
        ')',
    );
  });
  page.on('response', (response) => {
    if (new URL(response.url()).origin !== origin || response.status() < 500) return;
    add(
      'server response: ' +
        response.status() +
        ' ' +
        response.request().method() +
        ' ' +
        response.url(),
    );
  });

  return failures;
}

async function getJson<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(path, {
    failOnStatusCode: false,
    headers: { 'cache-control': 'no-cache' },
  });
  const body = await response.text();

  expect(
    response.status(),
    'Expected authenticated JSON from ' + path + ', received: ' + body.slice(0, 500),
  ).toBe(200);

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error('Expected JSON from ' + path + ', received: ' + body.slice(0, 500));
  }
}

async function loadProject(page: Page, projectId: string): Promise<ProjectPayload> {
  const payload = await getJson<ProjectPayload>(
    page,
    '/api/services/editron/projects/' + encodeURIComponent(projectId),
  );
  expect(payload.success).toBe(true);
  expect(payload.project).toBeTruthy();
  return payload;
}

async function loadSessions(page: Page, projectId: string): Promise<ChatSessionRecord[]> {
  const payload = await getJson<ChatSessionsPayload>(
    page,
    '/api/services/editron/chat/sessions/list?projectId=' + encodeURIComponent(projectId),
  );
  expect(payload.success).toBe(true);

  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  expect(
    sessions.length,
    'Fixture project ' + projectId + ' needs at least one seeded chat session.',
  ).toBeGreaterThan(0);

  for (const session of sessions) {
    expect(session.projectId).toBe(projectId);
  }

  return sessions;
}

function projectFingerprint(payload: ProjectPayload): string {
  const project = payload.project || {};
  const overlays = Array.isArray(project.overlays) ? project.overlays : [];
  const overlayIdentity = overlays.map((entry) => {
    const overlay = (entry && typeof entry === 'object' ? entry : {}) as JsonRecord;
    return [
      String(overlay.id ?? ''),
      String(overlay.type ?? ''),
      Number(overlay.from ?? 0),
      Number(overlay.durationInFrames ?? 0),
    ];
  });

  return JSON.stringify({
    projectId: String(project.projectId ?? project.id ?? ''),
    name: String(project.name ?? ''),
    durationInFrames: Number(project.durationInFrames ?? 0),
    aspectRatio: String(project.aspectRatio ?? ''),
    overlayIdentity,
  });
}

function normalizeMessage(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function messageCandidates(session: ChatSessionRecord): string[] {
  return (session.messages || [])
    .filter((message) => message.role === 'user' && typeof message.content === 'string')
    .map((message) => normalizeMessage(message.content || '').slice(0, 180))
    .filter((content) => content.length >= 12)
    .sort((left, right) => right.length - left.length);
}

function requireUniqueLatestMarker(
  projectId: string,
  sessions: ChatSessionRecord[],
  foreignSessions: ChatSessionRecord[],
): string {
  const latest = sessions[0];
  const foreignText = foreignSessions
    .flatMap((session) => messageCandidates(session))
    .join('\n')
    .toLocaleLowerCase();

  const marker = messageCandidates(latest).find(
    (candidate) => !foreignText.includes(candidate.toLocaleLowerCase()),
  );

  if (!marker) {
    throw new Error(
      'Fixture project ' +
        projectId +
        ' needs a unique user message in its latest chat session so UI isolation can be proved.',
    );
  }

  return marker;
}

function projectPath(projectId: string): string {
  return '/dashboard/editron/project/' + encodeURIComponent(projectId);
}

async function waitForProjectApi(
  page: Page,
  projectId: string,
  navigation: () => Promise<unknown>,
): Promise<void> {
  const expectedPath =
    '/api/services/editron/projects/' + encodeURIComponent(projectId);
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === expectedPath &&
      response.request().method() === 'GET'
    );
  });

  await navigation();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp('/dashboard/editron/project/' + projectId + '/?$'));
  await expect(page.getByText('Project Not Found')).toHaveCount(0);
}

async function ensureChatOpen(page: Page): Promise<void> {
  const input = page.getByPlaceholder('Ask AI to edit your video...');

  if (!(await input.isVisible().catch(() => false))) {
    const toggle = page
      .getByRole('button', { name: /AI Chat|Ask AI/i })
      .first();
    await expect(toggle).toBeVisible();
    await toggle.click();
  }

  await expect(input).toBeVisible();
  await expect(page.getByText('Loading chats...')).toBeHidden();
}

async function openProject(page: Page, projectId: string): Promise<void> {
  await waitForProjectApi(page, projectId, () =>
    page.goto(projectPath(projectId), { waitUntil: 'domcontentloaded' }),
  );
  await ensureChatOpen(page);
}

async function hardRefreshProject(page: Page, projectId: string): Promise<void> {
  await waitForProjectApi(page, projectId, () =>
    page.reload({ waitUntil: 'domcontentloaded' }),
  );
  await ensureChatOpen(page);
}

test.describe('Editron Clerk-authenticated project isolation', () => {
  test('keeps project and chat state isolated across navigation and hard refresh', async ({
    page,
    context,
  }) => {
    const baseUrl = normalizeBaseUrl(requireEnv('EDITRON_E2E_BASE_URL'));
    const firstProjectId = requireEnv('EDITRON_E2E_PROJECT_ID');
    const secondProjectId = requireEnv('EDITRON_E2E_SECOND_PROJECT_ID');

    expect(firstProjectId).not.toBe(secondProjectId);

    await installVercelBypass(
      context,
      baseUrl,
      process.env.EDITRON_E2E_VERCEL_BYPASS_TOKEN?.trim(),
    );
    const browserFailures = observeBrowserFailures(page, baseUrl);

    await openProject(page, firstProjectId);

    const firstProject = await loadProject(page, firstProjectId);
    const firstSessions = await loadSessions(page, firstProjectId);
    const secondSessions = await loadSessions(page, secondProjectId);
    const firstMarker = requireUniqueLatestMarker(
      firstProjectId,
      firstSessions,
      secondSessions,
    );
    const secondMarker = requireUniqueLatestMarker(
      secondProjectId,
      secondSessions,
      firstSessions,
    );
    const firstFingerprint = projectFingerprint(firstProject);

    await expect(page.getByText(firstMarker, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(secondMarker, { exact: false })).toHaveCount(0);

    await hardRefreshProject(page, firstProjectId);
    expect(projectFingerprint(await loadProject(page, firstProjectId))).toBe(firstFingerprint);
    await expect(page.getByText(firstMarker, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(secondMarker, { exact: false })).toHaveCount(0);

    await openProject(page, secondProjectId);
    const secondProject = await loadProject(page, secondProjectId);
    const secondFingerprint = projectFingerprint(secondProject);

    await expect(page.getByText(firstMarker, { exact: false })).toHaveCount(0);
    await expect(page.getByText(secondMarker, { exact: false }).first()).toBeVisible();

    await hardRefreshProject(page, secondProjectId);
    expect(projectFingerprint(await loadProject(page, secondProjectId))).toBe(secondFingerprint);
    await expect(page.getByText(firstMarker, { exact: false })).toHaveCount(0);
    await expect(page.getByText(secondMarker, { exact: false }).first()).toBeVisible();

    await openProject(page, firstProjectId);
    expect(projectFingerprint(await loadProject(page, firstProjectId))).toBe(firstFingerprint);
    await expect(page.getByText(firstMarker, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(secondMarker, { exact: false })).toHaveCount(0);

    expect(
      browserFailures,
      'Authenticated browser failures:\n' + browserFailures.join('\n'),
    ).toEqual([]);
  });
});
