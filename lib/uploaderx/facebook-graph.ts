const DEFAULT_FACEBOOK_GRAPH_VERSION = "v21.0";

export const FACEBOOK_GRAPH_TIMEOUT_MS = 10_000;

export function facebookGraphVersion(): string {
  const configured = process.env.FACEBOOK_GRAPH_API_VERSION?.trim();
  const version = configured
    ? configured.startsWith("v")
      ? configured
      : `v${configured}`
    : DEFAULT_FACEBOOK_GRAPH_VERSION;

  if (!/^v\d+\.\d+$/.test(version)) {
    throw new Error("FACEBOOK_GRAPH_API_VERSION must look like v21.0");
  }

  return version;
}

export function facebookGraphApiUrl(path: string): URL {
  return new URL(
    `https://graph.facebook.com/${facebookGraphVersion()}/${path.replace(/^\/+/, "")}`,
  );
}

export function facebookOAuthDialogUrl(): URL {
  return new URL(`https://www.facebook.com/${facebookGraphVersion()}/dialog/oauth`);
}
