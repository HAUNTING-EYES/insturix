"use client";

import React, { memo, useMemo, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { cn } from "@/lib/utils";

interface LiveDocumentRendererProps {
  content: string;
  title?: string | null;
  isStreaming: boolean;
  className?: string;
}

/**
 * Live Document Renderer
 *
 * The ONLY view the user ever sees. Renders markdown content as rich,
 * formatted HTML — like Notion. The underlying Tiptap editor is purely
 * a data layer and is never shown to the user.
 *
 * - During streaming: renders with a pulsing cursor
 * - At rest: shows the rendered document
 * - No "click to edit" — user always sees formatted output
 */
const LiveDocumentRenderer = memo(function LiveDocumentRenderer({
  content,
  title,
  isStreaming,
  className,
}: LiveDocumentRendererProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trimmed = useMemo(() => content?.trim() || "", [content]);
  const startsWithH1 = useMemo(() => /^#\s/.test(trimmed), [trimmed]);

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      const el = scrollRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [isStreaming, trimmed]);

  if (!trimmed && !isStreaming) return null;

  return (
    <div className="absolute inset-0 z-10 overflow-hidden">
      <div
        ref={scrollRef}
        className={cn(
          "h-full overflow-y-auto bg-[#0B0B0A]/95",
          "scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent",
          className
        )}
      >
        <article className="p-8 max-w-none text-[#ECE9E1] leading-relaxed">
          {/* Title */}
          {title && !startsWithH1 && (
            <h1 className="text-[1.75rem] font-bold tracking-tight text-white mb-6 pb-3 border-b border-white/8">
              {title}
            </h1>
          )}

          {trimmed ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={MD_COMPONENTS}
            >
              {trimmed}
            </ReactMarkdown>
          ) : isStreaming ? (
            <div className="flex items-center gap-2 text-[#5F5E5A] text-sm py-4">
              <span className="inline-block h-4 w-[2px] bg-[#D4A652] animate-pulse" />
              Generating...
            </div>
          ) : null}

          {/* Streaming cursor */}
          {isStreaming && trimmed && (
            <span className="inline-block h-5 w-[2px] bg-[#D4A652] animate-pulse ml-0.5 -mb-1" />
          )}
        </article>
      </div>
    </div>
  );
});

export default LiveDocumentRenderer;

// ---------------------------------------------------------------------------
// Markdown component overrides (styled for dark theme)
// ---------------------------------------------------------------------------

const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: ({ children }) => (
    <h1 className="text-[1.75rem] font-bold tracking-tight text-white mt-10 mb-4 pb-2 border-b border-white/8">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[18px] font-semibold text-white mt-8 mb-3">{children}</h2>
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
    <p className="text-[14px] text-[#B5B2A8] leading-[1.75] mb-4">{children}</p>
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

  hr: () => <hr className="my-8 border-t border-white/8" />,

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

  code: ({ className: codeClassName, children, ...props }: any) => {
    const isBlock = String(codeClassName ?? "").startsWith("language-");
    if (!isBlock) {
      return (
        <code className="px-1.5 py-0.5 rounded-md bg-white/6 border border-white/8 text-[13px] font-mono text-[#D4A652]">
          {children}
        </code>
      );
    }
    return (
      <code
        className={cn("block text-[13px] font-mono", codeClassName)}
        {...props}
      >
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
    <div className="my-6 overflow-x-auto rounded-xl border border-[#1C1B19] bg-black/20">
      <table
        className="w-full text-[13px]"
        style={{ borderCollapse: "collapse" }}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[#0F0F0E]">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody>{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="border-b border-white/8 hover:bg-white/3 transition-colors">
      {children}
    </tr>
  ),
  th: ({ children, style }) => (
    <th
      className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#7A776E] border-b border-[#1C1B19]"
      style={style}
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td
      className="px-4 py-2.5 text-[#B5B2A8] align-top border-b border-[#1C1B19]"
      style={style}
    >
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
        <figcaption className="mt-2 text-[11px] text-[#5F5E5A] text-center">
          {alt}
        </figcaption>
      )}
    </figure>
  ),

  del: ({ children }) => (
    <del className="text-[#5F5E5A] line-through">{children}</del>
  ),

  input: ({ checked, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      readOnly
      className="mr-2 accent-gold rounded"
      {...props}
    />
  ),
};
