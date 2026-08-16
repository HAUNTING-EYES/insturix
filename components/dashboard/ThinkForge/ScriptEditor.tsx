'use client';

import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';

// Import Tiptap editor styles
import '@/styles/thinkforge-editor.css';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Download,
  Copy,
  Check,
  Loader2,
  Sparkles,
  FileText,
  GitBranch,
  Plus,
  History,
  MoreVertical,
  FileDown,
  Save,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

// Import LiveDocumentRenderer for real-time streaming render
import LiveDocumentRenderer from "./LiveDocumentRenderer";

// Import Tiptap mappers and validation
import { thinkForgeBlocksToTiptapJSON } from "@/lib/thinkforge/mappers/thinkforge-to-tiptap";
import { tiptapJSONToThinkForgeBlocks } from "@/lib/thinkforge/mappers/tiptap-to-thinkforge";
import { validateThinkForgeBlocks } from "@/lib/thinkforge/schemas/thinkforge-block";
import { validateTiptapJSON, isTiptapJSON, extractPlainText } from "@/lib/thinkforge/schemas/tiptap-validation";
import { buildScriptHtmlDocument, buildScriptText, downloadBlob, printHtmlDocument } from "@/lib/thinkforge/export/export-utils";
import type { TiptapJSON } from "@/lib/thinkforge/schemas/tiptap-schema";
import { useVersionManager } from "@/app/dashboard/thinkforge/hooks/useVersionManager";
import { logShadowEvent } from "@/lib/thinkforge/services/shadow-logger";
import {
  createThinkForgeDocumentKey,
  matchesThinkForgeDocumentIdentity,
  stampThinkForgeDocumentIdentity,
  type ThinkForgeDocumentIdentity,
} from '@/lib/thinkforge/client-document-identity';
import {
  acceptThinkForgeServerDocument,
  clearThinkForgeConflictDraft,
  enqueueThinkForgeDocumentSave,
  overwriteThinkForgeDocumentAfterConflict,
  preserveThinkForgeConflictDraft,
  readThinkForgeConflictDraft,
  restoreThinkForgeDocumentConflict,
  type ThinkForgeDocumentSaveRequest,
} from '@/lib/thinkforge/client-document-save-queue';

// Import FormatToolbar
import { FormatToolbar } from "./FormatToolbar";

// Import ScriptHistoryPanel
import { ScriptHistoryPanel } from "./ScriptHistoryPanel";

// Import streaming Tiptap hook
import { useStreamingTiptap } from "@/lib/thinkforge/hooks/useStreamingTiptap";

// Import Markdown parser
import { marked } from 'marked';

// Import selection editing utilities
import { serializeSelectionToThinkForgeBlocks, applyAIEditToSelection, isSelectionEditable } from "@/lib/thinkforge/utils/selection-editing";

interface PendingDocumentSave {
  documentKey: string;
  request: ThinkForgeDocumentSaveRequest;
  updatedScript: Script;
}

