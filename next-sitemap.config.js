/** @type {import('next-sitemap').IConfig} */
import { fetchBlogPosts } from "./lib/blog-posts.js";

const config = {
  siteUrl: process.env.SITE_URL,
  generateRobotsTxt: true,
  generateIndexSitemap: true,
  sitemapSize: 7000,
  exclude: [
    "/api/*",
    "/admin/*",
    "/_next/*",
    "/_static/*",
    "/404",
    "/500",
    "/auth/*",
    "/dashboard/*",
    "/profile/*",
    "/settings/*",
    "/checkout/*",
    "/cart/*",
    "/search/*",
    "/privacy-policy",
    "/terms-of-service",
    "/sitemap.xml",
    "/robots.txt",
  ],
  // Add additionalPaths to handle dynamic routes
  additionalPaths: async () => {
    const blogPosts = await fetchBlogPosts();

    return blogPosts.map((post) => ({
      loc: `/blog/${post.slug}`,
      changefreq: "weekly",
      priority: 0.8,
      lastmod: post.updatedAt || new Date().toISOString(),
    }));
  },
  robotsTxtOptions: {
    policies: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/*",
          "/admin/*",
          "/_next/*",
          "/_static/*",
          "/auth/*",
          "/dashboard/*",
          "/profile/*",
          "/settings/*",
          "/checkout/*",
          "/cart/*",
          "/search/*",
        ],
      },
      {
        userAgent: "GPTBot",
        disallow: ["/"],
      },
      {
        userAgent: "ChatGPT-User",
        disallow: ["/"],
      },
      {
        userAgent: "Google-Extended",
        allow: ["/"],
      },
    ],
    additionalSitemaps: [`${process.env.SITE_URL}/sitemap.xml`],
  },
  transform: async (config) => {
    // Custom transform function to set priority and changefreq
    const path = config?.loc || "/";

    // Default values
    let priority = 0.6;
    let changefreq = "monthly";

    // Set priority based on path
    if (path === "/") {
      priority = 1.0;
      changefreq = "daily";
    } else if (path?.startsWith("/blog")) {
      priority = 0.8;
      changefreq = "weekly";
    } else if (path?.startsWith("/products")) {
      priority = 0.9;
      changefreq = "weekly";
    } else if (path?.startsWith("/categories")) {
      priority = 0.85;
      changefreq = "weekly";
    } else if (path?.startsWith("/about") || path?.startsWith("/contact")) {
      priority = 0.7;
      changefreq = "monthly";
    }

    return {
      loc: path,
      changefreq,
      priority,
      lastmod: new Date().toISOString(),
    };
  },
  // Add Google verification
  googleVerification: process.env.GOOGLE_VERIFICATION_ID,
  // Add custom headers for better SEO
  headers: {
    "X-Robots-Tag": "index, follow",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  },
};

export default config;
