"use client";

import React, { useState, useEffect } from "react";
import { useEditorContext } from "../../../contexts/editor-context";
import { OverlayType, HtmlSceneOverlay } from "../../../types";
import { Code, Sparkles, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// Track editing state per overlay ID (persists across panel switches)
const editingOverlays = new Set<number>();

export const HtmlScenePanel: React.FC = () => {
  const { selectedOverlayId, overlays, setOverlays } = useEditorContext();
  const [localOverlay, setLocalOverlay] = useState<HtmlSceneOverlay | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  
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

    if (selectedOverlay?.type === OverlayType.HTML_SCENE) {
      setLocalOverlay(selectedOverlay as HtmlSceneOverlay);
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
        <Code className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="font-medium text-foreground mb-2">No HTML Scene Selected</h3>
        <p className="text-sm text-muted-foreground">
          Select an HTML scene track on the timeline to view its properties and edit it.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-cyan-500/10">
            <Code className="h-5 w-5 text-cyan-500" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">HTML Scene</h3>
            <p className="text-xs text-muted-foreground">ID: {localOverlay.id}</p>
          </div>
        </div>

        <Separator />

        {/* Original Prompt */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Original Prompt</Label>
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-sm text-foreground">
              {localOverlay.prompt || "No prompt recorded"}
            </p>
          </div>
        </div>

        {/* Properties */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Duration</Label>
            <div className="text-sm font-medium">
              {Math.round(localOverlay.durationInFrames / 30)}s ({localOverlay.durationInFrames} frames)
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Position</Label>
            <div className="text-sm font-medium">
              {localOverlay.left}, {localOverlay.top}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Size</Label>
            <div className="text-sm font-medium">
              {localOverlay.width} × {localOverlay.height}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Start Frame</Label>
            <div className="text-sm font-medium">
              {localOverlay.from}
            </div>
          </div>
        </div>

        <Separator />

        {/* Edit with AI */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-500" />
            <Label className="font-medium">Edit with AI</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Describe changes you want to make to this scene. The AI will modify the HTML accordingly.
          </p>
          <Textarea
            placeholder="e.g., Make the text larger, change colors to blue theme, add more animation..."
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
                Editing...
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

        {/* Code Preview (collapsed) */}
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2">
            <Code className="h-4 w-4" />
            View Generated Code
          </summary>
          <div className="mt-2 p-3 rounded-lg bg-muted/30 border overflow-x-auto">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
              {localOverlay.content.substring(0, 1000)}
              {localOverlay.content.length > 1000 && "..."}
            </pre>
          </div>
        </details>
      </div>
    </ScrollArea>
  );
};
