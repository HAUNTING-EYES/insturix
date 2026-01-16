"use client";
import React, { memo } from "react";
import clsx from "clsx";
import type { TiptapJSON, TiptapBlockContent, TiptapTextNode, TiptapMark } from "@/lib/thinkforge/schemas/tiptap-schema";

// =============================================================================
// TIPTAP JSON RENDERING
// =============================================================================

/**
 * Render Tiptap marks as React elements
 */
function renderMarks(text: string, marks?: TiptapMark[]): React.ReactNode {
  if (!marks || marks.length === 0) {
    return text;
  }

  let element: React.ReactNode = text;

  // Apply marks in reverse order (innermost first)
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        element = <strong className="font-semibold">{element}</strong>;
        break;
      case 'italic':
        element = <em className="italic">{element}</em>;
        break;
      case 'underline':
        element = <u className="underline">{element}</u>;
        break;
      case 'strike':
        element = <s className="line-through">{element}</s>;
        break;
      case 'code':
        element = (
          <code className="px-1 py-0.5 rounded bg-black/40 border border-white/10 text-[11px] font-mono text-white/90">
            {element}
          </code>
        );
        break;
      case 'highlight':
        element = <mark className="bg-yellow-500/40 px-0.5 rounded">{element}</mark>;
        break;
      case 'link':
        const href = 'attrs' in mark ? mark.attrs?.href : '#';
        element = (
          <a href={href} className="text-red-400 hover:text-red-300 underline" target="_blank" rel="noopener noreferrer">
            {element}
          </a>
        );
        break;
    }
  }

  return element;
}

/**
 * Render Tiptap text nodes
 */
function renderTextNodes(content: TiptapTextNode[] | undefined, keyPrefix: string = ''): React.ReactNode[] {
  if (!content || content.length === 0) return [];

  return content.map((node, idx) => {
    if (node.type === 'text') {
      return (
        <React.Fragment key={`${keyPrefix}-text-${idx}`}>
          {renderMarks(node.text, node.marks)}
        </React.Fragment>
      );
    }
    return null;
  }).filter(Boolean);
}

/**
 * Render a Tiptap block node
 */
function RenderTiptapBlock({ node, keyPrefix = '' }: { node: TiptapBlockContent; keyPrefix?: string }): React.ReactNode {
  const type = node.type;

  switch (type) {
    case 'paragraph': {
      const content = 'content' in node ? node.content : undefined;
      return (
        <p className="mb-2 text-white/90">
          {renderTextNodes(content as TiptapTextNode[], keyPrefix)}
        </p>
      );
    }

    case 'heading': {
      const level = 'attrs' in node && node.attrs ? node.attrs.level : 2;
      const content = 'content' in node ? node.content : undefined;
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
      return (
        <Tag className={clsx("font-semibold mt-4 mb-2", {
          "text-2xl": level === 1,
          "text-xl": level === 2,
          "text-lg": level === 3,
        })}>
          {renderTextNodes(content as TiptapTextNode[], keyPrefix)}
        </Tag>
      );
    }

    case 'bulletList': {
      const items = 'content' in node && Array.isArray(node.content) ? node.content : [];
      return (
        <ul className="my-2 space-y-1 list-disc ml-6">
          {items.map((item, idx) => (
            <RenderTiptapBlock key={`${keyPrefix}-li-${idx}`} node={item as TiptapBlockContent} keyPrefix={`${keyPrefix}-li-${idx}`} />
          ))}
        </ul>
      );
    }

    case 'orderedList': {
      const items = 'content' in node && Array.isArray(node.content) ? node.content : [];
      return (
        <ol className="my-2 space-y-1 list-decimal ml-6">
          {items.map((item, idx) => (
            <RenderTiptapBlock key={`${keyPrefix}-li-${idx}`} node={item as TiptapBlockContent} keyPrefix={`${keyPrefix}-li-${idx}`} />
          ))}
        </ol>
      );
    }

    case 'listItem': {
      const content = 'content' in node && Array.isArray(node.content) ? node.content : [];
      return (
        <li className="text-white/90">
          {content.map((child, idx) => (
            <RenderTiptapBlock key={`${keyPrefix}-lic-${idx}`} node={child as TiptapBlockContent} keyPrefix={`${keyPrefix}-lic-${idx}`} />
          ))}
        </li>
      );
    }

    case 'blockquote': {
      const content = 'content' in node && Array.isArray(node.content) ? node.content : [];
      return (
        <blockquote className="border-l-2 border-white/20 pl-3 italic text-white/80 my-2">
          {content.map((child, idx) => (
            <RenderTiptapBlock key={`${keyPrefix}-bq-${idx}`} node={child as TiptapBlockContent} keyPrefix={`${keyPrefix}-bq-${idx}`} />
          ))}
        </blockquote>
      );
    }

    case 'codeBlock': {
      const content = 'content' in node ? node.content : undefined;
      const text = (content as TiptapTextNode[] | undefined)?.map(n => n.text).join('') || '';
      return (
        <pre className="mt-2 mb-3 rounded-lg bg-black/50 border border-white/10 p-3 overflow-x-auto text-[12px] leading-snug">
          <code>{text}</code>
        </pre>
      );
    }

    case 'horizontalRule': {
      return <hr className="border-t border-white/20 my-4" />;
    }

    case 'hardBreak': {
      return <br />;
    }

    // Custom ThinkForge blocks
    case 'actionBlock': {
      const content = 'content' in node && Array.isArray(node.content) ? node.content : [];
      return (
        <div className="bg-blue-500/10 border-l-3 border-blue-500 pl-4 py-2 my-2 rounded-r">
          {content.map((child, idx) => (
            <RenderTiptapBlock key={`${keyPrefix}-ab-${idx}`} node={child as TiptapBlockContent} keyPrefix={`${keyPrefix}-ab-${idx}`} />
          ))}
        </div>
      );
    }

    case 'whyBlock': {
      const content = 'content' in node && Array.isArray(node.content) ? node.content : [];
      return (
        <div className="bg-purple-500/10 border-l-3 border-purple-500 pl-4 py-2 my-2 rounded-r italic">
          {content.map((child, idx) => (
            <RenderTiptapBlock key={`${keyPrefix}-wb-${idx}`} node={child as TiptapBlockContent} keyPrefix={`${keyPrefix}-wb-${idx}`} />
          ))}
        </div>
      );
    }

    case 'exampleBlock': {
      const content = 'content' in node && Array.isArray(node.content) ? node.content : [];
      return (
        <div className="bg-green-500/10 border-l-3 border-green-500 pl-4 py-2 my-2 rounded-r">
          {content.map((child, idx) => (
            <RenderTiptapBlock key={`${keyPrefix}-eb-${idx}`} node={child as TiptapBlockContent} keyPrefix={`${keyPrefix}-eb-${idx}`} />
          ))}
        </div>
      );
    }

    default:
      return null;
  }
}

