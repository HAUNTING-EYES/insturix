import type { NextConfig } from "next";

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
  // Disable React Strict Mode in production to avoid double-renders
  // Keep enabled in development for debugging
  reactStrictMode: process.env.NODE_ENV === "development",
  typescript: {
    // Warning: This allows production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  // Performance optimizations
  experimental: {
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
