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
  Eye,
  Edit,
  FileText,
  ChevronDown,
  ChevronUp,
  Brain,
  Zap
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
import { looksLikeJSON } from "@/lib/thinkforge/json";

interface ScriptEditorProps {
  script?: Script | null;
  selectedIdea: Idea;
  sessionId?: string;
  onBackToChat: () => void;
  onEditScript: (updatedScript: Script) => void;
  onExportScript: () => void;
  loading?: boolean;
  generatingScript?: boolean;
  // Show autosaving state from the ThinkForge client hook
  isSaving?: boolean;
  onImportScript?: (data: any) => Promise<{ ok: boolean; applied?: any; error?: string } | { ok: boolean; applied?: any; error?: string }> | { ok: boolean; applied?: any; error?: string };
}

export default function ScriptEditor({
  script,
  selectedIdea,
  sessionId,
  onBackToChat,
  onEditScript,
  onExportScript,
  loading = false,
  generatingScript = false,
  isSaving = false,
  onImportScript
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
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const prevIsSavingRef = useRef<boolean>(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErr, setImportErr] = useState<string | null>(null);
  const [showOrchestration, setShowOrchestration] = useState(false);

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
        if (script?.body && script.body.trim().length > 0 && !looksLikeJSON(script.body)) {
          const blocks = await editor.tryParseHTMLToBlocks(script.body);
          editor.replaceBlocks(editor.document, blocks);
          return;
        }
        // Fallback: synthesize blocks from title + plain content
        const fallbackTitle = script?.title || 'Untitled Script';
  const text = looksLikeJSON((script?.content || '').toString()) ? '' : (script?.content || '').toString();
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
    // Delegate save cadence to the hook; do only a light debounce here to avoid heavy conversions each keystroke
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        const updatedScript = await convertBlocksToScript();
        onEditScript(updatedScript);
        // hasUnsavedChanges will flip off when isSaving completes (see effect below)
      } catch (e) {
        console.error('Autosave prepare failed:', e);
      }
    }, 300);
  }, [onEditScript]);

  // Cleanup autosave timer on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  // When external saving completes, flash a Saved check and clear unsaved flag
  useEffect(() => {
    const prev = prevIsSavingRef.current;
    if (prev && !isSaving) {
      setHasUnsavedChanges(false);
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 1500);
      return () => clearTimeout(t);
    }
    prevIsSavingRef.current = isSaving;
  }, [isSaving]);

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
  const looksLikeJSON = /\{[\s\S]*\}/.test(newContent.trim()) && (newContent.includes('"blocks"') || newContent.includes('"title"'));
      const serverBlocks: any[] | undefined = edited?.blocks;
      if (Array.isArray(serverBlocks) && serverBlocks.length > 0) {
        // Prefer minimal updates when lengths match: patch by id
        try {
          const cur: any[] = (editor as any).document as any[];
          const sameLen = Array.isArray(cur) && cur.length === serverBlocks.length;
          if (sameLen) {
            const byId: Record<string, number> = Object.create(null);
            cur.forEach((b: any, i: number) => { if (b?.id) byId[String(b.id)] = i; });
            let changed = 0;
            for (let i = 0; i < serverBlocks.length; i++) {
              const nb: any = serverBlocks[i];
              const id = nb?.id ? String(nb.id) : '';
              const idx = id && byId[id] !== undefined ? byId[id] : i;
              if (idx >= 0 && idx < cur.length) {
                // Replace block at idx
                (editor as any).replaceBlocks([cur[idx]], [nb]);
                changed++;
              }
            }
            if (changed > 0) {
              // Minimal patch applied
            } else {
              editor.replaceBlocks(editor.document, serverBlocks as any);
            }
          } else {
            editor.replaceBlocks(editor.document, serverBlocks as any);
          }
        } catch {
          editor.replaceBlocks(editor.document, serverBlocks as any);
        }
      } else if (!looksLikeJSON) {
        // Fallback to composing from content
        const paras = newContent.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
        const newBlocks: any[] = [
          { type: 'heading', props: { level: 1 }, content: newTitle },
          ...paras.map(p => ({ type: 'paragraph', content: p }))
        ];
        editor.replaceBlocks(editor.document, newBlocks as any);
      } else {
        // Avoid injecting half-JSON; keep current document
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
          {/* Import JSON */}
          {typeof onImportScript === 'function' && (
            <Button
              onClick={() => { setImportErr(null); setImportText(''); setImportOpen(true); }}
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Import JSON
            </Button>
          )}
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

          {/* Autosave indicator */}
          {isSaving ? (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Autosaving...
            </div>
          ) : justSaved ? (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <Check className="h-4 w-4" />
              Saved
            </div>
          ) : hasUnsavedChanges ? (
            <div className="text-xs text-amber-400">Unsaved changes</div>
          ) : (
            <div className="text-xs text-zinc-500">All changes saved</div>
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
                          // Prefer positioning BELOW selection; flip above if not enough space
                          const offset = 8;
                          const approxBtnH = 32; // px
                          const spaceBelow = crect.bottom - rect.bottom;
                          const preferBelow = spaceBelow > (approxBtnH + offset + 8);
                          const top = preferBelow
                            ? (rect.bottom - crect.top) + scrollTop + offset
                            : (rect.top - crect.top) + scrollTop - (approxBtnH + offset);
                          // Center horizontally relative to the selection
                          let left = (rect.left + (rect.width / 2) - crect.left) + scrollLeft;
                          // Clamp within container bounds with small padding
                          const pad = 12;
                          const maxLeft = (crect.width || container.clientWidth) - pad;
                          left = Math.min(Math.max(left, pad), maxLeft);
                          setSelectionPos({ top: Math.max(4, top), left });
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
                  className="absolute z-50 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-red-600/95 hover:bg-red-700 text-white shadow-xl border border-white/10 backdrop-blur-sm"
                  style={{ top: selectionPos.top, left: selectionPos.left, transform: 'translateX(-50%)' }}
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

      {/* Orchestration Metadata Display */}
      {script?.metadata && (script.metadata.thoughts || script.metadata.duration_ms || script.metadata.workflow) && (
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl mt-4">
          <CardContent className="p-0">
            <button
              onClick={() => setShowOrchestration(!showOrchestration)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-medium text-zinc-200">Agentic Orchestration Details</span>
                {script.metadata.workflow && (
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {script.metadata.workflow}
                  </span>
                )}
                {script.metadata.duration_ms && (
                  <span className="text-xs text-zinc-400">
                    {script.metadata.duration_ms}ms
                  </span>
                )}
              </div>
              {showOrchestration ? (
                <ChevronUp className="h-4 w-4 text-zinc-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              )}
            </button>
            {showOrchestration && (
              <div className="px-4 pb-4 space-y-4 border-t border-white/10">
                {script.metadata.thoughts && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-3.5 w-3.5 text-yellow-400" />
                      <span className="text-xs font-medium text-zinc-300 uppercase tracking-wide">Agent Thoughts</span>
                    </div>
                    <div className="text-sm text-zinc-300 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 font-mono">
                      {script.metadata.thoughts}
                    </div>
                  </div>
                )}
                {script.metadata.agent_steps && script.metadata.agent_steps.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="h-3.5 w-3.5 text-blue-400" />
                      <span className="text-xs font-medium text-zinc-300 uppercase tracking-wide">Agent Steps</span>
                    </div>
                    <div className="space-y-2">
                      {script.metadata.agent_steps.map((step, idx) => (
                        <div key={idx} className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                          {step.agent && (
                            <div className="text-xs font-semibold text-blue-300 mb-1">{step.agent}</div>
                          )}
                          {step.step && (
                            <div className="text-sm text-zinc-300 mb-1">{step.step}</div>
                          )}
                          {step.output && (
                            <div className="text-xs text-zinc-400 font-mono mt-1 opacity-75">{step.output}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {script.metadata.quality_metrics && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="h-3.5 w-3.5 text-green-400" />
                      <span className="text-xs font-medium text-zinc-300 uppercase tracking-wide">Quality Metrics</span>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                      {script.metadata.quality_metrics.score !== undefined && (
                        <div className="text-sm text-zinc-300 mb-1">
                          Score: <span className="font-semibold text-green-300">{script.metadata.quality_metrics.score}/100</span>
                        </div>
                      )}
                      {script.metadata.quality_metrics.feedback && (
                        <div className="text-sm text-zinc-300 mt-2">{script.metadata.quality_metrics.feedback}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

      {/* Import JSON Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="bg-black/95 border-zinc-800 text-zinc-100 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-red-500" />
              Import Script JSON (title + blocks)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Paste the JSON object containing a title and blocks array. This will replace the current editor content.</p>
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={10}
              placeholder='{"title":"My Script","blocks":[...]}'
              className="bg-zinc-800/50 border-zinc-700 text-zinc-100"
            />
            {importErr && <div className="text-xs text-red-400">{importErr}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportOpen(false)} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">Cancel</Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                onClick={async () => {
                  setImportErr(null);
                  try {
                    const raw = importText.trim();
                    if (!raw) { setImportErr('Please paste JSON'); return; }
                    let obj: any;
                    try { obj = JSON.parse(raw); } catch (e) { setImportErr('Invalid JSON'); return; }
                    if (!obj || (typeof obj !== 'object')) { setImportErr('JSON must be an object'); return; }
                    const res = await (onImportScript as any)?.(obj);
                    if (!res || res.ok !== true) {
                      setImportErr(res?.error || 'Failed to import');
                      return;
                    }
                    // Close and reset; editor content will refresh via props/state
                    setImportOpen(false);
                    setImportText('');
                  } catch (err: any) {
                    setImportErr(err?.message || 'Import failed');
                  }
                }}
              >
                Apply Import
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