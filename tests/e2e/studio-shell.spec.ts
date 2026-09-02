import { existsSync, readFileSync } from 'node:fs';
import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';

/**
 * Studio four-place shell — browser E2E (plan §20 browser gate).
 *
 * Zero-credit by construction: it asserts SHELL surfaces (rail, places,
 * composer, project page chrome) that render identically in mock and real
 * mode, and never submits a real turn (real-mode turns hit engines that can
 * spend credits — those need explicit founder authorization per §20).
 * Authentication rides the Clerk dev-instance backdoor (clerk.signIn with a
 * fixture email), mirroring tests/e2e/editron-clerk.setup.ts.
 */

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const E2E_EMAIL = process.env.E2E_CLERK_USER_EMAIL?.trim() || 'studio-e2e+shell@insturix.dev';

/** Dev-instance only (sk_test asserted): create the fixture user if missing
 *  so the dev backdoor sign-in has someone to be. A live key is refused. */
async function ensureFixtureUser(): Promise<void> {
  const secret = process.env.CLERK_SECRET_KEY ?? '';
  if (!secret.startsWith('sk_test_')) throw new Error('studio E2E requires a Clerk DEV instance (sk_test_ key) — refusing to touch a live user directory');
  const res = await fetch('https://api.clerk.com/v1/users?skip_password_checks=true&skip_password_requirement=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_address: [E2E_EMAIL], first_name: 'Studio', last_name: 'E2E' }),
  });
  if (!res.ok && res.status !== 422) {
    // 422 = already exists — the happy path for every run after the first
    throw new Error(`fixture user provision failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

const test = base.extend<{ studioPage: { page: Page; context: BrowserContext } }>({
  studioPage: [async ({ browser }, use) => {
    await clerkSetup({
      publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
      secretKey: process.env.CLERK_SECRET_KEY ?? '',
      dotenv: false,
    });
    await ensureFixtureUser();
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3000' });
    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await clerk.loaded({ page });
    await clerk.signIn({ page, emailAddress: E2E_EMAIL });
    await page.waitForFunction(() => Boolean((window as { Clerk?: { session?: unknown } }).Clerk?.session));
    await use({ page, context });
    await context.close();
  }, { scope: 'test' }],
});

test.use({ storageState: { cookies: [], origins: [] } }); // self-contained auth — no shared authState file

test.describe('studio four-place shell', () => {
  test('the rail persists across places and every place opens', async ({ studioPage }) => {
    const { page } = studioPage;

    await page.goto('/studio', { waitUntil: 'domcontentloaded' });
    const rail = page.getByRole('navigation', { name: 'Studio places' });
    await expect(rail).toBeVisible();
    for (const label of ['Home', 'Project', 'Calendar', 'Library', 'Needs']) {
      await expect(rail.getByRole('link', { name: new RegExp(label, 'i') }).or(rail.getByRole('button', { name: new RegExp(label, 'i') }))).toBeVisible();
    }

    await page.goto('/studio/calendar', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
    await expect(rail).toBeVisible();

    await page.goto('/studio/library', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await expect(rail).toBeVisible();
  });

  test('Home renders the composer and never a mock project in the URL bar', async ({ studioPage }) => {
    const { page } = studioPage;
    await page.goto('/studio', { waitUntil: 'domcontentloaded' });
    const composer = page.getByRole('textbox', { name: 'What do you want to make?' });
    await expect(composer).toBeVisible();
    await expect(page).toHaveURL(/\/studio$/);
  });

  test('the project page loads with thread + stage chrome', async ({ studioPage }) => {
    const { page } = studioPage;
    // mock-mode demo deliverable — real projects land here via /studio/d/<projectId> identically
    await page.goto('/studio/d/del_mock_reel', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.stu-top')).toBeVisible();
    await expect(page.locator('.stu-main').or(page.locator('.stu-convo'))).toBeVisible();
  });

  test('the needs-you bell opens its slide-over panel', async ({ studioPage }) => {
    const { page } = studioPage;
    await page.goto('/studio', { waitUntil: 'domcontentloaded' });
    const bell = page.getByRole('button', { name: 'Needs you' });
    await expect(bell).toBeVisible();
    await bell.click();
    const pop = page.locator('.stu-needspop');
    await expect(pop).toBeVisible();
    await expect(pop).toContainText(/nothing needs you|open/i);
  });
});