/**
 * Render Tiptap JSON document
 */
function RenderTiptapDocument({ doc }: { doc: TiptapJSON }): React.ReactNode {
  if (!doc || doc.type !== 'doc' || !doc.content) {
    return null;
  }

  return (
    <>
      {doc.content.map((node, idx) => (
        <RenderTiptapBlock key={`block-${idx}`} node={node} keyPrefix={`block-${idx}`} />
      ))}
    </>
  );
}

// =============================================================================
// LEGACY BLOCKNOTE/THINKFORGE RENDERING (for backward compatibility)
// =============================================================================

type LegacyBlock = any;

function extractText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object") {
    if (node.type === "link") return extractText(node.content);
    if (typeof node.text === "string") return node.text;
    const content = node.content ?? node.children;
    return extractText(content);
  }
  return String(node);
}

function renderInlineLegacy(text: string): React.ReactNode {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  const codeSplit = text.split(/`([^`]+)`/g);
  for (let i = 0; i < codeSplit.length; i++) {
    if (i % 2 === 1) {
      parts.push(
        <code key={"c" + i} className="px-1 py-0.5 rounded bg-black/40 border border-white/10 text-[11px] font-mono text-white/90">
          {codeSplit[i]}
        </code>
      );
    } else {
      const boldRe = /\*\*(.+?)\*\*/g;
      const italicRe = /(^|[^*])\*(?!\*)([^*]+)\*(?!\*)/g;
      let seg = codeSplit[i];
      let lastIndex = 0; let m: RegExpExecArray | null;
      const boldParts: React.ReactNode[] = [];
      while ((m = boldRe.exec(seg)) !== null) {
        boldParts.push(seg.slice(lastIndex, m.index));
        boldParts.push(<strong key={"b" + i + m.index} className="font-semibold">{m[1]}</strong>);
        lastIndex = m.index + m[0].length;
      }
      boldParts.push(seg.slice(lastIndex));
      const italicParts: React.ReactNode[] = [];
      boldParts.forEach((bp, j) => {
        if (typeof bp !== "string") { italicParts.push(bp); return; }
        let str = bp; let im: RegExpExecArray | null; let last = 0; const temp: React.ReactNode[] = [];
        while ((im = italicRe.exec(str)) !== null) {
          temp.push(str.slice(last, im.index + 1));
          temp.push(<em key={"i" + i + j + im.index} className="italic">{im[2]}</em>);
          last = im.index + im[0].length;
        }
        temp.push(str.slice(last));
        italicParts.push(...temp);
      });
      parts.push(<React.Fragment key={"t" + i}>{italicParts}</React.Fragment>);
    }
  }
  return <>{parts}</>;
}

function RenderLegacyBlock({ block }: { block: LegacyBlock }) {
  const type = String(block?.type || block?.kind || "paragraph").toLowerCase();
  const content = block?.content ?? block?.children ?? block?.text ?? "";
  const text = extractText(content);

  if (type === "heading" || /^h[1-6]$/.test(type)) {
    const lvl = Math.min(6, Math.max(1, Number(block?.props?.level) || Number(block?.attrs?.level) || Number((type.startsWith("h") ? type.slice(1) : 2)) || 2));
    const H: any = ("h" + String(lvl)) as any;
    return <H className={clsx("font-semibold mt-4 mb-2", {
      "text-2xl": lvl === 1,
      "text-xl": lvl === 2,
      "text-lg": lvl === 3,
      "text-base": lvl >= 4,
    })}>{renderInlineLegacy(text)}</H>;
  }
  if (type === "numberedlistitem") {
    return <li className="list-decimal ml-6"><span>{renderInlineLegacy(text)}</span></li>;
  }
  if (type === "bulletlistitem") {
    return <li className="list-disc ml-6"><span>{renderInlineLegacy(text)}</span></li>;
  }
  if (type === "code" || type === "codeblock" || type === "pre") {
    return (
      <pre className="mt-2 mb-3 rounded-lg bg-black/50 border border-white/10 p-3 overflow-x-auto text-[12px] leading-snug">
        <code>{text}</code>
      </pre>
    );
  }
  if (type === "quote" || type === "blockquote") {
    return (
      <blockquote className="border-l-2 border-white/20 pl-3 italic text-white/80 my-2">
        {renderInlineLegacy(text)}
      </blockquote>
    );
  }
  if (type === "action" || type === "actionblock") {
    return (
      <div className="bg-blue-500/10 border-l-3 border-blue-500 pl-4 py-2 my-2 rounded-r">
        <p className="text-white/90">{renderInlineLegacy(text)}</p>
      </div>
    );
  }
  if (type === "why" || type === "whyblock") {
    return (
      <div className="bg-purple-500/10 border-l-3 border-purple-500 pl-4 py-2 my-2 rounded-r italic">
        <p className="text-white/80">{renderInlineLegacy(text)}</p>
      </div>
    );
  }
  if (type === "example" || type === "exampleblock") {
    return (
      <div className="bg-green-500/10 border-l-3 border-green-500 pl-4 py-2 my-2 rounded-r">
        <p className="text-white/90">{renderInlineLegacy(text)}</p>
      </div>
    );
  }
  // default paragraph
  return <p className="mb-2 text-white/90">{renderInlineLegacy(text)}</p>;
}

function RenderLegacyBlocks({ blocks }: { blocks: LegacyBlock[] }) {
  const rendered: React.ReactNode[] = [];
  let listBuf: LegacyBlock[] = [];
  let ordered = false;
  
  const flushList = () => {
    if (listBuf.length === 0) return;
    const items = listBuf.map((b, idx) => <RenderLegacyBlock key={"li-" + idx + Math.random()} block={b} />);
    rendered.push(ordered ? <ol key={"ol-" + rendered.length} className="my-2 space-y-1">{items}</ol>
                          : <ul key={"ul-" + rendered.length} className="my-2 space-y-1">{items}</ul>);
    listBuf = []; ordered = false;
  };
  
  for (const b of blocks) {
    const t = String(b?.type || b?.kind || "paragraph").toLowerCase();
    if (t === "numberedlistitem") {
      if (listBuf.length === 0) ordered = true;
      listBuf.push(b); continue;
    }
    if (t === "bulletlistitem") {
      if (listBuf.length === 0) ordered = false;
      listBuf.push(b); continue;
    }
    flushList();
    rendered.push(<RenderLegacyBlock key={"b-" + rendered.length} block={b} />);
  }
  flushList();
  
  return <>{rendered}</>;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * Check if content is Tiptap JSON format
 */
function isTiptapJSON(content: any): content is TiptapJSON {
  return content && typeof content === 'object' && content.type === 'doc' && Array.isArray(content.content);
}

interface ScriptRendererProps {
  title?: string | null;
  blocks?: TiptapJSON | LegacyBlock[] | null;
  className?: string;
}

const ScriptRenderer = memo(function ScriptRenderer({
  title,
  blocks,
  className,
}: ScriptRendererProps) {
  return (
    <div className={clsx("ScriptRenderer", className)}>
      {title ? <h1 className="text-2xl font-bold mb-3">{title}</h1> : null}
      <div>
        {isTiptapJSON(blocks) ? (
          <RenderTiptapDocument doc={blocks} />
        ) : Array.isArray(blocks) ? (
          <RenderLegacyBlocks blocks={blocks} />
        ) : (
          <p className="text-zinc-500 italic">No content available</p>
        )}
      </div>
    </div>
  );
});

export default ScriptRenderer;
