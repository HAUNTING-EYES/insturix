type EnvLike = Record<string, string | undefined>;

export type RemotionSiteFreshnessReason =
  | 'verified_env_bundle'
  | 'verified_url_bundle'
  | 'unverified_no_app_commit'
  | 'unverified_no_expected_bundle'
  | 'missing_remotion_site_bundle'
  | 'remotion_site_bundle_mismatch';

export interface RemotionSiteFreshness {
  ok: boolean;
  reason: RemotionSiteFreshnessReason;
  serveUrl: string;
  expectedBundle: string | null;
  serveBundle: string | null;
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
  const expectedBundle = normalizeSha(env.EDITRON_REMOTION_BUNDLE_SHA);

  const envServeBundle = normalizeSha(
    env.REMOTION_LAMBDA_SERVE_BUNDLE_SHA
    ?? env.REMOTION_SITE_BUNDLE_SHA,
  );
  const urlServeBundle = envServeBundle ? null : findShaInServeUrl(serveUrl);
  const serveBundle = envServeBundle ?? urlServeBundle;
  const source: RemotionSiteFreshness['source'] = envServeBundle
    ? 'env'
    : urlServeBundle
      ? 'url'
      : 'none';

  if (!expectedBundle) {
    const appCommit = normalizeSha(
      env.EDITRON_APP_BUILD_SHA
      ?? env.VERCEL_GIT_COMMIT_SHA
      ?? env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    );
    return {
      ok: true,
      reason: appCommit ? 'unverified_no_expected_bundle' : 'unverified_no_app_commit',
      serveUrl,
      expectedBundle: null,
      serveBundle,
      source,
    };
  }

  if (!serveBundle) {
    return {
      ok: false,
      reason: 'missing_remotion_site_bundle',
      serveUrl,
      expectedBundle,
      serveBundle: null,
      source,
    };
  }

  const compareLength = Math.min(expectedBundle.length, serveBundle.length, DEFAULT_COMPARE_LENGTH);
  const matches = expectedBundle.slice(0, compareLength) === serveBundle.slice(0, compareLength);
  if (!matches) {
    return {
      ok: false,
      reason: 'remotion_site_bundle_mismatch',
      serveUrl,
      expectedBundle,
      serveBundle,
      source,
    };
  }

  return {
    ok: true,
    reason: source === 'env' ? 'verified_env_bundle' : 'verified_url_bundle',
    serveUrl,
    expectedBundle,
    serveBundle,
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
  if (status.reason === 'missing_remotion_site_bundle') {
    return 'REMOTION_LAMBDA_SERVE_URL is not pinned to the expected renderer bundle. Deploy a hash-named Remotion site or set REMOTION_LAMBDA_SERVE_BUNDLE_SHA.';
  }
  if (status.reason === 'remotion_site_bundle_mismatch') {
    return `REMOTION_LAMBDA_SERVE_URL points at renderer bundle ${status.serveBundle ?? 'unknown'}, but this app expects ${status.expectedBundle ?? 'unknown'}. Redeploy the Remotion site and update REMOTION_LAMBDA_SERVE_URL/REMOTION_LAMBDA_SERVE_BUNDLE_SHA.`;
  }
  return `REMOTION_LAMBDA_SERVE_URL failed version check: ${status.reason}`;
}

function normalizeSha(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.trim().toLowerCase().match(/^[a-f0-9]{7,40}$/);
  return match ? match[0] : null;
}

function findShaInServeUrl(serveUrl: string): string | null {
  const matches = serveUrl.toLowerCase().match(SHA_RE) ?? [];
  return matches.find((candidate) => normalizeSha(candidate)) ?? null;
}
