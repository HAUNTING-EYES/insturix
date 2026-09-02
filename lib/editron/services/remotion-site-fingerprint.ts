import { readFileSync } from 'node:fs';
import path from 'node:path';

import { computeExecutableImportClosureV1 }
  from './executable-import-closure-v1';

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
  let closure;
  try {
    closure = computeExecutableImportClosureV1({
      rootDir,
      roots: [entryPoint, ...configFiles],
      mode: 'runtime',
      strictGit: false,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNRESOLVED_REPO_LOCAL')) {
      throw new Error(`Unable to resolve local Remotion import. ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }

  const packageJson = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const packageVersions = closure.externalPackages
    .map((packageName) => {
      const version =
        packageJson.dependencies?.[packageName]
        ?? packageJson.devDependencies?.[packageName]
        ?? packageJson.optionalDependencies?.[packageName]
        ?? packageJson.peerDependencies?.[packageName];
      if (!version) {
        throw new Error(
          `Remotion import graph uses "${packageName}", but package.json does not pin it directly.`,
        );
      }
      return `${packageName}@${version}`;
    });
  return {
    sha256: closure.closureSha256,
    shortSha: closure.closureSha256.slice(0, 12),
    files: closure.files.map(({ path: file }) => file),
    packages: packageVersions,
  };
}
