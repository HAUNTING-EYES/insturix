import type { NextConfig } from "next";

import { computeRemotionSiteFingerprint } from "./lib/editron/services/remotion-site-fingerprint";
import { thinkforgeRedirects } from "./lib/studio/legacy-redirects";

const remotionSiteFingerprint = computeRemotionSiteFingerprint();

const legacyProductRoutes = [
  "/products/alyzitron",
  "/products/clickatron",
  "/products/editron",
  "/products/musitron",
  "/products/socialize",
  "/products/thinkforge",
];

const stalePublicRedirects = [
  { source: "/about/team", destination: "/about" },
  { source: "/checkout", destination: "/upgrade" },
  { source: "/contact-sales", destination: "/contactus" },
  { source: "/contribute", destination: "/support-us" },
  { source: "/donate", destination: "/support-us" },
  { source: "/enterprise", destination: "/contactus" },
  { source: "/ics25", destination: "/showcase" },
  { source: "/ics25/gameon", destination: "/showcase" },
  { source: "/ics25/register", destination: "/signup" },
  { source: "/insturix-creatives-agency", destination: "/contactus" },
  { source: "/pricing", destination: "/upgrade" },
  { source: "/products/ai-video-editor", destination: "/products" },
  { source: "/products/brand-deals", destination: "/products" },
  { source: "/products/business-analytics", destination: "/products" },
  { source: "/products/influencer-protection", destination: "/products" },
  { source: "/products/meditron", destination: "/products" },
  { source: "/products/shield", destination: "/products" },
  { source: "/sponsor", destination: "/support-us" },
  { source: "/waitlist", destination: "/signup" },
];

const nextConfig: NextConfig = {
  env: {
    EDITRON_REMOTION_BUNDLE_SHA: remotionSiteFingerprint.sha256,
  },
  // Disable React Strict Mode in production to avoid double-renders
  // Keep enabled in development for debugging
  reactStrictMode: process.env.NODE_ENV === "development",
  // The authenticated local Playwright gate runs from the loopback origin.
  // Declaring it prevents dev-server origin warnings without changing production routing.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  typescript: {
    // Warning: This allows production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  // Remotion's bundler/renderer are Node build tools (they embed webpack + spawn Chromium + native deps) and
  // CANNOT be bundled by Next's webpack — that is "bundling webpack with webpack" and fails the build. This was
  // the 67fc4fe6 regression: the MG codegen seam pulled frame-renderer into the Director route graph. Keep them
  // external so the build is green; the actual rendering must run in an isolated worker, never a Vercel function.
  // The Lambda packages are also Node-only AWS streaming clients. Bundling them into a Route Handler can leave
  // renderStillOnLambda waiting forever for a stream event even though the same request succeeds natively.
  serverExternalPackages: [
    '@remotion/bundler',
    '@remotion/lambda',
    '@remotion/lambda-client',
    '@remotion/renderer',
    '@ffmpeg-installer/ffmpeg',
    'sharp',
  ],
  outputFileTracingIncludes: {
    '/api/internal/workers/pipeline/audio': [
      './node_modules/@ffmpeg-installer/linux-x64/ffmpeg',
    ],
    '/api/internal/workers/chat-dubbing': [
      './node_modules/@ffmpeg-installer/linux-x64/ffmpeg',
    ],
    '/api/services/editron/chat/tool-call': [
      './node_modules/@ffmpeg-installer/linux-x64/ffmpeg',
    ],
    '/api/services/pipeline/storyboard/*/finalize': [
      './node_modules/@ffmpeg-installer/linux-x64/ffmpeg',
    ],
  },
  // Performance optimizations
  experimental: {
    // Keep the production compiler below Vercel's standard 8 GB builder ceiling.
    // Next documents this as a low-risk optimization for large Webpack graphs.
    webpackMemoryOptimizations: true,
    optimizePackageImports: [
      '@radix-ui/react-icons',
      '@tabler/icons-react',
      'lucide-react',
      'framer-motion',
      'gsap',
      '@gsap/react',
      'lenis',
      '@tanstack/react-query',
    ],
  },
  // Turbopack configuration (moved from experimental.turbo)
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  async redirects() {
    return [
      {
        source: "/mockups/:path*",
        destination: "/products",
        permanent: true,
      },
      ...legacyProductRoutes.map((source) => ({
        source,
        destination: "/products",
        permanent: true,
      })),
      ...stalePublicRedirects.map(({ source, destination }) => ({
        source,
        destination,
        permanent: true,
      })),
      {
        source: "/socialize/:uniqueUsername",
        destination: "/profile/:uniqueUsername",
        permanent: true,
      },
      /* ThinkForge control room → studio (plan §10 / Phase 4; see
       * lib/studio/legacy-redirects.ts for the entry list + rationale) */
      ...thinkforgeRedirects,
    ];
  },
  // LCP fix (2026-07-01): removed the custom production splitChunks override.
  //
  // OLD behavior: a single `vendor` cacheGroup with `test: /node_modules/` (no
  // maxSize / maxInitialRequests) forced almost the entire node_modules tree into
  // ONE ~4.8MB `vendor` chunk that every public page had to download before it
  // could paint (field LCP ~6.1s). It also worked against the
  // `experimental.optimizePackageImports` list above.
  //
  // NEW behavior: with no override, Next.js applies its default chunking —
  // per-route chunks plus size-capped shared chunks — which breaks that
  // mega-chunk into smaller, route-scoped files and lets optimizePackageImports
  // take effect. Same modules ship, just packaged smaller; no UI/behavior change.
  //
  // Rollback: restore the `webpack` splitChunks block from git history.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn2.suno.ai",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "tempfile.aiquickdraw.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "assets.aceternity.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "apiboxfiles.erweima.ai",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "mfile.erweima.ai",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.youtube.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "static.cdninstagram.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "scontent.cdninstagram.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "github.githubassets.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "yt3.googleusercontent.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        port: "",
        pathname: "/**",
      }
    ],
  },
};

export default nextConfig;
