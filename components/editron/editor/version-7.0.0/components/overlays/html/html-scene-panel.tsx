"use client";

import React, { useState, useEffect } from "react";
import { useEditorContext } from "../../../contexts/editor-context";
import { OverlayType, HtmlSceneOverlay, HtmlStickerOverlay } from "../../../types";
import { Sparkles, Send, Loader2, Code, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// Track editing state per overlay ID (persists across panel switches)
const editingOverlays = new Set<number>();

// Check if in development mode
const isDev = process.env.NODE_ENV === 'development';

export const HtmlScenePanel: React.FC = () => {
  const { selectedOverlayId, overlays, setOverlays } = useEditorContext();
  const [localOverlay, setLocalOverlay] = useState<HtmlSceneOverlay | HtmlStickerOverlay | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [showCode, setShowCode] = useState(false);
  
  // Get projectId from URL
  const projectId = typeof window !== 'undefined' ? window.location.pathname.split('/').pop() || '' : '';

  // Sync isEditing state with global tracking on mount/overlay change
  useEffect(() => {
    if (localOverlay) {
      setIsEditing(editingOverlays.has(localOverlay.id));
    }
  }, [localOverlay]);

  // Update local overlay when selected overlay changes
  useEffect(() => {
    if (selectedOverlayId === null) {
      setLocalOverlay(null);
      return;
    }

    const selectedOverlay = overlays.find(
      (overlay) => overlay.id === selectedOverlayId
    );

    if (selectedOverlay?.type === OverlayType.HTML_SCENE || selectedOverlay?.type === OverlayType.HTML_STICKER) {
      setLocalOverlay(selectedOverlay as HtmlSceneOverlay | HtmlStickerOverlay);
    } else {
      setLocalOverlay(null);
    }
  }, [selectedOverlayId, overlays]);

  const handleEditWithAI = async () => {
    if (!editPrompt.trim() || !localOverlay || !projectId) return;
    
    // Prevent parallel requests for the same overlay
    if (editingOverlays.has(localOverlay.id)) return;

    editingOverlays.add(localOverlay.id);
    setIsEditing(true);
    
    try {
      const response = await fetch('/api/services/editron/html-scene/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          overlayId: localOverlay.id,
          currentHtml: localOverlay.content,
          editPrompt: editPrompt,
          width: localOverlay.width,
          height: localOverlay.height,
        }),
      });

      const data = await response.json();
      if (data.success && data.newHtml) {
        // Update the overlay with new HTML
        const updatedOverlays = overlays.map(o => 
          o.id === localOverlay.id 
            ? { ...o, content: data.newHtml, prompt: `${localOverlay.prompt} | Edited: ${editPrompt}` }
            : o
        );
        setOverlays(updatedOverlays);
        setEditPrompt("");
      }
    } catch (error) {
      console.error("Failed to edit HTML scene:", error);
    } finally {
      editingOverlays.delete(localOverlay.id);
      setIsEditing(false);
    }
  };

  if (!localOverlay) {
    return (
      <div className="p-4 h-full flex flex-col items-center justify-center text-center">
        <Sparkles className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="font-medium text-foreground mb-2">No Scene Selected</h3>
        <p className="text-sm text-muted-foreground">
          Select a custom scene track on the timeline to view and edit it.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${localOverlay.type === OverlayType.HTML_STICKER ? 'bg-pink-500/10' : 'bg-cyan-500/10'}`}>
            <Sparkles className={`h-5 w-5 ${localOverlay.type === OverlayType.HTML_STICKER ? 'text-pink-500' : 'text-cyan-500'}`} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">
              {localOverlay.type === OverlayType.HTML_STICKER ? 'Custom Sticker' : 'Custom Scene'}
            </h3>
            <p className="text-xs text-muted-foreground truncate max-w-[180px]">
              {localOverlay.prompt?.split(' ').slice(0, 4).join(' ')}...
            </p>
          </div>
        </div>

        <Separator />

        {/* Edit with AI - Now at the top */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className={`h-4 w-4 ${localOverlay.type === OverlayType.HTML_STICKER ? 'text-pink-500' : 'text-cyan-500'}`} />
            <Label className="font-medium">Refine with AI</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Describe changes to this {localOverlay.type === OverlayType.HTML_STICKER ? 'sticker' : 'scene'} and the AI will update it for you.
          </p>
          <Textarea
            placeholder="e.g., Make the text larger, change to blue theme, add more animation..."
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <Button 
            onClick={handleEditWithAI} 
            disabled={!editPrompt.trim() || isEditing}
            className="w-full gap-2"
          >
            {isEditing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Apply Changes
              </>
            )}
          </Button>
        </div>

        <Separator />

        {/* Original Prompt */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Description</Label>
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-sm text-foreground">
              {localOverlay.prompt || "No description"}
            </p>
          </div>
        </div>

        {/* Properties */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Duration</Label>
            <div className="text-sm font-medium">
              {Math.round(localOverlay.durationInFrames / 30)}s
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Start</Label>
            <div className="text-sm font-medium">
              {Math.round(localOverlay.from / 30)}s
            </div>
          </div>
        </div>

        {/* Dev Mode: Code Preview */}
        {isDev && (
          <>
            <Separator />
            <div className="space-y-2">
              <button
                onClick={() => setShowCode(!showCode)}
                className="flex items-center gap-2 text-xs text-yellow-500 hover:text-yellow-400 transition-colors"
              >
                <Code className="h-4 w-4" />
                <span>DEV: View Generated Code</span>
                {showCode ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showCode && (
                <div className="p-3 rounded-lg bg-zinc-900 border border-yellow-500/30 max-h-[300px] overflow-auto">
                  <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                    {localOverlay.content || "No HTML content"}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
};
