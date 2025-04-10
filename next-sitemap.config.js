/** @type {import('next-sitemap').IConfig} */
module.exports = {
    siteUrl: process.env.SITE_URL,
    generateRobotsTxt: true,
    generateIndexSitemap: true,
    sitemapSize: 7000,
    exclude: ["/api/*", "/admin/*", "/_next/*", "/_static/*", "/404", "/500"],
    robotsTxtOptions: {
      policies: [
        {
          userAgent: "*",
          allow: "/",
          disallow: ["/api/*", "/admin/*", "/_next/*", "/_static/*"],
        },
      ],
      additionalSitemaps: [
        `${process.env.SITE_URL}/sitemap.xml`,
        `${process.env.SITE_URL}/server-sitemap.xml`, // For dynamic routes
      ],
    },
    transform: async (path) => {
      // Custom transform function to set priority and changefreq
      const priority =
        path === "/"
          ? 1.0
          : path.startsWith("/blog")
          ? 0.8
          : path.startsWith("/products")
          ? 0.9
          : 0.7;
  
      return {
        loc: path,
        changefreq: "daily",
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
    },
  };