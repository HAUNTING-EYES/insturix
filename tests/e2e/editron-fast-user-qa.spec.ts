import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';

import {
  buildEditronFastQaArtifactPaths,
  buildEditronFastQaProjectDiff,
  buildEditronFastQaScenarioManifest,
  writeEditronFastQaJson,
  type EditronFastQaArtifactPathsV1,
} from '../../lib/editron/services/editron-fast-user-qa';

type JsonRecord = Record<string, unknown>;

interface ProjectPayload {
  success?: boolean;
  project?: JsonRecord;
}

interface FixtureManifest {
  selectedOverlayId?: string | number;
}

interface BrowserObserver {
  failures: string[];
  providerRequests: string[];
  duringNavigation: <T>(operation: () => Promise<T>) => Promise<T>;
}

const baseUrl = normalizeBaseUrl(
  process.env.EDITRON_E2E_BASE_URL?.trim() || 'http://localhost:3000',
);
const projectId = requireEnv('EDITRON_E2E_PROJECT_ID');
const runId = process.env.EDITRON_FAST_QA_RUN_ID?.trim() || `ad-hoc-${Date.now()}`;
const outputRoot = process.env.EDITRON_FAST_QA_OUTPUT_ROOT?.trim()
  || '.calibration-temp/editron-fast-user-qa';
const artifactPaths = buildEditronFastQaArtifactPaths(outputRoot, runId, projectId);

