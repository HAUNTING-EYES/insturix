'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';

// Import Tiptap editor styles
import '@/styles/thinkforge-editor.css';
import { motion } from 'framer-motion';
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
  GitBranch,
  Plus,
  History,
  MoreVertical,
  FileDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Script, Idea } from '@/app/dashboard/thinkforge/types';
import { getToneColorClass } from '@/lib/thinkforge/tone';

// Tiptap imports
import { useEditor, EditorContent } from '@tiptap/react';
import { Editor } from '@tiptap/core';

// Import Tiptap extensions bundle
import { getThinkForgeExtensions, DEFAULT_EMPTY_DOCUMENT } from '@/lib/thinkforge/extensions';

// Import ScriptRenderer for preview mode
import ScriptRenderer from "./ScriptRenderer";

// Import Tiptap mappers and validation
import { thinkForgeBlocksToTiptapJSON } from "@/lib/thinkforge/mappers/thinkforge-to-tiptap";
import { tiptapJSONToThinkForgeBlocks } from "@/lib/thinkforge/mappers/tiptap-to-thinkforge";
import { validateThinkForgeBlocks } from "@/lib/thinkforge/schemas/thinkforge-block";
import { validateTiptapJSON, isTiptapJSON, extractPlainText } from "@/lib/thinkforge/schemas/tiptap-validation";
import { buildScriptHtmlDocument, buildScriptText, downloadBlob, printHtmlDocument } from "@/lib/thinkforge/export/export-utils";
import type { TiptapJSON } from "@/lib/thinkforge/schemas/tiptap-schema";
import { useStreamingBlocks } from "@/lib/thinkforge/hooks/useStreamingBlocks";
import { useVersionManager } from "@/app/dashboard/thinkforge/hooks/useVersionManager";

// Import FormatToolbar
import { FormatToolbar } from "./FormatToolbar";

// Import ScriptHistoryPanel
import { ScriptHistoryPanel } from "./ScriptHistoryPanel";

// Import streaming Tiptap hook
import { useStreamingTiptap } from "@/lib/thinkforge/hooks/useStreamingTiptap";

// Import selection editing utilities
import { serializeSelectionToThinkForgeBlocks, applyAIEditToSelection, isSelectionEditable } from "@/lib/thinkforge/utils/selection-editing";

// Type aliases for cursor preservation
type BlockId = string;
interface CursorPosition {
  pos: number;
}

/**
 * Convert ThinkForgeBlocks to Tiptap JSON
 */
function toTiptapJSON(blocks: any): TiptapJSON {
  // Check if it's already Tiptap JSON
  if (blocks && typeof blocks === 'object' && blocks.type === 'doc') {
    try {
      return validateTiptapJSON(blocks);
    } catch {
      // Invalid Tiptap JSON, try to convert
    }
  }
  
  // Convert from ThinkForgeBlocks
  const validated = validateThinkForgeBlocks(blocks || []);
  if (!validated.length) {
    return DEFAULT_EMPTY_DOCUMENT as TiptapJSON;
  }
  return thinkForgeBlocksToTiptapJSON(validated);
}

interface ScriptEditorProps {
  script?: Script | null;
  selectedIdea: Idea;
  sessionId?: string;
  scriptId?: string | null;
  onBackToChat: () => void;
  onEditScript: (updatedScript: Script) => void;
  generatingScript?: boolean;
  isSaving?: boolean;
  onImportScript?: (data: any) => Promise<{ ok: boolean; applied?: any; error?: string }>;
  onNewScript?: () => void;
  onSwitchScript?: (scriptId: string) => void;
  onTokenStream?: (callback: (tokens: string) => void) => void; // Callback setter for token streaming
  onGetSelection?: (callback: () => { blocks: any[]; blockIds: string[]; range: { from: number; to: number } | null } | null) => void; // Callback setter for getting current selection
  onEditSelection?: (text: string, range: { from: number; to: number }, blocks: any[]) => void;
}

