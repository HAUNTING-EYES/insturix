'use client';

import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useCreateBlockNote } from '@blocknote/react';
import type { Block } from '@blocknote/core';
import type { Script } from '@/app/dashboard/thinkforge/types';

// Client-only BlockNote renderer
const BlockNoteView = dynamic(
  () => import('@blocknote/mantine').then((m) => m.BlockNoteView),
  { ssr: false }
);

// Styles
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

export interface ScriptViewerProps {
  script?: Partial<Script> | null;
  className?: string;
  theme?: 'light' | 'dark';
}

function clampString(s: any, max = 5000): string {
  const str = typeof s === 'string' ? s : String(s ?? '');
  return str.length > max ? str.slice(0, max) + '\u2026' : str;
}

function sanitizeBlocks(input: any, maxBlocks = 500): Block[] {
  if (!Array.isArray(input)) return [] as any;
  const out: any[] = [];
  for (let i = 0; i < input.length && out.length < maxBlocks; i++) {
    const b = input[i] || {};
    const type = String(b.type || b.kind || 'paragraph');
    const props = typeof b.props === 'object' && b.props ? b.props : {};
    const content = b.content ?? b.children ?? b.text ?? '';
    const safe: any = { type, props: {}, content: undefined as any };
    // shallow props copy with clamps
    for (const k of Object.keys(props)) {
      const v = (props as any)[k];
      if (typeof v === 'string') safe.props[k] = clampString(v, 1000);
      else if (typeof v === 'number' || typeof v === 'boolean') safe.props[k] = v;
    }
    // content: support strings/arrays/objects minimally, clamp strings
    if (typeof content === 'string') safe.content = clampString(content, 10000);
    else if (Array.isArray(content)) safe.content = content.slice(0, 200).map((c) => (typeof c === 'string' ? clampString(c, 2000) : c));
    else if (content && typeof content === 'object') safe.content = content;
    else safe.content = '';
    out.push(safe);
  }
  return out as unknown as Block[];
}

// Attempt to recover from incomplete JSON arrays/objects by adding missing brackets/braces.
function healJSON(value: any): any {
  if (typeof value === 'string') {
    const s = value.trim();
    // If it looks like JSON but might be cut off, try simple healing
    const startsObj = s.startsWith('{');
    const startsArr = s.startsWith('[');
    const endsObj = s.endsWith('}');
    const endsArr = s.endsWith(']');
    let candidate = s;
    if ((startsObj && !endsObj) || (startsArr && !endsArr)) {
      try { return JSON.parse(candidate); } catch {}
      // naive healing: close quotes/brackets and strip dangling commas
      candidate = candidate.replace(/,\s*$/g, '');
      if (startsObj && !endsObj) candidate += '}';
      if (startsArr && !endsArr) candidate += ']';
      try { return JSON.parse(candidate); } catch {}
    }
    // Not JSON or still invalid; return original
    return value;
  }
  return value;
}

export default function ScriptViewer({ script, className = '', theme = 'dark' }: ScriptViewerProps) {
  const editor = useCreateBlockNote({ defaultStyles: true, trailingBlock: false, animations: false });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // 1) Prefer sanitized blocks
        const rawBlocks = healJSON((script as any)?.blocks);
        if (Array.isArray(rawBlocks) && rawBlocks.length > 0) {
          const safe = sanitizeBlocks(rawBlocks);
          if (!cancelled) editor.replaceBlocks(editor.document, safe as any);
          return;
        }
        // 2) HTML body → parse into blocks
        const html = healJSON((script as any)?.body);
        if (typeof html === 'string' && html.trim()) {
          try {
            const blocks = await editor.tryParseHTMLToBlocks(html);
            if (!cancelled) editor.replaceBlocks(editor.document, blocks);
            return;
          } catch {}
        }
        // 3) Plain content → synthesize paragraphs
        const title = clampString(healJSON((script as any)?.title) || 'Untitled Script', 300);
        const text = clampString(healJSON((script as any)?.content) || '', 10000);
        const paras = String(text)
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean)
          .slice(0, 500);
        const blocks: any[] = [
          { type: 'heading', props: { level: 1 }, content: clampString(title, 300) },
          ...paras.map((p) => ({ type: 'paragraph', content: clampString(p, 5000) }))
        ];
        if (!cancelled) editor.replaceBlocks(editor.document, blocks as any);
      } catch (e) {
        // Fallback to a simple placeholder
        if (!cancelled) {
          editor.replaceBlocks(editor.document, [
            { type: 'heading', props: { level: 2 }, content: 'Script Preview Unavailable' } as any,
            { type: 'paragraph', content: 'We could not render this script. Please try again or contact support.' } as any,
          ] as any);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [editor, script]);

  return (
    <div className={className}>
      <BlockNoteView editor={editor as any} editable={false} theme={theme} className="blocknote-view-readonly" />
      <style jsx global>{`
        .blocknote-view-readonly {
          background: transparent !important;
        }
        .blocknote-view-readonly .ProseMirror {
          background: transparent !important;
          color: inherit !important;
          padding: 0 !important;
          min-height: 0 !important;
        }
      `}</style>
    </div>
  );
}
