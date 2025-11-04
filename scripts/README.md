## Running TypeScript scripts (quick guide)

Keep this short. Scripts in this folder are TypeScript files and expect a Node ESM runtime.

1) Install dev deps (if you haven't):

```bash
pnpm i -D ts-node tsconfig-paths
```

2) Preferred (how this repo runs scripts):

The repository provides npm scripts that boot a small ESM loader which registers
`ts-node` and `tsconfig-paths` so path aliases work. Example (already in package.json):

```bash
pnpm migrate:socialize
# or provide DB URL inline:
MONGODB_URI="mongodb://localhost:27017/mydb" pnpm migrate:socialize
```

Note: the script bootstrap will try to auto-load environment files in this order:
1. `.env.<NODE_ENV>` (if NODE_ENV set), 2. `.env`, 3. `development.env`, `preview.env`, `production.env`.
So you can place your DB URL in `.env` or `development.env` and the migration will pick it up automatically.

3) Quick notes & common fixes
- If you see "Cannot find package '@/...'": run the script via the provided npm script (it registers tsconfig-paths), or use a file-relative import in the script.
- If you see `Unexpected token '<'` — a server script is importing client/UI code (JSX). Move any UI-only imports out of server modules (keep schemas and migration helpers server-safe).
- If you see `Please define the MONGODB_URI environment variable` — export the variable before running the script or pass it inline as shown above.
- ESM local imports require explicit extensions (e.g. `./foo.ts`) when running with Node ESM loaders. The bootstrap in `scripts/` handles most cases, but be aware when editing imports.

4) Alternatives
- If you prefer not to use runtime loaders, you can bundle scripts with `esbuild`/`tsup` and run the generated JS with `node`.

If you want, I can add a small preflight check to every script that validates required env vars before the migration runs.
