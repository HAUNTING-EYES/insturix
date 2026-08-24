import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '../../lib/editron/services/canonical-json-v1';
import {
  computeExecutableImportClosureV1,
  EXECUTABLE_IMPORT_CLOSURE_VERSION_V1,
  EXECUTABLE_IMPORT_RESOLVER_VERSION_V1,
} from '../../lib/editron/services/executable-import-closure-v1';

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('executable import closure V1', () => {
  it('resolves the active tsconfig graph and emits a stable immutable receipt', () => {
    const rootDir = fixtureRoot();
    write(rootDir, 'src/entry.ts', [
      "import type { Only } from '#/type-only';",
      "import '#/side-effect';",
      "import data from './data.json';",
      "export { leaf } from './reexport';",
      "void import('./dynamic');",
      "import required = require('./required');",
      "const literalRequired = require('./literal-required');",
      'void data; void required; void literalRequired;',
    ].join('\n'));
    write(rootDir, 'src/side-effect.ts', 'export const sideEffect = true;\n');
    write(rootDir, 'src/reexport.ts', "export * from './leaf';\n");
    write(rootDir, 'src/leaf.ts', 'export const leaf = 1;\n');
    write(rootDir, 'src/dynamic.ts', 'export const dynamic = 1;\n');
    write(rootDir, 'src/required.ts', 'export = { required: true };\n');
    write(rootDir, 'src/literal-required.ts', 'export const required = true;\n');
    write(rootDir, 'src/data.json', '{"value":1}\n');
    write(rootDir, 'src/type-only.ts', 'export interface Only { value: string }\n');
    write(rootDir, 'src/unrelated.ts', 'export const unrelated = 1;\n');
    write(rootDir, 'fixture.txt', 'fixture-v1\n');

    const first = computeExecutableImportClosureV1({
      rootDir,
      roots: ['src/entry.ts'],
      resources: ['fixture.txt'],
    });
    const repeated = computeExecutableImportClosureV1({
      rootDir,
      roots: ['src/entry.ts'],
      resources: ['fixture.txt'],
    });
    const duplicateRoots = computeExecutableImportClosureV1({
      rootDir,
      roots: ['src/entry.ts', './src/entry.ts', 'src/entry.ts'],
      resources: ['fixture.txt'],
    });

    expect(first.version).toBe(EXECUTABLE_IMPORT_CLOSURE_VERSION_V1);
    expect(first.resolverVersion).toBe(EXECUTABLE_IMPORT_RESOLVER_VERSION_V1);
    expect(first.resolverImplementationSha256).toBe(sha256File(path.join(
      process.cwd(),
      'lib/editron/services/executable-import-closure-v1.ts',
    )));
    expect(first.contentSource).toBe('WORKTREE');
    expect(first.files.map(({ path: file }) => file)).toEqual([
      'src/data.json',
      'src/dynamic.ts',
      'src/entry.ts',
      'src/leaf.ts',
      'src/literal-required.ts',
      'src/reexport.ts',
      'src/required.ts',
      'src/side-effect.ts',
    ]);
    expect(first.configFiles.map(({ path: file }) => file)).toEqual([
      'tsconfig.base.json',
      'tsconfig.json',
      'vitest.config.ts',
    ]);
    expect(first.dependencyManifests.map(({ path: file }) => file)).toEqual([
      'package-lock.json',
      'package.json',
      'pnpm-lock.yaml',
    ]);
    expect(first.resources.map(({ path: file }) => file)).toEqual(['fixture.txt']);
    expect(first.closureSha256).toBe(repeated.closureSha256);
    expect(duplicateRoots.roots).toEqual(['src/entry.ts']);
    expect(duplicateRoots.closureSha256).toBe(first.closureSha256);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.files)).toBe(true);

    const { closureSha256, ...receiptMaterial } = first;
    expect(closureSha256).toBe(hashEditronCanonicalJsonV1(receiptMaterial));
    const driftedImplementationSha256 =
      `${first.resolverImplementationSha256[0] === '0' ? '1' : '0'}`
      + first.resolverImplementationSha256.slice(1);
    expect(hashEditronCanonicalJsonV1({
      ...receiptMaterial,
      resolverImplementationSha256: driftedImplementationSha256,
    })).not.toBe(closureSha256);
    expect(hashEditronCanonicalJsonV1({
      ...receiptMaterial, roots: ['caf\u00e9'],
    })).toBe(hashEditronCanonicalJsonV1({
      ...receiptMaterial, roots: ['cafe\u0301'],
    }));

    write(rootDir, 'src/unrelated.ts', 'export const unrelated = 2;\n');
    const unrelatedChanged = computeExecutableImportClosureV1({
      rootDir, roots: ['src/entry.ts'], resources: ['fixture.txt'],
    });
    expect(unrelatedChanged.closureSha256).toBe(first.closureSha256);

    write(rootDir, 'src/leaf.ts', 'export const leaf = 2;\n');
    const transitiveChanged = computeExecutableImportClosureV1({
      rootDir, roots: ['src/entry.ts'], resources: ['fixture.txt'],
    });
    expect(transitiveChanged.closureSha256).not.toBe(first.closureSha256);

    write(rootDir, 'fixture.txt', 'fixture-v2\n');
    const resourceChanged = computeExecutableImportClosureV1({
      rootDir, roots: ['src/entry.ts'], resources: ['fixture.txt'],
    });
    expect(resourceChanged.closureSha256).not.toBe(transitiveChanged.closureSha256);

    write(rootDir, 'vitest.config.ts', 'export default { test: {} };\n');
    const configChanged = computeExecutableImportClosureV1({
      rootDir, roots: ['src/entry.ts'], resources: ['fixture.txt'],
    });
    expect(configChanged.closureSha256).not.toBe(resourceChanged.closureSha256);

    write(rootDir, 'pnpm-lock.yaml', "lockfileVersion: '9.1'\n");
    const lockfileChanged = computeExecutableImportClosureV1({
      rootDir, roots: ['src/entry.ts'], resources: ['fixture.txt'],
    });
    expect(lockfileChanged.closureSha256).not.toBe(configChanged.closureSha256);
  });

  it('includes genuine type-only edges only in verification mode', () => {
    const rootDir = fixtureRoot();
    write(rootDir, 'src/entry.ts', [
      "import type { Only } from '#/type-only';",
      "export type { Exported } from './exported-type';",
      "type Imported = import('./import-type').Imported;",
      'export const runtime = true;',
    ].join('\n'));
    write(rootDir, 'src/type-only.ts', 'export interface Only { value: string }\n');
    write(rootDir, 'src/exported-type.ts', 'export interface Exported { value: string }\n');
    write(rootDir, 'src/import-type.ts', 'export interface Imported { value: string }\n');

    const runtime = computeExecutableImportClosureV1({
      rootDir, roots: ['src/entry.ts'], mode: 'runtime',
    });
    const verification = computeExecutableImportClosureV1({
      rootDir, roots: ['src/entry.ts'], mode: 'verification',
    });

    expect(runtime.files.map(({ path: file }) => file)).toEqual(['src/entry.ts']);
    expect(verification.files.map(({ path: file }) => file)).toEqual([
      'src/entry.ts',
      'src/exported-type.ts',
      'src/import-type.ts',
      'src/type-only.ts',
    ]);
  });

  it('records declared external package roots without traversing node_modules', () => {
    const rootDir = fixtureRoot({
      dependencies: { '@scope/tool': '1.0.0', react: '19.1.0' },
    });
    write(rootDir, 'src/entry.ts', [
      "import React from 'react';",
      "import { tool } from '@scope/tool/runtime';",
      'void React; void tool;',
    ].join('\n'));

    const receipt = computeExecutableImportClosureV1({ rootDir, roots: ['src/entry.ts'] });
    expect(receipt.externalPackages).toEqual(['@scope/tool', 'react']);
    expect(receipt.files.map(({ path: file }) => file)).toEqual(['src/entry.ts']);
  });

  it('rejects unsupported and malicious package-manager declarations without executing them', () => {
    const rootDir = fixtureRoot();
    write(rootDir, 'src/entry.ts', 'export const entry = true;\n');
    write(rootDir, 'package.json', JSON.stringify({ packageManager: 'rush@1.0.0' }));
    expect(() => computeExecutableImportClosureV1({ rootDir, roots: ['src/entry.ts'] }))
      .toThrow(/PACKAGE_MANAGER_UNSUPPORTED/);

    const marker = path.join(rootDir, 'package-manager-command-injection-marker');
    const payload = Buffer.from(
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed')`,
      'utf8',
    ).toString('base64');
    write(rootDir, 'package.json', JSON.stringify({
      packageManager: `pnpm && node -e "eval(Buffer.from('${payload}','base64').toString())"@1.0.0`,
    }));
    expect(() => computeExecutableImportClosureV1({ rootDir, roots: ['src/entry.ts'] }))
      .toThrow(/PACKAGE_MANAGER_UNSUPPORTED/);
    expect(existsSync(marker)).toBe(false);

    const originalUserAgent = process.env.npm_config_user_agent;
    process.env.npm_config_user_agent = 'rush/1.0.0 pnpm/10.17.1';
    try {
      write(rootDir, 'package.json', JSON.stringify({ packageManager: 'pnpm@10.17.1' }));
      const receipt = computeExecutableImportClosureV1({ rootDir, roots: ['src/entry.ts'] });
      expect(receipt.toolchain.packageManager.launcher).toBeNull();
    } finally {
      if (originalUserAgent === undefined) delete process.env.npm_config_user_agent;
      else process.env.npm_config_user_agent = originalUserAgent;
    }
  });

  it.each([
    ["const target = './dynamic'; void import(target);", 'NONLITERAL_MODULE_LOAD'],
    ["const target = './required'; require(target);", 'NONLITERAL_MODULE_LOAD'],
    ["import './missing';", 'UNRESOLVED_REPO_LOCAL'],
    ["import undeclared from 'undeclared'; void undeclared;", 'EXTERNAL_PACKAGE_UNDECLARED'],
  ])('fails closed for incomplete topology: %s', (source, errorCode) => {
    const rootDir = fixtureRoot();
    write(rootDir, 'src/entry.ts', `${source}\n`);
    expect(() => computeExecutableImportClosureV1({ rootDir, roots: ['src/entry.ts'] }))
      .toThrow(errorCode);
  });

  it('rejects direct and symlink-mediated repository escapes', () => {
    const { rootDir, sandbox } = fixtureRootWithSandbox();
    write(sandbox, 'outside.ts', 'export const outside = true;\n');
    write(rootDir, 'src/entry.ts', "import '../../outside';\n");
    expect(() => computeExecutableImportClosureV1({ rootDir, roots: ['src/entry.ts'] }))
      .toThrow(/REPOSITORY_ESCAPE/);

    const outsideDirectory = path.join(sandbox, 'outside-directory');
    mkdirSync(outsideDirectory);
    write(outsideDirectory, 'linked.ts', 'export const linked = true;\n');
    const link = path.join(rootDir, 'linked-directory');
    symlinkSync(outsideDirectory, link, process.platform === 'win32' ? 'junction' : 'dir');
    write(rootDir, 'src/entry.ts', "import '../linked-directory/linked';\n");
    expect(() => computeExecutableImportClosureV1({ rootDir, roots: ['src/entry.ts'] }))
      .toThrow(/(?:REPOSITORY_ESCAPE|SYMLINK_PATH_UNSUPPORTED)/);
  });

  it('binds canonical HEAD blobs and blocks closure-scoped Git drift', () => {
    const rootDir = fixtureRoot();
    write(rootDir, 'src/entry.ts', "import './dependency';\n");
    write(rootDir, 'src/dependency.ts', 'export const dependency = 1;\n');
    initializeGit(rootDir);

    const clean = computeExecutableImportClosureV1({
      rootDir, roots: ['src/entry.ts'], strictGit: true,
    });
    expect(clean.contentSource).toBe('GIT_HEAD_BLOB');
    expect(clean.sourceControl).toMatchObject({ strict: true });
    expect(clean.sourceControl.headSha).toMatch(/^[a-f0-9]{40,64}$/);
    expect(clean.sourceControl.treeSha).toMatch(/^[a-f0-9]{40,64}$/);
    expect(clean.files.every(({ gitBlobOid }) => Boolean(gitBlobOid))).toBe(true);

    write(rootDir, 'unrelated-untracked.ts', 'export const unrelated = true;\n');
    expect(() => computeExecutableImportClosureV1({
      rootDir, roots: ['src/entry.ts'], strictGit: true,
    })).not.toThrow();

    write(rootDir, 'src/dependency.ts', 'export const dependency = 2;\n');
    expect(() => computeExecutableImportClosureV1({
      rootDir, roots: ['src/entry.ts'], strictGit: true,
    })).toThrow(/STRICT_GIT_CLOSURE_DIRTY/);
  });

  it('blocks an untracked file that enters an otherwise clean committed topology', () => {
    const rootDir = fixtureRoot();
    write(rootDir, 'src/entry.ts', "import './future';\n");
    initializeGit(rootDir);
    write(rootDir, 'src/future.ts', 'export const future = true;\n');

    expect(() => computeExecutableImportClosureV1({
      rootDir, roots: ['src/entry.ts'], strictGit: true,
    })).toThrow(/STRICT_GIT_CLOSURE_DIRTY/);
  });

  it('covers the real V4R and long-form operator transitive owners', () => {
    const rootDir = process.cwd();
    const v4r = computeExecutableImportClosureV1({
      rootDir,
      roots: ['scripts/run-sealed-holdout-generalisation-v4r.ts'],
    });
    const longForm = computeExecutableImportClosureV1({
      rootDir,
      roots: ['scripts/run-stage25-long-form-provider-cohort-v2.ts'],
    });
    const v4rFiles = v4r.files.map(({ path: file }) => file);
    const longFormFiles = longForm.files.map(({ path: file }) => file);

    expect(v4rFiles).toContain(
      'lib/editron/research/open-ended-planner/sealed-holdout-evaluator-v2r.ts',
    );
    expect(v4rFiles).toContain(
      'lib/editron/research/open-ended-planner/sealed-holdout-paid-cohort-runner-v2r.ts',
    );
    expect(longFormFiles).toContain(
      'lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-evaluator-v1.ts',
    );
    expect(longFormFiles).toContain(
      'lib/editron/research/open-ended-planner/stage25-long-form-plan-compiler-v1.ts',
    );
    expect(v4r.configFiles.map(({ path: file }) => file)).toEqual([
      'tsconfig.json', 'vitest.config.ts',
    ]);
    expect(v4r.dependencyManifests.map(({ path: file }) => file)).toEqual([
      'package-lock.json', 'package.json', 'pnpm-lock.yaml',
    ]);
    expect(v4r.toolchain.node.version).toBe(process.version);
    expect(v4r.toolchain.node.platform).toBe(process.platform);
    expect(v4r.toolchain.node.arch).toBe(process.arch);
    expect(v4r.toolchain.node.executableSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(v4r.toolchain.packageManager.declared).toMatch(/^pnpm@/);
    const expectedLauncher = readExpectedPackageManagerLauncher();
    const expectedCommand = readExpectedResolvedPnpmCommand();
    expect(v4r.toolchain.packageManager.launcher).toEqual(expectedLauncher);
    expect(v4r.toolchain.packageManager.resolvedCommand).toEqual(expectedCommand);
    expect(v4r.toolchain.packageManager.resolvedCommand).not.toHaveProperty('path');
    const declaredVersion = v4r.toolchain.packageManager.declared!
      .slice('pnpm@'.length).split('+')[0];
    expect(v4r.toolchain.packageManager.declaredMatchesLauncher).toBe(
      expectedLauncher
        ? expectedLauncher.name === 'pnpm' && expectedLauncher.version === declaredVersion
        : null,
    );
    expect(v4r.toolchain.packageManager.declaredMatchesResolvedCommand).toBe(
      expectedCommand.version.split('+')[0] === declaredVersion,
    );
    expect(v4r.toolchain.packages.typescript).toMatch(/^5\./);
    expect(v4r.toolchain.packages.tsx).toMatch(/^4\./);
    expect(v4r.toolchain.packages.vitest).toMatch(/^1\./);
  });
});

