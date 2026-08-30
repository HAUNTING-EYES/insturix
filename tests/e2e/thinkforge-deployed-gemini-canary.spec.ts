import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';

import { resolveThinkForgeBrowserTenantFixture } from './thinkforge-browser-fixtures';

type CanaryAttestation = {
  safe?: boolean;
  failures?: string[];
  deployment?: { gitCommitSha?: string | null; host?: string | null };
  isolation?: { runId?: string | null; e2eFixtureDisabled?: boolean; runScopedDatabases?: boolean; testClerk?: boolean };
  providers?: { geminiConfigured?: boolean; nonGeminiProviderKeysDisabled?: boolean };
  externalIntegrationsDisabled?: boolean;
};

type BrowserHttpResponse = { status: number; body: string };
type SessionPayload = { sessionId?: string };
type ScriptPayload = {
  script?: {
    scriptId?: string;
    version?: number;
    content?: string;
    blocks?: unknown[];
    contentContract?: { outputKind?: string };
    metadata?: Record<string, unknown>;
  } | null;
};
type ScriptBlocksPayload = { blocks?: unknown[] };
type EditronExportPayload = {
  success?: boolean;
  sceneCount?: number;
  productionManifest?: {
    parser?: { fallbackUsed?: boolean; sidecarUsed?: boolean; sidecarVersion?: number };
  };
};
type CanaryDocumentVerification = {
  verified?: boolean;
  failures?: string[];
  document?: {
    sessionId?: string;
    scriptId?: string;
    documentVersion?: number | null;
    outputKind?: string | null;
    authoringContext?: { brandId?: string | null; profileFingerprint?: string | null };
    writer?: { provider?: string | null; model?: string | null; cacheStatus?: string | null };
    traceIntegrity?: { valid?: boolean };
    generationReceipt?: { valid?: boolean };
  } | null;
  cost?: {
    eventCount?: number;
    totalCostUsd?: number;
    events?: Array<{
      eventId?: string | null;
      provider?: string | null;
      model?: string | null;
      operation?: string | null;
      status?: string | null;
      costUsd?: number | null;
      functionMs?: number | null;
    }>;
  };
  diagnostics?: { criticalAlertCodes?: string[] };
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required deployed Gemini canary environment variable: ${name}`);
  return value;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function signIn(page: Page, emailAddress: string): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await clerk.loaded({ page });
  await clerk.signIn({ page, emailAddress });
  await page.waitForFunction(() => Boolean(window.Clerk?.session && window.Clerk?.user));
}

async function browserRequest(page: Page, pathname: string, method: 'GET' | 'POST', data?: unknown): Promise<BrowserHttpResponse> {
  return page.evaluate(async ({ pathname: urlPath, method: requestMethod, data: requestData }) => {
    const response = await fetch(urlPath, {
      method: requestMethod,
      headers: requestData === undefined ? undefined : { 'content-type': 'application/json' },
      body: requestData === undefined ? undefined : JSON.stringify(requestData),
    });
    return { status: response.status, body: await response.text() };
  }, { pathname, method, data });
}

async function browserJson<T>(page: Page, pathname: string, method: 'GET' | 'POST', data?: unknown): Promise<T> {
  const response = await browserRequest(page, pathname, method, data);
  expect(response.status, `${method} ${pathname} failed: ${response.body.slice(0, 500)}`).toBe(200);
  return JSON.parse(response.body) as T;
}

function parseScriptUpdate(body: string): { scriptId: string; version: number } {
  const events = body.split(/\r?\n\r?\n/).flatMap((record) => {
    const data = record.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s?/, ''))
      .join('\n');
    return data ? [JSON.parse(data) as Record<string, unknown>] : [];
  });
  const script = recordOf(events.find((event) => event.type === 'script_update')?.script);
  const scriptId = typeof script?.scriptId === 'string' ? script.scriptId : null;
  const version = typeof script?.version === 'number' ? script.version : null;
  if (!scriptId || typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('The deployed Gemini canary did not receive a committed script_update event.');
  }
  return { scriptId, version };
}

function readWriterTrace(metadata: unknown): Record<string, unknown> {
  const writerOutput = recordOf(recordOf(metadata)?.writerOutput);
  const trace = recordOf(writerOutput?.generationTrace);
  if (!trace) throw new Error('The deployed Gemini canary document has no generation trace.');
  return trace;
}

function writeReceiptArtifact(runId: string, value: unknown): string {
  const output = resolve(process.cwd(), `.artifacts/thinkforge-deployed-canary/${runId}/receipt.json`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(value, null, 2));
  return output;
}

async function verifyCanaryDocument(input: { sessionId: string; scriptId: string }): Promise<CanaryDocumentVerification> {
  const response = await fetch(`${requireEnv('THINKFORGE_CANARY_BASE_URL')}/api/internal/thinkforge/canary-attestation`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-thinkforge-canary-secret': requireEnv('THINKFORGE_CANARY_ATTESTATION_SECRET'),
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  const body = await response.text();
  expect(response.status, `Canary persisted-document verification failed: ${body.slice(0, 500)}`).toBe(200);
  return JSON.parse(body) as CanaryDocumentVerification;
}

test.describe.serial('ThinkForge deployed Gemini canary', () => {
  let attestation: CanaryAttestation;

  test.beforeAll(async () => {
    await clerkSetup({
      publishableKey: requireEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'),
      secretKey: requireEnv('CLERK_SECRET_KEY'),
      dotenv: false,
    });

    const response = await fetch(`${requireEnv('THINKFORGE_CANARY_BASE_URL')}/api/internal/thinkforge/canary-attestation`, {
      headers: { 'x-thinkforge-canary-secret': requireEnv('THINKFORGE_CANARY_ATTESTATION_SECRET') },
      cache: 'no-store',
    });
    const body = await response.text();
    expect(response.status, `Canary attestation failed: ${body.slice(0, 500)}`).toBe(200);
    attestation = JSON.parse(body) as CanaryAttestation;
    expect(attestation.safe).toBe(true);
    expect(attestation.failures).toEqual([]);
    expect(attestation.deployment?.gitCommitSha).toBe(requireEnv('THINKFORGE_CANARY_EXPECTED_COMMIT'));
    expect(attestation.isolation).toMatchObject({
      runId: requireEnv('THINKFORGE_E2E_RUN_ID'),
      e2eFixtureDisabled: true,
      runScopedDatabases: true,
      testClerk: true,
    });
    expect(attestation.providers).toEqual({ geminiConfigured: true, nonGeminiProviderKeysDisabled: true });
    expect(attestation.externalIntegrationsDisabled).toBe(true);

  });

  test('generates one synthetic video script and records a verifiable Gemini receipt', async ({ page }, testInfo) => {
    const runId = requireEnv('THINKFORGE_E2E_RUN_ID');
    const tenant = resolveThinkForgeBrowserTenantFixture({
      runId,
      adminEmail: requireEnv('THINKFORGE_E2E_USER_EMAIL'),
      personalBrandId: requireEnv('THINKFORGE_E2E_BRAND_ID'),
    });
    const browserFailures: string[] = [];
    page.on('pageerror', (error) => browserFailures.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && /thinkforge|script|chat|hydration|av script/i.test(message.text())) {
        browserFailures.push(`console.error: ${message.text()}`);
      }
    });

    await signIn(page, tenant.admin.email);
    const sessionName = `Gemini Canary ${runId} ${Date.now()}`;
    const authoringRequest = {
      version: 1,
      contentContract: {
        version: 1,
        documentKind: 'script',
        outputKind: 'video_script',
        artifactType: 'screenplay',
      },
      platformSurface: { id: 'youtube' },
      publishingSurface: 'youtube_video',
      targetDurationSec: 45,
    };
    const created = await browserJson<SessionPayload>(page, '/api/services/thinkforge/session', 'POST', {
      projectMeta: {
        brandId: tenant.organizationBrand.brandId,
        sessionName,
        idea: 'A visible review lane',
        purpose: 'Explain one synthetic operating habit without external claims.',
        style: 'Calm, specific, abstract editorial explanation.',
        format: '45-second YouTube video script',
        platform: 'YouTube',
        tone: 'blue',
        authoringRequest,
      },
    });
    const sessionId = created.sessionId;
    expect(sessionId).toEqual(expect.any(String));

    await page.goto('/dashboard/thinkforge', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Library' }).click({ force: true });
    await page.getByText(sessionName, { exact: true }).click();
    const input = page.getByPlaceholder('Ask the AI to write, edit, or improve your script...');
    await expect(input).toBeVisible();

    const responsePromise = page.waitForResponse((response) => (
      new URL(response.url()).pathname === '/api/services/thinkforge/chat'
      && response.request().method() === 'POST'
    ));
    await input.fill(`Create a 45-second non-factual video script for the selected synthetic brand ${tenant.organizationBrand.name}. Explain this supplied operating pattern only: one shared review lane keeps the current artifact, decision owner, and next unresolved choice visible. Use calm, practical language. Treat this as a narrated motion-graphics explainer with no physical filming, no source footage, no customer facts, and no invented metrics.`);
    await input.press('Enter');
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const update = parseScriptUpdate(await response.text());

    await expect.poll(async () => {
      const current = await browserJson<ScriptPayload>(page, '/api/services/thinkforge/script/current', 'POST', {
        sessionId,
        scriptId: update.scriptId,
      });
      return recordOf(current.script?.metadata)?.writerOutput ? current : null;
    }, { timeout: 180_000 }).not.toBeNull();

    const current = await browserJson<ScriptPayload>(page, '/api/services/thinkforge/script/current', 'POST', {
      sessionId,
      scriptId: update.scriptId,
    });
    const script = current.script;
    expect(script?.version).toBe(update.version);
    expect(script?.contentContract?.outputKind).toBe('video_script');
    expect(script?.content?.trim().length).toBeGreaterThan(120);

    const trace = readWriterTrace(script?.metadata);
    const writer = recordOf(trace.writer);
    const provider = recordOf(writer?.provider);
    expect(provider?.provider).toBe('gemini');
    expect(provider?.model).toEqual(expect.any(String));
    expect(provider?.model).not.toBe('thinkforge-e2e-stub');

    await expect(page.getByRole('button', { name: 'AV Script' })).toBeVisible();
    await expect(page.getByText('What is heard', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('What the audience sees', { exact: true }).first()).toBeVisible();

    const avPresentation = await browserJson<Record<string, unknown>>(
      page,
      `/api/services/thinkforge/script/av-presentation?sessionId=${encodeURIComponent(sessionId!)}&scriptId=${encodeURIComponent(update.scriptId)}`,
      'GET',
    );
    expect(avPresentation.status).toBe('available');

    const blocks = await browserJson<ScriptBlocksPayload>(
      page,
      `/api/services/thinkforge/script/blocks?sessionId=${encodeURIComponent(sessionId!)}&scriptId=${encodeURIComponent(update.scriptId)}`,
      'GET',
    );
    const handoff = await browserJson<EditronExportPayload>(page, '/api/services/thinkforge/script/export-for-editron', 'POST', {
      sessionId,
      scriptId: update.scriptId,
      blocks: blocks.blocks,
      plainText: script?.content,
      brandId: tenant.organizationBrand.brandId,
    });
    expect(handoff.success).toBe(true);
    expect(handoff.sceneCount).toBeGreaterThan(0);
    expect(handoff.productionManifest?.parser).toMatchObject({
      fallbackUsed: false,
      sidecarUsed: true,
      sidecarVersion: 3,
    });

    const verification = await verifyCanaryDocument({ sessionId: sessionId!, scriptId: update.scriptId });
    expect(verification.verified).toBe(true);
    expect(verification.failures).toEqual([]);
    expect(verification.document).toMatchObject({
      sessionId,
      scriptId: update.scriptId,
      documentVersion: update.version,
      outputKind: 'video_script',
      authoringContext: { brandId: tenant.organizationBrand.brandId },
      writer: { provider: 'gemini' },
      traceIntegrity: { valid: true },
      generationReceipt: { valid: true },
    });
    expect(verification.document?.authoringContext?.profileFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(verification.document?.writer?.model).toEqual(expect.any(String));
    const costEvents = verification.cost?.events ?? [];
    expect(costEvents.length).toBeGreaterThan(0);
    expect(costEvents.every((event) => event.provider === 'gemini')).toBe(true);
    expect(costEvents.some((event) => event.status === 'success')).toBe(true);
    expect(costEvents.every((event) => (
      typeof event.costUsd === 'number' && Number.isFinite(event.costUsd) && event.costUsd >= 0
      && typeof event.functionMs === 'number' && Number.isFinite(event.functionMs) && event.functionMs >= 0
    ))).toBe(true);
    expect(verification.cost?.totalCostUsd).toBeLessThanOrEqual(Number(requireEnv('THINKFORGE_CANARY_APPROVED_MAX_USD')));
    expect(verification.diagnostics?.criticalAlertCodes).toEqual([]);
    expect(browserFailures).toEqual([]);

    const receiptArtifact = {
      runId,
      operator: requireEnv('THINKFORGE_CANARY_OPERATOR'),
      approvedMaxUsd: Number(requireEnv('THINKFORGE_CANARY_APPROVED_MAX_USD')),
      deployment: attestation.deployment,
      document: { sessionId, scriptId: update.scriptId, version: update.version },
      authoringContext: verification.document?.authoringContext,
      writer: verification.document?.writer,
      cost: verification.cost,
      handoff: handoff.productionManifest?.parser,
      diagnostics: verification.diagnostics,
    };
    const receiptPath = writeReceiptArtifact(runId, receiptArtifact);
    await testInfo.attach('thinkforge-deployed-gemini-canary-receipt.json', {
      body: Buffer.from(JSON.stringify(receiptArtifact, null, 2)),
      contentType: 'application/json',
    });
    expect(receiptPath).toContain(runId);
  });
});
