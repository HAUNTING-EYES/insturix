/**
 * Utility to resolve the base URL dynamically based on the environment.
 * Prioritizes explicitly set environment variables, then falls back to Vercel's dynamic URLs.
 */
export function getBaseUrl() {
  if (typeof window !== 'undefined') return ''; // browser should use relative url
  
  // Use explicitly set SITE_URL or NEXT_PUBLIC_APP_URL
  const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (siteUrl && !siteUrl.includes('localhost') && !siteUrl.includes('127.0.0.1')) {
    return siteUrl;
  }

  // Use Vercel's dynamic URL for preview/development deployments
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Fallback for local development
  return siteUrl || 'http://localhost:3000';
}
