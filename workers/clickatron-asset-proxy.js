/**
 * Cloudflare Worker - Clickatron Asset Proxy with CORS
 *
 * Serves R2 assets with proper CORS headers for browser access.
 *
 * Setup:
 * 1. Deploy this worker to Cloudflare
 * 2. Set R2_BUCKET binding in worker settings
 * 3. Update CLICKATRON_R2_WORKER_URL env variable
 */

export default {
  async fetch(request) {
    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // Handle OPTIONS request (preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders },
      });
    }

    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Extract R2 key from path: /asset/{key} or /clickatron/{key}
      let r2Key = pathname;

      if (pathname.startsWith('/asset/')) {
        r2Key = pathname.substring('/asset/'.length);
      } else if (pathname.startsWith('/clickatron/')) {
        r2Key = pathname.substring('/clickatron/'.length);
      } else if (pathname === '/' || pathname === '') {
        return new Response('Clickatron Asset Proxy - Use /asset/{key} or /clickatron/{key}', {
          headers: { 'Content-Type': 'text/plain', ...corsHeaders },
        });
      }

      if (!r2Key || r2Key === '/') {
        return new Response('Missing asset key', {
          status: 400,
          headers: { 'Content-Type': 'text/plain', ...corsHeaders },
        });
      }
      try {
        r2Key = decodeURIComponent(r2Key);
      } catch {
        return new Response('Malformed asset key', {
          status: 400,
          headers: { 'Content-Type': 'text/plain', ...corsHeaders },
        });
      }
      if (isPrivateR2Key(r2Key)) {
        return new Response('Private asset namespace', {
          status: 403,
          headers: { 'Content-Type': 'text/plain', ...corsHeaders },
        });
      }

      // Fetch from R2
      const object = await R2_BUCKET.get(r2Key);

      if (!object) {
        return new Response('Asset not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain', ...corsHeaders },
        });
      }

      // Return object with CORS headers
      const response = new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'ETag': object.httpEtag,
          ...corsHeaders,
        },
      });

      return response;

    } catch (error) {
      return new Response(`Error: ${error.message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders },
      });
    }
  },
};

function isPrivateR2Key(r2Key) {
  const withoutLeadingSeparators = r2Key.replace(/^[/\\]+/, '');
  return withoutLeadingSeparators === 'private'
    || withoutLeadingSeparators.startsWith('private/');
}
