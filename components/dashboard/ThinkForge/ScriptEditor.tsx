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
import ScriptRenderer from "./ScriptRenderer";

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
  const [selectionPos, setSelectionPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [aiPromptDialog, setAiPromptDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  // Thinking/summary are now shown in Chat; avoid duplication here
  const [copied, setCopied] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // No HTML composition: rely on blocks first, then synthesize simple blocks from title/content

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
        // Prefer server-provided blocks
        if (script?.blocks && Array.isArray(script.blocks) && (script.blocks as any[]).length > 0) {
          editor.replaceBlocks(editor.document, script.blocks as any);
          return;
        }
        // Next, try parsing existing body HTML if available
        if (script?.body && script.body.trim().length > 0) {
          const blocks = await editor.tryParseHTMLToBlocks(script.body);
          editor.replaceBlocks(editor.document, blocks);
          return;
        }
        // Fallback: synthesize blocks from title + plain content
        const fallbackTitle = script?.title || 'Untitled Script';
        const text = (script?.content || '').toString();
        const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
        const newBlocks: any[] = [
          { type: 'heading', props: { level: 1 }, content: fallbackTitle },
          ...paras.map(p => ({ type: 'paragraph', content: p }))
        ];
        editor.replaceBlocks(editor.document, newBlocks as any);
      } catch (error) {
        console.error('Failed to load content into BlockNote.', error);
      }
    };
    load();
  }, [editor, script]);

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
        content: fullText,
        // Provide blocks so server can resolve selection → indices accurately
        blocks: editor.document as any
      } as any;
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
        ? `Apply this change ONLY to the selected part. Selection is below, then the change.\nSelection:\n${selectedText}\nChange:\n${aiPrompt}`
        : aiPrompt;

      // Use block-targeted edit endpoint; pass selection to resolve indices server-side
      const editRes = await fetch('/api/services/thinkforge/script/edit-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, script: scriptPayload, project: projectPayload, sessionId, selection: selectedText || undefined })
      });
      if (!editRes.ok) throw new Error(`edit ${editRes.status}`);
      const edited = await editRes.json();
      const newTitle: string = edited?.title || script?.title || 'Untitled Script';
      const newContent: string = (edited?.content || fullText || '').toString();
      const serverBlocks: any[] | undefined = edited?.blocks;
      if (Array.isArray(serverBlocks) && serverBlocks.length > 0) {
        // Trust server-provided blocks directly
        editor.replaceBlocks(editor.document, serverBlocks as any);
      } else {
        // Fallback to composing from content
        const paras = newContent.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
        const newBlocks: any[] = [
          { type: 'heading', props: { level: 1 }, content: newTitle },
          ...paras.map(p => ({ type: 'paragraph', content: p }))
        ];
        editor.replaceBlocks(editor.document, newBlocks as any);
      }

      const updatedScript = await convertBlocksToScript();
      onEditScript(updatedScript);
      // Append a concise summary to chat to reflect analyze → edit → patch
      try {
        if (sessionId) {
          const sumRes = await fetch('/api/services/thinkforge/think/summary', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instruction,
              scriptBefore: { title: scriptPayload.title, content: fullText },
              scriptAfter: { title: newTitle, content: newContent },
              project: projectPayload,
              sessionId
            })
          });
          if (sumRes.ok) {
            const summaryText = await sumRes.text();
            if (summaryText) {
              void fetch('/api/services/thinkforge/chat/append', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, role: 'assistant', content: 'Summary: ' + summaryText })
              });
            }
          }
        }
      } catch {}
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

      {/* Editor or Preview */}
      {!generatingScript || script ? (
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
          <CardContent className="p-0">
            <div ref={containerRef} className="relative min-h-[600px] max-h-[70vh] overflow-y-auto rounded-lg scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {isPreviewMode ? (
                <div className="p-6">
                  <ScriptRenderer title={script?.title} blocks={(script as any)?.blocks || []} />
                </div>
              ) : (
                <BlockNoteView 
                  editor={editor as any}
                  editable={true}
                  onChange={handleContentChange}
                  onSelectionChange={() => {
                  try {
                    const txt = (editor as any)?.getSelectedText?.() || '';
                    setSelectedText(txt);
                    if (txt && typeof window !== 'undefined') {
                      const sel = window.getSelection?.();
                      if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        const rect = range.getBoundingClientRect();
                        const container = containerRef.current;
                        if (container) {
                          const crect = container.getBoundingClientRect();
                          const scrollTop = container.scrollTop || 0;
                          const scrollLeft = container.scrollLeft || 0;
                          // Position button slightly above selection start
                          const top = (rect.top - crect.top) + scrollTop - 32;
                          const left = (rect.left - crect.left) + scrollLeft;
                          setSelectionPos({ top: Math.max(4, top), left: Math.max(4, left) });
                        } else {
                          setSelectionPos(null);
                        }
                      } else {
                        setSelectionPos(null);
                      }
                    } else {
                      setSelectionPos(null);
                    }
                  } catch {}
                }}
                  theme="dark"
                  className="blocknote-editor-dark"
                />
              )}
              {selectedText && selectedText.trim().length > 0 && selectionPos ? (
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); }}
                  onClick={() => {
                    try {
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('tf-selection-to-chat', { detail: { text: selectedText } } as any));
                      }
                    } catch {}
                  }}
                  className="absolute z-20 px-2 py-1 rounded-md text-[11px] font-medium bg-red-600 hover:bg-red-700 text-white shadow-lg border border-white/10"
                  style={{ top: selectionPos.top, left: selectionPos.left }}
                  aria-label="Improve selected text with ForgeAI"
                >
                  <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Edit in Chat</span>
                </button>
              ) : null}
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