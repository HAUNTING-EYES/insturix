import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

export interface OAuthPopupResponseOptions {
  request: Request;
  source: string;
  payload: Record<string, unknown>;
  fallbackUrl: string;
  title?: string;
  message?: string;
}

const JSON_HTML_ESCAPE_MAP: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

const HTML_TEXT_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeJsonForHtml(value: unknown) {
  const json = JSON.stringify(value) ?? "null";
  return json.replace(/[<>&\u2028\u2029]/g, (char) => JSON_HTML_ESCAPE_MAP[char]);
}

export function createOAuthPopupResponse({
  request,
  source,
  payload,
  fallbackUrl,
  title = "OAuth Connection",
  message = "Completing connection...",
}: OAuthPopupResponseOptions) {
  const origin = new URL(request.url).origin;
  const nonce = randomBytes(16).toString("base64url");
  const config = { source, origin, fallbackUrl };

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtmlText(title)}</title>
  </head>
  <body>
    <script id="oauth-popup-payload" type="application/json">${escapeJsonForHtml(payload)}</script>
    <script id="oauth-popup-config" type="application/json">${escapeJsonForHtml(config)}</script>
    <script nonce="${nonce}">
      (function () {
        function readJson(id) {
          var el = document.getElementById(id);
          return JSON.parse((el && el.textContent) || "{}");
        }
        var payload = readJson("oauth-popup-payload");
        var config = readJson("oauth-popup-config");
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ source: config.source, payload: payload }, config.origin);
            window.close();
            return;
          }
        } catch (error) {}
        window.location.replace(config.fallbackUrl);
      })();
    </script>
    <p>${escapeHtmlText(message)}</p>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function escapeHtmlText(value: string) {
  return value.replace(/[&<>"']/g, (char) => HTML_TEXT_ESCAPE_MAP[char]);
}
