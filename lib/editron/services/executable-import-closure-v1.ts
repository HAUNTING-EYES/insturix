import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  CompilerOptions,
  ExportDeclaration,
  Expression,
  ImportClause,
  Node,
} from 'typescript';

import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

// Keep the compiler out of Next's static config graph. Its resolved version is
// nevertheless recorded in every receipt as part of the resolver toolchain.
const runtimeRequire = createRequire(import.meta.url);
const ts: typeof import('typescript') = runtimeRequire(['type', 'script'].join(''));

export const EXECUTABLE_IMPORT_CLOSURE_VERSION_V1 =
  'EDITRON_EXECUTABLE_IMPORT_CLOSURE_V1_2' as const;
export const EXECUTABLE_IMPORT_RESOLVER_VERSION_V1 =
  'EDITRON_TYPESCRIPT_IMPORT_RESOLVER_V1_2' as const;
export const EXECUTABLE_DEPENDENCY_AUTHORITY_VERSION_V1 =
  'EDITRON_EXECUTABLE_DEPENDENCY_AUTHORITY_V1_1' as const;

const FILE_EXTENSIONS = [
  '', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.css', '.scss', '.sass', '.svg',
] as const;
const INDEX_FILES = FILE_EXTENSIONS.filter(Boolean).map((extension) => `index${extension}`);
const CODE_POINT_ORDER = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const PACKAGE_MANAGER_PATTERN =
  /^(pnpm|npm|yarn|bun)@([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;
const PACKAGE_MANAGER_USER_AGENT_TOKEN_PATTERN =
  /^(pnpm|npm|yarn|bun)\/([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;
const PACKAGE_MANAGER_VERSION_PATTERN =
  /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export type PackageManagerName = 'pnpm' | 'npm' | 'yarn' | 'bun';

const LOCKFILE_CANDIDATES_BY_MANAGER: Readonly<
  Record<PackageManagerName, readonly string[]>
> = {
  pnpm: ['pnpm-lock.yaml'],
  npm: ['package-lock.json'],
  yarn: ['yarn.lock'],
  bun: ['bun.lock', 'bun.lockb'],
};
const ALL_LOCKFILE_CANDIDATES = [...new Set(
  Object.values(LOCKFILE_CANDIDATES_BY_MANAGER).flat(),
)].sort(CODE_POINT_ORDER);

export type ExecutableImportClosureModeV1 = 'runtime' | 'verification';

export interface ExecutableImportClosureOptionsV1 {
  rootDir?: string;
  roots: readonly string[];
  mode?: ExecutableImportClosureModeV1;
  tsconfigPath?: string | null;
  vitestConfigPath?: string | null;
  configFiles?: readonly string[];
  resources?: readonly string[];
  strictGit?: boolean;
}

export interface ExecutableImportClosureBoundFileV1 {
  path: string;
  sha256: string;
  gitBlobOid: string | null;
}

export interface ExecutableDependencyAuthorityV1 {
  version: typeof EXECUTABLE_DEPENDENCY_AUTHORITY_VERSION_V1;
  selection: 'DECLARED_PACKAGE_MANAGER' | 'UNDECLARED_PACKAGE_MANAGER';
  declaredPackageManager: Readonly<{
    name: PackageManagerName;
    version: string;
  }> | null;
  authoritativeLockfilePaths: readonly string[];
  excludedLockfileCandidates: readonly string[];
}

export interface ExecutableImportClosureReceiptV1 {
  version: typeof EXECUTABLE_IMPORT_CLOSURE_VERSION_V1;
  resolverVersion: typeof EXECUTABLE_IMPORT_RESOLVER_VERSION_V1;
  resolverImplementationSha256: string;
  mode: ExecutableImportClosureModeV1;
  contentSource: 'GIT_HEAD_BLOB' | 'WORKTREE';
  roots: readonly string[];
  files: readonly Readonly<ExecutableImportClosureBoundFileV1>[];
  externalPackages: readonly string[];
  configFiles: readonly Readonly<ExecutableImportClosureBoundFileV1>[];
  resources: readonly Readonly<ExecutableImportClosureBoundFileV1>[];
  dependencyManifests: readonly Readonly<ExecutableImportClosureBoundFileV1>[];
  dependencyAuthority: Readonly<ExecutableDependencyAuthorityV1>;
  sourceControl: Readonly<{
    strict: boolean;
    headSha: string | null;
    treeSha: string | null;
  }>;
  toolchain: Readonly<{
    node: Readonly<{
      version: string;
      platform: NodeJS.Platform;
      arch: string;
      executableSha256: string;
    }>;
    packageManager: Readonly<{
      declared: string | null;
      launcher: Readonly<{
        name: string;
        version: string;
        userAgent: string;
        source: 'npm_config_user_agent';
      }> | null;
      resolvedCommand: Readonly<{
        name: string;
        version: string;
        basename: string;
        kind: 'direct-executable' | 'windows-command-shim';
        contentSha256: string;
      }> | null;
      declaredMatchesLauncher: boolean | null;
      declaredMatchesResolvedCommand: boolean | null;
    }>;
    packages: Readonly<{
      typescript: string;
      tsx: string | null;
      vitest: string | null;
    }>;
  }>;
  closureSha256: string;
}

interface ParsedConfiguration {
  compilerOptions: CompilerOptions;
  configPaths: string[];
  configDirectory: string;
}

interface GitIdentity {
  headSha: string | null;
  treeSha: string | null;
}

interface GitEvidence extends GitIdentity {
  blobs: Map<string, Readonly<{ oid: string; content: Buffer }>>;
}

let nodeExecutableSha256: string | null = null;

export function computeExecutableImportClosureV1(
  options: ExecutableImportClosureOptionsV1,
): Readonly<ExecutableImportClosureReceiptV1> {
  if (options.roots.length === 0) fail('ROOTS_EMPTY');
  const rootDir = realpathSync.native(path.resolve(options.rootDir ?? process.cwd()));
  const mode = options.mode ?? 'runtime';
  const strictGit = options.strictGit ?? false;
  const tsconfigPath = resolveOptionalInput(
    rootDir,
    options.tsconfigPath,
    'tsconfig.json',
    'TSCONFIG',
  );
  const configuration = parseConfiguration(rootDir, tsconfigPath);
  const vitestConfigPath = resolveOptionalInput(
    rootDir,
    options.vitestConfigPath,
    'vitest.config.ts',
    'VITEST_CONFIG',
  );
  const extraConfigPaths = (options.configFiles ?? []).map((file) =>
    resolveRequiredInput(rootDir, file, 'CONFIG'));
  const resourcePaths = (options.resources ?? []).map((file) =>
    resolveRequiredInput(rootDir, file, 'RESOURCE'));
  const rootPaths = uniquePaths(
    options.roots.map((file) => resolveRequiredInput(rootDir, file, 'ROOT')),
    rootDir,
  );
  const packageJsonPath = resolveRequiredInput(rootDir, 'package.json', 'PACKAGE_JSON');
  const packageJson = readPackageJson(packageJsonPath);
  const declaredPackageManager = readDeclaredPackageManager(packageJson.packageManager);
  const dependencyAuthority = resolveDependencyAuthority(rootDir, declaredPackageManager);
  const dependencyManifestPaths = [
    packageJsonPath,
    ...dependencyAuthority.authoritativeLockfilePaths.map((file) =>
      assertRepositoryFile(rootDir, path.join(rootDir, file), 'DEPENDENCY_MANIFEST')),
  ];

  const graph = resolveImportGraph({
    rootDir,
    roots: rootPaths,
    mode,
    configuration,
  });
  assertExternalPackagesDeclared(graph.externalPackages, packageJson);

  const configPaths = uniquePaths([
    ...configuration.configPaths,
    ...(vitestConfigPath ? [vitestConfigPath] : []),
    ...extraConfigPaths,
  ], rootDir);
  const allBoundPaths = uniquePaths([
    ...graph.files,
    ...configPaths,
    ...resourcePaths,
    ...dependencyManifestPaths,
  ], rootDir);
  const gitIdentity = readGitIdentity(rootDir, strictGit);
  const gitEvidence = strictGit
    ? readStrictGitEvidence(rootDir, allBoundPaths, gitIdentity)
    : null;
  const bind = (values: readonly string[]) =>
    bindFiles(rootDir, uniquePaths(values, rootDir), gitEvidence);
  const roots = rootPaths.map((file) => toRepoPath(rootDir, file)).sort(CODE_POINT_ORDER);
  const dependencyManifests = bind(dependencyManifestPaths);
  assertExecutableDependencyAuthorityV1(dependencyAuthority, dependencyManifests);
  const material = {
    version: EXECUTABLE_IMPORT_CLOSURE_VERSION_V1,
    resolverVersion: EXECUTABLE_IMPORT_RESOLVER_VERSION_V1,
    resolverImplementationSha256: sha256Bytes(
      readFileSync(fileURLToPath(import.meta.url)),
    ),
    mode,
    contentSource: strictGit ? 'GIT_HEAD_BLOB' as const : 'WORKTREE' as const,
    roots,
    files: bind(graph.files),
    externalPackages: [...graph.externalPackages].sort(CODE_POINT_ORDER),
    configFiles: bind(configPaths),
    resources: bind(resourcePaths),
    dependencyManifests,
    dependencyAuthority,
    sourceControl: {
      strict: strictGit,
      headSha: gitIdentity.headSha,
      treeSha: gitIdentity.treeSha,
    },
    toolchain: buildToolchain(declaredPackageManager),
  };
  return deepFreezeEditronJsonV1({
    ...material,
    closureSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertExecutableDependencyAuthorityV1(
  authority: Readonly<ExecutableDependencyAuthorityV1>,
  manifests: readonly Readonly<ExecutableImportClosureBoundFileV1>[],
): void {
  if (authority.version !== EXECUTABLE_DEPENDENCY_AUTHORITY_VERSION_V1) {
    fail('DEPENDENCY_AUTHORITY_VERSION_DRIFT');
  }
  if (!['DECLARED_PACKAGE_MANAGER', 'UNDECLARED_PACKAGE_MANAGER']
    .includes(authority.selection)) {
    fail('DEPENDENCY_AUTHORITY_SELECTION_INVALID');
  }
  const manifestPaths = manifests.map(({ path: file }) => file);
  const sortedManifestPaths = [...manifestPaths].sort(CODE_POINT_ORDER);
  if (new Set(manifestPaths).size !== manifestPaths.length
    || !sameStrings(manifestPaths, sortedManifestPaths)) {
    fail('DEPENDENCY_MANIFEST_SET_NON_CANONICAL');
  }
  if (!manifestPaths.includes('package.json')) fail('PACKAGE_JSON_AUTHORITY_MISSING');
  const authoritative = [...authority.authoritativeLockfilePaths];
  const excluded = [...authority.excludedLockfileCandidates];
  const sortedAuthoritative = [...authoritative].sort(CODE_POINT_ORDER);
  const sortedExcluded = [...excluded].sort(CODE_POINT_ORDER);
  if (new Set(authoritative).size !== authoritative.length
    || new Set(excluded).size !== excluded.length
    || !sameStrings(authoritative, sortedAuthoritative)
    || !sameStrings(excluded, sortedExcluded)
    || authoritative.some((file) => excluded.includes(file))) {
    fail('DEPENDENCY_AUTHORITY_LOCKFILE_SET_INVALID');
  }
  if (authority.selection === 'UNDECLARED_PACKAGE_MANAGER') {
    if (authority.declaredPackageManager !== null || authoritative.length !== 0
      || !sameStrings(excluded, ALL_LOCKFILE_CANDIDATES)) {
      fail('UNDECLARED_DEPENDENCY_AUTHORITY_INVALID');
    }
  } else {
    const declared = authority.declaredPackageManager;
    if (!declared) fail('DECLARED_DEPENDENCY_AUTHORITY_MISSING');
    if (!Object.hasOwn(LOCKFILE_CANDIDATES_BY_MANAGER, declared.name)
      || !PACKAGE_MANAGER_VERSION_PATTERN.test(declared.version)) {
      fail('DECLARED_DEPENDENCY_AUTHORITY_IDENTITY_INVALID');
    }
    const allowed = LOCKFILE_CANDIDATES_BY_MANAGER[declared.name];
    if (authoritative.length !== 1 || !allowed.includes(authoritative[0])) {
      fail('AUTHORITATIVE_LOCKFILE_SELECTION_INVALID', declared.name);
    }
    const expectedExcluded = ALL_LOCKFILE_CANDIDATES
      .filter((file) => file !== authoritative[0]);
    if (!sameStrings(excluded, expectedExcluded)) {
      fail('EXCLUDED_LOCKFILE_POLICY_DRIFT', declared.name);
    }
  }
  const expectedManifests = ['package.json', ...authoritative].sort(CODE_POINT_ORDER);
  if (!sameStrings(manifestPaths, expectedManifests)) {
    fail('DEPENDENCY_MANIFEST_AUTHORITY_MISMATCH');
  }
}

function parseConfiguration(rootDir: string, configPath: string | null): ParsedConfiguration {
  if (!configPath) return { compilerOptions: {}, configPaths: [], configDirectory: rootDir };
  const configPaths = collectConfigChain(
    rootDir,
    configPath,
    new Set<string>(),
    new Set<string>(),
  );
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) fail('TSCONFIG_READ', formatDiagnostic(loaded.error));
  const parsed = ts.parseJsonConfigFileContent(
    loaded.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );
  const materialErrors = parsed.errors.filter((error) => error.code !== 18003);
  if (materialErrors.length > 0) {
    fail('TSCONFIG_PARSE', materialErrors.map(formatDiagnostic).join(' | '));
  }
  return {
    compilerOptions: parsed.options,
    configPaths,
    configDirectory: path.dirname(configPath),
  };
}

function collectConfigChain(
  rootDir: string,
  configPath: string,
  visiting: Set<string>,
  collected: Set<string>,
): string[] {
  const resolved = assertRepositoryFile(rootDir, configPath, 'TSCONFIG');
  if (collected.has(resolved)) return [];
  if (visiting.has(resolved)) fail('TSCONFIG_EXTENDS_CYCLE', toRepoPath(rootDir, resolved));
  visiting.add(resolved);
  const loaded = ts.readConfigFile(resolved, ts.sys.readFile);
  if (loaded.error) fail('TSCONFIG_READ', formatDiagnostic(loaded.error));
  const rawExtends: unknown = loaded.config?.extends;
  const references = typeof rawExtends === 'string'
    ? [rawExtends]
    : Array.isArray(rawExtends) && rawExtends.every((value) => typeof value === 'string')
      ? rawExtends as string[]
      : rawExtends === undefined
        ? []
        : fail('TSCONFIG_EXTENDS_INVALID', toRepoPath(rootDir, resolved));
  const ancestors = references.flatMap((reference) =>
    collectConfigChain(
      rootDir,
      resolveExtendedConfig(rootDir, resolved, reference),
      visiting,
      collected,
    ));
  visiting.delete(resolved);
  collected.add(resolved);
  return uniquePaths([...ancestors, resolved], rootDir);
}

function resolveExtendedConfig(rootDir: string, importer: string, reference: string): string {
  const fromDirectory = path.dirname(importer);
  const direct = reference.startsWith('.') || path.isAbsolute(reference)
    ? resolveConfigCandidate(path.resolve(fromDirectory, reference))
    : resolvePackageConfig(importer, reference);
  if (!direct) fail('TSCONFIG_EXTENDS_UNRESOLVED', `${reference} from ${toRepoPath(rootDir, importer)}`);
  return assertRepositoryFile(rootDir, direct, 'TSCONFIG_EXTENDS');
}

function resolvePackageConfig(importer: string, reference: string): string | null {
  const resolver = createRequire(importer);
  for (const request of [reference, `${reference}/tsconfig.json`]) {
    try {
      return resolver.resolve(request);
    } catch {
      // Continue to the explicit tsconfig.json package fallback.
    }
  }
  return null;
}

function resolveConfigCandidate(candidate: string): string | null {
  for (const value of [candidate, `${candidate}.json`, path.join(candidate, 'tsconfig.json')]) {
    if (existsSync(value) && statSync(value).isFile()) return path.resolve(value);
  }
  return null;
}

function resolveImportGraph(input: {
  rootDir: string;
  roots: readonly string[];
  mode: ExecutableImportClosureModeV1;
  configuration: ParsedConfiguration;
}): Readonly<{ files: string[]; externalPackages: Set<string> }> {
  const pending = [...input.roots];
  const visited = new Set<string>();
  const externalPackages = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (!isScriptFile(current)) continue;
    const source = readFileSync(current, 'utf8');
    for (const moduleName of collectModuleReferences(current, source, input.mode)) {
      if (isBuiltin(moduleName)) continue;
      const resolution = resolveModuleReference({
        ...input,
        importer: current,
        moduleName,
      });
      if (resolution.kind === 'local') pending.push(resolution.path);
      else externalPackages.add(resolution.packageName);
    }
  }
  return { files: [...visited], externalPackages };
}

function resolveModuleReference(input: {
  rootDir: string;
  importer: string;
  moduleName: string;
  configuration: ParsedConfiguration;
}): Readonly<{ kind: 'local'; path: string } | { kind: 'external'; packageName: string }> {
  const resolved = ts.resolveModuleName(
    input.moduleName,
    input.importer,
    input.configuration.compilerOptions,
    ts.sys,
  ).resolvedModule;
  if (resolved) {
    const resolvedPath = path.resolve(resolved.resolvedFileName);
    if (isNodeModulesPath(resolvedPath) || resolved.isExternalLibraryImport) {
      return { kind: 'external', packageName: toPackageName(input.moduleName) };
    }
    return {
      kind: 'local',
      path: assertRepositoryFile(input.rootDir, resolvedPath, 'RESOLVED_MODULE'),
    };
  }
  const repoSpecifier = isRepositorySpecifier(
    input.moduleName,
    input.configuration.compilerOptions,
  );
  if (repoSpecifier) {
    const fallback = resolveLocalFallback(input);
    if (fallback) return { kind: 'local', path: fallback };
    fail(
      'UNRESOLVED_REPO_LOCAL',
      `${input.moduleName} from ${toRepoPath(input.rootDir, input.importer)}`,
    );
  }
  return { kind: 'external', packageName: toPackageName(input.moduleName) };
}

function resolveLocalFallback(input: {
  rootDir: string;
  importer: string;
  moduleName: string;
  configuration: ParsedConfiguration;
}): string | null {
  const candidates: string[] = [];
  if (path.isAbsolute(input.moduleName)) candidates.push(input.moduleName);
  else if (input.moduleName.startsWith('.')) {
    candidates.push(path.resolve(path.dirname(input.importer), input.moduleName));
  }
  const mappings = input.configuration.compilerOptions.paths ?? {};
  const base = input.configuration.compilerOptions.baseUrl
    ?? input.configuration.configDirectory;
  for (const [pattern, targets] of Object.entries(mappings)) {
    const capture = matchPathPattern(pattern, input.moduleName);
    if (capture === null) continue;
    for (const target of targets) {
      candidates.push(path.resolve(base, target.replace('*', capture)));
    }
  }
  for (const candidate of candidates) {
    const file = resolveFile(candidate);
    if (file) return assertRepositoryFile(input.rootDir, file, 'LOCAL_FALLBACK');
  }
  return null;
}

function collectModuleReferences(
  filePath: string,
  source: string,
  mode: ExecutableImportClosureModeV1,
): string[] {
  const modules = new Set<string>();
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
  const addLiteral = (expression: Expression | undefined, label: string, node: Node) => {
    if (expression && ts.isStringLiteralLike(expression)) {
      modules.add(expression.text);
      return;
    }
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    fail('NONLITERAL_MODULE_LOAD', `${label} at ${filePath}:${position.line + 1}`);
  };
  const visit = (node: Node): void => {
    if (ts.isImportDeclaration(node)) {
      if (mode === 'verification' || !isTypeOnlyImport(node.importClause)) {
        addLiteral(node.moduleSpecifier, 'import', node);
      }
      return;
    }
    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && (mode === 'verification' || !isTypeOnlyExport(node))) {
        addLiteral(node.moduleSpecifier, 'export', node);
      }
      return;
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      if (mode === 'verification' || !node.isTypeOnly) {
        addLiteral(node.moduleReference.expression, 'import-equals', node);
      }
      return;
    }
    if (mode === 'verification' && ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument)) {
        addLiteral(node.argument.literal, 'import-type', node);
      } else {
        fail('NONLITERAL_MODULE_LOAD', `import-type at ${filePath}`);
      }
      return;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      addLiteral(node.arguments[0], 'dynamic-import', node);
      return;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'require') {
      addLiteral(node.arguments[0], 'require', node);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...modules].sort(CODE_POINT_ORDER);
}

function isTypeOnlyImport(importClause: ImportClause | undefined): boolean {
  if (!importClause) return false;
  if (importClause.isTypeOnly) return true;
  if (importClause.name) return false;
  return Boolean(
    importClause.namedBindings
    && ts.isNamedImports(importClause.namedBindings)
    && importClause.namedBindings.elements.length > 0
    && importClause.namedBindings.elements.every((element) => element.isTypeOnly),
  );
}

function isTypeOnlyExport(declaration: ExportDeclaration): boolean {
  if (declaration.isTypeOnly) return true;
  return Boolean(
    declaration.exportClause
    && ts.isNamedExports(declaration.exportClause)
    && declaration.exportClause.elements.length > 0
    && declaration.exportClause.elements.every((element) => element.isTypeOnly),
  );
}

function readStrictGitEvidence(
  rootDir: string,
  files: readonly string[],
  identity: GitIdentity,
): GitEvidence {
  if (!identity.headSha || !identity.treeSha) fail('STRICT_GIT_HEAD_MISSING');
  const repoPaths = files.map((file) => toRepoPath(rootDir, file)).sort(CODE_POINT_ORDER);
  assertStrictGitPathsClean(rootDir, repoPaths);
  const treeEntries = new Map<string, string>();
  for (const chunk of chunks(repoPaths, 80)) {
    const output = runGit(rootDir, ['ls-tree', '-r', '-z', 'HEAD', '--', ...chunk]);
    for (const entry of splitNull(output)) {
      const tab = entry.indexOf('\t');
      const [mode, type, oid] = entry.slice(0, tab).split(' ');
      const file = entry.slice(tab + 1);
      if (mode === '120000') fail('STRICT_GIT_SYMLINK_UNSUPPORTED', file);
      if (type !== 'blob' || !oid) fail('STRICT_GIT_NON_BLOB', file);
      treeEntries.set(file, oid);
    }
  }
  for (const repoPath of repoPaths) {
    if (!treeEntries.has(repoPath)) fail('STRICT_GIT_UNTRACKED', repoPath);
  }
  const contentByOid = readGitBlobs(rootDir, [...new Set(treeEntries.values())]);
  const blobs = new Map<string, Readonly<{ oid: string; content: Buffer }>>();
  for (const [repoPath, oid] of treeEntries) {
    const content = contentByOid.get(oid);
    if (!content) fail('STRICT_GIT_BLOB_MISSING', `${repoPath}:${oid}`);
    blobs.set(repoPath, { oid, content });
  }
  const finalIdentity = readGitIdentity(rootDir, true);
  if (finalIdentity.headSha !== identity.headSha || finalIdentity.treeSha !== identity.treeSha) {
    fail('STRICT_GIT_HEAD_CHANGED');
  }
  assertStrictGitPathsClean(rootDir, repoPaths);
  return { ...identity, blobs };
}

function assertStrictGitPathsClean(rootDir: string, repoPaths: readonly string[]): void {
  for (const chunk of chunks(repoPaths, 80)) {
    const status = runGit(rootDir, ['status', '--porcelain=v1', '-z',
      '--untracked-files=all', '--', ...chunk]);
    if (status.length > 0) fail('STRICT_GIT_CLOSURE_DIRTY', status.toString('utf8'));
  }
}

function readGitBlobs(rootDir: string, oids: readonly string[]): Map<string, Buffer> {
  if (oids.length === 0) return new Map();
  const output = runGit(rootDir, ['cat-file', '--batch'], `${oids.join('\n')}\n`);
  const result = new Map<string, Buffer>();
  let cursor = 0;
  for (const requestedOid of oids) {
    const lineEnd = output.indexOf(10, cursor);
    if (lineEnd < 0) fail('STRICT_GIT_BATCH_HEADER', requestedOid);
    const [oid, type, sizeText] = output.subarray(cursor, lineEnd).toString('utf8').split(' ');
    const size = Number(sizeText);
    if (type !== 'blob' || !Number.isSafeInteger(size)) fail('STRICT_GIT_BATCH_TYPE', requestedOid);
    const contentStart = lineEnd + 1;
    const contentEnd = contentStart + size;
    result.set(requestedOid, Buffer.from(output.subarray(contentStart, contentEnd)));
    if (oid !== requestedOid || output[contentEnd] !== 10) fail('STRICT_GIT_BATCH_CONTENT', requestedOid);
    cursor = contentEnd + 1;
  }
  return result;
}

function readGitIdentity(rootDir: string, strict: boolean): GitIdentity {
  const topLevel = tryGitText(rootDir, ['rev-parse', '--show-toplevel']);
  if (!topLevel) {
    if (strict) fail('STRICT_GIT_REPOSITORY_MISSING');
    return { headSha: null, treeSha: null };
  }
  const realTopLevel = realpathSync.native(path.resolve(topLevel));
  if (!samePath(realTopLevel, rootDir)) {
    if (strict) fail('STRICT_GIT_ROOT_MISMATCH', `${realTopLevel} != ${rootDir}`);
    return { headSha: null, treeSha: null };
  }
  const headSha = tryGitText(rootDir, ['rev-parse', 'HEAD']);
  const treeSha = tryGitText(rootDir, ['rev-parse', 'HEAD^{tree}']);
  if (strict && (!headSha || !treeSha)) fail('STRICT_GIT_HEAD_MISSING');
  return { headSha, treeSha };
}

function bindFiles(
  rootDir: string,
  files: readonly string[],
  git: GitEvidence | null,
): ExecutableImportClosureBoundFileV1[] {
  return files.map((file) => {
    const repoPath = toRepoPath(rootDir, file);
    const evidence = git?.blobs.get(repoPath);
    if (git && !evidence) fail('STRICT_GIT_EVIDENCE_MISSING', repoPath);
    return {
      path: repoPath,
      sha256: sha256Bytes(evidence?.content ?? readFileSync(file)),
      gitBlobOid: evidence?.oid ?? null,
    };
  }).sort((left, right) => CODE_POINT_ORDER(left.path, right.path));
}

function buildToolchain(
  declared: DeclaredPackageManager | null,
): ExecutableImportClosureReceiptV1['toolchain'] {
  const launcher = readPackageManagerLauncher();
  const resolvedCommand = declared
    ? readResolvedPackageManagerCommand(declared.name)
    : null;
  return {
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      executableSha256: readNodeExecutableSha256(),
    },
    packageManager: {
      declared: declared?.raw ?? null,
      launcher,
      resolvedCommand,
      declaredMatchesLauncher: packageManagerIdentityMatches(declared, launcher),
      declaredMatchesResolvedCommand: packageManagerIdentityMatches(
        declared,
        resolvedCommand,
      ),
    },
    packages: {
      typescript: ts.version,
      tsx: readInstalledPackageVersion('tsx'),
      vitest: readInstalledPackageVersion('vitest'),
    },
  };
}

function readDeclaredPackageManager(
  declaredValue: unknown,
): DeclaredPackageManager | null {
  if (declaredValue === undefined) return null;
  if (typeof declaredValue !== 'string') fail('PACKAGE_MANAGER_DECLARATION_INVALID');
  const match = PACKAGE_MANAGER_PATTERN.exec(declaredValue);
  if (!match) fail('PACKAGE_MANAGER_UNSUPPORTED', declaredValue);
  return {
    raw: declaredValue,
    name: match[1] as PackageManagerName,
    version: match[2].split('+')[0],
  };
}

interface DeclaredPackageManager {
  raw: string;
  name: PackageManagerName;
  version: string;
}

function resolveDependencyAuthority(
  rootDir: string,
  declared: DeclaredPackageManager | null,
): Readonly<ExecutableDependencyAuthorityV1> {
  if (!declared) {
    return deepFreezeEditronJsonV1({
      version: EXECUTABLE_DEPENDENCY_AUTHORITY_VERSION_V1,
      selection: 'UNDECLARED_PACKAGE_MANAGER' as const,
      declaredPackageManager: null,
      authoritativeLockfilePaths: [] as const,
      excludedLockfileCandidates: ALL_LOCKFILE_CANDIDATES,
    });
  }
  const present = LOCKFILE_CANDIDATES_BY_MANAGER[declared.name]
    .filter((file) => existsSync(path.join(rootDir, file)));
  if (present.length === 0) {
    fail('AUTHORITATIVE_LOCKFILE_MISSING', declared.name);
  }
  if (present.length > 1) {
    fail('AUTHORITATIVE_LOCKFILE_AMBIGUOUS', `${declared.name}:${present.join(',')}`);
  }
  return deepFreezeEditronJsonV1({
    version: EXECUTABLE_DEPENDENCY_AUTHORITY_VERSION_V1,
    selection: 'DECLARED_PACKAGE_MANAGER' as const,
    declaredPackageManager: { name: declared.name, version: declared.version },
    authoritativeLockfilePaths: present,
    excludedLockfileCandidates: ALL_LOCKFILE_CANDIDATES
      .filter((file) => file !== present[0]),
  });
}

function readPackageManagerLauncher(): Readonly<{
  name: PackageManagerName;
  version: string;
  userAgent: string;
  source: 'npm_config_user_agent';
}> | null {
  const userAgent = process.env.npm_config_user_agent?.trim();
  if (!userAgent) return null;
  if ([...userAgent].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  })) fail('PACKAGE_MANAGER_LAUNCHER_USER_AGENT_INVALID');
  const firstToken = userAgent.split(/\s+/u, 1)[0];
  const match = PACKAGE_MANAGER_USER_AGENT_TOKEN_PATTERN.exec(firstToken);
  if (!match) return null;
  return {
    name: match[1] as PackageManagerName,
    version: match[2],
    userAgent,
    source: 'npm_config_user_agent',
  };
}

