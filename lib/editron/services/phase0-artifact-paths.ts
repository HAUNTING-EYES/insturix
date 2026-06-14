export const DEFAULT_PHASE0_KEEP_RUNS = 5;

export interface BuildPhase0ArtifactPathsOptions {
  rootDir: string;
  runId?: string;
}

export interface Phase0ArtifactPaths {
  projectId: string;
  safeProjectId: string;
  runId: string;
  rootDir: string;
  projectDir: string;
  runDir: string;
  manifestPath: string;
  renderInputPath: string;
  artifactPackPath: string;
  failureTaxonomyPath: string;
  renderedAestheticDir: string;
  renderedAestheticJson: string;
  renderedAestheticHtml: string;
}

export function makePhase0RunId(date: Date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace('.', '');
}

export function buildPhase0ArtifactPaths(
  projectId: string,
  options: BuildPhase0ArtifactPathsOptions,
): Phase0ArtifactPaths {
  const safeProjectId = safePathSegment(projectId, 'project');
  const runId = safePathSegment(options.runId ?? makePhase0RunId(), 'run');
  const rootDir = normalizePath(options.rootDir);
  const projectDir = joinPath(rootDir, safeProjectId);
  const runDir = joinPath(projectDir, runId);
  const renderedAestheticDir = joinPath(runDir, 'rendered-aesthetic');

  return {
    projectId,
    safeProjectId,
    runId,
    rootDir,
    projectDir,
    runDir,
    manifestPath: joinPath(runDir, 'manifest.json'),
    renderInputPath: joinPath(runDir, 'render-input.json'),
    artifactPackPath: joinPath(runDir, 'render-artifact-pack.json'),
    failureTaxonomyPath: joinPath(runDir, 'failure-taxonomy.json'),
    renderedAestheticDir,
    renderedAestheticJson: joinPath(renderedAestheticDir, 'rendered-aesthetic.json'),
    renderedAestheticHtml: joinPath(renderedAestheticDir, 'report.html'),
  };
}

export function selectPhase0RunDirsToPrune(
  runDirNames: string[],
  options: { keepRuns?: number; protectedRunId?: string } = {},
): string[] {
  const keepRuns = Math.max(1, Math.floor(options.keepRuns ?? DEFAULT_PHASE0_KEEP_RUNS));
  const protectedRunId = options.protectedRunId
    ? safePathSegment(options.protectedRunId, 'run')
    : undefined;
  const uniqueNames = [...new Set(runDirNames)]
    .filter((name) => name && name !== protectedRunId && isGeneratedRunDirName(name))
    .sort((a, b) => b.localeCompare(a));
  const retainedOtherRuns = Math.max(0, keepRuns - (protectedRunId ? 1 : 0));
  return uniqueNames.slice(retainedOtherRuns);
}

function safePathSegment(value: string, fallback: string): string {
  const safe = value
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return safe || fallback;
}

function isGeneratedRunDirName(value: string): boolean {
  return /^\d{8}T\d{9}Z$/.test(value);
}

function joinPath(...parts: string[]): string {
  return parts
    .map((part) => normalizePath(part).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}
