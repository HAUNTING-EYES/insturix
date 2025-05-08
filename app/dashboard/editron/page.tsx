// Editron Dashboard with YouTube validation and UI update
"use client";

import { useState, useEffect, FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { ArrowRight, Loader2 } from "lucide-react";
import { HistoryPanel } from "@/components/dashboard/Editron/HistoryPanel";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

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

interface EditronTaskSubmitResponse {
  task_id: string;
}

interface HistoryTask {
  _id: string;
  status: TaskStatus;
  youtube_url?: string;
  created_at?: string;
}

// API functions using axios
const checkTaskStatus = async (
  taskId: string
): Promise<EditronTaskStatusResponse> => {
  try {
    const { data } = await axios.get<EditronTaskStatusResponse>(
      `/api/services/editron/status/${taskId}`
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.error || "Failed to fetch task status"
      );
    }
    throw error;
  }
};

const submitEditronTask = async (
  youtubeUrl: string
): Promise<EditronTaskSubmitResponse> => {
  try {
    const { data } = await axios.post<EditronTaskSubmitResponse>(
      "/api/services/editron/submit",
      { youtube_url: youtubeUrl }
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error("RATE_LIMITED");
      }
      throw new Error(error.response?.data?.error || "Failed to submit task");
    }
    throw error;
  }
};

const fetchActiveTask = async (): Promise<HistoryTask | undefined> => {
  try {
    const { data } = await axios.get("/api/services/editron/history");
    console.log("[Active Task Check] History API Response:", data);

    const tasks = data?.tasks || [];
    console.log("[Active Task Check] Tasks found:", tasks);

    const activeTask = tasks.find((task: HistoryTask) => {
      console.log(
        `[Active Task Check] Checking task ${task._id} with status: ${task.status}`
      );
      return task.status === "QUEUED" || task.status === "PROCESSING";
    });

    console.log("[Active Task Check] Active task found:", activeTask);
    return activeTask;
  } catch (error) {
    console.error("Error checking for active task:", error);
    return undefined;
  }
};

// Define query keys
const QueryKeys = {
  taskStatus: (taskId: string) => ["editron", "task", taskId],
  activeTask: ["editron", "active-task"],
};

export default function EditronDashboard() {
  const queryClient = useQueryClient();
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);
  const [showSubmitted, setShowSubmitted] = useState(false);

  // Rate limit countdown
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!rateLimitUntil) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [rateLimitUntil]);

  // Check for active task
  const { isLoading: isCheckingActiveTask, data: activeTaskData } = useQuery({
    queryKey: QueryKeys.activeTask,
    queryFn: fetchActiveTask,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Set task ID when active task is found
  useEffect(() => {
    if (activeTaskData) {
      console.log(
        `[Active Task Check] Found active task ID: ${activeTaskData._id}`
      );
      setTaskId(activeTaskData._id);
    }
  }, [activeTaskData]);

  // Task status query
  const { data: taskData } = useQuery<EditronTaskStatusResponse>({
    queryKey: QueryKeys.taskStatus(taskId || ""),
    queryFn: () => checkTaskStatus(taskId as string),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.status === "QUEUED" || data.status === "PROCESSING") {
        return 1500; // Poll every 1.5 seconds while in progress
      }
      return false; // Stop polling when complete or failed
    },
    staleTime: 0, // Always fetch fresh status
  });

  // Task submission mutation
  const taskSubmitMutation = useMutation({
    mutationFn: submitEditronTask,
    onSuccess: (data) => {
      setTaskId(data.task_id);
      setShowSubmitted(true);
      setInputValue("");
      setTimeout(() => setShowSubmitted(false), 1800);
      // Immediately refetch status for the new task
      queryClient.invalidateQueries({
        queryKey: QueryKeys.taskStatus(data.task_id),
      });
    },
    onError: (error: Error) => {
      if (error.message === "RATE_LIMITED") {
        const response = error.cause as Response;
        if (response?.json) {
          response
            .json()
            .then((data) => {
              const retryTimestamp = data.next_allowed_at
                ? new Date(data.next_allowed_at).getTime()
                : Date.now() + 60000;
              setRateLimitUntil(retryTimestamp);
            })
            .catch(() => {
              // Default rate limit if we can't parse the response
              setRateLimitUntil(Date.now() + 60000);
            });
        } else {
          // Fallback if no structured response
          setRateLimitUntil(Date.now() + 60000);
        }
      } else {
        setError(error.message || "Task submission failed.");
      }
    },
  });

  // Extract values from the task data with proper typing
  const taskStatus =
    (taskData as EditronTaskStatusResponse | undefined)?.status || null;
  const taskResult =
    (taskData as EditronTaskStatusResponse | undefined)?.result || null;
  const taskError =
    (taskData as EditronTaskStatusResponse | undefined)?.error?.message || null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setTaskId(null);

    taskSubmitMutation.mutate(inputValue);
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
        className="pointer-events-none absolute inset-0 z-0 aurora-background"
      />
      <style jsx global>
        {`
          .aurora-background {
            background:
              radial-gradient(
                ellipse 80% 60% at 20% 30%,
                rgba(0, 200, 255, 0.18) 0%,
                transparent 70%
              ),
              radial-gradient(
                ellipse 60% 40% at 80% 70%,
                rgba(255, 0, 200, 0.14) 0%,
                transparent 70%
              ),
              radial-gradient(
                ellipse 60% 60% at 60% 20%,
                rgba(0, 255, 180, 0.12) 0%,
                transparent 70%
              );
            animation: auroraMove 12s ease-in-out infinite alternate;
          }
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
            Generate YouTube Shorts instantly from your favorite podcasts. Enter
            the link below:
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
              This process can take up to 5 minutes to complete. Feel free to
              switch windows.
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
                {taskResult.signedUrls.map((urls: SignedUrlPair, i: number) => (
                  <div
                    key={i}
                    className="border border-zinc-700 p-3 rounded-lg bg-zinc-900/60"
                  >
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
            <span className="text-zinc-400 text-sm">
              Checking for active tasks...
            </span>
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
                onChange={(e) => setInputValue(e.target.value)}
                disabled={
                  taskSubmitMutation.isPending ||
                  !!(rateLimitUntil && rateLimitUntil > now)
                }
              />
              <Button
                variant="default"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 flex items-center gap-2"
                type="submit"
                disabled={
                  taskSubmitMutation.isPending ||
                  !inputValue.trim() ||
                  !!(rateLimitUntil && rateLimitUntil > now)
                }
              >
                {taskSubmitMutation.isPending ? (
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
          Editron v0.1 (Beta): Currently supports YouTube Short generation from
          podcasts. Stay tuned for advanced editing features!
        </p>
      </div>
    </div>
  );
}
