/**
 * Dedicated credentials for endpoints protected by Modal proxy authentication.
 *
 * These are deliberately not the generic MODAL_TOKEN_* API credentials. A
 * caller may send them only to a Modal endpoint that is explicitly configured
 * to require proxy authentication.
 */
export const EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1 =
  'EDITRON_MODAL_PROXY_AUTH_TOKEN_ID' as const;
export const EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1 =
  'EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET' as const;

export type ModalProxyAuthEnvironmentV1 = Readonly<Record<string, string | undefined>>;

export type ModalProxyAuthV1 = Readonly<{
  tokenId: string;
  tokenSecret: string;
}>;

/**
 * Modal proxy credentials must never be sent to an arbitrary configured host.
 * Custom domains are intentionally unsupported until they have an explicit,
 * separately reviewed trust policy.
 */
export function isModalProxyEndpointV1(endpoint: string | null | undefined): boolean {
  if (!endpoint?.trim()) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (url.hostname === 'modal.run' || url.hostname.endsWith('.modal.run'));
  } catch {
    return false;
  }
}

/** Returns complete, trimmed proxy credentials or null; partial configuration fails closed. */
export function readModalProxyAuthV1(
  environment: ModalProxyAuthEnvironmentV1 = process.env,
): ModalProxyAuthV1 | null {
  const tokenId = configured(environment[EDITRON_MODAL_PROXY_AUTH_TOKEN_ID_ENV_V1]);
  const tokenSecret = configured(environment[EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET_ENV_V1]);
  return tokenId && tokenSecret ? { tokenId, tokenSecret } : null;
}

/** Constructs only the headers Modal's proxy-authenticated endpoints accept. */
export function modalProxyAuthHeadersV1(
  auth: ModalProxyAuthV1,
): Readonly<Record<'Modal-Key' | 'Modal-Secret', string>> {
  return {
    'Modal-Key': auth.tokenId,
    'Modal-Secret': auth.tokenSecret,
  };
}

function configured(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}