function fixtureRoot(packageJson: Record<string, unknown> = {}): string {
  return fixtureRootWithSandbox(packageJson).rootDir;
}

function fixtureRootWithSandbox(packageJson: Record<string, unknown> = {}): {
  rootDir: string;
  sandbox: string;
} {
  const sandbox = mkdtempSync(path.join(os.tmpdir(), 'editron-import-closure-'));
  tempDirectories.push(sandbox);
  const rootDir = path.join(sandbox, 'repo');
  mkdirSync(rootDir);
  write(rootDir, 'package.json', `${JSON.stringify(packageJson)}\n`);
  write(rootDir, 'pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
  write(rootDir, 'package-lock.json', '{"lockfileVersion":3}\n');
  write(rootDir, 'tsconfig.base.json', JSON.stringify({
    compilerOptions: {
      baseUrl: '.',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      paths: { '#/*': ['src/*'] },
      resolveJsonModule: true,
    },
  }));
  write(rootDir, 'tsconfig.json', JSON.stringify({ extends: './tsconfig.base.json' }));
  write(rootDir, 'vitest.config.ts', 'export default {};\n');
  return { rootDir, sandbox };
}

function initializeGit(rootDir: string): void {
  git(rootDir, 'init');
  git(rootDir, 'config', 'user.email', 'closure-test@example.invalid');
  git(rootDir, 'config', 'user.name', 'Closure Test');
  git(rootDir, 'add', '.');
  git(rootDir, 'commit', '-m', 'fixture');
}

function git(rootDir: string, ...args: string[]): void {
  execFileSync('git', ['-C', rootDir, ...args], { stdio: 'ignore' });
}

function readExpectedPackageManagerLauncher(): Readonly<{
  name: string;
  version: string;
  userAgent: string;
  source: 'npm_config_user_agent';
}> | null {
  const userAgent = process.env.npm_config_user_agent?.trim();
  if (!userAgent) return null;
  const match = /^(pnpm|npm|yarn|bun)\/([^\s/]+)$/u.exec(userAgent.split(/\s+/u, 1)[0]);
  return match ? {
    name: match[1],
    version: match[2],
    userAgent,
    source: 'npm_config_user_agent',
  } : null;
}

function readExpectedResolvedPnpmCommand(): Readonly<{
  name: 'pnpm';
  version: string;
  basename: string;
  kind: 'direct-executable' | 'windows-command-shim';
  contentSha256: string;
}> {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot;
    if (!systemRoot) throw new Error('SystemRoot is required for the Windows integration test');
    const systemDirectory = path.join(systemRoot, 'System32');
    const commandPath = execFileSync(
      path.join(systemDirectory, 'where.exe'),
      ['pnpm.cmd'],
      { encoding: 'utf8' },
    ).split(/\r?\n/u).map((value) => value.trim()).find(Boolean);
    if (!commandPath) throw new Error('pnpm.cmd was not resolved');
    const commandLine = `""${commandPath}" --version"`;
    const result = spawnSync(
      path.join(systemDirectory, 'cmd.exe'),
      ['/d', '/s', '/v:off', '/c', commandLine],
      {
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
        windowsVerbatimArguments: true,
      },
    );
    if (result.status !== 0) throw new Error(result.stderr || 'pnpm.cmd probe failed');
    return {
      name: 'pnpm',
      version: result.stdout.trim(),
      basename: path.basename(commandPath).toLowerCase(),
      kind: 'windows-command-shim',
      contentSha256: sha256File(commandPath),
    };
  }
  const commandPath = (process.env.PATH ?? '').split(path.delimiter)
    .map((directory) => path.resolve(directory || process.cwd(), 'pnpm'))
    .find((candidate) => existsSync(candidate));
  if (!commandPath) throw new Error('pnpm was not resolved');
  const realCommandPath = realpathSync.native(commandPath);
  return {
    name: 'pnpm',
    version: execFileSync(realCommandPath, ['--version'], { encoding: 'utf8' }).trim(),
    basename: path.basename(commandPath),
    kind: 'direct-executable',
    contentSha256: sha256File(realCommandPath),
  };
}

function sha256File(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function write(rootDir: string, relativePath: string, contents: string): void {
  const target = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}
