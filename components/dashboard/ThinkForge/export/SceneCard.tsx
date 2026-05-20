"use client";

import React from "react";
import {
  Upload,
  RefreshCw,
  MessageSquare,
  Loader2,
  ImageIcon,
  X,
} from "lucide-react";
import type { UseExportPipelineReturn } from "./hooks/useExportPipeline";

interface SceneCardProps {
  scene: {
    sceneIndex: number;
    imageUrl?: string;
    title?: string;
    [key: string]: any;
  };
  pipeline: UseExportPipelineReturn;
}

export function SceneCard({ scene, pipeline }: SceneCardProps) {
  const {
    regeneratingSceneIdxs,
    sceneFeedbackIdx,
    setSceneFeedbackIdx,
    sceneFeedbackText,
    setSceneFeedbackText,
    handleRegenerateStoryboardScene,
    handleUploadSceneImage,
  } = pipeline;

  const isRegenerating = regeneratingSceneIdxs.has(scene.sceneIndex);
  const showFeedback = sceneFeedbackIdx === scene.sceneIndex;

  /* Mini sprocket row for scene film frames */
  const sceneSprockets = (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "0 5px", height: 5, alignItems: "center", background: "#131312" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ width: 4, height: 2, borderRadius: 1, background: "#454340" }} />
      ))}
    </div>
  );

  return (
    <div
      style={{
        border: "1px solid rgba(212,166,82,0.25)",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      {/* Top sprockets */}
      {sceneSprockets}

      <div className="aspect-video bg-[#1B1A18] relative group">
        {scene.imageUrl ? (
          <>
            <img
              src={scene.imageUrl}
              alt={scene.title || `Scene ${scene.sceneIndex + 1}`}
              className="w-full h-full object-cover"
            />
            {/* Hover overlay with actions */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
              <label
                className={`p-1.5 rounded-md bg-[#D4A652]/30 hover:bg-[#D4A652]/50 text-[#D4A652] transition-colors cursor-pointer ${isRegenerating ? "opacity-50 pointer-events-none" : ""}`}
                title="Upload your own image"
              >
                <Upload className="h-3.5 w-3.5" />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadSceneImage(scene.sceneIndex, file);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                onClick={() => handleRegenerateStoryboardScene(scene.sceneIndex)}
                disabled={isRegenerating}
                className="p-1.5 rounded-md bg-[#282724]/80 hover:bg-[#454340] text-[#ECE9E1] transition-colors disabled:opacity-50"
                title="Regenerate this scene"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRegenerating ? "animate-spin" : ""}`}
                />
              </button>
              <button
                onClick={() =>
                  setSceneFeedbackIdx(
                    showFeedback ? null : scene.sceneIndex,
                  )
                }
                disabled={isRegenerating}
                className="p-1.5 rounded-md bg-[#282724]/80 hover:bg-[#454340] text-[#ECE9E1] transition-colors disabled:opacity-50"
                title="Regenerate with feedback"
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-[#454340]">
            <X className="h-4 w-4" />
            <button
              onClick={() => handleRegenerateStoryboardScene(scene.sceneIndex)}
              disabled={isRegenerating}
              className="text-[9px] text-[#D4A652] hover:text-[#D4A652]/80 underline"
            >
              {isRegenerating ? "Regenerating..." : "Retry"}
            </button>
          </div>
        )}

        {/* Regenerating overlay */}
        {isRegenerating && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <Loader2 className="h-5 w-5 text-[#D4A652] animate-spin" />
          </div>
        )}

        {/* Scene number badge */}
        <span
          style={{
            position: "absolute",
            top: 3,
            left: 3,
            background: "rgba(0,0,0,0.6)",
            fontSize: 9,
            color: "#B5B2A8",
            padding: "1px 4px",
            borderRadius: 2,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {scene.sceneIndex + 1}
        </span>
      </div>

      {/* Bottom sprockets */}
      {sceneSprockets}

      <div style={{ padding: "4px 6px", background: "#131312" }}>
        <p style={{ fontSize: 10, fontWeight: 500, color: "#ECE9E1" }} className="truncate">
          {scene.title || `Scene ${scene.sceneIndex + 1}`}
        </p>
        <p style={{ fontSize: 9, color: "#5F5E5A" }}>
          {scene.imageUrl ? "Ready" : "Failed"}
        </p>
      </div>

      {/* Feedback input for scene regeneration */}
      {showFeedback && (
        <div className="p-1.5 pt-0 space-y-1">
          <textarea
            className="w-full text-[10px] p-1.5 rounded bg-[#1B1A18] border border-[#282724] text-[#ECE9E1] placeholder-[#454340] resize-none focus:outline-none focus:border-[#D4A652]"
            rows={2}
            placeholder="e.g. Make it darker, add more contrast..."
            value={sceneFeedbackText}
            onChange={(e) => setSceneFeedbackText(e.target.value)}
          />
          <button
            onClick={() =>
              handleRegenerateStoryboardScene(
                scene.sceneIndex,
                sceneFeedbackText.trim(),
              )
            }
            disabled={isRegenerating || !sceneFeedbackText.trim()}
            className="w-full text-[10px] py-1 rounded-[7px] bg-[#D4A652] hover:bg-[#C49840] text-[#0B0B0A] font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-1 border-none"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            Regenerate with feedback
          </button>
        </div>
      )}
    </div>
  );
}
