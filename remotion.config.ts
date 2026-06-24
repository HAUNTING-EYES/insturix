/**
 * Remotion Cloud Run Configuration
 */
import path from 'path';
import { Config } from '@remotion/cli/config';
import { enableTailwind } from '@remotion/tailwind';

// Enable TailwindCSS + the `@/` path alias (tsconfig maps `@/*` -> `./*` = project root).
// Without this alias the Remotion bundler can't resolve `@/lib/...` imports in the composition
// (it treats `@/lib` as a node module) — which silently broke every `lambda sites create` after a
// `@/`-import was added to the composition, freezing the deployed render bundle at its last good build.
Config.overrideWebpackConfig((currentConfiguration) => {
  const withTailwind = enableTailwind(currentConfiguration);
  return {
    ...withTailwind,
    resolve: {
      ...withTailwind.resolve,
      alias: {
        ...(withTailwind.resolve?.alias ?? {}),
        '@': path.resolve(process.cwd()),
      },
    },
  };
});

// Set the output format
Config.setCodec('h264');

