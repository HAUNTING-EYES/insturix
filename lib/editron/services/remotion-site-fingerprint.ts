import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import path from 'node:path';

import type { ExportDeclaration, Expression, ImportClause, Node } from 'typescript';

// Keep the compiler out of Next's config dependency graph; it is needed only while computing this hash.
const runtimeRequire = createRequire(import.meta.url);
const ts: typeof import('typescript') = runtimeRequire(['type', 'script'].join(''));

const FINGERPRINT_VERSION = 'editron-remotion-import-graph-v1';
const SOURCE_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
  '.sass',
  '.svg',
] as const;
const INDEX_FILES = SOURCE_EXTENSIONS
  .filter(Boolean)
  .map((extension) => `index${extension}`);

export const EDITRON_REMOTION_ENTRY =
  'components/editron/editor/version-7.0.0/remotion/index.ts';

export interface RemotionSiteFingerprint {
  sha256: string;
  shortSha: string;
  files: string[];
  packages: string[];
}

export function computeRemotionSiteFingerprint(options: {
  rootDir?: string;
  entryPoint?: string;
  configFiles?: string[];
} = {}): RemotionSiteFingerprint {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const entryPoint = options.entryPoint ?? EDITRON_REMOTION_ENTRY;
  const configFiles = options.configFiles ?? ['remotion.config.ts'];
  const pending = [
    resolveRequiredFile(rootDir, path.resolve(rootDir, entryPoint), entryPoint),
    ...configFiles.map((configFile) =>
      resolveRequiredFile(rootDir, path.resolve(rootDir, configFile), configFile),
    ),
  ];
  const visited = new Set<string>();
  const packageNames = new Set<string>();

  while (pending.length > 0) {
    const currentFile = pending.pop()!;
    if (visited.has(currentFile)) continue;
    visited.add(currentFile);

    if (!isScriptFile(currentFile)) continue;
    const source = readFileSync(currentFile, 'utf8');
    for (const moduleName of collectRuntimeImports(currentFile, source)) {
      const localTarget = resolveLocalImport({ rootDir, importer: currentFile, moduleName });
      if (localTarget) {
        pending.push(localTarget);
        continue;
      }
      if (isLocalSpecifier(moduleName)) {
        throw new Error(
          `Unable to resolve local Remotion import "${moduleName}" from ${toRepoPath(rootDir, currentFile)}`,
        );
      }
      if (!isBuiltin(moduleName)) {
        packageNames.add(toPackageName(moduleName));
      }
    }
  }

  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const packageVersions = [...packageNames]
    .sort()
    .map((packageName) => {
      const version =
        packageJson.dependencies?.[packageName]
        ?? packageJson.devDependencies?.[packageName]
        ?? packageJson.optionalDependencies?.[packageName];
      if (!version) {
        throw new Error(
          `Remotion import graph uses "${packageName}", but package.json does not pin it directly.`,
        );
      }
      return `${packageName}@${version}`;
    });

  const files = [...visited].sort((a, b) =>
    toRepoPath(rootDir, a).localeCompare(toRepoPath(rootDir, b)),
  );
  const digest = createHash('sha256');
  digest.update(`${FINGERPRINT_VERSION}\n`);
  for (const filePath of files) {
    digest.update(`file:${toRepoPath(rootDir, filePath)}\n`);
    digest.update(readFileSync(filePath));
    digest.update('\n');
  }
  for (const packageVersion of packageVersions) {
    digest.update(`package:${packageVersion}\n`);
  }

  const sha256 = digest.digest('hex');
  return {
    sha256,
    shortSha: sha256.slice(0, 12),
    files: files.map((filePath) => toRepoPath(rootDir, filePath)),
    packages: packageVersions,
  };
}

function resolveLocalImport(input: {
  rootDir: string;
  importer: string;
  moduleName: string;
}): string | null {
  if (!isLocalSpecifier(input.moduleName)) return null;
  const unresolved = input.moduleName.startsWith('@/')
    ? path.resolve(input.rootDir, input.moduleName.slice(2))
    : path.resolve(path.dirname(input.importer), input.moduleName);
  return resolveFile(unresolved);
}

function resolveRequiredFile(rootDir: string, unresolved: string, label: string): string {
  const resolved = resolveFile(unresolved);
  if (!resolved) {
    throw new Error(`Missing Remotion fingerprint input "${label}" under ${rootDir}.`);
  }
  return resolved;
}

function resolveFile(unresolved: string): string | null {
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = `${unresolved}${extension}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return path.resolve(candidate);
    }
  }
  if (existsSync(unresolved) && statSync(unresolved).isDirectory()) {
    for (const indexFile of INDEX_FILES) {
      const candidate = path.join(unresolved, indexFile);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return path.resolve(candidate);
      }
    }
  }
  return null;
}

function isScriptFile(filePath: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/i.test(filePath);
}

function collectRuntimeImports(filePath: string, source: string): string[] {
  const imports = new Set<string>();
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );

  const addModule = (expression: Expression | undefined) => {
    if (expression && ts.isStringLiteralLike(expression)) {
      imports.add(expression.text);
    }
  };
  const visit = (node: Node) => {
    if (ts.isImportDeclaration(node)) {
      if (!isTypeOnlyImport(node.importClause)) addModule(node.moduleSpecifier);
      return;
    }
    if (ts.isExportDeclaration(node)) {
      if (!isTypeOnlyExport(node)) addModule(node.moduleSpecifier);
      return;
    }
    if (
      ts.isCallExpression(node)
      && node.arguments.length > 0
      && (
        node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require')
      )
    ) {
      addModule(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...imports];
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

function isLocalSpecifier(moduleName: string): boolean {
  return moduleName.startsWith('.') || moduleName.startsWith('@/') || path.isAbsolute(moduleName);
}

function toPackageName(moduleName: string): string {
  const parts = moduleName.split('/');
  return moduleName.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function toRepoPath(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}