test.describe('Editron fast visible user QA', () => {
  test('proves one real timeline edit, playback attempt, correction, undo/redo, and reload', async ({
    page,
    context,
  }) => {
    await mkdir(artifactPaths.root, { recursive: true });
    const observer = observeBrowserFailures(page, baseUrl);
    const startedAt = new Date().toISOString();
    const saveReceipts: Array<Record<string, unknown>> = [];
    const stages: Record<string, Record<string, unknown>> = {};
    const projectValues: Record<string, unknown> = {};
    let traceStarted = false;
    let failure: string | undefined;
    let playback: Record<string, unknown> = {
      status: 'UNVERIFIABLE',
      reason: 'Playback was not attempted.',
    };

    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;

    try {
      await installVercelBypass(
        context,
        baseUrl,
        process.env.EDITRON_E2E_VERCEL_BYPASS_TOKEN?.trim(),
      );
      await openProject(page, projectId, observer);

      const fixtureManifest = await readFixtureManifest(artifactPaths.fixtureManifestPath);
      const beforePayload = await loadProject(page, projectId);
      const beforeProject = requireProject(beforePayload);
      projectValues.before = beforeProject;
      await writeStage(artifactPaths, 'before', beforeProject, page);
      const targetOverlay = pickTargetTextOverlay(beforeProject, fixtureManifest);
      const targetLabel = textOverlayLabel(targetOverlay);
      expect(targetLabel, 'Fixture must contain a visible selected text overlay.').toBeTruthy();

      const targetItem = page
        .locator('.cursor-grab')
        .filter({ hasText: targetLabel.slice(0, 80) })
        .first();
      await expect(targetItem).toBeVisible();
      const baselineStyle = await targetItem.getAttribute('style');
      stages.baseline = {
        status: 'PASS',
        projectDigest: buildEditronFastQaProjectDiff(beforeProject, beforeProject).beforeDigest,
        overlayId: targetOverlay.id,
        label: targetLabel,
      };

      playback = await provePlayback(page);
      stages.playback = playback;
      expect(
        playback.status,
        `Visible playback did not become ready: ${JSON.stringify(playback)}`,
      ).toBe('PASS');

      await dragTimelineItem(page, targetItem, -1);
      await expect
        .poll(() => targetItem.getAttribute('style'), {
          message: 'Visible timeline item did not move after the drag.',
        })
        .not.toBe(baselineStyle);
      const firstEditStyle = await targetItem.getAttribute('style');
      const firstEditReceipt = await saveEditorProject(page, projectId);
      saveReceipts.push({ stage: 'first-edit', ...firstEditReceipt });
      const firstEditProject = requireProject(await loadProject(page, projectId));
      projectValues.firstEdit = firstEditProject;
      await writeStage(artifactPaths, 'firstEdit', firstEditProject, page);
      const firstEditDiff = buildEditronFastQaProjectDiff(beforeProject, firstEditProject);
      expect(firstEditDiff.changed, 'The first visible timeline drag must persist a diff.').toBe(true);
      stages.visibleTimelineEdit = {
        status: 'PASS',
        styleChanged: firstEditStyle !== baselineStyle,
        diff: firstEditDiff,
      };

      const correctionItem = page
        .locator('.cursor-grab')
        .filter({ hasText: targetLabel.slice(0, 80) })
        .first();
      await expect(correctionItem).toBeVisible();
      await dragTimelineItem(page, correctionItem, 1);
      await expect
        .poll(() => correctionItem.getAttribute('style'), {
          message: 'Visible correction did not change the timeline item.',
        })
        .not.toBe(firstEditStyle);
      const correctionStyle = await correctionItem.getAttribute('style');
      const correctionReceipt = await saveEditorProject(page, projectId);
      saveReceipts.push({ stage: 'correction', ...correctionReceipt });
      const correctionProject = requireProject(await loadProject(page, projectId));
      projectValues.correction = correctionProject;
      await writeStage(artifactPaths, 'correction', correctionProject, page);
      const correctionDiff = buildEditronFastQaProjectDiff(firstEditProject, correctionProject);
      expect(correctionDiff.changed, 'The visible correction must persist a diff.').toBe(true);
      stages.correction = {
        status: 'PASS',
        styleChanged: correctionStyle !== firstEditStyle,
        diff: correctionDiff,
      };

      const undoButton = iconButton(page, 'lucide-undo-2');
      await expect(undoButton).toBeVisible();
      await expect(undoButton).toBeEnabled();
      await undoButton.click();
      await expect
        .poll(() => correctionItem.getAttribute('style'), {
          message: 'Undo did not restore the first edit in the visible timeline.',
        })
        .toBe(firstEditStyle);
      const undoReceipt = await saveEditorProject(page, projectId);
      saveReceipts.push({ stage: 'undo', ...undoReceipt });
      const undoProject = requireProject(await loadProject(page, projectId));
      projectValues.undo = undoProject;
      await writeStage(artifactPaths, 'undo', undoProject, page);
      const undoDiff = buildEditronFastQaProjectDiff(firstEditProject, undoProject);
      expect(undoDiff.beforeDigest).toBe(undoDiff.afterDigest);
      stages.undo = {
        status: 'PASS',
        restoredFirstEdit: undoDiff.beforeDigest === undoDiff.afterDigest,
        diff: undoDiff,
      };

      const redoButton = iconButton(page, 'lucide-redo-2');
      await expect(redoButton).toBeVisible();
      await expect(redoButton).toBeEnabled();
      await redoButton.click();
      await expect
        .poll(() => correctionItem.getAttribute('style'), {
          message: 'Redo did not restore the visible correction.',
        })
        .toBe(correctionStyle);
      const redoReceipt = await saveEditorProject(page, projectId);
      saveReceipts.push({ stage: 'redo', ...redoReceipt });
      const redoProject = requireProject(await loadProject(page, projectId));
      projectValues.redo = redoProject;
      await writeStage(artifactPaths, 'redo', redoProject, page);
      const redoDiff = buildEditronFastQaProjectDiff(correctionProject, redoProject);
      expect(redoDiff.beforeDigest).toBe(redoDiff.afterDigest);
      stages.redo = {
        status: 'PASS',
        restoredCorrection: redoDiff.beforeDigest === redoDiff.afterDigest,
        diff: redoDiff,
      };

      await observer.duringNavigation(async () => {
        await waitForProjectApi(page, projectId, () =>
          page.reload({ waitUntil: 'domcontentloaded' }),
        );
      });
      const reloadedProject = requireProject(await loadProject(page, projectId));
      projectValues.reload = reloadedProject;
      await writeStage(artifactPaths, 'reload', reloadedProject, page);
      const reloadDiff = buildEditronFastQaProjectDiff(redoProject, reloadedProject);
      expect(reloadDiff.beforeDigest).toBe(reloadDiff.afterDigest);
      stages.reload = {
        status: 'PASS',
        persistedRedo: reloadDiff.beforeDigest === reloadDiff.afterDigest,
        diff: reloadDiff,
      };

      const reloadedTarget = page
        .locator('.cursor-grab')
        .filter({ hasText: targetLabel.slice(0, 80) })
        .first();
      await expect(reloadedTarget).toBeVisible();
      const playbackAfterReload = await provePlayback(page);
      stages.playbackAfterReload = playbackAfterReload;
      expect(
        playbackAfterReload.status,
        `Visible playback after reload did not become ready: ${JSON.stringify(playbackAfterReload)}`,
      ).toBe('PASS');
      expect(observer.providerRequests, 'Provider inference must stay disabled in this lane.').toEqual([]);
      expect(observer.failures, 'Visible Editron journey must not emit browser failures.').toEqual([]);
    } catch (error) {
      failure = error instanceof Error ? error.stack ?? error.message : String(error);
      throw error;
    } finally {
      const completedAt = new Date().toISOString();
      if (traceStarted) {
        await context.tracing.stop({ path: artifactPaths.tracePath }).catch((error) => {
          failure = failure || `Could not write Playwright trace: ${String(error)}`;
        });
      }
      await writeStageDiff(artifactPaths, projectValues);
      const manifest = buildEditronFastQaScenarioManifest({
        projectId,
        runId,
        baseUrl,
      });
      await writeJourneyEvidence(artifactPaths, {
        version: manifest.version,
        scenarioId: manifest.scenarioId,
        projectId,
        runId,
        startedAt,
        completedAt,
        status: failure ? 'FAIL' : 'PASS',
        layers: {
          exact: {
            status: failure ? 'FAIL' : 'PASS',
            reason: failure || null,
          },
          perceptual: {
            status: 'UNVERIFIABLE',
            reason: 'Q2 rendered-frame and PCM proof is outside this Q0/Q1 lane.',
          },
          human: {
            status: 'UNVERIFIABLE',
            reason: 'Human review is not automated in the fast lane.',
          },
        },
        stages,
        playback,
        saveReceipts,
        providerRequests: observer.providerRequests,
        browserFailures: observer.failures,
        artifactRefs: artifactReferences(artifactPaths),
        error: failure || null,
      });
    }
  });
});

