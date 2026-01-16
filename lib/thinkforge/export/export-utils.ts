import type { TiptapJSON } from '@/lib/thinkforge/schemas/tiptap-schema';
import { extractPlainText } from '@/lib/thinkforge/schemas/tiptap-validation';

const DEFAULT_TITLE = 'Script';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTextNode(node: any): string {
  const text = escapeHtml(String(node?.text ?? ''));
  const marks: Array<{ type?: string; attrs?: Record<string, any> }> = Array.isArray(node?.marks) ? node.marks : [];

  return marks.reduce((acc, mark) => {
    const type = mark?.type;
    if (type === 'bold' || type === 'strong') return `<strong>${acc}</strong>`;
    if (type === 'italic' || type === 'em') return `<em>${acc}</em>`;
    if (type === 'underline') return `<u>${acc}</u>`;
    if (type === 'strike') return `<s>${acc}</s>`;
    if (type === 'code') return `<code>${acc}</code>`;
    if (type === 'link') {
      const href = escapeHtml(String(mark?.attrs?.href ?? '#'));
      return `<a href="${href}">${acc}</a>`;
    }
    return acc;
  }, text);
}

function renderChildren(nodes: any[] | undefined): string {
  if (!nodes || !Array.isArray(nodes)) return '';
  return nodes.map(renderNode).join('');
}

function renderCodeBlock(node: any): string {
  const text = collectText(node?.content);
  return `<pre><code>${escapeHtml(text)}</code></pre>`;
}

function collectText(nodes: any[] | undefined): string {
  if (!nodes || !Array.isArray(nodes)) return '';
  let text = '';
  for (const node of nodes) {
    if (node?.type === 'text') {
      text += String(node?.text ?? '');
    } else if (Array.isArray(node?.content)) {
      text += collectText(node.content);
    }
  }
  return text;
}

function renderThinkForgeBlock(node: any, className: string, label?: string): string {
  const header = label ? `<div class="tf-block-label">${escapeHtml(label)}</div>` : '';
  const content = renderChildren(node?.content);
  return `<section class="tf-block ${className}">${header}${content}</section>`;
}

function renderNode(node: any): string {
  if (!node || typeof node !== 'object') return '';
  const type = node.type;

  if (type === 'doc') return renderChildren(node.content);
  if (type === 'paragraph') return `<p>${renderChildren(node.content)}</p>`;
  if (type === 'heading') {
    const level = Math.min(Math.max(Number(node?.attrs?.level || 1), 1), 6);
    return `<h${level}>${renderChildren(node.content)}</h${level}>`;
  }
  if (type === 'text') return renderTextNode(node);
  if (type === 'hardBreak') return '<br />';
  if (type === 'bulletList') return `<ul>${renderChildren(node.content)}</ul>`;
  if (type === 'orderedList') return `<ol>${renderChildren(node.content)}</ol>`;
  if (type === 'listItem') return `<li>${renderChildren(node.content)}</li>`;
  if (type === 'blockquote') return `<blockquote>${renderChildren(node.content)}</blockquote>`;
  if (type === 'codeBlock') return renderCodeBlock(node);

  if (type === 'actionBlock') {
    const role = typeof node?.attrs?.role === 'string' ? node.attrs.role : '';
    const goal = typeof node?.attrs?.goal === 'string' ? node.attrs.goal : '';
    const label = [role, goal].filter(Boolean).join(' • ');
    return renderThinkForgeBlock(node, 'tf-action-block', label);
  }
  if (type === 'whyBlock') return renderThinkForgeBlock(node, 'tf-why-block', 'Why');
  if (type === 'exampleBlock') return renderThinkForgeBlock(node, 'tf-example-block', 'Example');

  if (Array.isArray(node.content)) return renderChildren(node.content);
  return '';
}

export function buildScriptHtmlDocument(doc: TiptapJSON, title?: string): string {
  const safeTitle = escapeHtml(title || DEFAULT_TITLE);
  const bodyHtml = renderNode(doc);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: light; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        line-height: 1.6;
        margin: 24px;
        color: #111827;
      }
      h1,h2,h3,h4,h5,h6 { margin: 1.25rem 0 0.5rem; }
      p { margin: 0.5rem 0; }
      ul, ol { padding-left: 1.5rem; margin: 0.5rem 0; }
      blockquote { border-left: 3px solid #e5e7eb; padding-left: 1rem; color: #4b5563; margin: 0.75rem 0; }
      pre { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 8px; overflow-x: auto; }
      code { background: #f3f4f6; padding: 0 4px; border-radius: 4px; }
      a { color: #2563eb; text-decoration: underline; }
      .tf-block { border-left: 3px solid #e5e7eb; padding: 0.75rem 1rem; margin: 0.75rem 0; border-radius: 0 8px 8px 0; }
      .tf-action-block { border-left-color: #3b82f6; background: #eff6ff; }
      .tf-why-block { border-left-color: #a855f7; background: #f5f3ff; font-style: italic; }
      .tf-example-block { border-left-color: #22c55e; background: #ecfdf3; }
      .tf-block-label { font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; }
    </style>
  </head>
  <body>
    <h1>${safeTitle}</h1>
    ${bodyHtml}
  </body>
</html>`;
}

export function buildScriptText(doc: TiptapJSON, title?: string): string {
  const safeTitle = title || DEFAULT_TITLE;
  const content = extractPlainText(doc);
  return `${safeTitle}\n\n${content}`.trim();
}

export function downloadBlob(filename: string, data: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function printHtmlDocument(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.setAttribute('aria-hidden', 'true');

      document.body.appendChild(iframe);
      const doc = iframe.contentWindow?.document;
      if (!doc) {
        iframe.remove();
        reject(new Error('Unable to create print frame'));
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      const printAndCleanup = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            iframe.remove();
            resolve();
          }, 300);
        } catch (error) {
          iframe.remove();
          reject(error);
        }
      };

      iframe.onload = () => {
        setTimeout(printAndCleanup, 50);
      };
    } catch (error) {
      reject(error);
    }
  });
}
