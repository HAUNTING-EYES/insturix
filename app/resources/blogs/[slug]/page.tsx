import { getBlogPost, getAllBlogPosts } from "@/lib/blog-server";
import { formatDate } from "@/lib/blog-utils";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BlogContent from "@/components/BlogContent";
import { Badge } from "@/components/ui/badge";
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
      title: "Post Not Found",
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

  if (!post) {
    notFound();
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#0a0a0a] relative overflow-hidden">
        {/* Premium background texture */}
        <div className="absolute inset-0 opacity-[0.02]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)`,
              backgroundSize: "24px 24px",
            }}
          ></div>
        </div>

        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#111111] to-[#0a0a0a] opacity-90"></div>

        <div className="relative z-10 container mx-auto px-4 py-12 mt-16">
          {/* Back Button */}
          <Link
            href="/resources/blogs"
            className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-12 group font-light"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Insights
          </Link>

          <article className="max-w-4xl mx-auto">
            {/* Header */}
            <header className="mb-16">
              <div className="flex flex-wrap gap-3 mb-8">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs text-gray-400 font-light tracking-wider uppercase border-b border-gray-600 pb-1"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <h1 className="font-serif text-5xl md:text-6xl font-light text-white mb-8 leading-tight tracking-tight">
                {post.title}
              </h1>

              <div className="w-24 h-[1px] bg-gradient-to-r from-transparent via-white to-transparent mb-8 opacity-30"></div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-12">
                <div className="flex items-center space-x-4">
                  <div className="relative w-14 h-14">
                    <Image
                      src={post.author.avatar}
                      alt={post.author.name}
                      fill
                      className="rounded-full object-cover grayscale-[0.5]"
                    />
                  </div>
                  <div>
                    <p className="font-serif text-lg font-light text-white">
                      {post.author.name}
                    </p>
                    <div className="flex items-center text-sm text-gray-400 space-x-6 font-light">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-2" />
                        {formatDate(post.publishedAt)}
                      </div>
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 mr-2" />
                        {post.readTime} min read
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            {/* Featured Image */}
            <div className="relative h-80 md:h-[500px] w-full mb-16 overflow-hidden">
              <Image
                src={post.image}
                alt={post.title}
                fill
                className="object-cover"
                priority
                quality={100}
              />
              <div className="absolute inset-0 bg-black/20"></div>
            </div>

            {/* Content */}
            <div className="prose prose-lg prose-invert max-w-none">
              <BlogContent content={post.content} />
            </div>
          </article>
        </div>
      </div>
      <Footer />
    </>
  );
}
