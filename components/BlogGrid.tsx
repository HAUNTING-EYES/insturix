"use client";

import Link from "next/link";
import Image from "next/image";
import { BlogPost, formatDate } from "@/lib/blog-utils";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar } from "lucide-react";
import { useState, useEffect } from "react";

interface BlogGridProps {
  posts: BlogPost[];
}

export default function BlogGrid({ posts }: BlogGridProps) {
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleImageError = (postId: string) => {
    setImageErrors((prev) => ({ ...prev, [postId]: true }));
  };

  return (
    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <article key={post.id} className="group cursor-pointer">
          <Link href={`/resources/blogs/${post.id}`} className="block">
            <div className="bg-[#111111] border border-white/5 rounded-none overflow-hidden transition-all duration-700 hover:border-white/20 hover:bg-[#151515] hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50">
              {/* Image Section */}
              <div className="relative h-64 w-full overflow-hidden">
                <Image
                  src={imageErrors[post.id] ? post.fallbackImage : post.image}
                  alt={post.title}
                  fill
                  className="object-cover transition-all duration-700 group-hover:scale-105 group-hover:grayscale-[0.3]"
                  onError={() => handleImageError(post.id)}
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-all duration-500" />

                {/* Read time badge */}
                <div className="absolute top-4 right-4">
                  <div className="bg-black/80 backdrop-blur-sm px-3 py-1 text-[11px] text-white font-light border border-white/10">
                    {post.readTime} min
                  </div>
                </div>
              </div>

              {/* Content Section */}
              <div className="p-8">
                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {post.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] text-gray-400 font-light tracking-wider uppercase border-b border-gray-600 pb-1"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Title */}
                <h2 className="font-serif text-2xl font-light text-white mb-4 leading-tight group-hover:text-gray-200 transition-colors duration-300 line-clamp-2">
                  {post.title}
                </h2>

                {/* Excerpt */}
                <p className="text-gray-400 text-sm font-light mb-6 line-clamp-3 leading-relaxed">
                  {post.excerpt}
                </p>

                {/* Author & Date */}
                <div className="flex items-center justify-between pt-6 border-t border-white/5">
                  <div className="flex items-center space-x-3">
                    <div className="relative w-10 h-10">
                      <Image
                        src={post.author.avatar}
                        alt={post.author.name}
                        fill
                        className="rounded-full object-cover grayscale-[0.7] group-hover:grayscale-[0.3]"
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-light text-white">
                        {post.author.name}
                      </span>
                      <div className="flex items-center text-[11px] text-gray-500 font-light">
                        <Calendar className="w-3 h-3 mr-1" />
                        {formatDate(post.publishedAt)}
                      </div>
                    </div>
                  </div>

                  {/* Read more indicator */}
                  <div className="text-gray-500 group-hover:text-gray-300 transition-colors duration-300">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M17 8l4 4m0 0l-4 4m4-4H3"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </article>
      ))}
    </div>
  );
}
