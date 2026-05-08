import { getBlogPost, getAllBlogPosts } from "@/lib/blog-server";
import { formatDate } from "@/lib/blog-utils";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import BlogContent from "@/components/BlogContent";
import BlogAudioPlayer from "@/components/BlogAudioPlayer";
import { Calendar, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";

type tParams = Promise<{ slug: string }>;

export async function generateStaticParams() {
  const posts = await getAllBlogPosts();
  return posts.map((post) => ({
    slug: post.id,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: tParams;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const post = await getBlogPost(resolvedParams.slug);

  if (!post) {
    return {
      title: "Post Not Found | Insturix",
      description: "The requested blog post could not be found",
    };
  }

  return {
    title: `${post.title} | Insturix Blog`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [
        {
          url: post.image,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: [post.image],
    },
  };
}

export default async function BlogPost({ params }: { params: tParams }) {
  const resolvedParams = await params;
  const post = await getBlogPost(resolvedParams.slug);

  if (
    !post ||
    !resolvedParams.slug ||
    resolvedParams.slug.includes(".") ||
    resolvedParams.slug === "favicon"
  ) {
    notFound();
  }

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
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "48px 24px 64px",
          }}
        >
          {/* Back link */}
          <Link
            href="/resources/blogs"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 400,
              color: "var(--text-muted)",
              textDecoration: "none",
              marginBottom: 32,
            }}
          >
            <ArrowLeft size={14} />
            Back to Insights
          </Link>

          <article>
            {/* Header */}
            <header style={{ marginBottom: 32 }}>
              {/* Tags */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                {post.tags.map((tag: string) => (
                  <span
                    key={tag}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 500,
                      letterSpacing: "0.08em",
                      color: "var(--text-dim)",
                      textTransform: "uppercase",
                      borderBottom: "1px solid var(--border-subtle)",
                      paddingBottom: 2,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Title */}
              <h1
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  lineHeight: 1.2,
                  margin: "0 0 16px",
                }}
              >
                {post.title}
              </h1>

              {/* Author + meta row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  <Image
                    src={post.author.avatar}
                    alt={post.author.name}
                    fill
                    style={{ objectFit: "cover" }}
                  />
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      margin: 0,
                      lineHeight: 1.3,
                    }}
                  >
                    {post.author.name}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-dim)",
                      marginTop: 2,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Calendar size={11} />
                      {formatDate(post.publishedAt)}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Clock size={11} />
                      {post.readTime} min
                    </span>
                  </div>
                </div>
              </div>
            </header>

            {/* Featured image */}
            <div
              style={{
                position: "relative",
                width: "100%",
                height: 400,
                borderRadius: 12,
                overflow: "hidden",
                marginBottom: 32,
              }}
            >
              <Image
                src={post.image}
                alt={post.title}
                fill
                style={{ objectFit: "cover" }}
                priority
                quality={90}
              />
            </div>

            {/* Audio player */}
            {post.audioUrl && (
              <BlogAudioPlayer
                audioUrl={post.audioUrl}
                title="Listen to this article"
              />
            )}

            {/* Article body */}
            <div
              style={{
                fontSize: 14,
                fontWeight: 400,
                color: "var(--text-secondary)",
                lineHeight: 1.8,
              }}
            >
              <style
                dangerouslySetInnerHTML={{
                  __html: `
                .blog-article h2 {
                  font-size: 24px;
                  font-weight: 800;
                  color: var(--text-primary);
                  margin: 32px 0 12px;
                  line-height: 1.3;
                }
                .blog-article h3 {
                  font-size: 18px;
                  font-weight: 500;
                  color: var(--text-primary);
                  margin: 24px 0 8px;
                  line-height: 1.4;
                }
                .blog-article p {
                  margin: 0 0 16px;
                }
                .blog-article a {
                  color: var(--accent-gold);
                  text-decoration: none;
                }
                .blog-article ul, .blog-article ol {
                  padding-left: 24px;
                  margin: 0 0 16px;
                }
                .blog-article li {
                  margin-bottom: 8px;
                }
                .blog-article blockquote {
                  border-left: 2px solid var(--border-emphasis);
                  padding-left: 16px;
                  margin: 24px 0;
                  color: var(--text-muted);
                  font-style: italic;
                }
                .blog-article code {
                  font-family: var(--font-mono);
                  font-size: 13px;
                  background: var(--bg-deeper);
                  padding: 2px 6px;
                  border-radius: 4px;
                }
                .blog-article pre {
                  background: var(--bg-deeper);
                  border: 1px solid var(--border-subtle);
                  border-radius: 7px;
                  padding: 16px;
                  overflow-x: auto;
                  margin: 0 0 16px;
                }
                .blog-article pre code {
                  background: none;
                  padding: 0;
                }
                .blog-article img {
                  border-radius: 7px;
                  max-width: 100%;
                  height: auto;
                }
              `,
                }}
              />
              <div className="blog-article">
                <BlogContent content={post.content} />
              </div>
            </div>
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
