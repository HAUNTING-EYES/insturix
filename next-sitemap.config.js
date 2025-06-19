/** @type {import('next-sitemap').IConfig} */
import { fetchBlogPosts } from "./lib/blog-posts.js";

const config = {
  siteUrl: process.env.SITE_URL || "https://insturix.com",
  generateRobotsTxt: true,
  generateIndexSitemap: true,
  sitemapSize: 7000,
  changefreq: 'daily',
  priority: 0.9,
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
    // Create a set to track URLs we've already added to prevent duplicates
    const addedPaths = new Set();
    
    const blogPosts = await fetchBlogPosts();
    const blogPaths = blogPosts.map((post) => ({
      loc: `/resources/blogs/${post.slug}`,
      changefreq: "daily",
      priority: 0.9,
      lastmod: post.updatedAt || new Date().toISOString(),
    }));

    // Add product pages
    const productSlugs = ["ai-video-editor", "business-analytics", "influencer-protection", "brand-deals"];
    const productPaths = productSlugs.map((slug) => ({
      loc: `/products/${slug}`,
      changefreq: "daily",
      priority: 1.0,
      lastmod: new Date().toISOString(),
    }));

    // Add important static pages
    const staticPages = [
      {
        loc: "/about",
        changefreq: "weekly",
        priority: 0.8,
        lastmod: new Date().toISOString(),
      },
      {
        loc: "/contactus",
        changefreq: "weekly",
        priority: 0.8,
        lastmod: new Date().toISOString(),
      },
      {
        loc: "/upgrade",
        changefreq: "daily",
        priority: 0.9,
        lastmod: new Date().toISOString(),
      },
      {
        loc: "/waitlist",
        changefreq: "always",
        priority: 1.0,
        lastmod: new Date().toISOString(),
      }
    ];

    // Combine all paths
    const paths = [...blogPaths, ...productPaths, ...staticPages];
    
    // Only return paths that haven't been added yet
    const uniquePaths = paths.filter(path => {
      if (addedPaths.has(path.loc)) {
        return false;
      }
      addedPaths.add(path.loc);
      return true;
    });

    return uniquePaths;
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
    additionalSitemaps: [],
  },
  transform: async (config, path) => {
    // Custom transform function to set priority and changefreq
    const url = config?.loc || "/";
    
    // Skip duplicate entries for the same URL
    // This is to prevent multiple entries for the homepage
    if (url === "/" && path === "/") {
      // Set priority and changefreq for homepage
      return {
        loc: "/",
        changefreq: "always",
        priority: 1.0,
        lastmod: new Date().toISOString(),
        alternateRefs: [
          {
            href: `${config.siteUrl || ""}${path}`,
            hreflang: "en",
          },
        ],
      };
    }

    // Set priority based on path
    let priority = 0.8;
    let changefreq = "weekly";

    // Set priority based on path
    if (path === "/") {
      priority = 1.0;
      changefreq = "always";
    } else if (path?.startsWith("/resources/blogs")) {
      priority = 0.9;
      changefreq = "daily";
    } else if (path?.startsWith("/products")) {
      priority = 1.0;
      changefreq = "daily";
    } else if (path?.startsWith("/waitlist")) {
      priority = 1.0;
      changefreq = "always";
    } else if (path?.startsWith("/about") || path?.startsWith("/contactus")) {
      priority = 0.8;
      changefreq = "weekly";
    } else if (path?.startsWith("/pricing")) {
      priority = 0.9;
      changefreq = "daily";
    }

    return {
      loc: path,
      changefreq,
      priority,
      lastmod: new Date().toISOString(),
      alternateRefs: [
        {
          href: `${config.siteUrl || ""}${path}`,
          hreflang: "en",
        },
      ],
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