function packageManagerIdentityMatches(
  declared: Readonly<{ name: PackageManagerName; version: string }> | null,
  observed: Readonly<{ name: string; version: string }> | null,
): boolean | null {
  if (!declared || !observed) return null;
  return declared.name === observed.name
    && declared.version === observed.version.split('+')[0];
}

function readInstalledPackageVersion(packageName: string): string | null {
  try {
    const packagePath = runtimeRequire.resolve(`${packageName}/package.json`);
    const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

function readResolvedPackageManagerCommand(
  command: PackageManagerName,
): Readonly<{
  name: PackageManagerName;
  version: string;
  basename: string;
  kind: 'direct-executable' | 'windows-command-shim';
  contentSha256: string;
}> | null {
  const executable = process.platform === 'win32'
    ? resolveWindowsPackageManagerCommand(command)
    : resolveDirectPackageManagerCommand(command);
  if (!executable) return null;
  const output = executable.kind === 'windows-command-shim'
    ? runWindowsCommandShim(executable.path)
    : runVersionExecutable(executable.path);
  if (!output || !PACKAGE_MANAGER_VERSION_PATTERN.test(output)) {
    fail('PACKAGE_MANAGER_COMMAND_VERSION_INVALID', command);
  }
  return {
    name: command,
    version: output,
    basename: executable.basename,
    kind: executable.kind,
    contentSha256: sha256Bytes(readFileSync(executable.path)),
  };
}

function resolveWindowsPackageManagerCommand(command: PackageManagerName): Readonly<{
  path: string;
  basename: string;
  kind: 'direct-executable' | 'windows-command-shim';
}> | null {
  const whereExecutable = trustedWindowsSystemExecutable('where.exe');
  const result = spawnSync(whereExecutable, [command], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  for (const value of result.stdout.split(/\r?\n/u)) {
    const logical = value.trim();
    if (!logical) continue;
    const extension = path.extname(logical).toLowerCase();
    if (extension !== '.exe' && extension !== '.cmd') continue;
    return {
      path: canonicalWindowsCommandPath(logical, extension, command),
      basename: path.basename(logical).toLowerCase(),
      kind: extension === '.cmd' ? 'windows-command-shim' : 'direct-executable',
    };
  }
  return null;
}

function resolveDirectPackageManagerCommand(command: PackageManagerName): Readonly<{
  path: string;
  basename: string;
  kind: 'direct-executable';
}> | null {
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    const logical = path.resolve(directory || process.cwd(), command);
    if (!existsSync(logical) || !statSync(logical).isFile()) continue;
    if ((statSync(logical).mode & 0o111) === 0) continue;
    return {
      path: realpathSync.native(logical),
      basename: path.basename(logical),
      kind: 'direct-executable',
    };
  }
  return null;
}

function runWindowsCommandShim(shim: string): string | null {
  const commandProcessor = trustedWindowsSystemExecutable('cmd.exe');
  const commandLine = `""${shim}" --version"`;
  const result = spawnSync(
    commandProcessor,
    ['/d', '/s', '/v:off', '/c', commandLine],
    {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      windowsVerbatimArguments: true,
    },
  );
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function trustedWindowsSystemExecutable(name: 'cmd.exe' | 'where.exe'): string {
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot || !path.isAbsolute(systemRoot)) fail('WINDOWS_SYSTEM_ROOT_INVALID');
  const executable = canonicalWindowsCommandPath(
    path.join(systemRoot, 'System32', name),
    '.exe',
    name,
  );
  const realSystemRoot = realpathSync.native(systemRoot);
  if (!isInside(realSystemRoot, executable)) fail('WINDOWS_SYSTEM_EXECUTABLE_ESCAPE', executable);
  return executable;
}

function canonicalWindowsCommandPath(
  candidate: string,
  expectedExtension: string,
  label: string,
): string {
  if (!path.isAbsolute(candidate)) fail('WINDOWS_COMMAND_PATH_NOT_ABSOLUTE', label);
  assertSafeWindowsCommandPath(candidate, label);
  if (!existsSync(candidate) || !statSync(candidate).isFile()) {
    fail('WINDOWS_COMMAND_PATH_NOT_FILE', label);
  }
  const real = realpathSync.native(candidate);
  assertSafeWindowsCommandPath(real, label);
  if (path.extname(real).toLowerCase() !== expectedExtension.toLowerCase()) {
    fail('WINDOWS_COMMAND_PATH_EXTENSION', label);
  }
  return real;
}

function assertSafeWindowsCommandPath(candidate: string, label: string): void {
  const unsafeMetacharacters = new Set(['"', '&', '|', '<', '>', '^', '%', '!', '(', ')']);
  const unsafe = [...candidate].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 || unsafeMetacharacters.has(character);
  });
  if (unsafe) fail('WINDOWS_COMMAND_PATH_UNSAFE', label);
}

