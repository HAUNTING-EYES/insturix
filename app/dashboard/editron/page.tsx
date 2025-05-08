// Editron Dashboard with YouTube validation and UI update
"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { ArrowRight, Loader2, Clock } from "lucide-react";
import { HistoryPanel } from "@/components/dashboard/Editron/HistoryPanel";

type TaskStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | null;

interface SignedUrlPair {
  playableUrl: string;
  downloadUrl: string;
}

interface EditronTaskResult {
  signedUrls?: SignedUrlPair[];
}

interface EditronTaskError {
  message?: string;
}

interface EditronTaskStatusResponse {
  status: TaskStatus;
  result?: EditronTaskResult;
  error?: EditronTaskError;
}

export default function EditronDashboard() {
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>(null);
  const [taskResult, setTaskResult] = useState<EditronTaskResult | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);
  const [showSubmitted, setShowSubmitted] = useState(false);
  const [isCheckingActiveTask, setIsCheckingActiveTask] = useState(true); // New state for initial check
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Rate limit countdown
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!rateLimitUntil) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [rateLimitUntil]);

  // Check for existing active task on mount
  useEffect(() => {
    const checkActiveTask = async () => {
      setIsCheckingActiveTask(true);
      setError(null); // Clear previous errors
      try {
        const res = await fetch("/api/services/editron/history");
        if (!res.ok) {
          // Don't necessarily show error, just proceed without finding active task
          console.error("Failed to fetch history for active task check");
          setIsCheckingActiveTask(false);
          return;
        }
        const data = await res.json();
        console.log("[Active Task Check] History API Response:", data); // Log the raw response
        const tasks = data?.tasks || [];
        console.log("[Active Task Check] Tasks found:", tasks); // Log the tasks array

        const activeTask = tasks.find(
          (task: any) => {
             console.log(`[Active Task Check] Checking task ${task._id} with status: ${task.status}`); // Log each task status
             return task.status === "QUEUED" || task.status === "PROCESSING";
          }
        );

        console.log("[Active Task Check] Active task found:", activeTask); // Log the result of find

        if (activeTask) {
          console.log(`[Active Task Check] Setting active task ID: ${activeTask._id}`);
          setTaskId(activeTask._id); // Set the active task ID to trigger polling
        } else {
          console.log("[Active Task Check] No active task found in history.");
        }
      } catch (err) {
        console.error("Error checking for active task:", err);
        // Optionally set an error state here if needed
      } finally {
        setIsCheckingActiveTask(false);
      }
    };

    checkActiveTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount

  // Polling for task status
  useEffect(() => {
    if (!taskId) return;
    setTaskStatus("QUEUED");
    setTaskResult(null);
    setTaskError(null);

    const poll = async () => {
      try {
        const res = await fetch(`/api/services/editron/status/${taskId}`);
        if (!res.ok) throw new Error("Failed to fetch status");
        const data: EditronTaskStatusResponse = await res.json();
        setTaskStatus(data.status);
        if (data.status === "COMPLETED") {
          setTaskResult(data.result || null);
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
        } else if (data.status === "FAILED") {
          setTaskError(data.error?.message || "Task failed.");
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
        }
      } catch {
        setTaskError("Failed to fetch task status.");
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 1500);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [taskId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setTaskId(null);
    setTaskStatus(null);
    setTaskResult(null);
    setTaskError(null);
    setShowSubmitted(false);

    try {
      const res = await fetch("/api/services/editron/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtube_url: inputValue }),
      });

      if (res.status === 201) {
        const data = await res.json();
        setTaskId(data.task_id);
        setShowSubmitted(true);
        setInputValue("");
        setTimeout(() => setShowSubmitted(false), 1800);
      } else if (res.status === 429) {
        const data = await res.json();
        // Use next_allowed_at from the API response
        const retryTimestamp = data.next_allowed_at ? new Date(data.next_allowed_at).getTime() : null;
        setRateLimitUntil(retryTimestamp);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Submission failed.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* History Panel - top right */}
      <div className="absolute top-8 right-8 z-30">
        <HistoryPanel />
      </div>
      {/* Aurora Animated Background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 30%, rgba(0,200,255,0.18) 0%, transparent 70%)," +
            "radial-gradient(ellipse 60% 40% at 80% 70%, rgba(255,0,200,0.14) 0%, transparent 70%)," +
            "radial-gradient(ellipse 60% 60% at 60% 20%, rgba(0,255,180,0.12) 0%, transparent 70%)",
          animation: "auroraMove 12s ease-in-out infinite alternate"
        }}
      />
      <style>
        {`
          @keyframes auroraMove {
            0% {
              filter: blur(0px) brightness(1);
              opacity: 1;
            }
            50% {
              filter: blur(8px) brightness(1.2);
              opacity: 0.85;
            }
            100% {
              filter: blur(16px) brightness(1.1);
              opacity: 1;
            }
          }
        `}
      </style>
      <div className="relative max-w-xl w-full mx-auto space-y-12 z-10">
        <div>
          <h1 className="text-4xl font-semibold text-zinc-100">Editron v0.1</h1>
          <p className="mt-4 text-lg text-zinc-400 font-light">
            Generate YouTube Shorts instantly from your favorite podcasts. Enter the link below:
          </p>
        </div>


        {/* Submission Success Message */}
        {showSubmitted && (
          <div className="flex flex-col items-center gap-2 py-4">
            <span className="text-green-400 font-semibold text-lg">
              Task submitted!
            </span>
          </div>
        )}

        {/* Polling/Status UI */}
        {taskId && (taskStatus === "QUEUED" || taskStatus === "PROCESSING") && (
            <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="text-blue-400 font-medium">
              {taskStatus === "QUEUED"
              ? "Task is queued..."
              : "Generating shorts..."}
            </span>
            <p className="text-sm text-zinc-400 text-center">
              This process can take up to 5 minutes to complete. Feel free to switch windows.
            </p>
            </div>
        )}

        {/* Completed Result */}
        {taskId && taskStatus === "COMPLETED" && taskResult?.signedUrls && (
          <Card className="mb-4 bg-zinc-800/50 border-zinc-700">
            <CardHeader>
              <CardTitle className="text-zinc-100">Shorts Generated!</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <span className="text-green-400 font-medium">
                  Your shorts are ready:
                </span>
                {taskResult.signedUrls.map((urls, i) => (
                  <div key={i} className="border border-zinc-700 p-3 rounded-lg bg-zinc-900/60">
                    <p className="text-sm text-zinc-300 mb-2">Short {i + 1}</p>
                    <video
                      src={urls.playableUrl}
                      controls
                      className="w-full max-w-md rounded-md mb-2"
                      preload="metadata" // Load metadata for duration/dimensions
                    />
                    <a
                      href={urls.downloadUrl}
                      download={`generated_short_${i + 1}.mp4`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-blue-600 text-primary-foreground hover:bg-blue-700 h-9 px-3" // Mimic Button component style
                    >
                      Download Short {i + 1}
                    </a>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Failed/Error State */}
        {taskId && taskStatus === "FAILED" && (
          <div className="flex flex-col items-center gap-2 py-8">
            <span className="text-red-400 font-semibold text-lg">
              {taskError || "Task failed."}
            </span>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => {
                setTaskId(null);
                setTaskStatus(null);
                setTaskResult(null);
                setTaskError(null);
              }}
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Initial Loading Check */}
        {isCheckingActiveTask && (
           <div className="flex flex-col items-center gap-2 py-8">
             <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
             <span className="text-zinc-400 text-sm">Checking for active tasks...</span>
           </div>
        )}

        {/* Input Form - Show only if not checking and no active/processing task */}
        {!isCheckingActiveTask && !taskId && (
          <>
            <form
              className="bg-black/40 border border-zinc-800 rounded-xl p-6 flex items-center gap-4 backdrop-blur-xl"
              onSubmit={handleSubmit}
            >
              <Input
                type="text"
                placeholder="Paste YouTube podcast link here"
                className="bg-black/30 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:ring-2 focus:ring-blue-500"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                disabled={isLoading || !!(rateLimitUntil && rateLimitUntil > now)}
              />
              <Button
                variant="default"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 flex items-center gap-2"
                type="submit"
                disabled={isLoading || !inputValue.trim() || !!(rateLimitUntil && rateLimitUntil > now)}
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowRight className="h-5 w-5" />
                )}
              </Button>
            </form>
            {rateLimitUntil && rateLimitUntil > now && (
              <div className="mt-2 text-sm text-blue-400 text-center">
                Rate limit active. Try again in{" "}
                {(() => {
                  const ms = rateLimitUntil - now;
                  const s = Math.max(0, Math.floor(ms / 1000));
                  const h = Math.floor(s / 3600);
                  const m = Math.floor((s % 3600) / 60);
                  const sec = s % 60;
                  return `${h > 0 ? `${h}h ` : ""}${m}m ${sec}s`;
                })()}
              </div>
            )}
          </>
        )}

        {/* Error Message */}
        {error && (
          <div className="text-red-400 text-sm mt-2 text-center">{error}</div>
        )}

        <p className="text-sm text-zinc-500">
          Editron v0.1 (Beta): Currently supports YouTube Short generation from podcasts. Stay tuned for advanced editing features!
        </p>
      </div>
    </div>
  );
}
