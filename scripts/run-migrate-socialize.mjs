import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// ESM bootstrap for running TypeScript scripts with ts-node's ESM loader.
// Run via: node --loader ts-node/esm scripts/run-migrate-socialize.mjs

const root = path.resolve('.');
const tsconfigPath = path.join(root, 'tsconfig.json');

// Auto-load environment variables for scripts. Prefer `.env`, then
// This makes running scripts locally (e.g. migrations) easier.
(() => {
  try {
    const tryFiles = ['.env'];
    // If NODE_ENV is set, prefer .env.<NODE_ENV>
    if (process.env.NODE_ENV) tryFiles.unshift(`.env.${process.env.NODE_ENV}`);
    // Common repo-specific env files
    // tryFiles.push('development.env', 'preview.env', 'production.env');

    let loaded = null;
    for (const f of tryFiles) {
      const p = path.join(root, f);
      if (fs.existsSync(p)) {
        const res = dotenv.config({ path: p });
        if (res.error) {
          // continue trying other files
          continue;
        }
        loaded = f;
        break;
      }
    }

    if (loaded) {
      // eslint-disable-next-line no-console
      console.log(`Loaded environment variables from ${loaded}`);
    } else {
      // eslint-disable-next-line no-console
      console.log('No .env file found for scripts (checked .env, .env.<NODE_ENV>, development.env, preview.env, production.env)');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load .env file for scripts:', err && err.message ? err.message : err);
  }
})();
let tsconfig = {};
try {
  tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
} catch (err) {
  console.warn('Could not read tsconfig.json:', err.message);
}

const compilerOptions = tsconfig.compilerOptions || {};
const baseUrl = compilerOptions.baseUrl ? path.resolve(root, compilerOptions.baseUrl) : root;
const paths = compilerOptions.paths || {};

// Register tsconfig-paths for ESM
try {
  const tsconfigPaths = await import('tsconfig-paths');
  tsconfigPaths.register({ baseUrl, paths });
} catch (err) {
  console.error('Failed to register tsconfig-paths. Is it installed?');
  console.error(err);
  process.exit(1);
}

// Import the TypeScript migration file. ts-node's ESM loader will compile it on-the-fly.
try {
  await import('./migrate-socialize-schema.ts');
} catch (err) {
  console.error('Error while running migration script:', err);
  process.exit(1);
}
