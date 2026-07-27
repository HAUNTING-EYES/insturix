/**
 * Upsert the two MG render-snapshot env vars into Vercel via the API. Called by the mg-render-snapshot CI job
 * after a fresh snapshot is built, so "rebuild the worker" becomes invisible — CI builds it and writes the new
 * pointer here; a redeploy (or the deploy hook) then picks it up.
 *
 * Env in: VERCEL_TOKEN, VERCEL_PROJECT_ID, (VERCEL_TEAM_ID optional),
 *         MG_RENDER_SANDBOX_SNAPSHOT_ID, MG_RENDER_SANDBOX_APP_COMMIT.
 * Targets production + preview (all branches) — the source of truth once CI owns these. Idempotent (upsert=true).
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`mg-update-vercel-env: missing ${name}`);
  return value;
}

async function upsert(key: string, value: string): Promise<void> {
  const projectId = required('VERCEL_PROJECT_ID');
  const team = process.env.VERCEL_TEAM_ID?.trim();
  const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env?upsert=true${team ? `&teamId=${encodeURIComponent(team)}` : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${required('VERCEL_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value, type: 'encrypted', target: ['production', 'preview'] }),
  });
  if (!res.ok) {
    throw new Error(`Vercel env upsert '${key}' failed: HTTP ${res.status} ${(await res.text()).slice(0, 500)}`);
  }
  console.log(`  ✓ ${key} upserted (production + preview)`);
}

async function triggerRedeploy(): Promise<void> {
  const hook = process.env.VERCEL_DEPLOY_HOOK_URL?.trim();
  if (!hook) {
    console.log('  (no VERCEL_DEPLOY_HOOK_URL — env vars take effect on your next deploy)');
    return;
  }
  const res = await fetch(hook, { method: 'POST' });
  console.log(res.ok ? '  ✓ redeploy triggered via deploy hook' : `  ⚠ deploy hook returned HTTP ${res.status}`);
}

async function main(): Promise<void> {
  console.log('Updating Vercel MG env vars:');
  await upsert('MG_RENDER_SANDBOX_SNAPSHOT_ID', required('MG_RENDER_SANDBOX_SNAPSHOT_ID'));
  await upsert('MG_RENDER_SANDBOX_APP_COMMIT', required('MG_RENDER_SANDBOX_APP_COMMIT'));
  await triggerRedeploy();
  console.log('Done.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
