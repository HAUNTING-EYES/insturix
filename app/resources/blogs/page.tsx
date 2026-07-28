import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { getAllBlogPosts } from "@/lib/blog-server";
import BlogGrid from "@/components/BlogGrid";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Guides and insights from the Insturix team on automated content production, AI-assisted workflows, brand consistency, and producing content at scale.",
};

export default async function BlogPage() {
  const blogPosts = await getAllBlogPosts();
  const hasPosts = blogPosts.length > 0;

  return (
    <>
      <SiteNavbar />
      <main style={{ minHeight: "100vh", backgroundColor: "var(--bg-canvas)", fontFamily: "var(--font-sans)" }}>
        {/* Hero */}
        <section style={{ maxWidth: 960, margin: "0 auto", padding: "var(--r-section-padding) var(--r-page-padding) 48px", textAlign: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: 24 }}>
            BLOG
          </span>
          <h1 style={{ fontSize: "var(--r-hero-size)", fontWeight: 800, color: "var(--text-primary)", margin: "0 0 16px", lineHeight: 1.05, letterSpacing: "-0.035em" }}>
            Production Notes
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
            Perspectives on automated content production, creative workflows, brand consistency, and scaling output.
          </p>
        </section>

        {/* Posts or empty state */}
        <section style={{ maxWidth: 960, margin: "0 auto", padding: "0 var(--r-page-padding) var(--r-section-padding)" }}>
          {hasPosts ? (
            <BlogGrid posts={blogPosts} />
          ) : (
            <div style={{ textAlign: "center", padding: "64px 24px" }}>
              <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 32 }}>
                No posts yet. We&apos;re just getting started.
              </p>
            </div>
          )}
        </section>

        {/* Write for us CTA */}
        <section style={{ maxWidth: 960, margin: "0 auto", padding: "0 var(--r-page-padding) var(--r-section-padding)" }}>
          <div style={{
            background: "var(--bg-raised)", border: "1px solid var(--border-subtle)",
            borderRadius: 12, padding: "48px 32px", textAlign: "center",
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", color: "var(--accent-gold)", textTransform: "uppercase", display: "block", marginBottom: 16 }}>
              COMMUNITY
            </span>
            <h2 style={{ fontSize: 24, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 12 }}>
              Write for us.
            </h2>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6 }}>
              Have a perspective on automated production, creative workflows, or the future of content?
              Submit a draft — we review and publish community posts.
            </p>
            <Link href="/contactus" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 24px", background: "var(--accent-gold)", color: "var(--bg-canvas)",
              fontSize: 13, fontWeight: 500, borderRadius: 7, textDecoration: "none",
            }}>
              Submit a draft
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
