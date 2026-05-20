import React from "react";
import { Download, Loader2, Bell, Save, X, Layers, Info, BarChart3, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";

/**
 * Interface representing a single video render attempt
 * @property {string} url - URL of the rendered video (if successful)
 * @property {Date} timestamp - When the render was completed
 * @property {string} id - Unique identifier for the render
 * @property {'success' | 'error'} status - Result of the render attempt
 * @property {string} error - Error message if render failed
 * @property {Date} expiresAt - When the render file expires (7 days after creation)
 */
interface RenderItem {
  url?: string;
  timestamp: Date;
  id: string;
  status: "success" | "error";
  error?: string;
  expiresAt?: Date;
}

/**
 * Props for the RenderControls component
 * @property {object} state - Current render state containing status, progress, and URL
 * @property {() => void} handleRender - Function to trigger a new render
 * @property {() => void} saveProject - Function to save the project
 * @property {('ssr' | 'lambda')?} renderType - Type of render (SSR or Lambda)
 * @property {string} projectId - Project ID for fetching render history
 */
interface RenderControlsProps {
  state: any;
  handleRender: () => void;
  handleCancel?: () => void;
  saveProject?: () => Promise<void>;
  renderType?: "ssr" | "lambda";
  projectId?: string;
}

/**
 * RenderControls component provides UI controls for video rendering functionality
 *
 * Features:
 * - Render button that shows progress during rendering
 * - Notification bell showing render history
 * - Download buttons for completed renders
 * - Error display for failed renders
 *
 * The component maintains a history of render attempts, both successful and failed,
 * and provides visual feedback about the current render status.
 */
const RenderControls: React.FC<RenderControlsProps> = ({
  state,
  handleRender,
  handleCancel,
  saveProject,
  renderType = "ssr",
  projectId,
}) => {
  // Store multiple renders
  const [renders, setRenders] = React.useState<RenderItem[]>([]);
  // Track if there are new renders
  const [hasNewRender, setHasNewRender] = React.useState(false);

  // Quality gate: warn before render when score < 40
  const QUALITY_WARN_THRESHOLD = 40; // ← Plan decision: "Score < 40 shows dialog"
  const [qualityDialogOpen, setQualityDialogOpen] = React.useState(false);
  const [qualityScore, setQualityScore] = React.useState<number | null>(null);
  const [qualityIssueCount, setQualityIssueCount] = React.useState(0);
  const [qualityChecking, setQualityChecking] = React.useState(false);

  const handleRenderWithQualityCheck = React.useCallback(async () => {
    if (!projectId || renderType !== "lambda") {
      handleRender();
      return;
    }

    setQualityChecking(true);
    try {
      const res = await fetch("/api/services/editron/quality-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (res.ok) {
        const data = await res.json();
        const score = data.overallScore ?? 100;
        const issues = data.issues?.length ?? 0;

        if (score < QUALITY_WARN_THRESHOLD) {
          setQualityScore(score);
          setQualityIssueCount(issues);
          setQualityDialogOpen(true);
          setQualityChecking(false);
          return;
        }
      }
    } catch (err) {
      console.warn("[RenderControls] Quality check failed, proceeding:", err);
    }

    setQualityChecking(false);
    handleRender();
  }, [projectId, renderType, handleRender]);

  // Check if rendering is disabled via environment variable
  const isRenderDisabled = process.env.NEXT_PUBLIC_DISABLE_RENDER === "true";

  // Alyzitron analysis state
  const [analyzingId, setAnalyzingId] = React.useState<string | null>(null);
  const [postRenderDialog, setPostRenderDialog] = React.useState<{ url: string } | null>(null);

  const handleAnalyze = async (url: string, renderId?: string) => {
    if (!projectId || analyzingId) return;
    setAnalyzingId(renderId || 'dialog');
    try {
      const res = await fetch('/api/services/alyzitron/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: url,
          editronProjectId: projectId,
          metadata: { mimeType: 'video/mp4' },
          storage: url.includes('storage.googleapis.com') ? 'gcs' : 'external',
        }),
      });
      if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
    } catch (err: any) {
      console.error('[RenderControls] Analyze failed:', err.message);
    } finally {
      setAnalyzingId(null);
      setPostRenderDialog(null);
    }
  };

  // Fetch render history on mount (for persistence across refreshes)
  React.useEffect(() => {
    if (!projectId || renderType !== "lambda") return;

    const fetchHistory = async () => {
      try {
        const response = await fetch(`/api/services/editron/render/history?projectId=${projectId}`);
        const json = await response.json();
        
        if (json.type === "success" && json.data?.renders?.length > 0) {
          const historyItems: RenderItem[] = json.data.renders.map((r: any) => ({
            id: r.id,
            url: r.url,
            timestamp: new Date(r.completedAt),
            status: r.status === "done" ? "success" : "error",
            error: r.error,
            expiresAt: r.expiresAt ? new Date(r.expiresAt) : undefined,
          }));
          setRenders(historyItems);
        }
      } catch (err) {
        console.error("Error fetching render history:", err);
      }
    };

    fetchHistory();
  }, [projectId, renderType]);

  // Add new render to the list when completed + show post-render dialog
  React.useEffect(() => {
    if (state.status === "done") {
      setRenders((prev) => [
        {
          url: state.url,
          timestamp: new Date(),
          id: crypto.randomUUID(),
          status: "success",
        },
        ...prev,
      ]);
      setHasNewRender(true);
      if (state.url) setPostRenderDialog({ url: state.url });
    } else if (state.status === "error") {
      setRenders((prev) => [
        {
          timestamp: new Date(),
          id: crypto.randomUUID(),
          status: "error",
          error:
            state.error?.message || "Failed to render video. Please try again.",
        },
        ...prev,
      ]);
      setHasNewRender(true);
    }
  }, [state.status, state.url, state.error]);

  const handleDownload = async (url: string) => {
    try {
      let downloadUrl = url;

      if (renderType === "ssr") {
        // Convert the video URL to a download URL for SSR
        downloadUrl = url
          .replace("/rendered-videos/", "/api/latest/ssr/download/")
          .replace(".mp4", "");
        
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = "rendered-video.mp4";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        // For Cloud Run/Lambda with GCS URLs
        // Check if it's a GCS signed URL
        if (url.includes('storage.googleapis.com') || url.includes('storage.cloud.google.com')) {
          // GCS signed URLs can be downloaded directly by opening in new tab
          // The browser will handle the download with proper authentication via the signed URL
          window.open(url, '_blank');
        } else {
          // For other URLs, try to fetch and download as blob
          const response = await fetch(url);
          
          if (!response.ok) {
            throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
          }
          
          const blob = await response.blob();
          
          // Check if blob is valid (not just a few bytes)
          if (blob.size < 1000) {
            console.warn('Downloaded blob is suspiciously small, opening URL directly instead');
            window.open(url, '_blank');
            return;
          }
          
          const blobUrl = window.URL.createObjectURL(blob);
          
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = "rendered-video.mp4";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
        }
      }
    } catch (error) {
      console.error("Download failed:", error);
      // Fallback to direct link opening if fetch fails
      window.open(url, "_blank");
    }
  };

  const getDisplayFileName = (url: string) => {
    if (renderType === "ssr") {
      return url.split("/").pop();
    }
    // For Lambda URLs, use the full URL pathname
    try {
      return new URL(url).pathname.split("/").pop();
    } catch {
      return url.split("/").pop();
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="relative hover:bg-accent"
        onClick={saveProject}
      >
        <Save className="w-3.5 h-3.5" />
      </Button>
      <Popover onOpenChange={() => setHasNewRender(false)}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="relative hover:bg-accent"
          >
            <Bell className="w-3.5 h-3.5" />
            {hasNewRender && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-3">
          <div className="space-y-1.5">
            <h4 className="text-sm font-medium">Recent Renders</h4>
            {renders.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No renders yet</p>
            ) : (
              renders.map((render) => (
                <div
                  key={render.id}
                  className={`flex items-center justify-between rounded-md border p-1.5 ${
                    render.status === "error"
                      ? "border-destructive/50 bg-destructive/10"
                      : "border-border"
                  }`}
                >
                  <div className="flex flex-col">
                    <div className="text-[11px] text-zinc-200">
                      {render.status === "error" ? (
                        <span className="text-red-400 font-medium">
                          Render Failed
                        </span>
                      ) : (
                        getDisplayFileName(render.url!)
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(render.timestamp, {
                        addSuffix: true,
                      })}
                      {render.error && (
                        <div
                          className="text-red-400 mt-0.5 truncate max-w-[180px]"
                          title={render.error}
                        >
                          {render.error}
                        </div>
                      )}
                    </div>
                  </div>
                  {render.status === "success" && (
                    (() => {
                      const isExpired = render.expiresAt && new Date() > render.expiresAt;
                      return isExpired ? (
                        <span className="text-[10px] text-muted-foreground px-1.5">Expired</span>
                      ) : (
                        <div className="flex items-center gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-zinc-200 hover:text-gray-800 h-6 w-6"
                            onClick={() => handleAnalyze(render.url!, render.id)}
                            disabled={analyzingId === render.id}
                            title="Analyze with Alyzitron"
                          >
                            {analyzingId === render.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <BarChart3 className="w-3 h-3" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-zinc-200 hover:text-gray-800 h-6 w-6"
                            onClick={() => handleDownload(render.url!)}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      );
                    })()
                  )}
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        onClick={handleRenderWithQualityCheck}
        size="sm"
        variant="outline"
        disabled={state.status === "rendering" || state.status === "invoking" || isRenderDisabled || qualityChecking}
        className={`bg-gray-800 text-white border-gray-700 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 ${isRenderDisabled ? "cursor-not-allowed" : ""}`}
        title={isRenderDisabled ? "Rendering is currently disabled" : undefined}
      >
        {isRenderDisabled ? (
          "Render Video"
        ) : qualityChecking ? (
          <>
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            Checking quality...
          </>
        ) : state.status === "rendering" ? (
          <>
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            Rendering... {state.progress.toFixed(0)}%
          </>
        ) : state.status === "invoking" ? (
          <>
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            Preparing...
          </>
        ) : (
          `Render Video`
        )}
      </Button>

      <AlertDialog open={qualityDialogOpen} onOpenChange={setQualityDialogOpen}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              Low Quality Score: {qualityScore}/100
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-300">
              Quality review found {qualityIssueCount} issue{qualityIssueCount !== 1 ? 's' : ''}.
              Rendering with a low quality score may produce a video with visible problems.
              You can still render — this is a warning, not a block.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 text-zinc-300 border-zinc-600 hover:bg-zinc-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-500"
              onClick={() => {
                setQualityDialogOpen(false);
                setQualityChecking(false);
                handleRender();
              }}
            >
              Render Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel button — visible only during rendering */}
      {(state.status === "rendering" || state.status === "invoking") && handleCancel && (
        <Button
          onClick={handleCancel}
          size="sm"
          variant="outline"
          className="bg-red-900/30 text-red-400 border-red-800 hover:bg-red-900/50 hover:text-red-300"
          title="Cancel render"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      )}

      {/* Chapter rendering indicator — shows when render uses chapter mode */}
      {state.chapterCount > 0 && (state.status === "rendering" || state.status === "invoking") && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-900/30 border border-indigo-800/50 rounded-md">
          <Layers className="w-3 h-3 text-indigo-400" />
          <span className="text-[10px] text-indigo-300 font-medium">
            {state.chapterCount} chapters
          </span>
          {state.chapterProgress && (
            <div className="flex gap-0.5 ml-1">
              {state.chapterProgress.map((cp: { index: number; status: string; progress: number }, i: number) => (
                <div
                  key={i}
                  className={`w-1.5 h-3 rounded-[1px] ${
                    cp.status === 'completed' ? 'bg-emerald-500' :
                    cp.status === 'rendering' ? 'bg-indigo-400 animate-pulse' :
                    cp.status === 'failed' ? 'bg-red-500' :
                    'bg-zinc-600'
                  }`}
                  title={`Chapter ${i + 1}: ${cp.status}${cp.progress ? ` (${Math.round(cp.progress)}%)` : ''}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Long video info — shown when not rendering but project > 3 min */}
      {state.totalFrames > 5400 && state.status !== "rendering" && state.status !== "invoking" && (
        <div className="flex items-center gap-1 text-[10px] text-zinc-500" title="Videos over 3 minutes use parallel chapter rendering for faster export">
          <Info className="w-3 h-3" />
          <span>Chapter render (parallel)</span>
        </div>
      )}

      {/* Post-render dialog: Download or Analyze */}
      <AlertDialog open={!!postRenderDialog} onOpenChange={(open) => !open && setPostRenderDialog(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Your video is ready</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400 text-sm">
              Download your rendered video or send it to Alyzitron for quality analysis, engagement scoring, and improvement suggestions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              className="bg-zinc-700 text-white hover:bg-zinc-600 w-full"
              onClick={() => {
                if (postRenderDialog?.url) handleDownload(postRenderDialog.url);
                setPostRenderDialog(null);
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Video
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-[#D4A652] text-zinc-900 hover:bg-[#c49542] w-full font-semibold"
              disabled={analyzingId === 'dialog'}
              onClick={() => {
                if (postRenderDialog?.url) handleAnalyze(postRenderDialog.url);
              }}
            >
              {analyzingId === 'dialog'
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</>
                : <><BarChart3 className="w-4 h-4 mr-2" />Analyze with Alyzitron</>}
            </AlertDialogAction>
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white w-full mt-0">
              Close
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default RenderControls;
