"use client";

import React, { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface DocumentPreviewProps {
  title?: string | null;
  content: string;
  className?: string;
}

const DocumentPreview = memo(function DocumentPreview({
  title,
  content,
  className,
}: DocumentPreviewProps) {
  const trimmed = useMemo(() => content?.trim() || "", [content]);
  const startsWithH1 = useMemo(() => /^#\s/.test(trimmed), [trimmed]);

  if (!trimmed) {
    return (
      <div className={cn("text-[#5F5E5A] italic text-sm py-8 text-center", className)}>
        No content to preview
      </div>
    );
  }

  return (
    <article
      className={cn(
        "doc-preview prose prose-invert max-w-none",
        "text-[#ECE9E1] leading-relaxed",
        className
      )}
    >
      {title && !startsWithH1 && (
        <h1 className="text-[1.75rem] font-bold tracking-tight text-white mb-6 pb-3 border-b border-white/8">
          {title}
        </h1>
      )}

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-[1.75rem] font-bold tracking-tight text-white mt-10 mb-4 pb-2 border-b border-white/8">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[18px] font-semibold text-white mt-8 mb-3">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold text-[#ECE9E1] mt-6 mb-2">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[14px] font-semibold text-[#ECE9E1] mt-5 mb-2">
              {children}
            </h4>
          ),

          p: ({ children }) => (
            <p className="text-[14px] text-[#B5B2A8] leading-[1.75] mb-4">
              {children}
            </p>
          ),

          strong: ({ children }) => (
            <strong className="font-semibold text-[#ECE9E1]">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[#B5B2A8]">{children}</em>
          ),

          ul: ({ children }) => (
            <ul className="my-3 space-y-1.5 pl-5 list-disc marker:text-[#D4A652]/50">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 space-y-1.5 pl-6 list-decimal marker:text-[#5F5E5A]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-[14px] text-[#B5B2A8] leading-[1.65] pl-1">
              {children}
            </li>
          ),

          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-[3px] border-[#D4A652]/40 pl-4 py-1 bg-[#D4A652]/3 rounded-r-lg">
              <div className="text-[#7A776E] italic text-[14px]">{children}</div>
            </blockquote>
          ),

          hr: () => (
            <hr className="my-8 border-t border-white/8" />
          ),

          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#D4A652] hover:text-[#D4A652] underline underline-offset-2 decoration-gold/30 transition-colors"
            >
              {children}
            </a>
          ),

          code: ({ className: codeClassName, children, ...props }) => {
            const isInline = !codeClassName;
            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 rounded-md bg-white/6 border border-white/8 text-[13px] font-mono text-[#D4A652]">
                  {children}
                </code>
              );
            }
            return (
              <code className={cn("block text-[13px] font-mono", codeClassName)} {...props}>
                {children}
              </code>
            );
          },

          pre: ({ children }) => (
            <pre className="my-4 rounded-xl bg-black/60 border border-white/8 p-4 overflow-x-auto text-[13px] leading-relaxed">
              {children}
            </pre>
          ),

          table: ({ children }) => (
            <div className="my-6 overflow-x-auto rounded-xl border border-white/8 bg-black/20">
              <table className="w-full text-[13px] border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-white/4 border-b border-white/8">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-white/5">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-white/2 transition-colors">{children}</tr>
          ),
          th: ({ children, style }) => (
            <th
              className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#7A776E]"
              style={style}
            >
              {children}
            </th>
          ),
          td: ({ children, style }) => (
            <td className="px-4 py-2.5 text-[#B5B2A8] align-top" style={style}>
              {children}
            </td>
          ),

          img: ({ src, alt }) => (
            <figure className="my-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt || ""}
                className="rounded-xl border border-white/8 max-w-full"
                loading="lazy"
              />
              {alt && (
                <figcaption className="mt-2 text-[11px] text-[#5F5E5A] text-center">{alt}</figcaption>
              )}
            </figure>
          ),

          del: ({ children }) => (
            <del className="text-[#5F5E5A] line-through">{children}</del>
          ),

          input: ({ checked, ...props }) => (
            <input
              type="checkbox"
              checked={checked}
              readOnly
              className="mr-2 accent-gold rounded"
              {...props}
            />
          ),
        }}
      >
        {trimmed}
      </ReactMarkdown>
    </article>
  );
});

export default DocumentPreview;