interface DocumentSaveConflict {
  documentKey: string;
  currentVersion: number;
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
  onEditScript: (updatedScript: Script) => void;
  generatingScript?: boolean;
  isSaving?: boolean;
  onImportScript?: (data: any) => Promise<{ ok: boolean; applied?: any; error?: string }>;
  onNewScript?: () => Promise<string | null>;
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
  onEditScript,
  generatingScript = false,
  isSaving = false,
  onImportScript,
  onNewScript,
  onSwitchScript,
  onTokenStream, // Optional callback to receive streaming tokens
  onGetSelection, // Optional callback setter for getting current selection
  onEditSelection,
}: ScriptEditorProps) {
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionRange, setSelectionRange] = useState<{ from: number; to: number } | null>(null);
  const [selectionPos, setSelectionPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const isSelectingRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [liveContent, setLiveContent] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const prevIsSavingRef = useRef<boolean>(false);
  const [showBranchEditor, setShowBranchEditor] = useState(false);
  const loadedTitleRef = useRef<string | null>(null);
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUpdatingFromPropsRef = useRef(false);
  const lastLoadedContentRef = useRef<string>(''); // Track last loaded content to avoid unnecessary reloads
  const lastAutosaveHashRef = useRef<string>('');
  const autosavePausedRef = useRef(false);
  const scriptVersionRef = useRef<number>(0);
  const loadAbortControllerRef = useRef<AbortController | null>(null);
  const pendingDocumentSaveRef = useRef<PendingDocumentSave | null>(null);
  const pendingConflictSaveRef = useRef<PendingDocumentSave | null>(null);
  const flushPendingDocumentSaveRef = useRef<((documentKey?: string) => Promise<void>) | null>(null);
  const [documentSaveConflict, setDocumentSaveConflict] = useState<DocumentSaveConflict | null>(null);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);
  const [conflictResolutionError, setConflictResolutionError] = useState<string | null>(null);
  const prevScriptBlocksRef = useRef<string>('');
  const prevMetadataRef = useRef<string>('');
  const isSwitchingScriptRef = useRef(false);

  // CRITICAL: Pending blocks queue for deterministic hydration
  // Stores blocks that arrived before editor was ready
  const pendingBlocksRef = useRef<any[] | null>(null);

  // CRITICAL: Track user typing state to prevent remote updates from overwriting user input
  const isUserTypingRef = useRef(false);
  const lastUserInputTimeRef = useRef<number>(0);
  const USER_TYPING_TIMEOUT = 2000; // Consider user stopped typing after 2s of inactivity

  // CRITICAL: Guards for Branch Editor restore and local edits
  const isRestoringVersionRef = useRef(false); // Only true when restoring a version
  const hasLocalEditsRef = useRef(false); // True if user has made local edits

  // Refs for callbacks to avoid initialization order issues
  const handleContentChangeRef = useRef<(() => void) | null>(null);
  const handleSelectionChangeRef = useRef<(() => void) | null>(null);

  // Shadow logger: track character count to detect significant deletions
  const prevCharCountRef = useRef<number>(0);
  const DELETION_THRESHOLD = 30;

  // Observer pipeline: debounce typing lulls for background fact extraction
  const observerTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastObservedTextRef = useRef<string>('');
  const OBSERVER_LULL_MS = 5000; // Increased to 5s for cost optimization
  const OBSERVER_MIN_CHARS = 100; // Only analyze larger blocks of text

  // Script identifier for multi-script tabs
  const scriptResourceId = useMemo(() => {
    return scriptId || 'default';
  }, [scriptId]);

  // Effective title: prefer loaded API title > prop title > fallback
  const activeIdentity = useMemo<ThinkForgeDocumentIdentity | null>(() => (
    sessionId
      ? { sessionId, scriptId: scriptResourceId }
      : null
  ), [sessionId, scriptResourceId]);
  const activeDocumentKey = useMemo(
    () => activeIdentity ? createThinkForgeDocumentKey(activeIdentity) : null,
    [activeIdentity],
  );
  const activeDocumentKeyRef = useRef<string | null>(activeDocumentKey);
  const documentEpochRef = useRef(0);

  const getEffectiveTitle = useCallback(() => {
    return loadedTitleRef.current || script?.title || 'Untitled Script';
  }, [script?.title]);

  const versionManager = useVersionManager(sessionId || null, scriptResourceId);
  const {
    createVersion,
    getVersionBlocks,
    currentVersionId,
    isLoading: versionManagerLoading,
    error: versionManagerError,
  } = versionManager;
  const lastVersionHashRef = useRef<string | null>(null);

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
        if (isUpdatingFromPropsRef.current) {
          prevCharCountRef.current = editor.state.doc.textContent.length;
          return;
        }
        isUserTypingRef.current = true;
        lastUserInputTimeRef.current = Date.now();
        setTimeout(() => {
          isUserTypingRef.current = false;
        }, USER_TYPING_TIMEOUT);

        // Shadow Logger: detect significant content deletion
        const currentLen = editor.state.doc.textContent.length;
        const delta = prevCharCountRef.current - currentLen;
        if (delta >= DELETION_THRESHOLD && sessionId) {
          logShadowEvent({
            projectId: sessionId,
            sessionId,
            type: 'content_deleted',
            payload: { charsDeleted: delta },
          });
        }
        prevCharCountRef.current = currentLen;

        // Observer pipeline: schedule background extraction on typing lull
        if (sessionId && currentLen >= OBSERVER_MIN_CHARS) {
          if (observerTimerRef.current) clearTimeout(observerTimerRef.current);
          observerTimerRef.current = setTimeout(() => {
            const fullText = editor.state.doc.textContent;
            const tail = fullText.slice(-500);
            if (tail !== lastObservedTextRef.current && tail.length >= 20) {
              lastObservedTextRef.current = tail;
              fetch('/api/services/thinkforge/events/observe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: tail, sessionId, source: 'editor' }),
              }).catch(() => { });
            }
          }, OBSERVER_LULL_MS);
        }

        setHasUnsavedChanges(true);
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
      onTokenStream((tokens: string) => {
        if (generatingScript) {
          // Accumulate raw markdown ONLY for the LiveDocumentRenderer overlay.
          // We intentionally do NOT feed raw tokens to Tiptap here because
          // useStreamingTiptap.parseTextToBlocks strips inline formatting
          // (bold, italic, tables) and inserts them as raw plain text.
          // Tiptap will sync cleanly from the API response once generation
          // is complete via the existing polling / ai-update hydration path.
          setLiveContent((prev) => prev + tokens);
        }
      });
    }
  }, [onTokenStream, generatingScript]);

  // CRITICAL: Hydrate pending blocks when editor becomes ready
  // This ensures blocks that arrived before editor initialization are not lost
  useEffect(() => {
    if (!editor) return;

    // Check if there are pending blocks waiting for hydration
    if (pendingBlocksRef.current && pendingBlocksRef.current.length > 0) {
      try {
        const tiptapContent = toTiptapJSON(pendingBlocksRef.current);
        const contentHash = JSON.stringify(tiptapContent);

        // Only apply if not already loaded
        if (contentHash !== lastLoadedContentRef.current) {
          isUpdatingFromPropsRef.current = true;
          editor.commands.setContent(tiptapContent as any);
          isUpdatingFromPropsRef.current = false;
          lastLoadedContentRef.current = contentHash;
        }
      } catch (error) {
        console.error('[Script] Pending hydration failed:', error);
      } finally {
        // Clear pending blocks regardless of success
        pendingBlocksRef.current = null;
      }
    }
  }, [editor]); // Run when editor becomes available

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
      setLiveContent('');
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

  // Sync live renderer content: after generation ends, update liveContent with
  // the final script.content if available.
  useEffect(() => {
    if (!generatingScript && script?.content) {
      setLiveContent(script.content);
    }
  }, [generatingScript, script?.content]);

  // Sync loadedTitleRef from prop when a real title arrives
  useEffect(() => {
    if (script?.title && script.title !== 'Untitled Script') {
      loadedTitleRef.current = script.title;
    }
  }, [script?.title]);

  // Lock / unlock editor based on AI generation state.
  // This prevents user input from colliding with streaming tokens.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!generatingScript);
  }, [editor, generatingScript]);



  // Safe content update function
  // CRITICAL: Only call setContent when restoring a version or initial load
  // Autosave and polling must NEVER call setContent
  const safeSetContent = useCallback(
    (content: TiptapJSON | string, reason: string) => {
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
      const isConflictRecovery = reason === 'conflict-recovery';
      const isNewScript = reason === 'new-script-button' || reason === 'clear-editor-new-script' || reason === 'clear-editor-new-session' || reason === 'document-switch';

      // Block setContent if:
      // - Not initial load, not restore, not new script, and has local edits
      // - Not initial load, not restore, not new script, and user is typing
      if (!isInitialLoad && !isVersionRestore && !isConflictRecovery && !isNewScript) {
        if (hasLocalEditsRef.current && !isAIUpdate) {
          return;
        }
        if (isUserTypingRef.current && !isAIUpdate) {
          return;
        }
      }

      try {
        isUpdatingFromPropsRef.current = true;
        editor.commands.setContent(content as any);
        isUpdatingFromPropsRef.current = false;

      } catch (error) {
        console.error(`ScriptEditor: setContent failed (${reason})`, error);
        isUpdatingFromPropsRef.current = false;

        // Fallback to empty document
        try {
          editor.commands.setContent(DEFAULT_EMPTY_DOCUMENT as any);
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
    (content: TiptapJSON | string, reason: string) => {
      if (!editor) return false;

      const isInitialLoad = reason === 'initial-load-api' || reason === 'initial-load-prop';
      const isVersionRestore = reason === 'version-restore' || isRestoringVersionRef.current;
      const isAIUpdate = reason === 'ai-update';  // AI-generated content should be allowed

      // CRITICAL: Never apply remote updates if user is actively typing (except initial load/restore/AI)
      const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
      const userRecentlyTyped = isUserTypingRef.current || timeSinceLastInput < USER_TYPING_TIMEOUT;

      if (userRecentlyTyped && !isInitialLoad && !isVersionRestore && !isAIUpdate) {
        return false;
      }

      // CRITICAL: Never overwrite if user has unsaved changes (unless initial load/restore/AI)
      // AI updates are allowed because they're the result of user's explicit request
      if (hasUnsavedChanges && !isInitialLoad && !isVersionRestore && !isAIUpdate) {
        return false;
      }

      // CRITICAL: Never overwrite if user has local edits (unless initial load/restore/AI)
      if (hasLocalEditsRef.current && !isInitialLoad && !isVersionRestore && !isAIUpdate) {
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
      // Clear flags after AI update to reflect that content is now synced
      if (isAIUpdate) {
        setHasUnsavedChanges(false);
        hasLocalEditsRef.current = false;
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

  // Sync hydrated content into parent state (no backend save)
  const notifyHydratedScript = useCallback((tiptapContent: TiptapJSON) => {
    if (!onEditScript || !activeIdentity) return;
    try {
      const blocks = tiptapJSONToThinkForgeBlocks(tiptapContent);
      const validated = validateThinkForgeBlocks(blocks);
      const hydratedScript = stampThinkForgeDocumentIdentity({
        title: getEffectiveTitle(),
        version: (script as any)?.version ?? scriptVersionRef.current,
        blocks: validated,
        richText: tiptapContent,
        content: '',
        body: '',
        sections: script?.sections || [],
        tips: script?.tips || [],
        duration: script?.duration,
        targetAudience: script?.targetAudience,
        tone: script?.tone,
        metadata: { ...(script?.metadata || {}), canonicalFormat: 'tiptap' as any }
      }, activeIdentity);
      onEditScript(hydratedScript as any);
    } catch (error) {
      console.error('ScriptEditor: Failed to sync hydrated script', error);
    }
  }, [onEditScript, script, getEffectiveTitle, activeIdentity]);

  // Load blocks from API or script.blocks prop - only on initial mount or scriptId change
  const initialLoadDoneRef = useRef(false);

  // Document identity owns reset, load, and save cancellation. This effect must
  // run before the loader below whenever the active session/document changes.
  useLayoutEffect(() => {
    const previousDocumentKey = activeDocumentKeyRef.current;
    if (previousDocumentKey && previousDocumentKey !== activeDocumentKey) {
      void flushPendingDocumentSaveRef.current?.(previousDocumentKey);
    }
    activeDocumentKeyRef.current = activeDocumentKey;
    documentEpochRef.current += 1;
    loadAbortControllerRef.current?.abort();
    loadAbortControllerRef.current = null;

    isSwitchingScriptRef.current = true;
    initialLoadDoneRef.current = false;
    lastLoadedContentRef.current = '';
    lastAutosaveHashRef.current = '';
    prevScriptBlocksRef.current = '';
    prevMetadataRef.current = '';
    pendingBlocksRef.current = null;
    loadedTitleRef.current = null;
    scriptVersionRef.current = 0;
    setHasUnsavedChanges(false);
    isUserTypingRef.current = false;
    lastUserInputTimeRef.current = 0;
    hasLocalEditsRef.current = false;
    isRestoringVersionRef.current = false;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (editor) {
      safeSetContent(DEFAULT_EMPTY_DOCUMENT as TiptapJSON, 'document-switch');
      lastLoadedContentRef.current = JSON.stringify(DEFAULT_EMPTY_DOCUMENT);
    }
  }, [activeDocumentKey, editor, safeSetContent]);

  useEffect(() => {
    if (!editor || !activeIdentity || !activeDocumentKey || initialLoadDoneRef.current) return;

    try {
      const recovered = readThinkForgeConflictDraft(activeIdentity);
      if (!recovered) return;

      restoreThinkForgeDocumentConflict(activeIdentity, recovered.currentVersion);
      const tiptapContent = validateTiptapJSON(recovered.request.richText);
      const blocks = validateThinkForgeBlocks(tiptapJSONToThinkForgeBlocks(tiptapContent));
      const matchingScript = script && matchesThinkForgeDocumentIdentity(script, activeIdentity)
        ? script
        : null;
      const recoveredScript = stampThinkForgeDocumentIdentity({
        title: recovered.request.title,
        version: recovered.currentVersion,
        content: recovered.request.content,
        blocks,
        richText: tiptapContent,
        metadata: {
          ...(matchingScript?.metadata || {}),
          canonicalFormat: 'tiptap',
          source: 'editor' as any,
        },
        documentType: matchingScript?.documentType,
        contentContract: (matchingScript as any)?.contentContract,
      }, activeIdentity) as unknown as Script;
      const pending: PendingDocumentSave = {
        documentKey: activeDocumentKey,
        request: recovered.request,
        updatedScript: recoveredScript,
      };

      safeSetContent(tiptapContent, 'conflict-recovery');
      initialLoadDoneRef.current = true;
      isSwitchingScriptRef.current = false;
      scriptVersionRef.current = recovered.currentVersion;
      loadedTitleRef.current = recovered.request.title || null;
      lastLoadedContentRef.current = '';
      lastAutosaveHashRef.current = '';
      pendingDocumentSaveRef.current = null;
      pendingConflictSaveRef.current = pending;
      setDocumentSaveConflict({
        documentKey: activeDocumentKey,
        currentVersion: recovered.currentVersion,
      });
      setConflictResolutionError(null);
      setHasUnsavedChanges(true);
      hasLocalEditsRef.current = true;
      isUserTypingRef.current = false;
      onEditScript(recoveredScript);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Stored conflict draft recovery failed.';
      console.error('ScriptEditor: Conflict draft recovery failed', error);
      setConflictResolutionError(message);
    }
  }, [activeDocumentKey, activeIdentity, editor, onEditScript, safeSetContent, script]);

  useEffect(() => {
    const loadBlocks = async () => {
      if (!editor || !activeIdentity || !activeDocumentKey) return;
      const forceHydration = isSwitchingScriptRef.current;
      const scheduledDocumentKey = activeDocumentKey;
      const scheduledEpoch = documentEpochRef.current;
      const controller = new AbortController();
      loadAbortControllerRef.current?.abort();
      loadAbortControllerRef.current = controller;
      const isCurrentLoad = () => (
        !controller.signal.aborted
        && activeDocumentKeyRef.current === scheduledDocumentKey
        && documentEpochRef.current === scheduledEpoch
      );

      const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
      const userRecentlyTyped = isUserTypingRef.current || timeSinceLastInput < USER_TYPING_TIMEOUT;

      if (!forceHydration && (hasUnsavedChanges || autosaveTimerRef.current || userRecentlyTyped)) {
        return;
      }

      try {
        // Try to fetch from API if session is available
        if (activeIdentity) {
          const response = await fetch(`/api/services/thinkforge/script/blocks?sessionId=${encodeURIComponent(activeIdentity.sessionId)}&scriptId=${encodeURIComponent(activeIdentity.scriptId)}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
            signal: controller.signal,
          });
          if (response.ok) {
            const data = await response.json();
            if (!isCurrentLoad()) return;
            if (typeof data?.version === 'number') {
              scriptVersionRef.current = data.version;
            }
            if (data?.title) {
              loadedTitleRef.current = data.title;
            }

            // Check if response has richText (Tiptap JSON) or blocks (ThinkForge format)
            let tiptapContent: TiptapJSON | string | null = null;
            if (data.richText && isTiptapJSON(data.richText)) {
              tiptapContent = data.richText;
            } else if (data.content) {
              tiptapContent = await marked.parse(data.content);
            } else if (data.blocks) {
              tiptapContent = toTiptapJSON(data.blocks);
            } else if (forceHydration) {
              tiptapContent = DEFAULT_EMPTY_DOCUMENT as TiptapJSON;
            } else {
              console.warn('ScriptEditor: API returned no valid content');
              return;
            }

            if (!isCurrentLoad()) return;
            const finalCheck = Date.now() - lastUserInputTimeRef.current;
            if (!forceHydration && (isUserTypingRef.current || finalCheck < USER_TYPING_TIMEOUT || hasUnsavedChanges)) {
              return;
            }

            const hasContent = !!(typeof tiptapContent === 'string' ? tiptapContent.length > 0 : tiptapContent?.content && tiptapContent.content.length > 0);
            if (tiptapContent && (hasContent || forceHydration)) {
              const applied = applyContentToEditor(tiptapContent, 'initial-load-api');
              if (applied) {
                initialLoadDoneRef.current = true;
                notifyHydratedScript(tiptapContent as any);
              }
              return;
            }
            console.warn('ScriptEditor: API returned empty content');
          }
        }

        // Fall back to the matching script prop when the API has no usable document.
        if (script?.blocks && matchesThinkForgeDocumentIdentity(script, activeIdentity)) {
          const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
          const userRecentlyTyped = isUserTypingRef.current || timeSinceLastInput < USER_TYPING_TIMEOUT;

          if (forceHydration || (!hasUnsavedChanges && !userRecentlyTyped)) {
            let tiptapContent: TiptapJSON | string;
            if (script.richText && isTiptapJSON(script.richText)) {
              tiptapContent = script.richText;
            } else if (script.blocks) {
              tiptapContent = toTiptapJSON(script.blocks);
            } else {
              tiptapContent = await marked.parse(script.content || '');
            }
            const hasContent = !!(typeof tiptapContent === 'string' ? tiptapContent.length > 0 : tiptapContent?.content && tiptapContent.content.length > 0);
            if (hasContent || forceHydration) {
              const applied = applyContentToEditor(tiptapContent, 'initial-load-prop');
              if (applied) {
                initialLoadDoneRef.current = true;
                notifyHydratedScript(tiptapContent as any);
              }
            } else {
              console.warn('ScriptEditor: Prop blocks were invalid');
            }
          }
        } else if (forceHydration) {
          const tiptapContent = DEFAULT_EMPTY_DOCUMENT as TiptapJSON;
          const applied = applyContentToEditor(tiptapContent, 'initial-load-prop');
          if (applied) {
            initialLoadDoneRef.current = true;
            notifyHydratedScript(tiptapContent);
          }
        }
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error("ScriptEditor: Failed to fetch from API:", error);
        }
      } finally {
        if (isCurrentLoad() && forceHydration) {
          isSwitchingScriptRef.current = false;
        }
        if (loadAbortControllerRef.current === controller) {
          loadAbortControllerRef.current = null;
        }
      }
    };

    // Only load on initial mount or when scriptId changes
    if (editor && !initialLoadDoneRef.current) {
      loadBlocks();
    }
  }, [activeDocumentKey, activeIdentity, editor, hasUnsavedChanges, notifyHydratedScript]);


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

  useEffect(() => {
    if (!editor || !activeIdentity || !activeDocumentKey || (!script?.blocks && !script?.content)) {
      return;
    }

    if (!matchesThinkForgeDocumentIdentity(script, activeIdentity)) return;
    const updateDocumentKey = activeDocumentKey;

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
          if (activeDocumentKeyRef.current !== updateDocumentKey) return;
          // Apply edit surgically to the selection range
          const success = applyAIEditToSelection(
            editor,
            editedBlocks || [],
            originalRange || { from: 0, to: 0 }
          );

          if (success) {
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
    // Check if this is a script update from AI
    // CRITICAL: Include ALL workflow types that AI generation can produce
    const isAIGenerated = script?.metadata?.workflow === 'create' ||
      script?.metadata?.workflow === 'edit' ||
      script?.metadata?.workflow === 'draft' ||
      script?.metadata?.workflow === 'refine' ||  // <-- ADDED: surgical refinements
      script?.metadata?.workflow === 'hybrid';    // <-- ADDED: hybrid edits

    const metadataSource = (script?.metadata as any)?.source;
    if (metadataSource === 'editor' && !isAIGenerated) {
      return;
    }

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
        if (activeDocumentKeyRef.current !== updateDocumentKey) return;
        if (!editor) {
          // Store pending blocks for retry
          pendingBlocksRef.current = Array.isArray(script.blocks) ? script.blocks : null;
          return;
        }
        let tiptapPromise: Promise<TiptapJSON | string>;
        if (script.richText && isTiptapJSON(script.richText)) {
          tiptapPromise = Promise.resolve(script.richText);
        } else if (script.blocks) {
          tiptapPromise = Promise.resolve(toTiptapJSON(script.blocks));
        } else {
          tiptapPromise = Promise.resolve(marked.parse(script.content || ''));
        }

        tiptapPromise.then((tiptapContent) => {
          if (activeDocumentKeyRef.current !== updateDocumentKey) return;
          const applied = applyContentToEditor(tiptapContent, 'ai-update');
          if (applied) {
            createVersionSnapshot('AI edit');
          }
        }).catch(err => console.error('[Script] Hydration error:', err));
      });
    } catch (error) {
      console.error('[Script] Hydration failed:', error);
    }
  }, [script?.blocks, script?.metadata, editor, activeIdentity, activeDocumentKey, generatingScript, streamingTiptap, createVersionSnapshot]);

  // Poll for blocks during generation
  // CRITICAL: Must never overwrite user edits - user input is source of truth
  // CRITICAL: Every request is owned by the active document identity.
  useEffect(() => {
    if (!activeIdentity || !activeDocumentKey || !editor || !generatingScript) return;

    const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
    const userRecentlyTyped = isUserTypingRef.current || timeSinceLastInput < USER_TYPING_TIMEOUT;
    if (hasUnsavedChanges || autosaveTimerRef.current || userRecentlyTyped || hasLocalEditsRef.current) {
      return;
    }

    const pollIdentity = activeIdentity;
    const pollDocumentKey = activeDocumentKey;
    let pollAbortController: AbortController | null = null;
    let pollInFlight = false;
    const pollInterval = 2000;

    const interval = setInterval(async () => {
      if (activeDocumentKeyRef.current !== pollDocumentKey || pollInFlight) return;

      const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
      const userRecentlyTyped = isUserTypingRef.current || timeSinceLastInput < USER_TYPING_TIMEOUT;
      if (
        hasUnsavedChanges
        || autosaveTimerRef.current
        || userRecentlyTyped
        || hasLocalEditsRef.current
        || isRestoringVersionRef.current
      ) {
        return;
      }

      pollAbortController = new AbortController();
      const requestController = pollAbortController;
      pollInFlight = true;

      try {
        const response = await fetch(
          '/api/services/thinkforge/script/blocks?sessionId='
            + encodeURIComponent(pollIdentity.sessionId)
            + '&scriptId='
            + encodeURIComponent(pollIdentity.scriptId),
          {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
            signal: requestController.signal,
          },
        );
        if (!response.ok || activeDocumentKeyRef.current !== pollDocumentKey) return;

        const data = await response.json();
        if (activeDocumentKeyRef.current !== pollDocumentKey) return;

        let tiptapContent: TiptapJSON | string;
        if (data.richText && isTiptapJSON(data.richText)) {
          tiptapContent = data.richText;
        } else if (data.content) {
          tiptapContent = await marked.parse(data.content);
        } else if (data.blocks) {
          tiptapContent = toTiptapJSON(data.blocks);
        } else {
          return;
        }

        if (activeDocumentKeyRef.current !== pollDocumentKey) return;

        const contentHash = JSON.stringify(tiptapContent);
        if (contentHash === lastLoadedContentRef.current) return;
        if (hasLocalEditsRef.current || isRestoringVersionRef.current) return;

        const finalCheck = Date.now() - lastUserInputTimeRef.current;
        if (isUserTypingRef.current || finalCheck < USER_TYPING_TIMEOUT) return;

        const applied = applyContentToEditor(tiptapContent, 'polling-update');
        if (applied && activeDocumentKeyRef.current === pollDocumentKey) {
          lastLoadedContentRef.current = contentHash;
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('ScriptEditor: Polling error:', error);
        }
      } finally {
        if (pollAbortController === requestController) {
          pollAbortController = null;
        }
        pollInFlight = false;
      }
    }, pollInterval);

    return () => {
      clearInterval(interval);
      pollAbortController?.abort();
    };
  }, [
    activeIdentity,
    activeDocumentKey,
    editor,
    generatingScript,
    hasUnsavedChanges,
    applyContentToEditor,
  ]);
  // TipTap JSON is runtime truth; convert only at persistence/export boundaries.
  const convertEditorToScript = useCallback((): Script => {
    const effectiveTitle = getEffectiveTitle();
    if (!activeIdentity) throw new Error('Cannot serialize a document without active identity');
    if (!editor) {
      return stampThinkForgeDocumentIdentity({
        title: effectiveTitle,
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
      }, activeIdentity) as any;
    }

    const tiptapJSON = editor.getJSON() as TiptapJSON;

    const thinkforgeBlocks = tiptapJSONToThinkForgeBlocks(tiptapJSON);
    const validated = validateThinkForgeBlocks(thinkforgeBlocks);

    return stampThinkForgeDocumentIdentity({
      title: effectiveTitle,
      version: (script as any)?.version ?? scriptVersionRef.current,
      blocks: validated,
      richText: tiptapJSON,
      content: '',
      body: '',
      sections: script?.sections || [],
      tips: script?.tips || [],
      duration: script?.duration,
      targetAudience: script?.targetAudience,
      tone: script?.tone,
      metadata: { ...(script?.metadata || {}), canonicalFormat: 'tiptap', source: 'editor' as any }
    }, activeIdentity) as any;
  }, [editor, script, getEffectiveTitle, activeIdentity]);

  const finishDocumentSave = useCallback((pending: PendingDocumentSave, version: number): void => {
    if (activeDocumentKeyRef.current !== pending.documentKey) return;

    scriptVersionRef.current = version;
    const committedScript = { ...pending.updatedScript, version } as Script;
    onEditScript(committedScript);

    const activeHash = editor ? JSON.stringify(editor.getJSON()) : '';
    if (activeHash !== pending.request.contentHash) {
      setHasUnsavedChanges(true);
      return;
    }

    lastLoadedContentRef.current = pending.request.contentHash;
    lastAutosaveHashRef.current = pending.request.contentHash;
    setHasUnsavedChanges(false);
    hasLocalEditsRef.current = false;
    isUserTypingRef.current = false;
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }, [editor, onEditScript]);

  const recordDocumentConflict = useCallback((
    pending: PendingDocumentSave,
    currentVersion: number,
  ): void => {
    if (activeDocumentKeyRef.current !== pending.documentKey) return;
    pendingConflictSaveRef.current = pending;
    try {
      preserveThinkForgeConflictDraft(pending.request, currentVersion);
    } catch (error) {
      console.error('ScriptEditor: Failed to preserve conflict draft', error);
    }
    setHasUnsavedChanges(true);
    setConflictResolutionError(null);
    setDocumentSaveConflict({ documentKey: pending.documentKey, currentVersion });
  }, []);

  const flushPendingDocumentSave = useCallback(async (documentKey?: string): Promise<void> => {
    const pending = pendingDocumentSaveRef.current;
    if (!pending || (documentKey && pending.documentKey !== documentKey)) return;
    pendingDocumentSaveRef.current = null;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    try {
      const result = await enqueueThinkForgeDocumentSave(pending.request);
      if (result.status === 'conflict') {
        recordDocumentConflict(pending, result.currentVersion);
        return;
      }
      finishDocumentSave(pending, result.version);
    } catch (error) {
      if (activeDocumentKeyRef.current === pending.documentKey) setHasUnsavedChanges(true);
      console.error('ScriptEditor: Document save queue failed', error);
    }
  }, [finishDocumentSave, recordDocumentConflict]);
  flushPendingDocumentSaveRef.current = flushPendingDocumentSave;

  const handleLoadLatestDocument = useCallback(async (): Promise<void> => {
    const conflict = documentSaveConflict;
    const pending = pendingConflictSaveRef.current;
    if (!conflict || !pending || !editor) return;
    if (activeDocumentKeyRef.current !== conflict.documentKey) {
      setConflictResolutionError('The active document changed. Reopen the conflicted document to resolve it.');
      return;
    }

    setIsResolvingConflict(true);
    setConflictResolutionError(null);
    try {
      const response = await fetch(
        `/api/services/thinkforge/script/blocks?sessionId=${encodeURIComponent(pending.request.sessionId)}&scriptId=${encodeURIComponent(pending.request.scriptId)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error(`Latest document load failed (${response.status}).`);
      const data = await response.json();
      if (typeof data?.version !== 'number') throw new Error('Latest document response omitted its version.');

      const tiptapContent = data.richText && isTiptapJSON(data.richText)
        ? validateTiptapJSON(data.richText)
        : toTiptapJSON(data.blocks);
      const blocks = validateThinkForgeBlocks(tiptapJSONToThinkForgeBlocks(tiptapContent));
      const contentHash = JSON.stringify(tiptapContent);
      const loadedScript = stampThinkForgeDocumentIdentity({
        title: typeof data.title === 'string' ? data.title : 'Untitled Script',
        version: data.version,
        content: typeof data.content === 'string' ? data.content : '',
        blocks,
        richText: tiptapContent,
        metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : undefined,
        documentType: data.documentType,
        contentContract: data.contentContract,
      }, {
        sessionId: pending.request.sessionId,
        scriptId: pending.request.scriptId,
      }) as unknown as Script;

      isUpdatingFromPropsRef.current = true;
      try {
        editor.commands.setContent(tiptapContent as any);
      } finally {
        isUpdatingFromPropsRef.current = false;
      }
      acceptThinkForgeServerDocument(
        pending.request,
        conflict.currentVersion,
        data.version,
        contentHash,
      );

      scriptVersionRef.current = data.version;
      loadedTitleRef.current = loadedScript.title || null;
      lastLoadedContentRef.current = contentHash;
      lastAutosaveHashRef.current = contentHash;
      pendingConflictSaveRef.current = null;
      setDocumentSaveConflict(null);
      setHasUnsavedChanges(false);
      hasLocalEditsRef.current = false;
      isUserTypingRef.current = false;
      clearThinkForgeConflictDraft(pending.request);
      onEditScript(loadedScript);
    } catch (error) {
      setConflictResolutionError(error instanceof Error ? error.message : 'Latest document load failed.');
    } finally {
      setIsResolvingConflict(false);
    }
  }, [documentSaveConflict, editor, onEditScript]);

  const handleOverwriteLatestDocument = useCallback(async (): Promise<void> => {
    const conflict = documentSaveConflict;
    const pending = pendingConflictSaveRef.current;
    if (!conflict || !pending) return;
    if (activeDocumentKeyRef.current !== conflict.documentKey) {
      setConflictResolutionError('The active document changed. Reopen the conflicted document to resolve it.');
      return;
    }

    setIsResolvingConflict(true);
    setConflictResolutionError(null);
    try {
      const result = await overwriteThinkForgeDocumentAfterConflict(
        pending.request,
        conflict.currentVersion,
      );
      if (result.status === 'conflict') {
        recordDocumentConflict(pending, result.currentVersion);
        return;
      }

      pendingConflictSaveRef.current = null;
      setDocumentSaveConflict(null);
      clearThinkForgeConflictDraft(pending.request);
      finishDocumentSave(pending, result.version);
    } catch (error) {
      setConflictResolutionError(error instanceof Error ? error.message : 'Document overwrite failed.');
    } finally {
      setIsResolvingConflict(false);
    }
  }, [documentSaveConflict, finishDocumentSave, recordDocumentConflict]);

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

  // Autosave reads editor state and never writes content back into TipTap.
  const handleContentChange = useCallback(() => {
    if (isSwitchingScriptRef.current) {
      return;
    }
    if (isUpdatingFromPropsRef.current || generatingScript || autosavePausedRef.current) {
      return;
    }
    if (!activeIdentity || !activeDocumentKey) return;
    const scheduledDocumentKey = activeDocumentKey;

    // Mark that user is actively typing - this prevents remote updates from overwriting
    isUserTypingRef.current = true;
    lastUserInputTimeRef.current = Date.now();
    hasLocalEditsRef.current = true; // Mark that user has local edits
    setHasUnsavedChanges(true);

    // Clear typing flag after timeout (user stopped typing)
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    if (!editor) return;
    const currentJSON = editor.getJSON() as TiptapJSON;
    const currentHash = JSON.stringify(currentJSON);
    if (currentHash === lastAutosaveHashRef.current) return;

    const updatedScript = convertEditorToScript();
    const pendingSave: PendingDocumentSave = {
      documentKey: scheduledDocumentKey,
      request: {
        sessionId: activeIdentity.sessionId,
        scriptId: activeIdentity.scriptId,
        baseVersion: scriptVersionRef.current,
        title: updatedScript.title || 'Untitled Script',
        content: updatedScript.content || '',
        richText: currentJSON as unknown as Record<string, unknown>,
        contentHash: currentHash,
      },
      updatedScript,
    };
    if (documentSaveConflict?.documentKey === scheduledDocumentKey) {
      pendingConflictSaveRef.current = pendingSave;
      try {
        preserveThinkForgeConflictDraft(
          pendingSave.request,
          documentSaveConflict.currentVersion,
        );
      } catch (error) {
        console.error('ScriptEditor: Failed to update preserved conflict draft', error);
      }
      pendingDocumentSaveRef.current = null;
      return;
    }
    pendingDocumentSaveRef.current = pendingSave;

    const scheduledTimer = setTimeout(() => {
      void flushPendingDocumentSaveRef.current?.(scheduledDocumentKey);
    }, 1200);
    autosaveTimerRef.current = scheduledTimer;
  }, [convertEditorToScript, editor, activeIdentity, activeDocumentKey, documentSaveConflict]);

  // Pause autosave when tab/window is not active to avoid stale saves on return
  useEffect(() => {
    const handleVisibility = () => {
      const hidden = typeof document !== 'undefined' && document.hidden;
      autosavePausedRef.current = !!hidden;
      if (hidden) {
        void flushPendingDocumentSaveRef.current?.(activeDocumentKeyRef.current || undefined);
      }
    };
    const handleBlur = () => {
      autosavePausedRef.current = true;
      void flushPendingDocumentSaveRef.current?.(activeDocumentKeyRef.current || undefined);
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
      } catch { }
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
      void flushPendingDocumentSaveRef.current?.(activeDocumentKeyRef.current || undefined);
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
      if (observerTimerRef.current) clearTimeout(observerTimerRef.current);
      loadAbortControllerRef.current?.abort();
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
            <span className="text-sm text-[#7A776E]">Generating...</span>
          )}

          {/* New Script Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => {
                    if (onNewScript) {
                      onNewScript();
                    }
                  }}
                  variant="outline"
                  size="sm"
                  className="border-[#282724] text-[#B5B2A8] hover:bg-[#1C1B19] h-8 w-8 p-0"
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

          {/* Save Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => {
                    setHasUnsavedChanges(true);
                    if (handleContentChangeRef.current) {
                      handleContentChangeRef.current();
                    }
                  }}
                  variant="outline"
                  size="sm"
                  className="border-[#282724] text-[#B5B2A8] hover:bg-[#1C1B19] h-8 px-2"
                  disabled={!sessionId}
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  <span className="text-[11px]">Save</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Save Script</p>
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
                  className="border-[#282724] text-[#B5B2A8] hover:bg-[#1C1B19] h-8 w-8 p-0"
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

          {/* Format Toolbar - always shown when not generating */}
          {!generatingScript && (
            <div className="border-l border-[#282724] pl-3 ml-1">
              <FormatToolbar
                editor={editor}
                disabled={false}
              />
            </div>
          )}
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
                  className="border-[#282724] text-[#B5B2A8] hover:bg-[#1C1B19] h-8 w-8 p-0"
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
                className="border-[#282724] text-[#B5B2A8] hover:bg-[#1C1B19] h-8 w-8 p-0"
                disabled={generatingScript && !script}
              >
                <Download className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#0F0F0E] border-[#282724]">
              <DropdownMenuItem
                onClick={handleExportPDF}
                className="text-[#B5B2A8] hover:bg-[#1C1B19] cursor-pointer"
                disabled={generatingScript && !script}
              >
                Export PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportHTML}
                className="text-[#B5B2A8] hover:bg-[#1C1B19] cursor-pointer"
                disabled={generatingScript && !script}
              >
                Export HTML
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportTXT}
                className="text-[#B5B2A8] hover:bg-[#1C1B19] cursor-pointer"
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
                className="border-[#282724] text-[#B5B2A8] hover:bg-[#1C1B19] h-8 w-8 p-0"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#0F0F0E] border-[#282724]">
              <DropdownMenuItem
                onClick={() => {
                  if (sessionId) {
                    setShowBranchEditor(true);
                  } else {
                    console.warn('Cannot open history: no sessionId');
                  }
                }}
                className="text-[#B5B2A8] hover:bg-[#1C1B19] cursor-pointer"
                disabled={!sessionId}
              >
                <History className="h-4 w-4 mr-2" />
                Version History
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Save Status Indicator */}
          <div className="flex items-center pl-2 border-l border-[#282724] ml-1">
            {isSaving ? (
              <div className="flex items-center gap-1.5 text-[11px] text-[#7A776E]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Saving</span>
              </div>
            ) : justSaved ? (
              <div className="flex items-center gap-1.5 text-[11px] text-green-400">
                <Check className="h-3.5 w-3.5" />
                <span>Saved</span>
              </div>
            ) : hasUnsavedChanges ? (
              <div className="text-[11px] text-[#D4A652]">Unsaved</div>
            ) : (
              <div className="text-[11px] text-[#5F5E5A]">Saved</div>
            )}
          </div>
        </div>
      </div>

      {/* Loading State - shown only before any content arrives */}
      {generatingScript && !script && !liveContent && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#D4A652]" />
            <div>
              <h3 className="text-lg font-medium text-[#ECE9E1]">Generating Your Script</h3>
              <p className="text-sm text-[#7A776E]">ForgeAI is crafting your content...</p>
            </div>
          </div>
        </div>
      )}

      {/* Editor or Preview */}
      {(!generatingScript || script || liveContent) ? (
        <Card className="bg-[#0F0F0E] border-[#1C1B19]">
          <CardContent className="p-0">
            <div
              ref={containerRef}
              className="relative min-h-[600px] max-h-[70vh] overflow-y-auto rounded-lg scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
            >
              {/* Live Document Renderer - Overlay when streaming */}
              {!!generatingScript && !!liveContent && (
                <div className="absolute inset-x-0 top-0 bottom-0 z-20 bg-(--background) overflow-y-auto">
                  <LiveDocumentRenderer
                    content={liveContent}
                    title={script?.title}
                    isStreaming={true}
                  />
                </div>
              )}

              {/* Tiptap editor */}
              <div className={cn("tiptap-editor-dark", (!!generatingScript && !!liveContent) && "invisible")}>
                <EditorContent editor={editor} />
              </div>

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
                      } catch { }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium bg-[#0F0F0E] text-[#ECE9E1] shadow-lg border border-[#282724]/50 hover:bg-[#1C1B19] hover:text-[#ECE9E1] hover:border-[#282724] transition-all group backdrop-blur-md"
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
        <DialogContent className="bg-[#0F0F0E] border-[#1C1B19] text-[#ECE9E1] max-w-4xl h-[600px] p-0">
          {showBranchEditor && (
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
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={documentSaveConflict !== null}>
        <AlertDialogContent className="border-[#3A3022] bg-[#0F0F0E] text-[#ECE9E1]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-[#D4A652]" />
              A newer document version exists
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#A7A39A]">
              ThinkForge stopped autosave before overwriting it. Load the latest saved version, or explicitly replace it with the draft currently in this editor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {conflictResolutionError && (
            <p role="alert" className="text-sm text-red-400">{conflictResolutionError}</p>
          )}
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isResolvingConflict}
              onClick={() => void handleLoadLatestDocument()}
              className="border-[#3A3935] bg-transparent text-[#ECE9E1] hover:bg-[#1C1B19]"
            >
              Load latest
            </Button>
            <Button
              type="button"
              disabled={isResolvingConflict}
              onClick={() => void handleOverwriteLatestDocument()}
              className="bg-[#D4A652] text-black hover:bg-[#E0B75F]"
            >
              {isResolvingConflict ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Replace with my draft
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tiptap Editor Styles */}
      <style jsx global>{`
        .tiptap-editor-dark {
          background: transparent !important;
          border-radius: 8px;
        }
        .tiptap-editor-dark .ProseMirror {
          background: transparent !important;
          color: #ECE9E1 !important;
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
          color: #ECE9E1 !important;
          font-size: 2rem !important;
          font-weight: 700 !important;
          margin-bottom: 1rem !important;
        }
        .tiptap-editor-dark h2 {
          color: #ECE9E1 !important;
          font-size: 1.5rem !important;
          font-weight: 600 !important;
          margin-top: 1.5rem !important;
          margin-bottom: 0.75rem !important;
        }
        .tiptap-editor-dark h3 {
          color: #ECE9E1 !important;
          font-size: 1.25rem !important;
          font-weight: 600 !important;
          margin-top: 1.25rem !important;
          margin-bottom: 0.5rem !important;
        }
        .tiptap-editor-dark p {
          color: #ECE9E1 !important;
          margin-bottom: 0.75rem !important;
        }
        .tiptap-editor-dark ul, 
        .tiptap-editor-dark ol {
          color: #ECE9E1 !important;
          margin-bottom: 0.75rem !important;
          padding-left: 1.5rem !important;
        }
        .tiptap-editor-dark li {
          color: #ECE9E1 !important;
          margin-bottom: 0.25rem !important;
        }
        .tiptap-editor-dark blockquote {
          border-left: 3px solid #282724 !important;
          padding-left: 1rem !important;
          margin-left: 0 !important;
          color: rgba(236, 233, 225, 0.8) !important;
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
          font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace !important;
          font-size: 0.875em !important;
          color: #ECE9E1 !important;
        }
        .tiptap-editor-dark pre code {
          background: transparent !important;
          border: none !important;
          padding: 0 !important;
          font-size: 0.75rem !important;
        }
        .tiptap-editor-dark hr {
          border: none !important;
          border-top: 1px solid #282724 !important;
          margin: 1.5rem 0 !important;
        }
        .tiptap-editor-dark a {
          color: #D4A652 !important;
          text-decoration: underline !important;
        }
        .tiptap-editor-dark a:hover {
          color: #D4A652 !important;
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
