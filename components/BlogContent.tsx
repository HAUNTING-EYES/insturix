"use client";

import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface BlogContentProps {
  content: string;
}

export default function BlogContent({ content }: BlogContentProps) {
  return (
    <div className="blog-content">
      <ReactMarkdown
        components={{
          code({ node, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline =
              !node || node.position?.start.line === node.position?.end.line;

            return !isInline && match ? (
              <SyntaxHighlighter
                style={oneDark as any}
                language={match[1]}
                PreTag="div"
                className="rounded-lg !mt-6 !mb-6"
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            ) : (
              <code
                className="bg-white/10 px-2 py-1 rounded text-sm font-mono text-gray-200 border border-white/20"
                {...props}
              >
                {children}
              </code>
            );
          },
          h1: ({ children }) => (
            <h1 className="font-serif text-[44px] font-light mt-16 mb-8 text-white border-b border-white/10 pb-6 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="font-serif text-[32px] font-light mt-12 mb-6 text-white">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-serif text-2xl font-light mt-10 mb-5 text-gray-200">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-gray-300 leading-relaxed mb-8 text-lg font-light">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="space-y-3 mb-8 text-gray-300 ml-6">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="space-y-3 mb-8 text-gray-300 ml-6 list-decimal">
              {children}
            </ol>
          ),
          li: ({ children, ...props }: any) => {
            // Simple approach: check if we're in an ordered list context
            return (
              <li className="text-lg leading-relaxed font-light relative before:content-['—'] before:absolute before:-left-6 before:text-gray-500">
                {children}
              </li>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l border-white/20 pl-8 py-6 my-12 bg-white/[0.02] italic text-gray-200 font-light text-[18px] leading-relaxed">
              {children}
            </blockquote>
          ),
          strong: ({ children }) => (
            <strong className="font-medium text-white">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-gray-200 font-light">{children}</em>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-12">
              <table className="min-w-full border border-white/10 overflow-hidden">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-white/[0.02]">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-6 py-4 text-left text-sm font-light text-gray-300 tracking-wider border-b border-white/10">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-6 py-4 text-sm text-gray-300 font-light border-b border-white/5">
              {children}
            </td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-gray-200 hover:text-white border-b border-gray-500 hover:border-white transition-colors font-light"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>

      <style jsx global>{`
        .blog-content {
          line-height: 1.9;
          font-family: "Georgia", "Times New Roman", serif;
        }

        .blog-content h1:first-child {
          margin-top: 0;
        }

        .blog-content img {
          margin: 3rem 0;
          opacity: 0.9;
          transition: all 0.3s ease;
        }

        .blog-content img:hover {
          opacity: 1;
          filter: grayscale(0.2);
        }

        .blog-content pre {
          overflow-x: auto;
          background: rgba(0, 0, 0, 0.3) !important;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .blog-content code {
          font-family:
            "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", monospace;
        }

        .blog-content ol {
          list-style: decimal;
        }

        .blog-content ol li::before {
          display: none !important;
        }

        .blog-content ol li {
          list-style: decimal;
        }

        .blog-content ul li::marker {
          content: none;
        }
      `}</style>
    </div>
  );
}
