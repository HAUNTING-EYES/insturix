/**
 * MG render-worker SNAPSHOT BUILDER — the one-time deploy artifact for the MG codegen lane.
 *
 * The lane's job runner boots a Vercel Sandbox from a pre-baked SNAPSHOT (sandbox-render-worker.ts
 * `source: { type: 'snapshot', snapshotId }`) so every render starts in seconds instead of paying a full
 * pnpm install per job. This script builds that snapshot:
 *
 *   boot sandbox from git @ pinned commit → corepack pnpm install (frozen lockfile)
 *   → BAKE CHROMIUM (@remotion/renderer ensureBrowser — CRITICAL: the job sandbox's network allowlist
 *     only permits Google/Z.AI/R2/the auth route, so the headless shell can NEVER download at render
 *     time; it must live in the snapshot) → smoke-check tsx + sharp + commit → snapshot({expiration: 0}).
 *
 * The BUILD sandbox runs with the default open network (downloads need it); only JOB sandboxes get the
 * locked allowlist. No secrets are baked in: worker credentials (ZAI/GEMINI/R2/auth token) are injected
 * per-job at Sandbox.create — the snapshot holds only code + dependencies + the browser.
 *
 * Run (locally, from the repo):
 *   GITHUB_TOKEN=<repo-read PAT> npx tsx scripts/mg-build-render-snapshot.ts [commitSha]
 *   - commitSha defaults to the current HEAD; it MUST be pushed to origin (the sandbox clones from GitHub).
 *   - Vercel credentials: either a fresh `vercel env pull` (VERCEL_OIDC_TOKEN) or VERCEL_TOKEN +
 *     VERCEL_TEAM_ID + VERCEL_PROJECT_ID in the environment (the @vercel/sandbox SDK resolves both).
 *
 * On success it prints the snapshot ID + the exact Vercel env vars to set:
 *   MG_RENDER_SANDBOX_SNAPSHOT_ID=<id>   MG_RENDER_SANDBOX_APP_COMMIT=<commit>
 * (the worker refuses a commit mismatch by design — rebuild the snapshot when the pinned commit changes).
 */
import { execSync } from 'node:child_process';

const GIT_URL = process.env.MG_SNAPSHOT_GIT_URL?.trim() || 'https://github.com/Insturix/Front-End.git';
const BUILD_TIMEOUT_MS = 40 * 60 * 1_000;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

interface FinishedCommand {
  exitCode: number | null;
  stdout(): Promise<string>;
  stderr(): Promise<string>;
}

async function runStep(
  sandbox: { runCommand(params: { cmd: string; args?: string[]; cwd?: string }): Promise<FinishedCommand> },
  label: string,
  cmd: string,
  args: string[],
): Promise<string> {
  process.stdout.write(`→ ${label} ... `);
  const started = Date.now();
  const command = await sandbox.runCommand({ cmd, args, cwd: '/vercel/sandbox' });
  const stdout = (await command.stdout()).trim();
  if (command.exitCode !== 0) {
    const stderr = (await command.stderr()).trim();
    console.log('FAILED');
    throw new Error(`${label} exited ${command.exitCode}\nstdout: ${stdout.slice(0, 2_000)}\nstderr: ${stderr.slice(0, 4_000)}`);
  }
  console.log(`ok (${Math.round((Date.now() - started) / 1000)}s)`);
  return stdout;
}

async function main(): Promise<void> {
  const githubToken = requiredEnv('GITHUB_TOKEN');
  const commit = (process.argv[2]?.trim() || execSync('git rev-parse HEAD').toString().trim()).toLowerCase();
  if (!/^[a-f0-9]{7,40}$/.test(commit)) throw new Error(`invalid commit sha: ${commit}`);

  console.log(`MG render snapshot build\n  repo:   ${GIT_URL}\n  commit: ${commit}\n`);

  const { Sandbox } = await import('@vercel/sandbox');
  const sandbox = await Sandbox.create({
    source: { type: 'git', url: GIT_URL, revision: commit, username: 'x-access-token', password: githubToken },
    timeout: BUILD_TIMEOUT_MS,
    resources: { vcpus: 4 },
    tags: { app: 'editron', workload: 'mg-render-snapshot-build', commit: commit.slice(0, 12) },
  });

  try {
    const checkedOut = await runStep(sandbox, 'verify checkout commit', 'git', ['rev-parse', 'HEAD']);
    if (!checkedOut.toLowerCase().startsWith(commit) && !commit.startsWith(checkedOut.toLowerCase())) {
      throw new Error(`sandbox checked out ${checkedOut}, expected ${commit} — is the commit pushed to origin?`);
    }
    // packageManager pin in package.json drives the exact pnpm version via corepack.
    await runStep(sandbox, 'pnpm install (frozen lockfile)', 'bash', ['-lc', 'corepack enable && pnpm install --frozen-lockfile']);
    // CRITICAL: bake the Remotion headless browser — the job sandbox's network policy can never fetch it.
    await runStep(sandbox, 'bake Remotion headless browser', 'node', ['-e', "require('@remotion/renderer').ensureBrowser().then(() => console.log('BROWSER_OK')).catch((e) => { console.error(e); process.exit(1); })"]);
    await runStep(sandbox, 'smoke: sharp loads', 'node', ['-e', "require('sharp'); console.log('SHARP_OK')"]);
    await runStep(sandbox, 'smoke: tsx binary present', 'bash', ['-lc', 'test -x node_modules/.bin/tsx && echo TSX_OK']);

    process.stdout.write('→ creating snapshot (no expiration) ... ');
    const snapshot = await sandbox.snapshot({ expiration: 0 });
    console.log(`ok\n`);

    console.log('SNAPSHOT READY');
    console.log(`  snapshotId: ${snapshot.snapshotId}`);
    console.log(`  commit:     ${commit}\n`);
    console.log('Set these in Vercel (production) and redeploy:');
    console.log(`  MG_RENDER_SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}`);
    console.log(`  MG_RENDER_SANDBOX_APP_COMMIT=${commit}`);
    console.log('Then flip MG_CODEGEN_ENABLED=true only after the playbook battle test passes.');
  } finally {
    await sandbox.delete().catch((error: unknown) => {
      console.error('[snapshot-build] cleanup failed (snapshot is unaffected):', error instanceof Error ? error.message : String(error));
    });
  }
}

main().catch((error) => {
  console.error('[snapshot-build] fatal:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
