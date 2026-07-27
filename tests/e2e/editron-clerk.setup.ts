import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { chromium, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

function requireEnv(name: string, aliases: string[] = []): string {
  for (const candidate of [name, ...aliases]) {
    const value = process.env[candidate]?.trim();
    if (value) return value;
  }

  const accepted = [name, ...aliases].join(' or ');
  throw new Error('Missing required Editron browser-test environment variable: ' + accepted);
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

export default async function setupClerkBrowserState(): Promise<void> {
  const baseUrl = normalizeBaseUrl(requireEnv('EDITRON_E2E_BASE_URL'));
  const projectId = requireEnv('EDITRON_E2E_PROJECT_ID');
  const userEmail = requireEnv('E2E_CLERK_USER_EMAIL');
  const publishableKey = requireEnv('CLERK_PUBLISHABLE_KEY', [
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  ]);
  const secretKey = requireEnv('CLERK_SECRET_KEY');
  const authStatePath = requireEnv('EDITRON_E2E_AUTH_STATE_PATH');
  const bypassToken = process.env.EDITRON_E2E_VERCEL_BYPASS_TOKEN?.trim();

  await clerkSetup({
    publishableKey,
    secretKey,
    dotenv: false,
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl });

  try {
    await installVercelBypass(context, baseUrl, bypassToken);
    const page = await context.newPage();

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await clerk.loaded({ page });
    await clerk.signIn({ page, emailAddress: userEmail });
    await page.waitForFunction(() => Boolean(window.Clerk?.session));

    const response = await page.request.get(
      '/api/services/editron/projects/' + encodeURIComponent(projectId),
      { failOnStatusCode: false },
    );

    if (response.status() !== 200) {
      const body = (await response.text()).slice(0, 500);
      throw new Error(
        'Clerk browser authentication did not authorize fixture project ' +
          projectId +
          ': HTTP ' +
          response.status() +
          ' ' +
          body,
      );
    }

    await mkdir(dirname(authStatePath), { recursive: true });
    await context.storageState({ path: authStatePath });
  } finally {
    await context.close();
    await browser.close();
  }
}
