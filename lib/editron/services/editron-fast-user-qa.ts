import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  OverlayType,
  type TextOverlay,
} from '@/components/editron/editor/version-7.0.0/types';

import {
  buildChatBattleProjectSnapshot,
} from './chat-edit-battle-harness';
import type { EditorState } from './project-service';

export const EDITRON_FAST_USER_QA_VERSION = 'editron-fast-user-qa-v1' as const;
export const EDITRON_FAST_USER_QA_SCENARIO_ID = 'agency-core-timeline-edit-v1' as const;
export const EDITRON_FAST_USER_QA_FIXTURE_CASE = 'selected-overlay-edit' as const;
export const EDITRON_FAST_USER_QA_SUPPORTED_CLASS = 'AGENCY_100GB_4H_V1' as const;

export type FastQaLayerStatus =
  | 'PASS'
  | 'FAIL'
  | 'UNVERIFIABLE'
  | 'INFRASTRUCTURE_FAILURE';

export interface EditronFastQaScenarioManifestV1 {
  version: typeof EDITRON_FAST_USER_QA_VERSION;
  scenarioId: typeof EDITRON_FAST_USER_QA_SCENARIO_ID;
  label: string;
  supportedProjectClass: typeof EDITRON_FAST_USER_QA_SUPPORTED_CLASS;
  command: string;
  fixture: {
    owner: 'editron-fast-user-qa-fixture-v1';
    fixtureCase: typeof EDITRON_FAST_USER_QA_FIXTURE_CASE;
    projectId: string;
    isolatedNamespace: string;
  };
  provider: {
    inference: 'disabled';
    mutationPath: 'existing-editron-ui-project-service';
    providerRequests: 'forbidden';
    mediaAndAuthOrigins: 'app-configured';
  };
  journey: readonly [
    'baseline',
    'visible-timeline-edit',
    'playback',
    'correction',
    'undo',
    'redo',
    'reload',
  ];
  evidence: {
    exact: readonly string[];
    perceptual: readonly string[];
    human: 'not-run-in-fast-lane';
  };
  cleanup: {
    required: true;
    owner: 'project-service-delete-and-fresh-verification';
    verifyProjectAbsence: true;
  };
  limits: {
    fastLaneDoesNotCertify: readonly [
      'AGENCY_100GB_4H_V1 envelope',
      'Q2 render/audio proof',
      'human review',
      'stale/unsafe SAFE_STOP path',
    ];
  };
}

export interface EditronFastQaArtifactPathsV1 {
  root: string;
  fixtureRoot: string;
  manifestPath: string;
  fixtureManifestPath: string;
  beforeProjectPath: string;
  firstEditProjectPath: string;
  correctionProjectPath: string;
  undoProjectPath: string;
  redoProjectPath: string;
  reloadProjectPath: string;
  diffPath: string;
  tracePath: string;
  beforeScreenshotPath: string;
  firstEditScreenshotPath: string;
  correctionScreenshotPath: string;
  undoScreenshotPath: string;
  redoScreenshotPath: string;
  reloadScreenshotPath: string;
  browserLogPath: string;
  fixtureLogPath: string;
  journeyPath: string;
  cleanupPath: string;
  resultPath: string;
  cockpitPath: string;
}

export interface EditronFastQaOverlayChangeV1 {
  id: string;
  before: {
    type: string;
    from: number;
    durationInFrames: number;
    row: number;
    assetId: string | null;
    digest: string;
  } | null;
  after: {
    type: string;
    from: number;
    durationInFrames: number;
    row: number;
    assetId: string | null;
    digest: string;
  } | null;
  changedFields: string[];
}

export interface EditronFastQaProjectDiffV1 {
  version: typeof EDITRON_FAST_USER_QA_VERSION;
  beforeDigest: string;
  afterDigest: string;
  beforeProjectRevision: unknown;
  afterProjectRevision: unknown;
  addedOverlayIds: string[];
  removedOverlayIds: string[];
  changedOverlays: EditronFastQaOverlayChangeV1[];
  changed: boolean;
  capturedAt: string;
}

