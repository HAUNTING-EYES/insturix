import crypto from "crypto";

/**
 * OAuth 1.0a Signing Utility
 * Twitter/X media upload API (v1.1) requires OAuth 1.0a signatures.
 * This module generates the Authorization header for signed requests.
 */

/**
 * Generate a random OAuth nonce (unique per request)
 */
function generateNonce(): string {
    return crypto.randomBytes(16).toString("base64").replace(/[^a-zA-Z0-9]/g, "").substring(0, 32);
}

/**
 * Generate OAuth timestamp (seconds since epoch)
 */
function generateTimestamp(): string {
    return Math.floor(Date.now() / 1000).toString();
}

/**
 * URL-encode according to OAuth 1.0a spec (RFC 3986)
 */
function rfc3986Encode(str: string): string {
    return encodeURIComponent(str)
        .replace(/!/g, "%21")
        .replace(/\*/g, "%2A")
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29")
        .replace(/'/g, "%27");
}

/**
 * Build the base string for OAuth 1.0a signature
 */
function buildBaseString(
    method: string,
    url: string,
    params: Record<string, string>
): string {
    const sortedParams = Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${rfc3986Encode(key)}=${rfc3986Encode(value)}`)
        .join("&");

    return `${method.toUpperCase()}&${rfc3986Encode(url)}&${rfc3986Encode(sortedParams)}`;
}

/**
 * Build the OAuth Authorization header
 */
function buildAuthHeader(oauthParams: Record<string, string>): string {
    const params = Object.entries(oauthParams)
        .map(([key, value]) => `${rfc3986Encode(key)}="${rfc3986Encode(value)}"`)
        .join(", ");

    return `OAuth ${params}`;
}

/**
 * Sign a request with OAuth 1.0a using HMAC-SHA1
 * Returns the Authorization header value
 */
export function signOAuth1a(
    method: string,
    url: string,
    params: Record<string, string> | undefined,
    consumerKey: string,
    consumerSecret: string,
    oauthToken: string,
    oauthTokenSecret: string
): string {
    const oauthParams: Record<string, string> = {
        oauth_consumer_key: consumerKey,
        oauth_nonce: generateNonce(),
        oauth_signature_method: "HMAC-SHA1",
        oauth_timestamp: generateTimestamp(),
        oauth_token: oauthToken,
        oauth_version: "1.0",
    };

    // Combine OAuth params with request params for signature
    const allParams: Record<string, string> = { ...oauthParams };
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                allParams[key] = String(value);
            }
        }
    }

    // Build and sign the base string
    const baseString = buildBaseString(method, url.split("?")[0], allParams);
    const signingKey = `${rfc3986Encode(consumerSecret)}&${rfc3986Encode(oauthTokenSecret)}`;
    const signature = crypto
        .createHmac("sha1", signingKey)
        .update(baseString)
        .digest("base64");

    // Add signature to OAuth params
    oauthParams.oauth_signature = signature;

    return buildAuthHeader(oauthParams);
}

/**
 * Make an OAuth 1.0a authenticated request
 * For upload.twitter.com endpoints (media upload API)
 */
export async function oauth1aRequest(
    method: string,
    url: string,
    params: Record<string, string> | undefined,
    consumerKey: string,
    consumerSecret: string,
    oauthToken: string,
    oauthTokenSecret: string,
    body?: Buffer
): Promise<any> {
    const authHeader = signOAuth1a(
        method,
        url,
        params,
        consumerKey,
        consumerSecret,
        oauthToken,
        oauthTokenSecret
    );

    // Build URL with query params if any
    const urlObj = new URL(url);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            urlObj.searchParams.set(key, value);
        }
    }

    const fetchOptions: RequestInit = {
        method,
        headers: {
            Authorization: authHeader,
        },
    };

    // For media upload (APPEND), send raw binary
    if (body) {
        (fetchOptions.headers as Record<string, string>)["Content-Type"] = "application/octet-stream";
        (fetchOptions.headers as Record<string, string>)["Content-Length"] = body.length.toString();
        fetchOptions.body = body;
    }

    console.log(`🔐 OAuth 1.0a Request: ${method} ${urlObj.toString().substring(0, 100)}...`);
    console.log(`🔐 Auth header (preview): ${authHeader.substring(0, 80)}...`);

    const response = await fetch(urlObj.toString(), fetchOptions);
    const responseText = await response.text();

    console.log(`📥 OAuth 1.0a Response: ${response.status} | Body:`, responseText.substring(0, 500));

    let data: any;
    try {
        data = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
        console.error("❌ Failed to parse Twitter API response:", responseText);
        throw new Error(`Twitter API returned invalid JSON (HTTP ${response.status}): ${responseText.substring(0, 200)}`);
    }

    if (response.status >= 400) {
        console.error("❌ Twitter API error:", data);
        throw new Error(
            data.error ||
            data.errors?.[0]?.message ||
            `Twitter API returned ${response.status}: ${responseText.substring(0, 200)}`
        );
    }

    return data;
}
