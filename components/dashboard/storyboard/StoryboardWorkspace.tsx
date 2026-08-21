"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  X,
  RefreshCw,
  Play,
  Mic,
  Film,
  Video,
  Loader2,
  ChevronRight,
  ChevronDown,
  Sparkles,
  MessageSquare,
  Image as ImageIcon,
  Volume2,
  Layers,
  Scissors,
  DollarSign,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useStoryboard } from "./hooks/useStoryboard";
import { TTS_VOICES, TTS_PACING_OPTIONS } from "@/lib/pipeline/config/tts-config";

interface StoryboardWorkspaceProps {
  storyboardId: string;
}

export function StoryboardWorkspace({ storyboardId }: StoryboardWorkspaceProps) {
  const router = useRouter();
  const {
    storyboard,
    isLoading,
    error,
    actionError,
    clearActionError,
    selectedSceneIndex,
    setSelectedSceneIndex,
    approveScene,
    rejectScene,
    regenerateScene,
    generateNextScene,
    generateVoiceover,
    generateVideos,
    finalizeToEditron,
    isGenerating,
    isRegenerating,
    isVoiceoverGenerating,
    isVideoGenerating,
    isFinalizing,
  } = useStoryboard(storyboardId);

  const [feedbackText, setFeedbackText] = useState("");
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [voiceoverVoice, setVoiceoverVoice] = useState("kokoro-heart");
  const [voiceoverPacing, setVoiceoverPacing] = useState("narration");

  // Sync settings when storyboard loads
  useEffect(() => {
    if (storyboard?.voiceoverConfig) {
      if (storyboard.voiceoverConfig.voice) setVoiceoverVoice(storyboard.voiceoverConfig.voice);
      if (storyboard.voiceoverConfig.contentType) setVoiceoverPacing(storyboard.voiceoverConfig.contentType);
    }
  }, [storyboard?.voiceoverConfig?.voice, storyboard?.voiceoverConfig?.contentType]);
  const [expandedSubShots, setExpandedSubShots] = useState<Set<number>>(new Set());
  const [collapsedScenes, setCollapsedScenes] = useState<Set<number>>(new Set());

  // Helper: get sub-shots for a scene
  const getSubShots = (scene: any) => {
    const subs = scene?.descriptor?.subShots || [];
    return subs.filter((s: any) => s.independentGeneration);
  };

  // Helper: check if scene has montage sub-shots
  const hasMontageSubShots = (scene: any) => getSubShots(scene).length > 0;

  // Helper: calculate total credits for a scene (asset-type aware)
  const getSceneCredits = (scene: any) => {
    const assetRec = scene.descriptor?.assetRecommendation;
    const imageCost = 2; // storyboard image gen
    // animated-still / stock / graphics-only = no video gen cost
    if (assetRec === 'animated-still' || assetRec === 'stock' || assetRec === 'graphics-only') {
      return imageCost; // just image, no video
    }
    const subs = getSubShots(scene);
    if (subs.length > 0 && !collapsedScenes.has(scene.sceneIndex)) {
      return imageCost + (subs.length * 3); // 2 for storyboard image + 3 per video
    }
    return imageCost + 3; // 2 for image + 3 for one video
  };

  // Helper: get asset type label for display
  const getAssetLabel = (scene: any): string | null => {
    const rec = scene.descriptor?.assetRecommendation;
    if (rec === 'animated-still') return 'Ken Burns';
    if (rec === 'stock') return 'Stock';
    if (rec === 'graphics-only') return 'Graphics';
    return null; // ai-video is the default, no label needed
  };

  // Toggle sub-shot expansion
  const toggleSubShots = (sceneIndex: number) => {
    setExpandedSubShots(prev => {
      const next = new Set(prev);
      if (next.has(sceneIndex)) next.delete(sceneIndex);
      else next.add(sceneIndex);
      return next;
    });
  };

  // Collapse montage to single shot
  const collapseScene = (sceneIndex: number) => {
    setCollapsedScenes(prev => {
      const next = new Set(prev);
      next.add(sceneIndex);
      return next;
    });
  };

  // Expand montage back to multiple shots
  const expandScene = (sceneIndex: number) => {
    setCollapsedScenes(prev => {
      const next = new Set(prev);
      next.delete(sceneIndex);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading storyboard...</p>
        </div>
      </div>
    );
  }

  if (error || !storyboard) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <p className="text-destructive">{error || "Storyboard not found"}</p>
          <Button variant="outline" onClick={() => router.back()}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const scenes = storyboard.scenes || [];

  // Calculate total credits for all scenes
  const totalCredits = scenes.reduce((sum: number, s: any) => sum + getSceneCredits(s), 0);
  const totalVideoCredits = scenes.reduce((sum: number, s: any) => {
    const assetRec = s.descriptor?.assetRecommendation;
    if (assetRec === 'animated-still' || assetRec === 'stock' || assetRec === 'graphics-only') return sum;
    const subs = getSubShots(s);
    if (subs.length > 0 && !collapsedScenes.has(s.sceneIndex)) return sum + (subs.length * 3);
    return sum + 3;
  }, 0);
  const selectedScene = scenes.find((s: any) => s.sceneIndex === selectedSceneIndex);
  const approvedCount = scenes.filter((s: any) => s.status === "approved").length;
  const allApproved = approvedCount === scenes.length && scenes.length > 0;
  const hasVoiceover = storyboard.voiceoverConfig?.status === "ready";

  // Find next scene to generate (first pending after last approved)
  const nextToGenerate = scenes.find((s: any, i: number) => {
    if (s.status !== "pending") return false;
    if (i === 0) return true;
    return scenes[i - 1]?.status === "approved";
  });

  const handleRegenerate = async () => {
    if (selectedSceneIndex === null) return;
    await regenerateScene(selectedSceneIndex, feedbackText || undefined);
    setFeedbackText("");
  };

  const handleFinalize = async () => {
    const result = await finalizeToEditron();
    if (result?.projectId) {
      router.push(`/dashboard/editron/project/${result.projectId}`);
    }
    setShowFinalizeDialog(false);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Non-fatal action failures (regenerate / voiceover / videos / finalize,
          incl. insufficient credits) surface HERE, dismissible — they used to
          unmount this entire workspace into a dead-end "Go Back" screen. */}
      {actionError && (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-6 py-2.5">
          <p className="text-sm text-destructive min-w-0 truncate" title={actionError}>{actionError}</p>
          <Button variant="ghost" size="sm" className="shrink-0" onClick={clearActionError}>
            Dismiss
          </Button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold text-lg">
              {storyboard.title || "Storyboard"}
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {approvedCount}/{scenes.length} scenes approved
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Progress badge */}
          <Badge variant={allApproved ? "default" : "secondary"} className="gap-1">
            {allApproved ? <Check className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
            {approvedCount}/{scenes.length}
          </Badge>

          {/* Generate next scene button */}
          {nextToGenerate && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => generateNextScene(nextToGenerate.sceneIndex)}
              disabled={isGenerating}
              className="gap-2"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate Scene {nextToGenerate.sceneIndex + 1}
            </Button>
          )}

          {/* Voiceover */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateVoiceover(voiceoverVoice, voiceoverPacing)}
            disabled={isVoiceoverGenerating || !allApproved}
            className="gap-2"
            title={!allApproved ? "Approve all scenes first" : ""}
          >
            {isVoiceoverGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {hasVoiceover ? "Regenerate Voice" : "Add Voiceover"}
          </Button>

          {/* Generate AI Videos */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateVideos()}
            disabled={isVideoGenerating || !allApproved}
            className="gap-2"
            title={!allApproved ? "Approve all scenes first" : "Generate AI video clips for each scene (3 credits/scene)"}
          >
            {isVideoGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Video className="h-4 w-4" />
            )}
            {isVideoGenerating ? "Generating..." : "Generate Videos"}
          </Button>

          {/* Finalize */}
          <Button
            onClick={() => setShowFinalizeDialog(true)}
            disabled={!allApproved || isFinalizing}
            className="gap-2"
          >
            {isFinalizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Film className="h-4 w-4" />
            )}
            Create Video
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Scene Flow Strip (left panel) */}
        <ScrollArea className="w-[300px] border-r bg-muted/30">
          <div className="p-4 space-y-3">
            {scenes.map((scene: any, idx: number) => (
              <button
                key={scene.sceneIndex}
                onClick={() => setSelectedSceneIndex(scene.sceneIndex)}
                className={cn(
                  "w-full rounded-xl border transition-all duration-200 overflow-hidden text-left",
                  selectedSceneIndex === scene.sceneIndex
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border hover:border-primary/40",
                )}
              >
                {/* Scene image thumbnail */}
                <div className="aspect-video bg-muted relative">
                  {scene.imageUrl ? (
                    <img
                      src={scene.imageUrl}
                      alt={`Scene ${scene.sceneIndex + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}

                  {/* Status badge */}
                  <div className="absolute top-2 left-2">
                    <Badge
                      variant={
                        scene.status === "approved"
                          ? "default"
                          : scene.status === "rejected"
                          ? "destructive"
                          : scene.status === "generating"
                          ? "secondary"
                          : "outline"
                      }
                      className="text-[10px] h-5"
                    >
                      {scene.status === "approved" && <Check className="h-3 w-3 mr-1" />}
                      {scene.status === "generating" && (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      )}
                      {scene.status}
                    </Badge>
                  </div>

                  {/* Scene number */}
                  <div className="absolute top-2 right-2 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                    {scene.sceneIndex + 1}/{scenes.length}
                  </div>

                  {/* Voiceover indicator */}
                  {scene.voiceover?.audioUrl && (
                    <div className="absolute bottom-2 right-2">
                      <Volume2 className="h-4 w-4 text-white drop-shadow" />
                    </div>
                  )}

                  {/* Multi-shot montage indicator — shows image count when sub-shot images exist */}
                  {hasMontageSubShots(scene) && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-amber-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                      <Layers className="h-3 w-3" />
                      {collapsedScenes.has(scene.sceneIndex)
                        ? '1 shot'
                        : `${getSubShots(scene).length} shots`}
                      {!collapsedScenes.has(scene.sceneIndex) &&
                        getSubShots(scene).some((s: any) => s.imageUrl) &&
                        <ImageIcon className="h-3 w-3 ml-0.5" />}
                    </div>
                  )}
                </div>

                {/* Scene info */}
                <div className="p-3 space-y-1">
                  <p className="font-medium text-sm truncate">
                    {scene.descriptor.title || `Scene ${scene.sceneIndex + 1}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                    {scene.descriptor.narration || scene.descriptor.visualDescription}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {scene.descriptor.durationSeconds}s · {scene.descriptor.mood}
                  </p>
                </div>

                {/* Arrow to next */}
                {idx < scenes.length - 1 && (
                  <div className="flex justify-center -mb-1.5 text-muted-foreground">
                    <ChevronRight className="h-4 w-4 rotate-90" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* Scene Detail (right panel) */}
        <div className="flex-1 flex flex-col">
          {selectedScene ? (
            <>
              {/* Large preview */}
              <div className="flex-1 flex items-center justify-center p-8 bg-black/5 dark:bg-black/20">
                {selectedScene.imageUrl ? (
                  <img
                    src={selectedScene.imageUrl}
                    alt={`Scene ${selectedScene.sceneIndex + 1}`}
                    className="max-w-full max-h-full rounded-lg shadow-lg object-contain"
                  />
                ) : selectedScene.status === "generating" ? (
                  <div className="text-center space-y-4">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                    <p className="text-muted-foreground">Generating scene...</p>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <ImageIcon className="h-16 w-16 mx-auto text-muted-foreground/30" />
                    <p className="text-muted-foreground">Scene not yet generated</p>
                    <Button
                      onClick={() => generateNextScene(selectedScene.sceneIndex)}
                      disabled={isGenerating}
                      className="gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      Generate This Scene
                    </Button>
                  </div>
                )}
              </div>

              {/* Actions bar */}
              <div className="border-t p-4 space-y-4">
                {/* Scene info */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">
                      {selectedScene.descriptor.title || `Scene ${selectedScene.sceneIndex + 1}`}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedScene.descriptor.mood} · {selectedScene.descriptor.durationSeconds}s
                      {selectedScene.generationHistory?.length > 1 &&
                        ` · ${selectedScene.generationHistory.length} versions`}
                    </p>
                  </div>

                  {/* Approve/Reject buttons */}
                  {selectedScene.status === "generated" && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectScene(selectedScene.sceneIndex)}
                        className="gap-1 text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => approveScene(selectedScene.sceneIndex)}
                        className="gap-1"
                      >
                        <Check className="h-4 w-4" />
                        Approve
                      </Button>
                    </div>
                  )}

                  {selectedScene.status === "approved" && (
                    <Badge className="gap-1">
                      <Check className="h-3 w-3" /> Approved
                    </Badge>
                  )}
                </div>

                {/* Narration */}
                {selectedScene.descriptor.narration && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">Narration</p>
                    <p className="text-sm">{selectedScene.descriptor.narration}</p>
                  </div>
                )}

                {/* Sub-shot montage review panel */}
                {selectedScene && hasMontageSubShots(selectedScene) && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Scissors className="h-4 w-4 text-amber-500" />
                        <span className="text-sm font-medium">Multi-Shot Sequence Detected</span>
                      </div>
                      <button
                        onClick={() => toggleSubShots(selectedScene.sceneIndex)}
                        className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        {expandedSubShots.has(selectedScene.sceneIndex) ? 'Hide' : 'Review shots'}
                        <ChevronDown className={cn(
                          "h-3 w-3 transition-transform",
                          expandedSubShots.has(selectedScene.sceneIndex) && "rotate-180"
                        )} />
                      </button>
                    </div>

                    {!collapsedScenes.has(selectedScene.sceneIndex) ? (
                      <>
                        <p className="text-[11px] text-muted-foreground">
                          This scene has {getSubShots(selectedScene).length} distinct shots that will each generate a separate video clip.
                        </p>

                        {expandedSubShots.has(selectedScene.sceneIndex) && (
                          <div className="space-y-2">
                            {getSubShots(selectedScene).map((sub: any, i: number) => (
                              <div key={i} className="flex items-start gap-3 bg-background/60 rounded-lg p-2.5 border border-border/50">
                                {/* Sub-shot thumbnail: show generated image when available, fall back to number */}
                                {sub.imageUrl ? (
                                  <div className="w-16 h-10 rounded overflow-hidden flex-shrink-0 border border-border/50 relative group">
                                    <img src={sub.imageUrl} alt={`Shot ${i + 1}`} className="w-full h-full object-cover" />
                                    <div className="absolute top-0 left-0 bg-amber-500/80 text-[9px] font-bold text-white px-1 rounded-br">
                                      {i + 1}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                                    <span className="text-[11px] font-bold text-amber-500">{i + 1}</span>
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {sub.description || sub.visualDescription || `Shot ${i + 1}`}
                                  </p>
                                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                                    <span>{sub.targetDurationSeconds || 2}s</span>
                                    <span>·</span>
                                    <span className="flex items-center gap-0.5">
                                      <DollarSign className="h-3 w-3" />3 credits
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}

                            <div className="flex items-center justify-between pt-2 border-t border-border/50">
                              <div className="text-[11px] text-muted-foreground">
                                Total: <span className="font-medium text-foreground">{getSubShots(selectedScene).length * 3} credits</span> for {getSubShots(selectedScene).length} video clips
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => collapseScene(selectedScene.sceneIndex)}
                                className="gap-1 text-[11px] h-7"
                              >
                                <Minimize2 className="h-3 w-3" />
                                Collapse to 1 shot — {3} credits
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-muted-foreground">
                          Collapsed to 1 shot (was {getSubShots(selectedScene).length} shots). Saves {(getSubShots(selectedScene).length - 1) * 3} credits.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => expandScene(selectedScene.sceneIndex)}
                          className="gap-1 text-[11px] h-7"
                        >
                          <Layers className="h-3 w-3" />
                          Expand to {getSubShots(selectedScene).length} shots
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Regeneration with feedback */}
                {(selectedScene.status === "generated" || selectedScene.status === "rejected") && (
                  <div className="flex gap-2">
                    <Textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Describe what to change (optional)..."
                      className="min-h-[40px] max-h-[80px] resize-none text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRegenerate}
                      disabled={isRegenerating}
                      className="shrink-0 gap-1"
                    >
                      {isRegenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Regenerate
                    </Button>
                  </div>
                )}

                {/* Generation history */}
                {selectedScene.generationHistory?.length > 1 && (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-2">
                      Previous versions
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {selectedScene.generationHistory.map((entry: any, i: number) => (
                        <img
                          key={i}
                          src={entry.imageUrl}
                          alt={`Version ${i + 1}`}
                          className={cn(
                            "h-16 w-24 rounded border object-cover cursor-pointer transition-all",
                            entry.assetId === selectedScene.imageAssetId
                              ? "border-primary ring-2 ring-primary/20"
                              : "border-border hover:border-primary/40 opacity-60 hover:opacity-100",
                          )}
                          title={entry.feedback ? `Feedback: ${entry.feedback}` : `Version ${i + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <ImageIcon className="h-16 w-16 mx-auto text-muted-foreground/30" />
                <p className="text-muted-foreground">Select a scene to preview</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Finalize Dialog */}
      <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Editron Project</DialogTitle>
            <DialogDescription>
              Convert your approved storyboard into a video editing project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between text-sm">
              <span>Scenes</span>
              <span className="font-medium">{scenes.length}</span>
            </div>

            {/* Cost breakdown */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">Estimated Cost</p>
              {scenes.map((s: any) => {
                const subs = getSubShots(s);
                const isCollapsed = collapsedScenes.has(s.sceneIndex);
                const shotCount = (subs.length > 0 && !isCollapsed) ? subs.length : 1;
                return (
                  <div key={s.sceneIndex} className="flex items-center justify-between text-[11px]">
                    <span className="truncate max-w-[200px]">
                      {s.descriptor.title || `Scene ${s.sceneIndex + 1}`}
                      {getAssetLabel(s) && (
                        <span className="text-blue-400 ml-1 text-[10px] font-medium">[{getAssetLabel(s)}]</span>
                      )}
                      {subs.length > 0 && !isCollapsed && (
                        <span className="text-amber-500 ml-1">×{subs.length} shots</span>
                      )}
                      {subs.length > 0 && isCollapsed && (
                        <span className="text-zinc-500 ml-1">(collapsed)</span>
                      )}
                    </span>
                    <span className="font-mono text-muted-foreground">{getSceneCredits(s)} cr</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between text-sm font-medium pt-2 border-t border-border/50">
                <span>Total</span>
                <span>{totalCredits} credits</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span>Voiceover</span>
              <Badge variant={hasVoiceover ? "default" : "secondary"}>
                {hasVoiceover ? "Ready" : "Not generated"}
              </Badge>
            </div>

            {!hasVoiceover && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Select value={voiceoverVoice} onValueChange={setVoiceoverVoice}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select Voice" />
                      </SelectTrigger>
                      <SelectContent>
                        {TTS_VOICES.map(v => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name} ({v.gender}, {v.style})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={voiceoverPacing} onValueChange={setVoiceoverPacing}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Pacing" />
                      </SelectTrigger>
                      <SelectContent>
                        {TTS_PACING_OPTIONS.map(opt => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => generateVoiceover(voiceoverVoice, voiceoverPacing)}
                    disabled={isVoiceoverGenerating}
                  >
                    {isVoiceoverGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                    {hasVoiceover ? "Regenerate Voiceover" : "Generate Voiceover"}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <span>Credits cost</span>
              <span className="font-medium">1 credit</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalizeDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleFinalize} disabled={isFinalizing} className="gap-2">
              {isFinalizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Film className="h-4 w-4" />
              )}
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
