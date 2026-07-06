type EnvLike = Record<string, string | undefined>;

export type RemotionSiteFreshnessReason =
  | 'verified_env_commit'
  | 'verified_url_commit'
  | 'unverified_no_app_commit'
  | 'missing_remotion_site_commit'
  | 'remotion_site_commit_mismatch';

export interface RemotionSiteFreshness {
  ok: boolean;
  reason: RemotionSiteFreshnessReason;
  serveUrl: string;
  appCommit: string | null;
  serveCommit: string | null;
  source: 'env' | 'url' | 'none';
}

const SHA_RE = /[a-f0-9]{7,40}/gi;
const DEFAULT_COMPARE_LENGTH = 12;

export function resolveRemotionSiteFreshness(input: {
  serveUrl: string;
  env?: EnvLike;
}): RemotionSiteFreshness {
  const env = input.env ?? process.env;
  const serveUrl = input.serveUrl || '';
  const appCommit = normalizeCommit(
    env.EDITRON_APP_BUILD_SHA
    ?? env.VERCEL_GIT_COMMIT_SHA
    ?? env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  );

  const envServeCommit = normalizeCommit(
    env.REMOTION_LAMBDA_SERVE_COMMIT_SHA
    ?? env.REMOTION_SITE_COMMIT_SHA,
  );
  const urlServeCommit = envServeCommit ? null : findCommitInServeUrl(serveUrl);
  const serveCommit = envServeCommit ?? urlServeCommit;
  const source: RemotionSiteFreshness['source'] = envServeCommit ? 'env' : urlServeCommit ? 'url' : 'none';

  if (!appCommit) {
    return { ok: true, reason: 'unverified_no_app_commit', serveUrl, appCommit: null, serveCommit, source };
  }

  if (!serveCommit) {
    return { ok: false, reason: 'missing_remotion_site_commit', serveUrl, appCommit, serveCommit: null, source };
  }

  const compareLength = Math.min(appCommit.length, serveCommit.length, DEFAULT_COMPARE_LENGTH);
  const matches = appCommit.slice(0, compareLength) === serveCommit.slice(0, compareLength);
  if (!matches) {
    return { ok: false, reason: 'remotion_site_commit_mismatch', serveUrl, appCommit, serveCommit, source };
  }

  return {
    ok: true,
    reason: source === 'env' ? 'verified_env_commit' : 'verified_url_commit',
    serveUrl,
    appCommit,
    serveCommit,
    source,
  };
}

export function assertRemotionSiteFresh(input: {
  serveUrl: string;
  env?: EnvLike;
}): RemotionSiteFreshness {
  const status = resolveRemotionSiteFreshness(input);
  if (!status.ok) {
    throw new Error(formatRemotionSiteFreshnessError(status));
  }
  return status;
}

export function formatRemotionSiteFreshnessError(status: RemotionSiteFreshness): string {
  if (status.reason === 'missing_remotion_site_commit') {
    return 'REMOTION_LAMBDA_SERVE_URL is not version-pinned for this app deploy. Set REMOTION_LAMBDA_SERVE_COMMIT_SHA to the Remotion site commit or deploy a serve URL containing the current commit.';
  }
  if (status.reason === 'remotion_site_commit_mismatch') {
    return `REMOTION_LAMBDA_SERVE_URL points at commit ${status.serveCommit ?? 'unknown'}, but the app deploy is ${status.appCommit ?? 'unknown'}. Redeploy the Remotion site and update REMOTION_LAMBDA_SERVE_URL/REMOTION_LAMBDA_SERVE_COMMIT_SHA.`;
  }
  return `REMOTION_LAMBDA_SERVE_URL failed version check: ${status.reason}`;
}

function normalizeCommit(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.trim().toLowerCase().match(/^[a-f0-9]{7,40}$/);
  return match ? match[0] : null;
}

function findCommitInServeUrl(serveUrl: string): string | null {
  const matches = serveUrl.toLowerCase().match(SHA_RE) ?? [];
  return matches.find((candidate) => normalizeCommit(candidate)) ?? null;
}