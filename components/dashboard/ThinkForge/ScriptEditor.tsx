'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
import ScriptRenderer from "./ScriptRenderer";

// Import canonical mappers and types
import { canonicalToBlockNote } from "@/lib/thinkforge/mappers/canonical-to-blocknote";
import { blockNoteToCanonical } from "@/lib/thinkforge/mappers/blocknote-to-canonical";
import { useStreamingBlocks } from "@/lib/thinkforge/hooks/useStreamingBlocks";
import type { BlockTree } from "@/lib/thinkforge/schemas/canonical";

// Type aliases for cursor preservation
type BlockId = string;
interface CursorPosition {
  blockId: BlockId;
  offset: number;
}

interface ScriptEditorProps {
  script?: Script | null;
  selectedIdea: Idea;
  sessionId?: string;
  onBackToChat: () => void;
  onEditScript: (updatedScript: Script) => void;
  generatingScript?: boolean;
  isSaving?: boolean;
  onImportScript?: (data: any) => Promise<{ ok: boolean; applied?: any; error?: string }>;
}

export default function ScriptEditor({
  script,
  selectedIdea,
  sessionId,
  onBackToChat,
  onEditScript,
  generatingScript = false,
  isSaving = false,
  onImportScript
}: ScriptEditorProps) {
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionPos, setSelectionPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
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
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUpdatingFromPropsRef = useRef(false);
  const lastLoadedBlocksRef = useRef<string>(''); // Track last loaded blocks to avoid unnecessary reloads
  
  // Cursor preservation state
  const cursorPositionRef = useRef<CursorPosition | null>(null);
  
  // Extract scriptId from script metadata or use sessionId (for API calls)
  // Note: The API endpoint accepts both scriptId and sessionId
  const scriptId = useMemo(() => {
    // Use sessionId - the backend will look up the latest script for that session
    return sessionId || null;
  }, [sessionId]);
  
  // Streaming state (ready for integration when streaming endpoint is used)
  const [streamingUrl, setStreamingUrl] = useState<string | null>(null);
  const streamingBlocks = useStreamingBlocks(streamingUrl, {
    onComplete: () => {
      setStreamingUrl(null);
    },
    onError: (error) => {
      console.error("Streaming error:", error);
      setStreamingUrl(null);
    },
  });


  // Prepare initial content for BlockNote
  const initialContent = useMemo(() => {
    if (!script?.blocks || !Array.isArray(script.blocks) || script.blocks.length === 0) {
      return [{
        type: 'heading',
        props: { level: 1 },
        content: script?.title || 'Untitled Script'
      }];
    }
    
    // Check if blocks are canonical format (have 'children' field)
    const isCanonical = script.blocks.every(
      (b: any) => b && typeof b === 'object' && 'id' in b && 'type' in b && 'children' in b
    );
    
    if (isCanonical) {
      // Convert canonical to BlockNote
      try {
        return canonicalToBlockNote(script.blocks as BlockTree);
      } catch (error) {
        console.error("Failed to convert canonical blocks on mount:", error);
        // Fallback to empty heading
        return [{
          type: 'heading',
          props: { level: 1 },
          content: script?.title || 'Untitled Script'
        }];
      }
    }
    
    // Legacy BlockNote format - convert to canonical first, then to BlockNote
    // This ensures we normalize all blocks through canonical format
    try {
      // Convert legacy blocks to canonical (they may have content field)
      const legacyBlocks = script.blocks.map((b: any) => {
        if (b && typeof b === 'object' && 'type' in b) {
          // If it has content but not children, it's legacy BlockNote format
          if ('content' in b && !('children' in b)) {
            // Convert legacy BlockNote block to canonical
            return {
              id: b.id || `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: b.type,
              props: b.props,
              children: Array.isArray(b.content) 
                ? b.content.map((c: any) => ({ type: 'text' as const, text: typeof c === 'string' ? c : (c?.text || '') }))
                : [{ type: 'text' as const, text: typeof b.content === 'string' ? b.content : '' }]
            };
          }
        }
        return b;
      });
      
      // Now convert to BlockNote
      return canonicalToBlockNote(legacyBlocks as BlockTree);
    } catch (error) {
      console.error("Failed to convert legacy blocks:", error);
      // Final fallback
      return [{
        type: 'heading',
        props: { level: 1 },
        content: script?.title || 'Untitled Script'
      }];
    }
  }, []); // Only on mount

  // Create BlockNote editor
  const editor = useCreateBlockNote({
    initialContent: initialContent as any,
    defaultStyles: true,
    trailingBlock: true,
  });

  // Store cursor position before updates
  const storeCursorPosition = useCallback(() => {
    try {
      // Get current selection from BlockNote editor
      const selection = (editor as any)?.getSelection?.();
      if (selection && selection.blocks && selection.blocks.length > 0) {
        const block = selection.blocks[0];
        const blockId = block.id as string;
        // Get content length safely
        const content = block.content;
        const offset = Array.isArray(content) ? content.length : (typeof content === 'string' ? content.length : 0);
        cursorPositionRef.current = { blockId, offset };
      }
    } catch (error) {
      // Ignore errors in cursor tracking
    }
  }, [editor]);

  // Restore cursor position after updates
  const restoreCursorPosition = useCallback(() => {
    if (!cursorPositionRef.current || !editor) {
      return;
    }

    try {
      const { blockId, offset } = cursorPositionRef.current;
      const blocks = editor.document;
      const targetBlock = blocks.find((b: any) => b.id === blockId);
      
      if (targetBlock) {
        // Try to restore selection (BlockNote API may vary)
        // This is a best-effort restoration
        const content = targetBlock.content as any;
        const maxOffset = Array.isArray(content) ? content.length : (typeof content === 'string' ? content.length : 0);
        (editor as any)?.setSelection?.({
          blocks: [targetBlock],
          anchor: { block: targetBlock, offset: Math.min(offset, maxOffset) },
          head: { block: targetBlock, offset: Math.min(offset, maxOffset) },
        });
      }
    } catch (error) {
      // Ignore errors in cursor restoration
    }
  }, [editor]);

  // Load blocks from API or script.blocks prop
  useEffect(() => {
    const loadBlocks = async () => {
      if (!editor) return;
      
      // Try to fetch from API if scriptId (sessionId) is available - ALWAYS try API first
      if (scriptId) {
        try {
          console.log('ScriptEditor: Loading blocks from API for sessionId:', scriptId);
          // Use sessionId parameter - backend will look up latest script for that session
          const response = await fetch(`/api/services/thinkforge/script/blocks?sessionId=${scriptId}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
          });
          if (response.ok) {
            const data = await response.json();
            console.log('ScriptEditor: Fetched blocks from API:', {
              blocksCount: data.blocks?.length || 0,
              hasBlocks: !!(data.blocks && Array.isArray(data.blocks) && data.blocks.length > 0),
              blocks: data.blocks,
            });
            if (data.blocks && Array.isArray(data.blocks) && data.blocks.length > 0) {
              try {
                // Convert canonical blocks to BlockNote
                const blockNoteBlocks = canonicalToBlockNote(data.blocks as BlockTree);
                console.log('ScriptEditor: Converted to BlockNote blocks:', {
                  blockNoteBlocksCount: blockNoteBlocks.length,
                  blockTypes: blockNoteBlocks.map(b => b.type),
                  firstBlock: blockNoteBlocks[0],
                });
                if (blockNoteBlocks.length > 0) {
                  const blocksHash = JSON.stringify(blockNoteBlocks);
                  if (blocksHash !== lastLoadedBlocksRef.current) {
                    isUpdatingFromPropsRef.current = true;
                    editor.replaceBlocks(editor.document, blockNoteBlocks as any);
                    isUpdatingFromPropsRef.current = false;
                    setHasUnsavedChanges(false);
                    lastLoadedBlocksRef.current = blocksHash;
                    console.log('ScriptEditor: Successfully loaded blocks from API');
                  } else {
                    console.log('ScriptEditor: Blocks unchanged, skipping update');
                  }
                  return;
                }
              } catch (conversionError) {
                console.error('ScriptEditor: Failed to convert canonical blocks to BlockNote:', conversionError);
                console.error('ScriptEditor: Blocks that failed:', data.blocks);
              }
            } else {
              console.log('ScriptEditor: No blocks returned from API or empty array');
            }
          } else {
            const errorText = await response.text().catch(() => '');
            console.error('ScriptEditor: Failed to fetch blocks from API:', response.status, errorText);
          }
        } catch (error) {
          console.error("ScriptEditor: Failed to fetch blocks from API:", error);
          // Fall through to use script.blocks prop
        }
      }
      
      // Fallback: use script.blocks prop if available
      if (script?.blocks && Array.isArray(script.blocks) && script.blocks.length > 0) {
        console.log('ScriptEditor: Loading blocks from script prop:', {
          blocksCount: script.blocks.length,
          firstBlock: script.blocks[0]
        });
        // Check if blocks are canonical format
        const isCanonical = script.blocks.every(
          (b: any) => b && typeof b === 'object' && 'id' in b && 'type' in b && 'children' in b
        );
        
        if (isCanonical) {
          // Convert canonical to BlockNote
          try {
            const blockNoteBlocks = canonicalToBlockNote(script.blocks as BlockTree);
            if (blockNoteBlocks.length > 0) {
              // Check if content is actually different (avoid unnecessary updates)
              const currentBlocks = editor.document;
              const currentJson = JSON.stringify(currentBlocks);
              const newJson = JSON.stringify(blockNoteBlocks);
              
              if (currentJson === newJson) {
                console.log('ScriptEditor: Blocks unchanged, skipping update');
                return;
              }

              // Skip update if user has made changes very recently
              if (hasUnsavedChanges && autosaveTimerRef.current) {
                console.log('ScriptEditor: Skipping update, user is actively editing');
                return;
              }
              
              isUpdatingFromPropsRef.current = true;
              editor.replaceBlocks(editor.document, blockNoteBlocks as any);
              console.log('ScriptEditor: Updated editor with', blockNoteBlocks.length, 'canonical blocks from prop');
              setHasUnsavedChanges(false);
              isUpdatingFromPropsRef.current = false;
              
              // Restore cursor after update
              setTimeout(() => restoreCursorPosition(), 100);
            }
          } catch (error) {
            console.error("ScriptEditor: Failed to convert canonical blocks:", error);
          }
        }
      } else {
        console.log('ScriptEditor: No blocks in script prop');
      }
    };
    
    // Load blocks whenever editor is ready OR scriptId changes OR script.blocks changes
    if (editor) {
      loadBlocks();
    }
  }, [script?.blocks, scriptId, editor, restoreCursorPosition]);

  // Poll for blocks when script is being generated OR when we have a sessionId (refresh every 2 seconds)
  useEffect(() => {
    if (!scriptId || !editor) return;
    
    // Poll more aggressively when generating, less when not
    const pollInterval = generatingScript ? 1500 : 3000;
    
    const interval = setInterval(async () => {
      try {
        console.log('ScriptEditor: Polling for blocks, generatingScript:', generatingScript);
        const response = await fetch(`/api/services/thinkforge/script/blocks?sessionId=${scriptId}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (response.ok) {
          const data = await response.json();
          console.log('ScriptEditor: Polling response:', {
            hasBlocks: !!(data.blocks && Array.isArray(data.blocks) && data.blocks.length > 0),
            blocksCount: data.blocks?.length || 0
          });
          if (data.blocks && Array.isArray(data.blocks) && data.blocks.length > 0) {
            try {
              const blockNoteBlocks = canonicalToBlockNote(data.blocks as BlockTree);
              if (blockNoteBlocks.length > 0) {
                // Check if blocks are different before updating
                const currentBlocks = editor.document;
                const currentJson = JSON.stringify(currentBlocks);
                const newJson = JSON.stringify(blockNoteBlocks);
                
              if (currentJson !== newJson) {
                const blocksHash = JSON.stringify(blockNoteBlocks);
                if (blocksHash !== lastLoadedBlocksRef.current) {
                  isUpdatingFromPropsRef.current = true;
                  editor.replaceBlocks(editor.document, blockNoteBlocks as any);
                  isUpdatingFromPropsRef.current = false;
                  setHasUnsavedChanges(false);
                  lastLoadedBlocksRef.current = blocksHash;
                  console.log('ScriptEditor: Updated blocks from polling');
                }
              }
              }
            } catch (error) {
              console.error('ScriptEditor: Failed to convert blocks during polling:', error);
            }
          }
        }
      } catch (error) {
        console.error('ScriptEditor: Polling error:', error);
      }
    }, pollInterval);
    
    return () => clearInterval(interval);
  }, [scriptId, editor, generatingScript]);

  // Integrate streaming blocks into editor when they arrive
  useEffect(() => {
    if (streamingBlocks.blocks.length > 0 && editor) {
      try {
        console.log('ScriptEditor: Integrating streaming blocks:', streamingBlocks.blocks.length);
        // Convert canonical streaming blocks to BlockNote
        const blockNoteBlocks = canonicalToBlockNote(streamingBlocks.blocks);
        if (blockNoteBlocks.length > 0) {
          // Replace all blocks with streaming blocks
          isUpdatingFromPropsRef.current = true;
          editor.replaceBlocks(editor.document, blockNoteBlocks as any);
          isUpdatingFromPropsRef.current = false;
          setHasUnsavedChanges(false);
          console.log('ScriptEditor: Integrated streaming blocks successfully');
        }
      } catch (error) {
        console.error("ScriptEditor: Failed to integrate streaming blocks:", error);
      }
    }
  }, [streamingBlocks.blocks, editor]);

  // Convert BlockNote content back to Script format (with canonical conversion)
  const convertBlocksToScript = useCallback(async (): Promise<Script> => {
    const blocks = editor.document;
    
    // Store cursor before conversion
    storeCursorPosition();
    
    // Convert BlockNote to canonical format
    let canonicalBlocks: BlockTree;
    try {
      canonicalBlocks = blockNoteToCanonical(blocks);
    } catch (error) {
      console.error("Failed to convert to canonical:", error);
      // Fallback to legacy format
      canonicalBlocks = blocks as any;
    }
    
    // Extract title from HTML content
    const htmlContent = await editor.blocksToHTMLLossy(blocks);
    const titleMatch = htmlContent.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : script?.title || 'Untitled Script';
    
    // Extract text content
    const textContent = await editor.blocksToMarkdownLossy(blocks);

    return {
      title,
      body: htmlContent,
      blocks: canonicalBlocks, // Use canonical format
      content: textContent.replace(/[#*_`]/g, ''),
      sections: script?.sections || [],
      tips: script?.tips || [],
      duration: script?.duration,
      targetAudience: script?.targetAudience,
      tone: script?.tone,
      metadata: script?.metadata
    };
  }, [editor, script, storeCursorPosition]);

  // Handle content changes with debounced autosave
  const handleContentChange = useCallback(() => {
    // Skip if this is an update from props
    if (isUpdatingFromPropsRef.current) {
      return;
    }

    setHasUnsavedChanges(true);
    
    // Debounce autosave
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        const updatedScript = await convertBlocksToScript();
        
        // Send canonical blocks to backend if scriptId is available
        if (scriptId && updatedScript.blocks) {
          try {
            const response = await fetch(`/api/services/thinkforge/script/blocks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                scriptId: scriptId,
                blocks: updatedScript.blocks,
              }),
            });
            
            if (!response.ok) {
              console.error('Failed to save blocks to backend');
            }
          } catch (error) {
            console.error('Error saving blocks to backend:', error);
          }
        }
        
        onEditScript(updatedScript);
        
        // Restore cursor after save
        setTimeout(() => restoreCursorPosition(), 100);
      } catch (error) {
        console.error('Autosave failed:', error);
      }
    }, 800);
  }, [convertBlocksToScript, onEditScript, restoreCursorPosition]);

  // Handle selection changes
  const handleSelectionChange = useCallback(() => {
    if (selectionTimerRef.current) {
      clearTimeout(selectionTimerRef.current);
    }
    
    selectionTimerRef.current = setTimeout(() => {
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
              
              const offset = 8;
              const approxBtnH = 32;
              const spaceBelow = crect.bottom - rect.bottom;
              const preferBelow = spaceBelow > (approxBtnH + offset + 8);
              
              const top = preferBelow
                ? (rect.bottom - crect.top) + scrollTop + offset
                : (rect.top - crect.top) + scrollTop - (approxBtnH + offset);
              
              let left = (rect.left + (rect.width / 2) - crect.left) + scrollLeft;
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
    }, 300);
  }, [editor]);

  // Detect when saving completes
  useEffect(() => {
    if (prevIsSavingRef.current && !isSaving) {
      setJustSaved(true);
      setHasUnsavedChanges(false);
      setTimeout(() => setJustSaved(false), 2000);
    }
    prevIsSavingRef.current = isSaving;
  }, [isSaving]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
    };
  }, []);

  // Copy to clipboard
  const handleCopy = async () => {
    try {
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
      
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>${title}</title>
              <style>
                body { 
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
                  line-height: 1.6; 
                  margin: 2cm; 
                  color: #000;
                }
                h1 { color: #333; font-size: 24px; margin-bottom: 20px; }
                h2 { color: #555; font-size: 20px; margin: 20px 0 10px 0; }
                h3 { color: #666; font-size: 16px; margin: 15px 0 8px 0; }
                p { margin: 8px 0; }
                ul, ol { margin: 8px 0; padding-left: 20px; }
                li { margin: 4px 0; }
                blockquote { 
                  border-left: 3px solid #ddd; 
                  margin: 10px 0; 
                  padding-left: 15px; 
                  font-style: italic; 
                }
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

  // Handle import
  const handleImport = async () => {
    setImportErr(null);
    try {
      const raw = importText.trim();
      if (!raw) {
        setImportErr('Please paste JSON');
        return;
      }
      
      let obj: any;
      try {
        obj = JSON.parse(raw);
      } catch (e) {
        setImportErr('Invalid JSON');
        return;
      }
      
      if (!obj || typeof obj !== 'object') {
        setImportErr('JSON must be an object');
        return;
      }
      
      const res = await onImportScript?.(obj);
      if (!res || res.ok !== true) {
        setImportErr(res?.error || 'Failed to import');
        return;
      }
      
      setImportOpen(false);
      setImportText('');
    } catch (err: any) {
      setImportErr(err?.message || 'Import failed');
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
              onClick={() => {
                setImportErr(null);
                setImportText('');
                setImportOpen(true);
              }}
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
            disabled={generatingScript && !script}
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>

          {/* Autosave indicator */}
          {isSaving ? (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </div>
          ) : justSaved ? (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <Check className="h-4 w-4" />
              Saved
            </div>
          ) : hasUnsavedChanges ? (
            <div className="text-xs text-amber-400">Unsaved</div>
          ) : (
            <div className="text-xs text-zinc-500">All saved</div>
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
            <div 
              ref={containerRef} 
              className="relative min-h-[600px] max-h-[70vh] overflow-y-auto rounded-lg scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
            >
              {isPreviewMode ? (
                <div className="p-6">
                  <ScriptRenderer 
                    title={script?.title} 
                    blocks={script?.blocks || []}
                  />
                </div>
              ) : (
                <BlockNoteView 
                  editor={editor as any}
                  editable={true}
                  onChange={handleContentChange}
                  onSelectionChange={handleSelectionChange}
                  theme="dark"
                  className="blocknote-editor-dark"
                />
              )}
              
              {/* Selection floating button */}
              {selectedText && selectedText.trim().length > 0 && selectionPos && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    try {
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(
                          new CustomEvent('tf-selection-to-chat', { 
                            detail: { text: selectedText } 
                          } as any)
                        );
                      }
                    } catch {}
                  }}
                  className="absolute z-50 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-red-600/95 hover:bg-red-700 text-white shadow-xl border border-white/10 backdrop-blur-sm transition-all"
                  style={{ 
                    top: selectionPos.top, 
                    left: selectionPos.left, 
                    transform: 'translateX(-50%)' 
                  }}
                  aria-label="Improve selected text with ForgeAI"
                >
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" /> 
                    Edit in Chat
                  </span>
                </button>
              )}
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
                      {script.metadata.agent_steps.map((step: any, idx: number) => (
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

      {/* Import JSON Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="bg-black/95 border-zinc-800 text-zinc-100 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-red-500" />
              Import Script JSON
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Paste JSON containing title and blocks. This will replace the current content.
            </p>
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={10}
              placeholder='{"title":"My Script","blocks":[...]}'
              className="bg-zinc-800/50 border-zinc-700 text-zinc-100 font-mono text-xs"
            />
            {importErr && (
              <div className="text-xs text-red-400">{importErr}</div>
            )}
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => setImportOpen(false)} 
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                onClick={handleImport}
              >
                Apply Import
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Styles */}
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
        
        button {
          transition: all 0.2s ease !important;
        }
        button:hover {
          transform: translateY(-1px);
        }
        button:active {
          transform: translateY(0);
        }
        
        .scrollbar-thin {
          scroll-behavior: smooth;
        }
      `}</style>
    </motion.div>
  );
}