export function buildEditronFastQaFixtureState(): EditorState {
  const selectedOverlay: TextOverlay = {
    id: 1,
    type: OverlayType.TEXT,
    content: 'Agency launch — fast QA title',
    from: 30,
    durationInFrames: 180,
    row: 0,
    left: 360,
    top: 420,
    width: 1200,
    height: 180,
    rotation: 0,
    isDragging: false,
    styles: {
      color: '#ffffff',
      backgroundColor: 'rgba(8, 12, 24, 0.88)',
      fontFamily: 'Inter',
      fontSize: '64px',
      fontStyle: 'normal',
      fontWeight: '700',
      lineHeight: '1.2',
      opacity: 1,
      padding: '20px',
      textAlign: 'center',
      textDecoration: 'none',
      zIndex: 1,
    },
  };
  return Object.freeze({
    overlays: [Object.freeze(selectedOverlay)],
    aspectRatio: '16:9',
    playerDimensions: Object.freeze({ width: 1920, height: 1080 }),
    fps: 30,
    durationInFrames: 300,
  });
}

export function safeFastQaSegment(value: unknown, fallback: string): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  const sanitized = candidate
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return sanitized || fallback;
}

export function createEditronFastQaRunId(now: Date = new Date()): string {
  const timestamp = now.toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  return `fast-qa-${timestamp}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function buildEditronFastQaArtifactPaths(
  outputRoot: string,
  runId: string,
  fixtureProjectId?: string,
): EditronFastQaArtifactPathsV1 {
  const root = path.resolve(outputRoot, safeFastQaSegment(runId, 'run'));
  const file = (name: string) => path.join(root, name);
  const fixtureManifestProject = safeFastQaSegment(fixtureProjectId, 'fixture');
  return {
    root,
    fixtureRoot: path.join(root, 'fixture'),
    manifestPath: file('manifest.json'),
    fixtureManifestPath: path.join(root, 'fixture', fixtureManifestProject, 'fixture.json'),
    beforeProjectPath: file('before-project.json'),
    firstEditProjectPath: file('first-edit-project.json'),
    correctionProjectPath: file('correction-project.json'),
    undoProjectPath: file('undo-project.json'),
    redoProjectPath: file('redo-project.json'),
    reloadProjectPath: file('reload-project.json'),
    diffPath: file('project-diff.json'),
    tracePath: file('trace.zip'),
    beforeScreenshotPath: file('before.png'),
    firstEditScreenshotPath: file('first-edit.png'),
    correctionScreenshotPath: file('correction.png'),
    undoScreenshotPath: file('undo.png'),
    redoScreenshotPath: file('redo.png'),
    reloadScreenshotPath: file('reload.png'),
    browserLogPath: file('browser.log'),
    fixtureLogPath: file('fixture.log'),
    journeyPath: file('journey.json'),
    cleanupPath: file('cleanup.json'),
    resultPath: file('result.json'),
    cockpitPath: file('cockpit.html'),
  };
}

export function buildEditronFastQaScenarioManifest(input: {
  projectId: string;
  runId: string;
  baseUrl: string;
}): EditronFastQaScenarioManifestV1 {
  const baseOrigin = (() => {
    try {
      return new URL(input.baseUrl).origin;
    } catch {
      return 'invalid-origin';
    }
  })();
  return {
    version: EDITRON_FAST_USER_QA_VERSION,
    scenarioId: EDITRON_FAST_USER_QA_SCENARIO_ID,
    label: 'One real visible agency timeline edit with correction and recovery',
    supportedProjectClass: EDITRON_FAST_USER_QA_SUPPORTED_CLASS,
    command: 'pnpm exec tsx scripts/run-editron-fast-user-qa.ts',
    fixture: {
      owner: 'editron-fast-user-qa-fixture-v1',
      fixtureCase: EDITRON_FAST_USER_QA_FIXTURE_CASE,
      projectId: safeFastQaSegment(input.projectId, 'fixture'),
      isolatedNamespace: `${safeFastQaSegment(input.runId, 'run')}@${baseOrigin}`,
    },
    provider: {
      inference: 'disabled',
      mutationPath: 'existing-editron-ui-project-service',
      providerRequests: 'forbidden',
      mediaAndAuthOrigins: 'app-configured',
    },
    journey: [
      'baseline',
      'visible-timeline-edit',
      'playback',
      'correction',
      'undo',
      'redo',
      'reload',
    ],
    evidence: {
      exact: [
        'before-project.json',
        'first-edit-project.json',
        'correction-project.json',
        'undo-project.json',
        'redo-project.json',
        'reload-project.json',
        'project-diff.json',
        'ProjectRevisionV1 save receipts',
      ],
      perceptual: [
        'Playwright screenshots',
        'Playwright trace.zip',
        'Remotion player state',
      ],
      human: 'not-run-in-fast-lane',
    },
    cleanup: {
      required: true,
      owner: 'project-service-delete-and-fresh-verification',
      verifyProjectAbsence: true,
    },
    limits: {
      fastLaneDoesNotCertify: [
        'AGENCY_100GB_4H_V1 envelope',
        'Q2 render/audio proof',
        'human review',
        'stale/unsafe SAFE_STOP path',
      ],
    },
  };
}

export async function writeEditronFastQaJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function buildEditronFastQaProjectDiff(
  beforeProject: unknown,
  afterProject: unknown,
  capturedAt: string = new Date().toISOString(),
): EditronFastQaProjectDiffV1 {
  const beforeSnapshot = buildChatBattleProjectSnapshot(beforeProject, 'mongo-before', capturedAt);
  const afterSnapshot = buildChatBattleProjectSnapshot(afterProject, 'mongo-after', capturedAt);
  const beforeById = new Map(beforeSnapshot.overlays.map((overlay) => [overlay.id, overlay]));
  const afterById = new Map(afterSnapshot.overlays.map((overlay) => [overlay.id, overlay]));
  const addedOverlayIds = [...afterById.keys()].filter((id) => !beforeById.has(id)).sort();
  const removedOverlayIds = [...beforeById.keys()].filter((id) => !afterById.has(id)).sort();
  const changedOverlays: EditronFastQaOverlayChangeV1[] = [];

  for (const id of [...new Set([...beforeById.keys(), ...afterById.keys()])].sort()) {
    const before = beforeById.get(id) ?? null;
    const after = afterById.get(id) ?? null;
    if (!before || !after) continue;
    const changedFields = (['type', 'from', 'durationInFrames', 'row', 'assetId', 'digest'] as const)
      .filter((field) => before[field] !== after[field]);
    if (changedFields.length > 0) {
      changedOverlays.push({ id, before, after, changedFields });
    }
  }

  return {
    version: EDITRON_FAST_USER_QA_VERSION,
    beforeDigest: beforeSnapshot.digest,
    afterDigest: afterSnapshot.digest,
    beforeProjectRevision: projectRevision(beforeProject),
    afterProjectRevision: projectRevision(afterProject),
    addedOverlayIds,
    removedOverlayIds,
    changedOverlays,
    changed: beforeSnapshot.digest !== afterSnapshot.digest
      || addedOverlayIds.length > 0
      || removedOverlayIds.length > 0,
    capturedAt,
  };
}

export function renderEditronFastQaCockpitHtml(input: {
  manifest: unknown;
  result: unknown;
  cleanup: unknown;
}): string {
  const escape = (value: string) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  const serialized = JSON.stringify(input, null, 2);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Editron fast user QA</title>
<style>body{font:14px system-ui,sans-serif;max-width:1000px;margin:32px auto;padding:0 20px;background:#111;color:#eee}pre{white-space:pre-wrap;background:#1e1e1e;border:1px solid #444;border-radius:8px;padding:16px}h1{font-size:20px}small{color:#aaa}</style>
</head><body><h1>Editron fast user QA</h1><small>Machine-readable evidence is stored beside this cockpit.</small><pre>${escape(serialized)}</pre></body></html>
`;
}

function projectRevision(value: unknown): unknown {
  const project = unwrapProject(value);
  if (!project || typeof project !== 'object' || Array.isArray(project)) return null;
  return (project as Record<string, unknown>).projectRevision ?? null;
}

function unwrapProject(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const nested = record.project;
  return nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : value;
}