export default function ScriptEditor({
  script,
  selectedIdea,
  sessionId,
  scriptId,
  onBackToChat,
  onEditScript,
  generatingScript = false,
  isSaving = false,
  onImportScript,
  onNewScript,
  onSwitchScript,
  onTokenStream, // Optional callback to receive streaming tokens
  onGetSelection, // Optional callback setter for getting current selection
  onEditSelection,
}: ScriptEditorProps & { 
  onTokenStream?: (callback: (tokens: string) => void) => void;
  onGetSelection?: (callback: () => { blocks: any[]; blockIds: string[]; range: { from: number; to: number } | null } | null) => void;
  onEditSelection?: (text: string, range: { from: number; to: number }, blocks: any[]) => void;
}) {
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionRange, setSelectionRange] = useState<{ from: number; to: number } | null>(null);
  const [selectionPos, setSelectionPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const isSelectingRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const prevIsSavingRef = useRef<boolean>(false);
  const [showBranchEditor, setShowBranchEditor] = useState(false);
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUpdatingFromPropsRef = useRef(false);
  const lastLoadedContentRef = useRef<string>(''); // Track last loaded content to avoid unnecessary reloads
  const isProgrammaticUpdateRef = useRef(false);
  const lastAutosaveHashRef = useRef<string>('');
  const lastAutosaveAtRef = useRef<number>(0);
  const autosaveInFlightRef = useRef(false);
  const MIN_AUTOSAVE_INTERVAL_MS = 4000;
  const autosavePausedRef = useRef(false);
  const scriptVersionRef = useRef<number>(0);
  
  // CRITICAL: Track user typing state to prevent remote updates from overwriting user input
  const isUserTypingRef = useRef(false);
  const lastUserInputTimeRef = useRef<number>(0);
  const USER_TYPING_TIMEOUT = 2000; // Consider user stopped typing after 2s of inactivity
  
  // CRITICAL: Guards for Branch Editor restore and local edits
  const isRestoringVersionRef = useRef(false); // Only true when restoring a version
  const hasLocalEditsRef = useRef(false); // True if user has made local edits
  const isHydratedOnceRef = useRef(false); // True after initial hydration
  
  // Cursor preservation state
  const cursorPositionRef = useRef<CursorPosition | null>(null);
  
  // Refs for callbacks to avoid initialization order issues
  const handleContentChangeRef = useRef<(() => void) | null>(null);
  const handleSelectionChangeRef = useRef<(() => void) | null>(null);
  
  // Script identifier for multi-script tabs
  const scriptResourceId = useMemo(() => {
    return scriptId || 'default';
  }, [scriptId]);
  const versionManager = useVersionManager(sessionId || null);
  const {
    createVersion,
    getVersionBlocks,
    currentVersionId,
    isLoading: versionManagerLoading,
    error: versionManagerError,
  } = versionManager;
  const lastVersionHashRef = useRef<string | null>(null);
  
  // Streaming state
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

  // Preview blocks for ScriptRenderer
  const previewBlocks = useMemo(() => {
    if (script?.blocks) {
      // Check if it's already Tiptap JSON
      if (script.blocks && typeof script.blocks === 'object' && (script.blocks as any).type === 'doc') {
        return script.blocks;
      }
      // Convert to Tiptap JSON for preview
      return toTiptapJSON(script.blocks);
    }
    return DEFAULT_EMPTY_DOCUMENT;
  }, [script]);

  const editorExtensions = useMemo(() => getThinkForgeExtensions({
    placeholder: 'Start writing your script...',
  }), []);

  // Create Tiptap editor
  const editor = useEditor({
    extensions: editorExtensions,
    content: DEFAULT_EMPTY_DOCUMENT,
    immediatelyRender: false, // Required for SSR/Next.js to avoid hydration mismatches
    editorProps: {
      attributes: {
        class: 'tiptap-editor-content prose prose-invert focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      queueMicrotask(() => {
        // Skip if this is an update from props/API
        if (isUpdatingFromPropsRef.current || isProgrammaticUpdateRef.current) {
          return;
        }
        // CRITICAL: Mark user as actively typing
        isUserTypingRef.current = true;
        lastUserInputTimeRef.current = Date.now();
        // Clear typing flag after timeout
        setTimeout(() => {
          isUserTypingRef.current = false;
        }, USER_TYPING_TIMEOUT);
        // Mark as having unsaved changes
        setHasUnsavedChanges(true);
        // handleContentChange will be defined later, use a ref to avoid initialization order issues
        if (handleContentChangeRef.current) {
          handleContentChangeRef.current();
        }
      });
    },
  });

  // Streaming Tiptap hook for progressive content insertion
  const streamingTiptap = useStreamingTiptap({
    editor,
    onError: (error) => {
      console.error('Streaming Tiptap error:', error);
    },
  });

  // Handle token streaming from chat
  useEffect(() => {
    if (onTokenStream) {
      // Register callback to receive tokens
      onTokenStream((tokens: string) => {
        if (generatingScript) {
          isProgrammaticUpdateRef.current = true;
          streamingTiptap.appendTokens(tokens);
          requestAnimationFrame(() => {
            isProgrammaticUpdateRef.current = false;
          });
        }
      });
    }
  }, [onTokenStream, generatingScript, streamingTiptap]);

  // Expose selection getter to parent components
  useEffect(() => {
    if (onGetSelection && editor) {
      onGetSelection(() => {
        if (!editor) return null;
        
        const selection = serializeSelectionToThinkForgeBlocks(editor);
        return {
          blocks: selection.blocks,
          blockIds: selection.blockIds,
          range: selection.range,
        };
      });
    }
  }, [onGetSelection, editor]);

  // Track latest script version from props
  useEffect(() => {
    if (typeof (script as any)?.version === 'number') {
      scriptVersionRef.current = (script as any).version;
    }
  }, [script]);

  // Reset streaming when generation starts
  useEffect(() => {
    if (generatingScript) {
      streamingTiptap.reset();
    }
  }, [generatingScript, streamingTiptap]);

  // Finalize streaming when generation completes or stops
  useEffect(() => {
    if (!generatingScript) {
      // CRITICAL: Cancel streaming first to prevent stale tokens
      streamingTiptap.cancel();
      // Then finalize if there's remaining content
      if (streamingTiptap.isStreaming()) {
        streamingTiptap.finalize();
      }
      // Reset streaming state to prevent further token processing
      streamingTiptap.reset();
    }
  }, [generatingScript, streamingTiptap]);

  // Safe content update function
  // CRITICAL: Only call setContent when restoring a version or initial load
  // Autosave and polling must NEVER call setContent
  const safeSetContent = useCallback(
    (content: TiptapJSON, reason: string) => {
      if (!editor) return;

      // CRITICAL: Only allow setContent for:
      // 1. Initial loads (api/prop)
      // 2. Version restore (explicit restore action)
      // 3. AI updates (but only if no local edits)
      // 4. New script button (clearing editor)
      // 5. Clear editor operations
      const isInitialLoad = reason === 'initial-load-api' || reason === 'initial-load-prop';
      const isVersionRestore = reason === 'version-restore' || isRestoringVersionRef.current;
      const isAIUpdate = reason === 'ai-update';
      const isNewScript = reason === 'new-script-button' || reason === 'clear-editor-new-script' || reason === 'clear-editor-new-session';
      
      // Block setContent if:
      // - Not initial load, not restore, not new script, and has local edits
      // - Not initial load, not restore, not new script, and user is typing
      if (!isInitialLoad && !isVersionRestore && !isNewScript) {
        if (hasLocalEditsRef.current && !isAIUpdate) {
          console.log(`ScriptEditor: Blocking setContent (${reason}), has local edits`);
          return;
        }
        if (isUserTypingRef.current && !isAIUpdate) {
          console.log(`ScriptEditor: Blocking setContent (${reason}), user is typing`);
          return;
        }
      }

      try {
        isUpdatingFromPropsRef.current = true;
        editor.commands.setContent(content);
        isUpdatingFromPropsRef.current = false;
        
        // Mark as hydrated after initial load
        if (isInitialLoad) {
          isHydratedOnceRef.current = true;
        }
      } catch (error) {
        console.error(`ScriptEditor: setContent failed (${reason})`, error);
        isUpdatingFromPropsRef.current = false;
        
        // Fallback to empty document
        try {
          editor.commands.setContent(DEFAULT_EMPTY_DOCUMENT);
        } catch (fallbackError) {
          console.error(`ScriptEditor: Fallback setContent failed`, fallbackError);
        }
      }
    },
    [editor]
  );

  // Apply content to editor with deduplication
  // CRITICAL: Must never overwrite user edits - user input is source of truth
  // CRITICAL: Never call setContent if user has local edits (except restore/initial load)
  const applyContentToEditor = useCallback(
    (content: TiptapJSON, reason: string) => {
      if (!editor) return false;
      
      const isInitialLoad = reason === 'initial-load-api' || reason === 'initial-load-prop';
      const isVersionRestore = reason === 'version-restore' || isRestoringVersionRef.current;
      
      // CRITICAL: Never apply remote updates if user is actively typing (except initial load/restore)
      const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
      const userRecentlyTyped = isUserTypingRef.current || timeSinceLastInput < USER_TYPING_TIMEOUT;
      
      if (userRecentlyTyped && !isInitialLoad && !isVersionRestore) {
        console.log(`ScriptEditor: Skipping ${reason}, user is actively typing`);
        return false;
      }
      
      // CRITICAL: Never overwrite if user has unsaved changes (unless initial load/restore)
      if (hasUnsavedChanges && !isInitialLoad && !isVersionRestore) {
        console.log(`ScriptEditor: Skipping ${reason}, user has unsaved changes`);
        return false;
      }
      
      // CRITICAL: Never overwrite if user has local edits (unless initial load/restore)
      if (hasLocalEditsRef.current && !isInitialLoad && !isVersionRestore) {
        console.log(`ScriptEditor: Skipping ${reason}, user has local edits`);
        return false;
      }
      
      const contentHash = JSON.stringify(content);
      if (contentHash === lastLoadedContentRef.current) {
        return false;
      }
      
      safeSetContent(content, reason);
      // Only clear unsaved changes flag if this is an initial load
      // User edits should preserve the flag
      if (isInitialLoad) {
        setHasUnsavedChanges(false);
        hasLocalEditsRef.current = false; // Clear local edits on initial load
      }
      lastLoadedContentRef.current = contentHash;
      return true;
    },
    [editor, safeSetContent, hasUnsavedChanges]
  );

  // Create a version snapshot from the current editor state
  const createVersionSnapshot = useCallback((description: string, options?: { isAutoSave?: boolean }) => {
    if (!sessionId || !editor) return;
    if (versionManagerLoading || versionManagerError) return;
    if (isRestoringVersionRef.current) return;
    
    try {
      const tiptapJSON = editor.getJSON() as TiptapJSON;
      const hash = JSON.stringify(tiptapJSON);
      
      if (lastVersionHashRef.current === hash) {
        return;
      }
      
      const blocks = tiptapJSONToThinkForgeBlocks(tiptapJSON);
      const validated = validateThinkForgeBlocks(blocks);
      const created = createVersion(validated as any, description, {
        isAutoSave: options?.isAutoSave,
      });
      
      if (created) {
        lastVersionHashRef.current = hash;
      }
    } catch (error) {
      console.error('ScriptEditor: Failed to create version snapshot', error);
    }
  }, [editor, sessionId, versionManagerLoading, versionManagerError, createVersion]);

  // Store cursor position before updates
  const storeCursorPosition = useCallback(() => {
    if (!editor) return;
    try {
      const { from } = editor.state.selection;
      cursorPositionRef.current = { pos: from };
    } catch (error) {
      // Ignore errors in cursor tracking
    }
  }, [editor]);

  // Restore cursor position after updates
  const restoreCursorPosition = useCallback(() => {
    if (!cursorPositionRef.current || !editor) return;

    try {
      const { pos } = cursorPositionRef.current;
      const maxPos = editor.state.doc.content.size;
      const safePos = Math.min(pos, maxPos);
      editor.commands.setTextSelection(safePos);
    } catch (error) {
      // Ignore errors in cursor restoration
    }
  }, [editor]);

  // Load blocks from API or script.blocks prop - only on initial mount or scriptId change
  // CRITICAL: Must never overwrite user edits during load
  const initialLoadDoneRef = useRef(false);
  
  useEffect(() => {
    const loadBlocks = async () => {
      if (!editor) return;
      
      // CRITICAL: Skip if user is actively editing or has unsaved changes
      // User input is always the source of truth
      const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
      const userRecentlyTyped = isUserTypingRef.current || timeSinceLastInput < USER_TYPING_TIMEOUT;
      
      if (hasUnsavedChanges || autosaveTimerRef.current || userRecentlyTyped) {
        console.log('ScriptEditor: Skipping load, user is actively editing');
        return;
      }
      
      // Try to fetch from API if session is available
      if (sessionId) {
        try {
          const response = await fetch(`/api/services/thinkforge/script/blocks?sessionId=${sessionId}&scriptId=${encodeURIComponent(scriptResourceId)}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
          });
          if (response.ok) {
            const data = await response.json();
            if (typeof data?.version === 'number') {
              scriptVersionRef.current = data.version;
            }
            
            // Check if response has richText (Tiptap JSON) or blocks (ThinkForge format)
            let tiptapContent: TiptapJSON;
            if (data.richText && isTiptapJSON(data.richText)) {
              tiptapContent = data.richText;
            } else if (data.blocks) {
              tiptapContent = toTiptapJSON(data.blocks);
            } else {
              console.warn('ScriptEditor: API returned no valid content');
              return;
            }
            
            // CRITICAL: Final check before applying - user might have typed during fetch
            const finalCheck = Date.now() - lastUserInputTimeRef.current;
            if (isUserTypingRef.current || finalCheck < USER_TYPING_TIMEOUT || hasUnsavedChanges) {
              console.log('ScriptEditor: Skipping load, user typed during fetch');
              return;
            }
            
            if (tiptapContent.content && tiptapContent.content.length > 0) {
              const applied = applyContentToEditor(tiptapContent, 'initial-load-api');
              if (applied) {
                initialLoadDoneRef.current = true;
                console.log('ScriptEditor: Loaded content from API');
              }
              return;
            }
            console.warn('ScriptEditor: API returned empty content');
          }
        } catch (error) {
          console.error("ScriptEditor: Failed to fetch from API:", error);
        }
      }

      // Fallback: use script.blocks prop if available
      // CRITICAL: Only load from prop if user isn't actively editing
      if (script?.blocks) {
        const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
        const userRecentlyTyped = isUserTypingRef.current || timeSinceLastInput < USER_TYPING_TIMEOUT;
        
        if (!hasUnsavedChanges && !userRecentlyTyped) {
          const tiptapContent = toTiptapJSON(script.blocks);
          if (tiptapContent.content && tiptapContent.content.length > 0) {
            const applied = applyContentToEditor(tiptapContent, 'initial-load-prop');
            if (applied) {
              initialLoadDoneRef.current = true;
              console.log('ScriptEditor: Loaded content from prop');
            }
          } else {
            console.warn('ScriptEditor: Prop blocks were invalid');
          }
        }
      }
    };
    
    // Only load on initial mount or when scriptId changes
    if (editor && !initialLoadDoneRef.current) {
      loadBlocks();
    }
  }, [sessionId, scriptResourceId, editor, hasUnsavedChanges]);
  
  // Reset state when script tab changes
  // CRITICAL: Reset all tracking refs to prevent stale state from affecting new session
  useEffect(() => {
    initialLoadDoneRef.current = false;
    lastLoadedContentRef.current = '';
    prevScriptBlocksRef.current = '';
    setHasUnsavedChanges(false);
    // CRITICAL: Reset user typing state when switching sessions
    isUserTypingRef.current = false;
    lastUserInputTimeRef.current = 0;
    hasLocalEditsRef.current = false; // Clear local edits on session change
    isRestoringVersionRef.current = false; // Clear restore flag on session change
    
    // Clear the editor content for new sessions
    if (editor && !sessionId) {
      try {
        safeSetContent(DEFAULT_EMPTY_DOCUMENT as TiptapJSON, 'clear-editor-new-session');
      } catch {
        // Ignore if editor not ready
      }
    }
  }, [scriptResourceId, sessionId, editor]);

  // Handle script reset (when script becomes empty/null - e.g., New Script button)
  useEffect(() => {
    if (!editor) return;
    
    // Check if script was reset to empty (blocks is null or empty array)
    const isScriptEmpty = !script?.blocks || (Array.isArray(script.blocks) && script.blocks.length === 0);
    const hasContent = editor.getJSON().content && editor.getJSON().content.length > 0;
    
    const metadataSource = (script?.metadata as any)?.source;
    // If script is empty but editor has content, clear the editor
    // Skip clearing if the update originated from editor autosave to avoid lossy wipes
    if (metadataSource === 'editor' && hasContent) {
      return;
    }
    if (isScriptEmpty && hasContent && !isUpdatingFromPropsRef.current) {
      try {
        isUpdatingFromPropsRef.current = true;
        safeSetContent(DEFAULT_EMPTY_DOCUMENT as TiptapJSON, 'clear-editor-new-script');
        lastLoadedContentRef.current = JSON.stringify(DEFAULT_EMPTY_DOCUMENT);
        hasLocalEditsRef.current = false;
        setHasUnsavedChanges(false);
        isUpdatingFromPropsRef.current = false;
      } catch (error) {
        console.error('Failed to clear editor on script reset:', error);
        isUpdatingFromPropsRef.current = false;
      }
    }
  }, [script?.blocks, editor, safeSetContent]);
  
  // Handle script.blocks updates from AI generation (via chat)
  const prevScriptBlocksRef = useRef<string>('');
  const prevMetadataRef = useRef<string>('');
  
  useEffect(() => {
    if (!editor || (!script?.blocks && !script?.content)) {
      return;
    }
    
    // Skip full content updates during streaming (streaming handles incremental updates)
    if (generatingScript && streamingTiptap.isStreaming()) {
      return;
    }
    
    // Check if this is a surgical selection edit
    const isSurgicalEdit = script?.metadata?.selectionEdit?.applySurgically === true;
    
    if (isSurgicalEdit && script?.metadata?.selectionEdit) {
      const { editedBlocks, originalRange } = script.metadata.selectionEdit;
      
      try {
        // Mark that we're updating from props to prevent autosave loop
        isUpdatingFromPropsRef.current = true;
        
        // Defer surgical edit to avoid React lifecycle conflicts
        requestAnimationFrame(() => {
          // Apply edit surgically to the selection range
          const success = applyAIEditToSelection(
            editor,
            editedBlocks || [],
            originalRange || { from: 0, to: 0 }
          );
          
          if (success) {
            console.log('ScriptEditor: Applied surgical edit to selection');
            // Reset flag and trigger autosave after a brief delay
            setTimeout(() => {
              isUpdatingFromPropsRef.current = false;
              if (handleContentChangeRef.current) {
                handleContentChangeRef.current();
              }
            }, 100);
          } else {
            isUpdatingFromPropsRef.current = false;
          }
        });
      } catch (error) {
        console.error('ScriptEditor: Failed to apply surgical edit:', error);
        isUpdatingFromPropsRef.current = false;
      }
      return;
    }
    
    const metadataSource = (script?.metadata as any)?.source;
    if (metadataSource === 'editor') {
      return;
    }
    // Check if this is a new script from AI
    const isAIGenerated = script?.metadata?.workflow === 'create' || 
                          script?.metadata?.workflow === 'edit' ||
                          script?.metadata?.workflow === 'draft';
    
    if (!isAIGenerated) {
      return;
    }
    
    const scriptBlocksHash = JSON.stringify(script.blocks);
    const metadataHash = JSON.stringify(script.metadata);
    
    // Skip if already processed
    if (scriptBlocksHash === prevScriptBlocksRef.current && metadataHash === prevMetadataRef.current) {
      return;
    }
    
    prevScriptBlocksRef.current = scriptBlocksHash;
    prevMetadataRef.current = metadataHash;
    
    try {
      // Clear any pending autosave timer
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      
      // Defer content update to avoid React lifecycle conflicts
      requestAnimationFrame(() => {
        const tiptapContent = toTiptapJSON(script.blocks);
        const applied = applyContentToEditor(tiptapContent, 'ai-update');
        if (applied) {
          console.log('ScriptEditor: Updated with AI-generated content');
          createVersionSnapshot('AI edit');
        }
      });
    } catch (error) {
      console.error('ScriptEditor: Failed to apply AI-generated content:', error);
    }
  }, [script?.blocks, script?.metadata, editor, generatingScript, streamingTiptap, createVersionSnapshot]);

  // Poll for blocks during generation
  // CRITICAL: Must never overwrite user edits - user input is source of truth
  // CRITICAL: Polling must NEVER call setContent if user has local edits
  useEffect(() => {
    if (!sessionId || !editor || !generatingScript) return;
    
    // CRITICAL: Skip polling if user has unsaved changes, is actively typing, or recently typed
    const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
    const userRecentlyTyped = isUserTypingRef.current || timeSinceLastInput < USER_TYPING_TIMEOUT;
    if (hasUnsavedChanges || autosaveTimerRef.current || userRecentlyTyped || hasLocalEditsRef.current) {
      return;
    }
    
    const pollInterval = 2000;
    
    const interval = setInterval(async () => {
      // CRITICAL: Multiple guards to prevent overwriting user edits
      // 1. Check unsaved changes flag
      // 2. Check if autosave is pending (user just typed)
      // 3. Check if user is actively typing (within timeout window)
      // 4. Check if user has local edits (CRITICAL - never overwrite)
      // 5. Check if restoring version (never poll during restore)
      const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
      const userRecentlyTyped = isUserTypingRef.current || timeSinceLastInput < USER_TYPING_TIMEOUT;
      
      if (hasUnsavedChanges || autosaveTimerRef.current || userRecentlyTyped || hasLocalEditsRef.current || isRestoringVersionRef.current) {
        return;
      }
      
      try {
        const response = await fetch(`/api/services/thinkforge/script/blocks?sessionId=${sessionId}&scriptId=${encodeURIComponent(scriptResourceId)}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (response.ok) {
          const data = await response.json();
          let tiptapContent: TiptapJSON;
          
          // CRITICAL: Prefer richText (TipTap JSON) - this is runtime truth
          // Only convert ThinkForgeBlocks → TipTap if richText not available
          if (data.richText && isTiptapJSON(data.richText)) {
            tiptapContent = data.richText;
          } else if (data.blocks) {
            // Only convert at boundary (when fetching from backend)
            tiptapContent = toTiptapJSON(data.blocks);
          } else {
            return;
          }
          
          // CRITICAL: Compare with last loaded content to avoid overwriting user edits
          const contentHash = JSON.stringify(tiptapContent);
          if (contentHash === lastLoadedContentRef.current) {
            // No change, skip update
            return;
          }
          
          // CRITICAL: Final check - never overwrite if user has local edits
          if (hasLocalEditsRef.current || isRestoringVersionRef.current) {
            console.log('ScriptEditor: Skipping polling update, user has local edits or is restoring');
            return;
          }
          
          // CRITICAL: Double-check user isn't typing before applying remote update
          const finalCheck = Date.now() - lastUserInputTimeRef.current;
          if (isUserTypingRef.current || finalCheck < USER_TYPING_TIMEOUT) {
            return;
          }
          
          const applied = applyContentToEditor(tiptapContent, 'polling-update');
          if (applied) {
            console.log('ScriptEditor: Updated from polling');
            // Update last loaded content ref to prevent duplicate updates
            lastLoadedContentRef.current = contentHash;
          }
        }
      } catch (error) {
        console.error('ScriptEditor: Polling error:', error);
      }
    }, pollInterval);
    
    return () => clearInterval(interval);
  }, [sessionId, scriptResourceId, editor, generatingScript, hasUnsavedChanges]);

  // Integrate streaming blocks
  useEffect(() => {
    if (streamingBlocks.blocks.length > 0 && editor) {
      try {
        const tiptapContent = toTiptapJSON(streamingBlocks.blocks);
        const applied = applyContentToEditor(tiptapContent, 'streaming-update');
        if (applied) {
          console.log('ScriptEditor: Integrated streaming content');
        }
      } catch (error) {
        console.error("ScriptEditor: Failed to integrate streaming content:", error);
      }
    }
  }, [streamingBlocks.blocks, editor]);

  // Convert Tiptap content back to Script format
  // CRITICAL: TipTap JSON is the runtime truth
  // Only convert to ThinkForgeBlocks at boundaries (saving, exporting)
  const convertEditorToScript = useCallback(async (): Promise<Script> => {
    if (!editor) {
      return {
        title: script?.title || 'Untitled Script',
        version: (script as any)?.version ?? scriptVersionRef.current,
        blocks: [],
        content: '',
        body: '',
        sections: script?.sections || [],
        tips: script?.tips || [],
        duration: script?.duration,
        targetAudience: script?.targetAudience,
        tone: script?.tone,
        metadata: { ...(script?.metadata || {}), canonicalFormat: 'tiptap', source: 'editor' as any }
      } as any;
    }
    
    storeCursorPosition();
    
    // CRITICAL: Get Tiptap JSON directly from editor (runtime truth)
    // This is the canonical format - never convert ThinkForgeBlocks → TipTap during normal editing
    const tiptapJSON = editor.getJSON() as TiptapJSON;
    
    // CRITICAL: Convert to ThinkForgeBlocks ONLY at boundary (when saving/exporting)
    // This conversion happens here because we need to send blocks to backend
    // But richText (TipTap JSON) is also sent and should be preferred
    const thinkforgeBlocks = tiptapJSONToThinkForgeBlocks(tiptapJSON);
    const validated = validateThinkForgeBlocks(thinkforgeBlocks);

    return {
      title: script?.title || 'Untitled Script',
      version: (script as any)?.version ?? scriptVersionRef.current,
      blocks: validated, // ThinkForgeBlocks for backward compatibility
      richText: tiptapJSON, // TipTap JSON - this is the runtime truth
      content: '',
      body: '',
      sections: script?.sections || [],
      tips: script?.tips || [],
      duration: script?.duration,
      targetAudience: script?.targetAudience,
      tone: script?.tone,
      metadata: { ...(script?.metadata || {}), canonicalFormat: 'tiptap', source: 'editor' as any }
    } as any;
  }, [editor, script, storeCursorPosition]);

  // Sync last version hash when the version manager updates its current version
  useEffect(() => {
    if (!editor || !currentVersionId) return;
    
    try {
      const blocks = getVersionBlocks(currentVersionId);
      if (blocks) {
        const tiptapContent = toTiptapJSON(blocks);
        lastVersionHashRef.current = JSON.stringify(tiptapContent);
      }
    } catch (error) {
      console.error('ScriptEditor: Failed to sync current version hash', error);
    }
  }, [editor, currentVersionId, getVersionBlocks]);

  // Handle content changes with debounced autosave
  // CRITICAL: This marks user input as the source of truth
  // CRITICAL: Autosave NEVER calls setContent - only reads current content and sends to backend
  const handleContentChange = useCallback(() => {
    if (isUpdatingFromPropsRef.current || isProgrammaticUpdateRef.current || generatingScript || autosavePausedRef.current) {
      return;
    }

    // Mark that user is actively typing - this prevents remote updates from overwriting
    isUserTypingRef.current = true;
    lastUserInputTimeRef.current = Date.now();
    hasLocalEditsRef.current = true; // Mark that user has local edits
    setHasUnsavedChanges(true);
    
    // Clear typing flag after timeout (user stopped typing)
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        if (!editor) return;
        if (autosavePausedRef.current) return;
        if (autosaveInFlightRef.current) return;

        const now = Date.now();
        if (now - lastAutosaveAtRef.current < MIN_AUTOSAVE_INTERVAL_MS) {
          return;
        }

        const currentJSON = editor.getJSON() as TiptapJSON;
        const currentHash = JSON.stringify(currentJSON);

        if (currentHash === lastAutosaveHashRef.current) {
          return;
        }

        autosaveInFlightRef.current = true;

        // CRITICAL: Autosave only reads current editor content (TipTap JSON)
        // Converts to ThinkForgeBlocks ONLY for backend storage
        // NEVER calls setContent - user edits are the source of truth
        const updatedScript = await convertEditorToScript();
        
        // CRITICAL: Update ref with CURRENT editor state to prevent polling overwrite
        // This ensures user edits are preserved even if remote data arrives
        if (editor) {
          const tiptapJSON = editor.getJSON();
          lastLoadedContentRef.current = JSON.stringify(tiptapJSON);
        }
        
        // Send to backend (converting TipTap JSON → ThinkForgeBlocks only for storage)
        if (sessionId && updatedScript.blocks) {
          try {
            const response = await fetch(`/api/commands`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'ReplaceDocument',
                sessionId: sessionId,
                baseVersion: scriptVersionRef.current,
                source: 'user',
                payload: {
                  scriptId: scriptResourceId,
                  richText: (updatedScript as any).richText, // Send TipTap JSON as richText
                  content: updatedScript.content,
                  title: updatedScript.title
                }
              }),
            });
            
            if (response.ok) {
              const data = await response.json();
              if (data?.script && typeof data.script.version === 'number') {
                scriptVersionRef.current = data.script.version;
                (updatedScript as any).version = data.script.version;
              }
              setHasUnsavedChanges(false);
              setJustSaved(true);
              setTimeout(() => setJustSaved(false), 2000);
              // Mark that user is no longer actively typing after successful save
              isUserTypingRef.current = false;
              lastAutosaveHashRef.current = currentHash;
              lastAutosaveAtRef.current = Date.now();
            } else if (response.status === 409) {
              try {
                const data = await response.json();
                if (typeof data?.currentVersion === 'number') {
                  scriptVersionRef.current = data.currentVersion;
                }
              } catch {}
              // Keep unsaved changes; back off to avoid tight retry loop
              lastAutosaveAtRef.current = Date.now();
            } else {
              console.error('Failed to save to backend');
            }
          } catch (error) {
            console.error('Error saving to backend:', error);
          }
        }
        
        // Notify parent (but don't trigger setContent - parent should not rehydrate)
        onEditScript(updatedScript);
        autosaveTimerRef.current = null;
      } catch (error) {
        console.error('Autosave failed:', error);
      } finally {
        autosaveInFlightRef.current = false;
      }
    }, 1200);
  }, [convertEditorToScript, onEditScript, sessionId, scriptResourceId, editor, createVersionSnapshot]);

  // Pause autosave when tab/window is not active to avoid stale saves on return
  useEffect(() => {
    const handleVisibility = () => {
      const hidden = typeof document !== 'undefined' && document.hidden;
      autosavePausedRef.current = !!hidden;
      if (hidden && autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
    const handleBlur = () => {
      autosavePausedRef.current = true;
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
    const handleFocus = () => {
      autosavePausedRef.current = false;
    };

    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('blur', handleBlur);
      window.addEventListener('focus', handleFocus);
    }

    return () => {
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('blur', handleBlur);
        window.removeEventListener('focus', handleFocus);
      }
    };
  }, []);

  // Update refs after callbacks are defined
  useEffect(() => {
    handleContentChangeRef.current = handleContentChange;
  }, [handleContentChange]);

  // Handle selection changes
  const handleSelectionChange = useCallback(() => {
    if (selectionTimerRef.current) {
      clearTimeout(selectionTimerRef.current);
    }
    
    selectionTimerRef.current = setTimeout(() => {
      try {
        if (!editor) return;
        
        if (!isSelectionEditable(editor)) {
          setSelectedText('');
          setSelectionRange(null);
          setSelectionPos(null);
          return;
        }

        const { from, to } = editor.state.selection;
        const txt = editor.state.doc.textBetween(from, to, ' ');
        if (!txt || txt.trim().length === 0) {
          setSelectedText('');
          setSelectionRange(null);
          setSelectionPos(null);
          return;
        }
        const selection = serializeSelectionToThinkForgeBlocks(editor);
        setSelectedText(txt);
        setSelectionRange(selection.range);

        if (isSelectingRef.current) {
          setSelectionPos(null);
          return;
        }
        
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
    }, 50);
  }, [editor]);
  // Track pointer/keyboard selection to avoid floating button stealing focus
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const handleMouseDown = () => {
      isSelectingRef.current = true;
      setIsSelecting(true);
    };
    const handleMouseUp = () => {
      isSelectingRef.current = false;
      setIsSelecting(false);
      if (handleSelectionChangeRef.current) {
        handleSelectionChangeRef.current();
      }
    };
    const handleKeyUp = () => {
      if (handleSelectionChangeRef.current) {
        handleSelectionChangeRef.current();
      }
    };
    dom.addEventListener('mousedown', handleMouseDown);
    dom.addEventListener('mouseup', handleMouseUp);
    dom.addEventListener('keyup', handleKeyUp);
    return () => {
      dom.removeEventListener('mousedown', handleMouseDown);
      dom.removeEventListener('mouseup', handleMouseUp);
      dom.removeEventListener('keyup', handleKeyUp);
    };
  }, [editor]);

  // Update ref after handleSelectionChange is defined
  useEffect(() => {
    handleSelectionChangeRef.current = handleSelectionChange;
  }, [handleSelectionChange]);

  // Allow external callers (chat panel) to clear the current selection highlight
  useEffect(() => {
    const clearSelection = () => {
      setSelectedText('');
      setSelectionRange(null);
      setSelectionPos(null);
    };
    window.addEventListener('tf-clear-selection', clearSelection);
    return () => window.removeEventListener('tf-clear-selection', clearSelection);
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

  // Copy to clipboard - copy plain text, not JSON
  const handleCopy = async () => {
    try {
      if (!editor) return;
      const tiptapJSON = editor.getJSON() as TiptapJSON;
      // Extract plain text from TipTap JSON
      const plainText = extractPlainText(tiptapJSON);
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleExportError = (label: string, error: unknown) => {
    console.error(`Failed to export ${label}:`, error);
    alert(`Failed to export ${label}. Please try again.`);
  };

  const handleExportPDF = async () => {
    try {
      if (!editor) return;
      const tiptapJSON = editor.getJSON() as TiptapJSON;
      const title = script?.title || 'Script';
      const html = buildScriptHtmlDocument(tiptapJSON, title);
      await printHtmlDocument(html);
    } catch (error) {
      handleExportError('PDF', error);
    }
  };

  const handleExportHTML = () => {
    try {
      if (!editor) return;
      const tiptapJSON = editor.getJSON() as TiptapJSON;
      const title = script?.title || 'Script';
      const html = buildScriptHtmlDocument(tiptapJSON, title);
      const filename = `${title.replace(/[^a-z0-9-_]+/gi, '_')}.html`;
      downloadBlob(filename, html, 'text/html');
    } catch (error) {
      handleExportError('HTML', error);
    }
  };

  const handleExportTXT = () => {
    try {
      if (!editor) return;
      const tiptapJSON = editor.getJSON() as TiptapJSON;
      const title = script?.title || 'Script';
      const text = buildScriptText(tiptapJSON, title);
      const filename = `${title.replace(/[^a-z0-9-_]+/gi, '_')}.txt`;
      downloadBlob(filename, text, 'text/plain');
    } catch (error) {
      handleExportError('TXT', error);
    }
  };

  // Handle import

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-4 relative max-w-5xl mx-auto"
    >
      {/* Header - All Tools Consolidated (Toolbar + View Toggle + Actions) */}
      <div className="flex items-center justify-between gap-4 px-2">
        {/* Left section: Tone indicator + New Script + History + Toolbar */}
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${getToneColorClass(selectedIdea.tone)}`} />
          {generatingScript && !script && (
            <span className="text-sm text-zinc-400">Generating...</span>
          )}
          
          {/* New Script Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => {
                    if (onNewScript) {
                      // Clear editor immediately before calling onNewScript
                      if (editor) {
                        try {
                          isUpdatingFromPropsRef.current = true;
                          safeSetContent(DEFAULT_EMPTY_DOCUMENT as TiptapJSON, 'new-script-button');
                          lastLoadedContentRef.current = JSON.stringify(DEFAULT_EMPTY_DOCUMENT);
                          hasLocalEditsRef.current = false;
                          setHasUnsavedChanges(false);
                          isUpdatingFromPropsRef.current = false;
                        } catch (error) {
                          console.error('Failed to clear editor:', error);
                          isUpdatingFromPropsRef.current = false;
                        }
                      }
                      onNewScript();
                    }
                  }}
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-8 w-8 p-0"
                  disabled={!onNewScript || !sessionId}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>New Script</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* History/Version Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => {
                    if (sessionId) {
                      setShowBranchEditor(true);
                    } else {
                      console.warn('Cannot open history: no sessionId');
                    }
                  }}
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-8 w-8 p-0"
                  disabled={!sessionId}
                >
                  <History className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Script History</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Format Toolbar - Now inline with other tools */}
          {!isPreviewMode && (!generatingScript || script) && (
            <div className="border-l border-zinc-700 pl-3 ml-1">
              <FormatToolbar 
                editor={editor} 
                disabled={generatingScript && !script}
              />
            </div>
          )}
        </div>
        
        {/* Center section: Edit Mode Toggle */}
        <div className="flex items-center gap-2 bg-zinc-900/50 rounded-lg px-3 py-1.5 border border-zinc-800">
          <Eye className={`h-4 w-4 ${isPreviewMode ? 'text-red-400' : 'text-zinc-500'}`} />
          <Switch
            checked={!isPreviewMode}
            onCheckedChange={(checked) => setIsPreviewMode(!checked)}
            disabled={generatingScript && !script}
            className="data-[state=checked]:bg-red-600"
          />
          <Edit className={`h-4 w-4 ${!isPreviewMode ? 'text-red-400' : 'text-zinc-500'}`} />
        </div>

        {/* Right section: Actions + Save Status */}
        <div className="flex items-center gap-2">
          {/* Quick Actions */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-8 w-8 p-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{copied ? 'Copied!' : 'Copy to Clipboard'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-8 w-8 p-0"
                disabled={generatingScript && !script}
              >
                <Download className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-700">
              <DropdownMenuItem
                onClick={handleExportPDF}
                className="text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                disabled={generatingScript && !script}
              >
                Export PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportHTML}
                className="text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                disabled={generatingScript && !script}
              >
                Export HTML
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportTXT}
                className="text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                disabled={generatingScript && !script}
              >
                Export TXT
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* More Actions Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-8 w-8 p-0"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-700">
              <DropdownMenuItem
                onClick={() => {
                  if (sessionId) {
                    setShowBranchEditor(true);
                  } else {
                    console.warn('Cannot open history: no sessionId');
                  }
                }}
                className="text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                disabled={!sessionId}
              >
                <History className="h-4 w-4 mr-2" />
                Version History
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Save Status Indicator */}
          <div className="flex items-center pl-2 border-l border-zinc-700 ml-1">
            {isSaving ? (
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Saving</span>
              </div>
            ) : justSaved ? (
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <Check className="h-3.5 w-3.5" />
                <span>Saved</span>
              </div>
            ) : hasUnsavedChanges ? (
              <div className="text-xs text-amber-400">Unsaved</div>
            ) : (
              <div className="text-xs text-zinc-500">Saved</div>
            )}
          </div>
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
                    blocks={previewBlocks}
                  />
                </div>
              ) : (
                <div className="tiptap-editor-dark">
                  <EditorContent editor={editor} />
                </div>
              )}
              
              {/* Selection floating button */}
              {selectedText && selectedText.trim().length > 0 && selectionPos && !isSelecting && (
                <div
                  className="absolute z-50 transition-all duration-200 animate-in fade-in zoom-in-95"
                  style={{ 
                    top: selectionPos.top, 
                    left: selectionPos.left, 
                    transform: 'translateX(-50%)' 
                  }}
                >
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      try {
                        if (onEditSelection && editor) {
                          const selection = serializeSelectionToThinkForgeBlocks(editor);
                          if (selection.range && selection.blocks.length > 0) {
                            onEditSelection(selectedText, selection.range, selection.blocks);
                            return;
                          }
                        } else if (typeof window !== 'undefined') {
                          // Fallback for backward compatibility
                          window.dispatchEvent(
                            new CustomEvent('tf-selection-to-chat', { 
                              detail: { text: selectedText } 
                            } as any)
                          );
                        }
                      } catch {}
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-900 text-zinc-200 shadow-lg border border-zinc-700/50 hover:bg-zinc-800 hover:text-white hover:border-zinc-600 transition-all group backdrop-blur-md"
                    aria-label="Edit selection in Chat"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-indigo-400 group-hover:text-indigo-300 transition-colors" /> 
                    <span>Edit in Chat</span>
                  </button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}


      {/* Script Tabs Panel Dialog */}
      <Dialog open={showBranchEditor} onOpenChange={setShowBranchEditor}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-4xl h-[600px] p-0">
          <ScriptHistoryPanel
            sessionId={sessionId || null}
            activeScriptId={scriptResourceId}
            onSwitchScript={(id) => {
              if (onSwitchScript) {
                onSwitchScript(id);
              }
              setShowBranchEditor(false);
            }}
            onNewScript={onNewScript}
            onClose={() => setShowBranchEditor(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Tiptap Editor Styles */}
      <style jsx global>{`
        .tiptap-editor-dark {
          background: transparent !important;
          border-radius: 8px;
        }
        .tiptap-editor-dark .ProseMirror {
          background: transparent !important;
          color: #f4f4f5 !important;
          padding: 2rem !important;
          font-size: 16px !important;
          line-height: 1.6 !important;
          min-height: 600px !important;
          outline: none !important;
        }
        .tiptap-editor-dark .ProseMirror:focus {
          outline: none !important;
        }
        .tiptap-editor-dark .ProseMirror > * + * {
          margin-top: 0.75em;
        }
        .tiptap-editor-dark h1 {
          color: #f4f4f5 !important;
          font-size: 2rem !important;
          font-weight: 700 !important;
          margin-bottom: 1rem !important;
        }
        .tiptap-editor-dark h2 {
          color: #f4f4f5 !important;
          font-size: 1.5rem !important;
          font-weight: 600 !important;
          margin-top: 1.5rem !important;
          margin-bottom: 0.75rem !important;
        }
        .tiptap-editor-dark h3 {
          color: #f4f4f5 !important;
          font-size: 1.25rem !important;
          font-weight: 600 !important;
          margin-top: 1.25rem !important;
          margin-bottom: 0.5rem !important;
        }
        .tiptap-editor-dark p {
          color: #f4f4f5 !important;
          margin-bottom: 0.75rem !important;
        }
        .tiptap-editor-dark ul, 
        .tiptap-editor-dark ol {
          color: #f4f4f5 !important;
          margin-bottom: 0.75rem !important;
          padding-left: 1.5rem !important;
        }
        .tiptap-editor-dark li {
          color: #f4f4f5 !important;
          margin-bottom: 0.25rem !important;
        }
        .tiptap-editor-dark blockquote {
          border-left: 3px solid #3f3f46 !important;
          padding-left: 1rem !important;
          margin-left: 0 !important;
          color: rgba(244, 244, 245, 0.8) !important;
          font-style: italic !important;
        }
        .tiptap-editor-dark pre {
          background: rgba(0, 0, 0, 0.5) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 0.5rem !important;
          padding: 0.75rem 1rem !important;
          overflow-x: auto !important;
        }
        .tiptap-editor-dark code {
          background: rgba(0, 0, 0, 0.4) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 0.25rem !important;
          padding: 0.125rem 0.25rem !important;
          font-family: ui-monospace, monospace !important;
          font-size: 0.875em !important;
          color: #f4f4f5 !important;
        }
        .tiptap-editor-dark pre code {
          background: transparent !important;
          border: none !important;
          padding: 0 !important;
          font-size: 0.75rem !important;
        }
        .tiptap-editor-dark hr {
          border: none !important;
          border-top: 1px solid #3f3f46 !important;
          margin: 1.5rem 0 !important;
        }
        .tiptap-editor-dark a {
          color: #ef4444 !important;
          text-decoration: underline !important;
        }
        .tiptap-editor-dark a:hover {
          color: #f87171 !important;
        }
        .tiptap-editor-dark strong {
          font-weight: 600 !important;
        }
        .tiptap-editor-dark em {
          font-style: italic !important;
        }
        .tiptap-editor-dark u {
          text-decoration: underline !important;
        }
        .tiptap-editor-dark s {
          text-decoration: line-through !important;
        }
        .tiptap-editor-dark mark {
          background-color: rgba(250, 204, 21, 0.4) !important;
          padding: 0.125rem 0.25rem !important;
          border-radius: 0.125rem !important;
        }
        
        /* Custom ThinkForge blocks */
        .tiptap-editor-dark .thinkforge-action-block {
          background: rgba(59, 130, 246, 0.1) !important;
          border-left: 3px solid #3b82f6 !important;
          padding: 0.75rem 1rem !important;
          margin: 0.75rem 0 !important;
          border-radius: 0 0.375rem 0.375rem 0 !important;
        }
        .tiptap-editor-dark .thinkforge-why-block {
          background: rgba(168, 85, 247, 0.1) !important;
          border-left: 3px solid #a855f7 !important;
          padding: 0.75rem 1rem !important;
          margin: 0.75rem 0 !important;
          border-radius: 0 0.375rem 0.375rem 0 !important;
          font-style: italic !important;
        }
        .tiptap-editor-dark .thinkforge-example-block {
          background: rgba(34, 197, 94, 0.1) !important;
          border-left: 3px solid #22c55e !important;
          padding: 0.75rem 1rem !important;
          margin: 0.75rem 0 !important;
          border-radius: 0 0.375rem 0.375rem 0 !important;
        }
        
        /* Placeholder styling */
        .tiptap-editor-dark .is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #71717a !important;
          pointer-events: none;
          height: 0;
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
