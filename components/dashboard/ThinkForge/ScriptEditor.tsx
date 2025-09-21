'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { 
  ArrowLeft, 
  Download,
  Copy,
  Check,
  Loader2,
  Sparkles,
  Save,
  Eye,
  Edit,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Script, Idea } from '@/app/dashboard/thinkforge/types';
import { pdfExportService } from '@/lib/services/pdfExportService';
import { getToneColorClass } from '@/lib/thinkforge/tone';

// Dynamic imports for BlockNote to prevent SSR issues
const BlockNoteView = dynamic(
  () => import("@blocknote/mantine").then((mod) => mod.BlockNoteView),
  { ssr: false }
);

// Import BlockNote styles and fonts
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

// Import BlockNote hooks and types
import { useCreateBlockNote } from "@blocknote/react";
import { Block, BlockNoteEditor } from "@blocknote/core";

interface ScriptEditorProps {
  script?: Script | null;
  selectedIdea: Idea;
  sessionId?: string;
  onBackToChat: () => void;
  onEditScript: (updatedScript: Script) => void;
  onExportScript: () => void;
  loading?: boolean;
  generatingScript?: boolean;
}

export default function ScriptEditor({
  script,
  selectedIdea,
  sessionId,
  onBackToChat,
  onEditScript,
  onExportScript,
  loading = false,
  generatingScript = false
}: ScriptEditorProps) {
  const [selectedText, setSelectedText] = useState<string>('');
  const [aiPromptDialog, setAiPromptDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  // Thinking/summary are now shown in Chat; avoid duplication here
  const [copied, setCopied] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Compose a rich HTML body from various content formats (markdown-ish, JSON-ish blocks, plain text)
  const smartComposeHtml = useCallback((title: string, content: string, existingHtml?: string): string => {
    const escapeHtml = (s: string) => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    if (existingHtml && existingHtml.trim().length > 0) return existingHtml;
    const head = `<h1>${escapeHtml(title || 'Untitled')}</h1>`;
    if (!content || content.trim().length === 0) return head;

    const tryJsonParse = (raw: string): any | null => {
      try { return JSON.parse(raw); } catch {}
      try {
        let s = raw.trim();
        s = s.replace(/'(\\.|[^'])*'/g, (m) => '"' + m.slice(1, -1).replace(/\\\\"/g, '"').replace(/\\\"/g, '"') + '"');
        s = s.replace(/([\{,\s])(\w+)\s*:/g, '$1"$2":');
        s = s.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(s);
      } catch {}
      return null;
    };

    const blocksToHtml = (blocks: any): string => {
      const out: string[] = [];
      const pushText = (txt?: string) => { if (txt && txt.trim()) out.push(`<p>${escapeHtml(txt.trim())}</p>`); };
      const renderBlock = (b: any) => {
        if (!b) return;
        const t = (b.type || b.kind || '').toLowerCase();
        const text = b.text ?? b.content ?? (typeof b.children === 'string' ? b.children : undefined);
        if (t === 'heading' || t === 'header' || /^h[1-6]$/.test(t)) {
          const lvl = Math.min(6, Math.max(1, Number(b.level) || (t.startsWith('h') ? Number(t.slice(1)) || 2 : 2)));
          const titleText = text || (Array.isArray(b.children) ? b.children.map((c: any)=> c.text || c.content || '').join(' ') : '');
          out.push(`<h${lvl}>${escapeHtml(String(titleText || '').trim() || title)}</h${lvl}>`);
          return;
        }
        if (t === 'list' || t === 'bullet_list' || t === 'ordered_list' || t === 'ul' || t === 'ol') {
          const ordered = t === 'ordered_list' || t === 'ol' || b.ordered === true;
          const items = (b.items || b.children || []) as any[];
          const lis = items.map((it) => `<li>${escapeHtml((it.text || it.content || (Array.isArray(it.children)? it.children.map((c:any)=> c.text || c.content || '').join(' ') : '') || '').toString())}</li>`).join('');
          out.push(ordered ? `<ol>${lis}</ol>` : `<ul>${lis}</ul>`);
          return;
        }
        if (t === 'code' || t === 'code_block' || t === 'pre') {
          const code = (text || (Array.isArray(b.children)? b.children.map((c:any)=> c.text || c.content || '').join('\n') : '') || '').toString();
          out.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
          return;
        }
        if (t === 'blockquote' || t === 'quote') {
          const q = (text || (Array.isArray(b.children)? b.children.map((c:any)=> c.text || c.content || '').join(' ') : '') || '').toString();
          out.push(`<blockquote>${escapeHtml(q)}</blockquote>`);
          return;
        }
        const para = (text || (Array.isArray(b.children)? b.children.map((c:any)=> c.text || c.content || '').join(' ') : '') || '').toString();
        pushText(para);
      };

      if (Array.isArray(blocks)) {
        blocks.forEach(renderBlock);
      } else if (blocks && typeof blocks === 'object') {
        if (Array.isArray(blocks.blocks)) blocks.blocks.forEach(renderBlock);
        else if (Array.isArray(blocks.children)) blocks.children.forEach(renderBlock);
        else renderBlock(blocks);
      } else {
        pushText(String(blocks || ''));
      }
      return out.join('\n');
    };

    const parsed = tryJsonParse(content);
    if (parsed) {
      return [head, blocksToHtml(parsed)].join('\n');
    }

    // Markdown-ish parsing with code fences, headings, and lists
    const segments: { type: 'code' | 'text'; lang?: string; body: string }[] = [];
    const fenceRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let lastIdx = 0; let m: RegExpExecArray | null;
    while ((m = fenceRegex.exec(content)) !== null) {
      if (m.index > lastIdx) segments.push({ type: 'text', body: content.slice(lastIdx, m.index) });
      segments.push({ type: 'code', lang: m[1], body: m[2] });
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < content.length) segments.push({ type: 'text', body: content.slice(lastIdx) });

    const htmlParts: string[] = [head];
    segments.forEach((seg) => {
      if (seg.type === 'code') {
        htmlParts.push(`<pre><code>${escapeHtml(seg.body)}</code></pre>`);
        return;
      }
      const lines = seg.body.split(/\r?\n/);
      let listBuf: string[] = []; let ordered = false;
      const flushList = () => {
        if (listBuf.length === 0) return;
        const items = listBuf.map(li => `<li>${escapeHtml(li)}</li>`).join('');
        htmlParts.push(ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`);
        listBuf = []; ordered = false;
      };
      for (const ln of lines) {
        const t = ln.trim();
        if (!t) { flushList(); continue; }
        if (/^\d+\.\s+/.test(t)) { ordered = true; listBuf.push(t.replace(/^\d+\.\s+/, '')); continue; }
        if (/^[-*•]\s+/.test(t)) { if (!ordered) ordered = false; listBuf.push(t.replace(/^[-*•]\s+/, '')); continue; }
        flushList();
        if (/^#{1,6}\s+/.test(t)) {
          const lvl = Math.min(6, Math.max(1, t.match(/^#+/g)?.[0].length || 1));
          const textOnly = t.replace(/^#{1,6}\s+/, '');
          htmlParts.push(`<h${lvl}>${escapeHtml(textOnly)}</h${lvl}>`);
        } else {
          htmlParts.push(`<p>${escapeHtml(t)}</p>`);
        }
      }
      flushList();
    });
    return htmlParts.join('\n');
  }, []);

  // Build safe default HTML for initial load and fallbacks (uses smart composer)
  const buildSafeHTML = useCallback((s?: Script | null) => {
    const title = s?.title || 'Your Script Title';
    const content = (s?.content || '').trim();
    return smartComposeHtml(title, content, s?.body);
  }, [smartComposeHtml]);

  // Create BlockNote editor with initial content
  const editor = useCreateBlockNote({
    // Do not pass initialContent to avoid BlockNote crashing on malformed blocks
    defaultStyles: true,
    trailingBlock: true,
    animations: true,
  });

  // Load content into editor after creation and whenever script changes
  useEffect(() => {
    const load = async () => {
      try {
        const html = script?.body || buildSafeHTML(script);
        const blocks = await editor.tryParseHTMLToBlocks(html);
        editor.replaceBlocks(editor.document, blocks);
      } catch (error) {
        console.error('Failed to load content into BlockNote, using content-based fallback.', error);
        // Content-based fallback to reflect latest script instead of a static placeholder
        try {
          const safeHTML = buildSafeHTML(script);
          const blocks = await editor.tryParseHTMLToBlocks(safeHTML);
          editor.replaceBlocks(editor.document, blocks);
        } catch {}
      }
    };
    // Defer load slightly to ensure editor is ready
    load();
  }, [editor, script, buildSafeHTML]);

  // Note: We intentionally avoid injecting script.blocks directly to prevent malformed data from crashing BlockNote

  // Handle content changes
  const handleContentChange = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  // Handle AI improvement: inspector -> (answer | editor)
  const handleAIImprovement = async () => {
    if (!aiPrompt.trim()) return;
    setIsProcessingAI(true);
    setAiPromptDialog(false);
  // Chat shows thinking and summary; no local duplication
    try {
      // Gather current full script text for context
      const fullText = await editor.blocksToMarkdownLossy(editor.document);
      const scriptPayload = {
        title: script?.title || 'Untitled Script',
        content: fullText
      };
      const projectPayload = {
        idea: selectedIdea?.idea,
        purpose: (selectedIdea as any)?.purpose,
        style: (selectedIdea as any)?.style,
        format: (selectedIdea as any)?.format,
        platform: (selectedIdea as any)?.platform,
        tone: selectedIdea?.tone
      };

      // Build prompt for inspector, include selection if present
      const prompt = selectedText
        ? `Edit the following selection within the script:\n---\n${selectedText}\n---\nInstruction: ${aiPrompt}`
        : aiPrompt;

      const inspectRes = await fetch('/api/services/thinkforge/script/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, script: scriptPayload, project: projectPayload, sessionId })
      });
      if (!inspectRes.ok) throw new Error(`inspect ${inspectRes.status}`);
      const inspect = await inspectRes.json();

      if (inspect?.action !== 'edit') {
        // Not an edit; provide quick answer via alert for now
        alert('This request was classified as an answer, not an edit. Please use chat mode for answers.');
        return;
      }

      // Kick off a quick 'think' to show reasoning while editing
      // Thinking streamed in Chat; skip here

      const instruction = selectedText
        ? `Apply this change to the selected part:\nSelection:\n${selectedText}\nChange:\n${aiPrompt}`
        : aiPrompt;

      const editRes = await fetch('/api/services/thinkforge/script/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, script: scriptPayload, project: projectPayload, sessionId })
      });
      if (!editRes.ok) throw new Error(`edit ${editRes.status}`);
      const edited = await editRes.json();

  const newTitle: string = edited?.title || script?.title || 'Untitled Script';
      const newContent: string = edited?.content || fullText;
  // Summary is shown in Chat; we still apply edits here
      // Build minimal blocks from returned text
      const paras = newContent.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
      const newBlocks: any[] = [
        { type: 'heading', props: { level: 1 }, content: newTitle },
        ...paras.map(p => ({ type: 'paragraph', content: p }))
      ];
      editor.replaceBlocks(editor.document, newBlocks as any);

      // Persist to parent via onEditScript
      const updatedScript = await convertBlocksToScript();
      onEditScript(updatedScript);
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('AI improvement failed:', err);
      alert('Failed to apply AI edit. Please try again.');
    } finally {
      setIsProcessingAI(false);
      setAiPrompt('');
  // no-op; thinking is in Chat
    }
  };

  // Convert BlockNote content back to Script format
  const convertBlocksToScript = useCallback(async (): Promise<Script> => {
    const blocks = editor.document;
    
    // Extract title from HTML content (simpler approach)
    const htmlContent = await editor.blocksToHTMLLossy(blocks);
    const titleMatch = htmlContent.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : script?.title || 'Untitled Script';
    
    // Extract text content by converting to markdown first (simpler)
    const textContent = await editor.blocksToMarkdownLossy(blocks);

    return {
      title,
      body: htmlContent,
      blocks: blocks, // Save native BlockNote document structure
      content: textContent.replace(/[#*_`]/g, ''), // Remove markdown formatting for plain text
      sections: script?.sections || [],
      tips: script?.tips || [],
      duration: script?.duration,
      targetAudience: script?.targetAudience,
      tone: script?.tone
    };
  }, [editor, script]);

  // Save changes
  const handleSave = async () => {
    try {
      const updatedScript = await convertBlocksToScript();
      onEditScript(updatedScript);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to save script:', error);
      alert('Failed to save script. Please try again.');
    }
  };

  // Copy content to clipboard
  const handleCopy = async () => {
    try {
      // Use BlockNote's built-in method to get markdown, then convert to plain text
      const markdownContent = await editor.blocksToMarkdownLossy(editor.document);
      const textContent = markdownContent.replace(/[#*_`]/g, '').replace(/\n\s*\n/g, '\n\n');
      
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Export to PDF
  const handleExportPDF = async () => {
    try {
      const htmlContent = await editor.blocksToHTMLLossy(editor.document);
      const title = script?.title || 'Script';
      
      // Create a simple PDF export using browser print
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>${title}</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; margin: 2cm; }
                h1 { color: #333; font-size: 24px; margin-bottom: 20px; }
                h2 { color: #555; font-size: 20px; margin: 20px 0 10px 0; }
                h3 { color: #666; font-size: 16px; margin: 15px 0 8px 0; }
                p { margin: 8px 0; }
                ul, ol { margin: 8px 0; padding-left: 20px; }
                li { margin: 4px 0; }
                blockquote { border-left: 3px solid #ddd; margin: 10px 0; padding-left: 15px; font-style: italic; }
              </style>
            </head>
            <body>
              ${htmlContent}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) {
      console.error('Failed to export PDF:', error);
      alert('Failed to export PDF. Please try again.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 relative max-w-5xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            onClick={onBackToChat}
            variant="outline"
            size="sm"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${getToneColorClass(selectedIdea.tone)}`} />
            <div>
              <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
                <FileText className="h-5 w-5 text-red-500" />
                {generatingScript && !script ? "Generating Script..." : "Script Editor"}
              </h2>
              <p className="text-sm text-zinc-400">
                {generatingScript && !script 
                  ? "ForgeAI is creating your script..."
                  : "Notion-style editor with AI assistance"
                }
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Preview/Edit Toggle */}
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-zinc-400" />
            <Switch
              checked={!isPreviewMode}
              onCheckedChange={(checked) => setIsPreviewMode(!checked)}
              disabled={generatingScript && !script}
            />
            <Edit className="h-4 w-4 text-zinc-400" />
          </div>

          {/* Action Buttons */}
          <Button
            onClick={handleCopy}
            variant="outline"
            size="sm"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            {copied ? (
              <Check className="h-4 w-4 mr-2 text-green-400" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            {copied ? 'Copied!' : 'Copy'}
          </Button>

          <Button
            onClick={handleExportPDF}
            variant="outline"
            size="sm"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export PDF
          </Button>

          {hasUnsavedChanges && (
            <Button
              onClick={handleSave}
              size="sm"
              className="bg-red-600 hover:bg-red-700"
            >
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {generatingScript && !script && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-red-500" />
            <div>
              <h3 className="text-lg font-medium text-zinc-100">Generating Your Script</h3>
              <p className="text-sm text-zinc-400">ForgeAI is crafting your content...</p>
            </div>
          </div>
        </div>
      )}

      {/* BlockNote Editor */}
      {!generatingScript || script ? (
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
          <CardContent className="p-0">
            <div className="min-h-[600px] max-h-[70vh] overflow-y-auto rounded-lg scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              <BlockNoteView 
                editor={editor as any}
                editable={!isPreviewMode}
                onChange={handleContentChange}
                theme="dark"
                className="blocknote-editor-dark"
              />
              {/* Thinking and summary are now displayed in Chat */}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* AI Enhancement Dialog */}
      <Dialog open={aiPromptDialog} onOpenChange={setAiPromptDialog}>
        <DialogContent className="bg-black/95 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-red-500" />
              Improve with ForgeAI
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-zinc-400 mb-2">Selected text:</p>
              <div className="bg-zinc-800/50 p-3 rounded-lg text-sm">
                "{selectedText}"
              </div>
            </div>
            <div>
              <p className="text-sm text-zinc-400 mb-2">How would you like to improve this text?</p>
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g., make it more engaging, add examples, simplify the language..."
                className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setAiPromptDialog(false)}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAIImprovement}
                disabled={!aiPrompt.trim() || isProcessingAI}
                className="bg-red-600 hover:bg-red-700"
              >
                {isProcessingAI ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Improve Text
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .blocknote-editor-dark {
          background: transparent !important;
          border-radius: 8px;
        }
        .blocknote-editor-dark .ProseMirror {
          background: transparent !important;
          color: #f4f4f5 !important;
          padding: 2rem !important;
          font-size: 16px !important;
          line-height: 1.6 !important;
          min-height: 600px !important;
        }
        .blocknote-editor-dark .bn-editor {
          background: transparent !important;
        }
        .blocknote-editor-dark .bn-block-content {
          color: #f4f4f5 !important;
        }
        .blocknote-editor-dark h1 {
          color: #f4f4f5 !important;
          font-size: 2rem !important;
          font-weight: 700 !important;
          margin-bottom: 1rem !important;
        }
        .blocknote-editor-dark h2 {
          color: #f4f4f5 !important;
          font-size: 1.5rem !important;
          font-weight: 600 !important;
          margin-top: 1.5rem !important;
          margin-bottom: 0.75rem !important;
        }
        .blocknote-editor-dark h3 {
          color: #f4f4f5 !important;
          font-size: 1.25rem !important;
          font-weight: 600 !important;
          margin-top: 1.25rem !important;
          margin-bottom: 0.5rem !important;
        }
        .blocknote-editor-dark p {
          color: #f4f4f5 !important;
          margin-bottom: 0.75rem !important;
        }
        .blocknote-editor-dark ul, 
        .blocknote-editor-dark ol {
          color: #f4f4f5 !important;
          margin-bottom: 0.75rem !important;
          padding-left: 1.5rem !important;
        }
        .blocknote-editor-dark li {
          color: #f4f4f5 !important;
          margin-bottom: 0.25rem !important;
        }
        /* BlockNote menu styling for dark theme */
        .blocknote-editor-dark .bn-menu {
          background: #18181b !important;
          border: 1px solid #3f3f46 !important;
          border-radius: 6px !important;
        }
        .blocknote-editor-dark .bn-menu-item {
          color: #f4f4f5 !important;
        }
        .blocknote-editor-dark .bn-menu-item:hover {
          background: #27272a !important;
        }
        .blocknote-editor-dark .bn-side-menu {
          background: #18181b !important;
        }
        /* Slash menu styling */
        .blocknote-editor-dark .bn-suggestion-menu {
          background: #18181b !important;
          border: 1px solid #3f3f46 !important;
          border-radius: 6px !important;
        }
        .blocknote-editor-dark .bn-suggestion-menu-item {
          color: #f4f4f5 !important;
        }
        .blocknote-editor-dark .bn-suggestion-menu-item:hover,
        .blocknote-editor-dark .bn-suggestion-menu-item.selected {
          background: #27272a !important;
        }
      `}</style>
    </motion.div>
  );
} 