async function installVercelBypass(
  context: BrowserContext,
  originUrl: string,
  bypassToken: string | undefined,
): Promise<void> {
  if (!bypassToken) return;
  const origin = new URL(originUrl).origin;
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

function observeBrowserFailures(page: Page, originUrl: string): BrowserObserver {
  const failures: string[] = [];
  const providerRequests: string[] = [];
  const origin = new URL(originUrl).origin;
  let navigationDepth = 0;
  const add = (message: string) => {
    if (!failures.includes(message)) failures.push(message);
  };

  page.on('pageerror', (error) => add(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') add(`console.error: ${message.text()}`);
  });
  page.on('request', (request) => {
    if (isProviderUrl(request.url())) providerRequests.push(redactUrl(request.url()));
  });
  page.on('requestfailed', (request) => {
    try {
      if (new URL(request.url()).origin !== origin) return;
    } catch {
      return;
    }
    const errorText = request.failure()?.errorText || 'unknown';
    if (navigationDepth > 0 && errorText === 'net::ERR_ABORTED') return;
    add(`requestfailed: ${request.method()} ${redactUrl(request.url())} (${errorText})`);
  });
  page.on('response', (response) => {
    try {
      if (new URL(response.url()).origin !== origin || response.status() < 500) return;
    } catch {
      return;
    }
    add(`server response: ${response.status()} ${response.request().method()} ${redactUrl(response.url())}`);
  });

  return {
    failures,
    providerRequests,
    duringNavigation: async <T,>(operation: () => Promise<T>): Promise<T> => {
      navigationDepth += 1;
      try {
        return await operation();
      } finally {
        navigationDepth -= 1;
      }
    },
  };
}

async function openProject(
  page: Page,
  id: string,
  observer: BrowserObserver,
): Promise<void> {
  await observer.duringNavigation(async () => {
    await waitForProjectApi(page, id, () =>
      page.goto(projectPath(id), { waitUntil: 'domcontentloaded' }),
    );
    await expect(page.locator('#remotion-player-container')).toBeVisible();
    await expect(page.getByText('Project Not Found')).toHaveCount(0);
  });
}

async function waitForProjectApi(
  page: Page,
  id: string,
  navigation: () => Promise<unknown>,
): Promise<void> {
  const expectedPath = `/api/services/editron/projects/${encodeURIComponent(id)}`;
  const responsePromise = page.waitForResponse((response) => {
    try {
      return new URL(response.url()).pathname === expectedPath
        && response.request().method() === 'GET';
    } catch {
      return false;
    }
  });
  await navigation();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/dashboard/editron/project/${escapeRegExp(id)}/?$`));
}

async function getJson<T>(page: Page, requestPath: string): Promise<T> {
  const response = await page.request.get(requestPath, {
    failOnStatusCode: false,
    headers: { 'cache-control': 'no-cache' },
  });
  const body = await response.text();
  expect(response.status(), `Expected authenticated JSON from ${requestPath}: ${body.slice(0, 500)}`).toBe(200);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`Expected JSON from ${requestPath}: ${body.slice(0, 500)}`);
  }
}

async function loadProject(page: Page, id: string): Promise<ProjectPayload> {
  const payload = await getJson<ProjectPayload>(
    page,
    `/api/services/editron/projects/${encodeURIComponent(id)}`,
  );
  expect(payload.success).toBe(true);
  expect(payload.project).toBeTruthy();
  return payload;
}

async function saveEditorProject(page: Page, id: string): Promise<Record<string, unknown>> {
  const expectedPath = `/api/services/editron/projects/${encodeURIComponent(id)}/save`;
  const responsePromise = page.waitForResponse((response) => {
    try {
      return new URL(response.url()).pathname === expectedPath
        && response.request().method() === 'POST';
    } catch {
      return false;
    }
  });
  await page.keyboard.press('Control+s');
  const response = await responsePromise;
  const body = await response.text();
  expect(response.status(), `Manual editor save failed: ${body.slice(0, 500)}`).toBe(200);
  const payload = JSON.parse(body) as JsonRecord;
  expect(payload.revision, 'Manual save must return a ProjectRevisionV1 receipt.').toBeTruthy();
  return { receivedAt: new Date().toISOString(), revision: payload.revision };
}

async function provePlayback(page: Page): Promise<Record<string, unknown>> {
  const container = page.locator('#remotion-player-container');
  await expect(container).toBeVisible();
  const gateDisposition = await waitForTimestampPreviewGate(page, container);
  if (gateDisposition !== 'READY') {
    return {
      status: 'BLOCKED',
      buttonToggled: false,
      gateDisposition,
      playerElementCount: await container.locator('canvas, video, [data-testid]').count(),
      reason: `Exact-timing preview remained ${gateDisposition}; visible playback was not attempted.`,
    };
  }
  const playButton = page.locator('button:has(svg.lucide-play)').first();
  await expect(playButton).toBeVisible();
  await playButton.click();
  const pauseButton = page.locator('button:has(svg.lucide-pause)').first();
  const toggled = await expect
    .poll(() => pauseButton.isVisible().catch(() => false), { timeout: 3_000 })
    .toBe(true)
    .then(() => true)
    .catch(() => false);
  if (toggled) await pauseButton.click();
  return {
    status: toggled ? 'PASS' : 'UNVERIFIABLE',
    buttonToggled: toggled,
    gateDisposition,
    playerElementCount: await container.locator('canvas, video, [data-testid]').count(),
    reason: toggled
      ? null
      : 'The visible player stayed mounted, but exact playback did not reach a pause state; inspect the gate and trace.',
  };
}

async function waitForTimestampPreviewGate(
  page: Page,
  container: ReturnType<Page['locator']>,
): Promise<string> {
  const gate = container.locator('[data-editron-timestamp-preview-gate]');
  const deadline = Date.now() + 10_000;
  let disposition = 'UNKNOWN';
  while (Date.now() < deadline) {
    if (await gate.count() === 0) return 'READY';
    disposition = await gate
      .getAttribute('data-editron-timestamp-preview-gate')
      .catch(() => null) || 'UNKNOWN';
    if (disposition === 'READY') return disposition;
    await page.waitForTimeout(100);
  }
  return disposition;
}

async function dragTimelineItem(page: Page, item: ReturnType<Page['locator']>, direction = 1): Promise<void> {
  await item.scrollIntoViewIfNeeded();
  const box = await item.boundingBox();
  const timeline = await item
    .locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")][1]')
    .boundingBox();
  if (!box || !timeline) throw new Error('Could not measure the visible timeline item.');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const delta = Math.max(8, Math.min(28, box.width / 3)) * direction;
  const rightTarget = Math.min(timeline.x + timeline.width - 3, startX + delta);
  const leftTarget = Math.max(timeline.x + 3, startX + delta);
  const targetX = Math.abs(rightTarget - startX) >= 2 ? rightTarget : leftTarget;
  if (Math.abs(targetX - startX) < 2) throw new Error('Timeline item has no measurable drag room.');
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(targetX, startY, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

function iconButton(page: Page, iconClass: string) {
  return page.locator(`button:has(svg.${iconClass})`).first();
}

async function writeStage(
  paths: EditronFastQaArtifactPathsV1,
  stage: 'before' | 'firstEdit' | 'correction' | 'undo' | 'redo' | 'reload',
  project: unknown,
  page: Page,
): Promise<void> {
  const fileByStage = {
    before: paths.beforeProjectPath,
    firstEdit: paths.firstEditProjectPath,
    correction: paths.correctionProjectPath,
    undo: paths.undoProjectPath,
    redo: paths.redoProjectPath,
    reload: paths.reloadProjectPath,
  } as const;
  await writeJson(fileByStage[stage], project);
  const screenshotByStage = {
    before: paths.beforeScreenshotPath,
    firstEdit: paths.firstEditScreenshotPath,
    correction: paths.correctionScreenshotPath,
    undo: paths.undoScreenshotPath,
    redo: paths.redoScreenshotPath,
    reload: paths.reloadScreenshotPath,
  } as const;
  await page.screenshot({ path: screenshotByStage[stage], fullPage: true });
}

async function writeStageDiff(paths: EditronFastQaArtifactPathsV1, projectValues: Record<string, unknown>): Promise<void> {
  const stages: Record<string, unknown> = {};
  const pairs: Array<[string, string, string]> = [
    ['beforeToFirstEdit', 'before', 'firstEdit'],
    ['firstEditToCorrection', 'firstEdit', 'correction'],
    ['correctionToUndo', 'correction', 'undo'],
    ['undoToRedo', 'undo', 'redo'],
    ['redoToReload', 'redo', 'reload'],
  ];
  for (const [label, before, after] of pairs) {
    if (projectValues[before] !== undefined && projectValues[after] !== undefined) {
      stages[label] = buildEditronFastQaProjectDiff(projectValues[before], projectValues[after]);
    }
  }
  await writeJson(paths.diffPath, stages);
}

async function writeJourneyEvidence(paths: EditronFastQaArtifactPathsV1, value: unknown): Promise<void> {
  await writeJson(paths.journeyPath, value);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeEditronFastQaJson(filePath, value);
}

function requireProject(payload: ProjectPayload): JsonRecord {
  if (!payload.project || typeof payload.project !== 'object') throw new Error('Project response omitted project payload.');
  return payload.project;
}

function pickTargetTextOverlay(project: JsonRecord, manifest: FixtureManifest): JsonRecord {
  const overlays = Array.isArray(project.overlays)
    ? project.overlays.filter((value): value is JsonRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value)))
    : [];
  const selected = manifest.selectedOverlayId == null
    ? undefined
    : overlays.find((overlay) => String(overlay.id) === String(manifest.selectedOverlayId));
  return selected && String(selected.type).toLowerCase() === 'text'
    ? selected
    : overlays.find((overlay) => String(overlay.type).toLowerCase() === 'text') ?? {};
}

function textOverlayLabel(overlay: JsonRecord): string {
  return typeof overlay.content === 'string' ? overlay.content.trim() : '';
}

async function readFixtureManifest(filePath: string): Promise<FixtureManifest> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as FixtureManifest;
  } catch {
    return {};
  }
}

function artifactReferences(paths: EditronFastQaArtifactPathsV1): Record<string, string> {
  return Object.fromEntries(
    Object.entries(paths)
      .filter(([key]) => key.endsWith('Path'))
      .map(([key, value]) => [key, value]),
  );
}

function isProviderUrl(value: string): boolean {
  return /(?:generativelanguage|openrouter|api\.openai|api\.anthropic|replicate\.com|fal\.ai|deepgram|elevenlabs|googleapis\.com)/i.test(value);
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '[invalid-url]';
  }
}

function projectPath(id: string): string {
  return `/dashboard/editron/project/${encodeURIComponent(id)}`;
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  parsed.pathname = '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required Editron fast QA environment variable: ${name}`);
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