function runVersionExecutable(executable: string): string | null {
  const result = spawnSync(executable, ['--version'], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function readNodeExecutableSha256(): string {
  nodeExecutableSha256 ??= sha256Bytes(readFileSync(process.execPath));
  return nodeExecutableSha256;
}

function resolveOptionalInput(
  rootDir: string,
  requested: string | null | undefined,
  defaultPath: string,
  label: string,
): string | null {
  if (requested === null) return null;
  const candidate = requested ?? defaultPath;
  if (!existsSync(path.resolve(rootDir, candidate))) {
    if (requested !== undefined) fail(`${label}_MISSING`, candidate);
    return null;
  }
  return resolveRequiredInput(rootDir, candidate, label);
}

function resolveRequiredInput(rootDir: string, file: string, label: string): string {
  const resolved = resolveFile(path.resolve(rootDir, file));
  if (!resolved) fail(`${label}_MISSING`, file);
  return assertRepositoryFile(rootDir, resolved, label);
}

function resolveFile(unresolved: string): string | null {
  for (const extension of FILE_EXTENSIONS) {
    const candidate = `${unresolved}${extension}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return path.resolve(candidate);
  }
  if (existsSync(unresolved) && statSync(unresolved).isDirectory()) {
    for (const indexFile of INDEX_FILES) {
      const candidate = path.join(unresolved, indexFile);
      if (existsSync(candidate) && statSync(candidate).isFile()) return path.resolve(candidate);
    }
  }
  return null;
}

function assertRepositoryFile(rootDir: string, file: string, label: string): string {
  const logical = path.resolve(file);
  if (!existsSync(logical) || !statSync(logical).isFile()) fail(`${label}_NOT_FILE`, logical);
  if (lstatSync(logical).isSymbolicLink()) fail(`${label}_SYMLINK_UNSUPPORTED`, logical);
  const real = realpathSync.native(logical);
  if (!isInside(rootDir, real)) fail(`${label}_REPOSITORY_ESCAPE`, real);
  if (!samePath(logical, real)) fail(`${label}_SYMLINK_PATH_UNSUPPORTED`, logical);
  return real;
}

function isRepositorySpecifier(moduleName: string, options: CompilerOptions): boolean {
  return moduleName.startsWith('.')
    || path.isAbsolute(moduleName)
    || Object.keys(options.paths ?? {}).some((pattern) => matchPathPattern(pattern, moduleName) !== null);
}

function matchPathPattern(pattern: string, moduleName: string): string | null {
  const star = pattern.indexOf('*');
  if (star < 0) return pattern === moduleName ? '' : null;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return moduleName.startsWith(prefix) && moduleName.endsWith(suffix)
    ? moduleName.slice(prefix.length, moduleName.length - suffix.length)
    : null;
}

function assertExternalPackagesDeclared(
  packages: ReadonlySet<string>,
  packageJson: Record<string, unknown>,
): void {
  const declared = new Set<string>();
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const values = packageJson[field];
    if (values && typeof values === 'object' && !Array.isArray(values)) {
      Object.keys(values).forEach((name) => declared.add(name));
    }
  }
  for (const packageName of packages) {
    if (!declared.has(packageName)) fail('EXTERNAL_PACKAGE_UNDECLARED', packageName);
  }
}

function readPackageJson(file: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('PACKAGE_JSON_INVALID');
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('EXECUTABLE_IMPORT_CLOSURE_')) throw error;
    fail('PACKAGE_JSON_INVALID', error instanceof Error ? error.message : String(error));
  }
}

function formatDiagnostic(diagnostic: import('typescript').Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}

function scriptKind(file: string): import('typescript').ScriptKind {
  if (/\.[cm]?tsx$/i.test(file)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(file)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/i.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isScriptFile(file: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/i.test(file);
}

function isNodeModulesPath(file: string): boolean {
  return file.split(path.sep).includes('node_modules');
}

function toPackageName(moduleName: string): string {
  const parts = moduleName.split('/');
  return moduleName.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function uniquePaths(files: readonly string[], rootDir: string): string[] {
  return [...new Set(files)].sort((left, right) =>
    CODE_POINT_ORDER(toRepoPath(rootDir, left), toRepoPath(rootDir, right)));
}

function toRepoPath(rootDir: string, file: string): string {
  return path.relative(rootDir, file).replaceAll(path.sep, '/');
}

function isInside(rootDir: string, file: string): boolean {
  const relative = path.relative(rootDir, file);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..'
    && !path.isAbsolute(relative);
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function tryGitText(rootDir: string, args: readonly string[]): string | null {
  const result = spawnSync('git', ['-C', rootDir, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function runGit(rootDir: string, args: readonly string[], input?: string): Buffer {
  const result = spawnSync('git', ['-C', rootDir, ...args], {
    input,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = result.stderr?.toString('utf8').trim() || args.join(' ');
    fail('GIT_COMMAND_FAILED', detail);
  }
  return result.stdout;
}

function splitNull(value: Buffer): string[] {
  return value.toString('utf8').split('\0').filter(Boolean);
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function sha256Bytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function fail(code: string, detail?: string): never {
  throw new Error(`EXECUTABLE_IMPORT_CLOSURE_${code}${detail ? `: ${detail}` : ''}`);
}
