/** @type {import('next-sitemap').IConfig} */
import { fetchBlogPosts } from "./lib/blog-posts.js";

const SITE_URL = process.env.SITE_URL || "https://www.insturix.com";

const appSurfaceDisallow = [
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
];

const archivedOrUtilityRoutes = [
  "/manifest.json",
  "/about/team",
  "/contact-sales",
  "/contribute",
  "/donate",
  "/insturix-creatives-agency",
  "/sponsor",
  "/waitlist",
  "/products/alyzitron",
  "/products/clickatron",
  "/products/editron",
  "/products/musitron",
  "/products/socialize",
  "/products/thinkforge",
  "/landing-a",
  "/landing-b",
  "/hero-test",
  "/preview",
  "/signin",
  "/signup",
];

const config = {
  siteUrl: SITE_URL,
  generateRobotsTxt: true,
  generateIndexSitemap: true,
  sitemapSize: 7000,
  changefreq: 'daily',
  priority: 0.9,
  exclude: [
    ...appSurfaceDisallow,
    ...archivedOrUtilityRoutes,
    "/404",
    "/500",
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
    const blogPaths = blogPosts
      .filter((post) => !/^\d+$/.test(post.slug))
      .map((post) => ({
        loc: `/resources/blogs/${post.slug}`,
        changefreq: "daily",
        priority: 0.9,
        lastmod: post.updatedAt || new Date().toISOString(),
      }));

    // Static routes come from the Next.js build. Only dynamic blog entries
    // need to be added here.
    const paths = [...blogPaths];

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
        disallow: appSurfaceDisallow,
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
    } else if (path?.startsWith("/about") || path?.startsWith("/contactus")) {
      priority = 0.8;
      changefreq = "weekly";
    } else if (path?.startsWith("/upgrade")) {
      priority = 0.9;
      changefreq = "daily";
    }

    return {
      loc: path,
      changefreq,
      priority,
      lastmod: new Date().toISOString(),
    };
  },
};

export default config;
