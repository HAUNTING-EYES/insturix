import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { getAllBlogPosts } from "@/lib/blog-server";
import BlogGrid from "@/components/BlogGrid";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog | Insturix",
  description: "Insights on AI video production, creative workflows, and the future of content creation.",
};

export default async function BlogPage() {
  const blogPosts = await getAllBlogPosts();

  return (
    <>
      <SiteNavbar />
      <main
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--bg-canvas)",
          fontFamily: "var(--font-sans)",
        }}
      >
        {/* Hero */}
        <section
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "64px 24px 48px",
            textAlign: "center",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.12em",
              color: "var(--text-dim)",
              textTransform: "uppercase",
              display: "block",
              marginBottom: 12,
            }}
          >
            BLOG
          </span>

          <h1
            style={{
              fontSize: 44,
              fontWeight: 800,
              color: "var(--text-primary)",
              margin: "0 0 12px",
              lineHeight: 1.1,
            }}
          >
            Insights
          </h1>

          <p
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: "var(--text-secondary)",
              maxWidth: 480,
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            Perspectives on AI-driven production, creative workflows, and the
            evolving landscape of video content.
          </p>
        </section>

        {/* Grid */}
        <section
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "0 24px 64px",
          }}
        >
          <BlogGrid posts={blogPosts} />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
