"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { History, Loader, CheckCircle, XCircle, Video } from "lucide-react"; // Added Video icon
// import Image from "next/image"; // Removed Image import
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { EditronTask } from "@/lib/types"; // Import the task type

export function HistoryPanel() {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = React.useState<EditronTask[]>([]); // Use specific type
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<EditronTask | null>(null); // State for dialog

  React.useEffect(() => {
    if (!expanded) return;
    setLoading(true);
    setError(null);
    fetch("/api/services/editron/history")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch history");
        return res.json();
      })
      .then((data) => {
        console.log("[HistoryPanel] Received data:", data); // Log received data
        // Ensure we are accessing the 'tasks' array from the response object
        const tasks = Array.isArray(data) ? data : data?.tasks || [];
        console.log("[HistoryPanel] Setting history:", tasks); // Log the array being set
        setHistory(tasks);
      })
      .catch((err) => {
        console.error("[HistoryPanel] Fetch error:", err); // Log fetch errors
        setError("Could not load history.");
      })
      .finally(() => setLoading(false));
  }, [expanded]);

  return (
    <div
      className="fixed top-4 right-4 z-50"
      style={{ pointerEvents: "auto" }}
      tabIndex={0}
      aria-label="History panel"
    >
      {/* Collapsed State */}
      <div
        className={`transition-all duration-400 ease-in-out overflow-hidden ${
          expanded ? "history-panel-expanded" : "history-panel-collapsed"
        }`}
        style={{
          maxHeight: expanded ? 440 : 64,
          opacity: expanded ? 1 : 0.85,
          transform: expanded ? "translateY(0)" : "translateY(20px)",
        }}
      >
        {!expanded ? (
          <Button
            variant="ghost"
            size="icon"
            className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg bg-zinc-900/90 border border-zinc-800 hover:bg-zinc-800/90 transition"
            onClick={() => setExpanded(true)}
            aria-label="Open history panel"
          >
            <History size={28} className="text-zinc-400" />
          </Button>
        ) : (
          <Card
            className="relative w-80 h-96 p-4 bg-zinc-900 border-zinc-800 shadow-lg transition-all duration-300 flex flex-col"
            tabIndex={0}
          >
            {/* Close Button */}
            <button
              className="absolute top-2 right-2 z-10 text-zinc-400 hover:text-zinc-200 transition"
              onClick={() => setExpanded(false)}
              aria-label="Close history panel"
              type="button"
              tabIndex={0}
              style={{ background: "none", border: "none", padding: 0 }}
            >
              <History size={22} />
            </button>
            <h3 className="text-lg font-semibold text-zinc-100 mb-2 pr-7">
              Generation History
            </h3>
            <ScrollArea className="flex-1 pr-1">
              {loading ? (
                <div className="flex items-center justify-center h-40 text-blue-400">
                  <Loader className="animate-spin mr-2" /> Loading...
                </div>
              ) : error ? (
                <div className="text-red-400 text-center py-8">{error}</div>
              ) : (
                <ul className="space-y-3">
                  {history.length === 0 ? (
                    <li className="text-zinc-400 text-center py-8">
                      No history yet.
                    </li>
                  ) : (
                    history.map((item: EditronTask, idx) => {
                      // Use specific type
                      const isCompleted = item.status === "COMPLETED";
                      const isFailed = item.status === "FAILED";
                      const isActive =
                        item.status === "QUEUED" ||
                        item.status === "PROCESSING";

                      const statusStyles = isActive
                        ? "border-blue-400 bg-zinc-800/80 animate-pulse"
                        : isCompleted
                          ? "border-green-500 bg-zinc-800/90"
                          : "border-red-500 bg-zinc-900/80 opacity-80";

                      const icon = isActive ? (
                        <Loader
                          size={20}
                          className="text-blue-400 animate-spin"
                        />
                      ) : isCompleted ? (
                        <CheckCircle size={20} className="text-green-500" />
                      ) : (
                        <XCircle size={20} className="text-red-500" />
                      );

                      return (
                        <li
                          key={item._id || idx}
                          className={`flex w-70 items-center gap-3 rounded-lg p-3 border-2 shadow-sm transition-all ${statusStyles} group ${
                            isCompleted
                              ? "cursor-pointer hover:bg-zinc-700/50"
                              : "" // Add clickable styles
                          }`}
                          style={{
                            boxShadow: isCompleted
                              ? "0 0 0 2px #22c55e33"
                              : isFailed
                                ? "0 0 0 2px #ef444433"
                                : undefined,
                          }}
                          onClick={() => {
                            if (isCompleted) setSelectedTask(item); // Open dialog on click if completed
                          }}
                        >
                          {/* Placeholder Icon */}
                          <div className="w-14 h-10 rounded bg-zinc-700 flex-shrink-0 border border-zinc-600 flex items-center justify-center">
                            <Video size={24} className="text-zinc-500" />
                          </div>
                          {/* Info */}
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-zinc-200 text-sm font-medium truncate">
                              {item.youtube_url}
                            </span>
                            <span
                              className={`text-[11px] mt-0.5 ${
                                isActive
                                  ? "text-blue-400"
                                  : isCompleted
                                    ? "text-green-400"
                                    : "text-red-400"
                              }`}
                            >
                              {item.status}
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              {item.created_at
                                ? new Date(item.created_at).toLocaleString()
                                : ""}
                            </span>
                            {/* Removed video/download links from here */}
                            {isFailed && item.error?.message && (
                              <span
                                className="text-[11px] text-red-400 mt-1 truncate"
                                title={item.error.message}
                              >
                                Error: {item.error.message}
                              </span>
                            )}
                          </div>
                          {/* Icon */}
                          <div className="ml-2">{icon}</div>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </ScrollArea>
          </Card>
        )}
      </div>

      {/* Dialog for displaying selected task details */}
      <Dialog
        open={!!selectedTask}
        onOpenChange={(isOpen) => !isOpen && setSelectedTask(null)}
      >
        <DialogContent className="sm:max-w-[625px] bg-zinc-900 border-zinc-700 text-zinc-100">
          {selectedTask && ( // Render content only if a task is selected
            <>
              <DialogHeader>
                <DialogTitle>Task Details</DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Details for task created on{" "}
                  {new Date(selectedTask.created_at).toLocaleString()}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {/* Display basic task info */}
                <div className="text-sm">
                  <span className="font-medium text-zinc-300">
                    Original URL:
                  </span>
                  <span className="ml-2 text-zinc-400 break-all">
                    {selectedTask.youtube_url}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-zinc-300">Status:</span>
                  <span
                    className={`ml-2 px-2 py-0.5 rounded text-[11px] ${
                      selectedTask.status === "COMPLETED"
                        ? "bg-green-600/30 text-green-300"
                        : selectedTask.status === "FAILED"
                          ? "bg-red-600/30 text-red-300"
                          : "bg-blue-600/30 text-blue-300"
                    }`}
                  >
                    {selectedTask.status}
                  </span>
                </div>

                {/* Conditionally render results for COMPLETED tasks */}
                {selectedTask.status === "COMPLETED" &&
                  selectedTask.result?.signedUrls && (
                    <div className="mt-4 space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                      <h4 className="font-medium text-zinc-200 mb-2">
                        Generated Shorts:
                      </h4>
                      {selectedTask.result.signedUrls.map(
                        (
                          urls: { playableUrl: string; downloadUrl: string },
                          i: number
                        ) => (
                          <div
                            key={i}
                            className="border border-zinc-700 p-3 rounded bg-zinc-800/70"
                          >
                            <p className="text-sm text-zinc-300 mb-2">
                              Short {i + 1}
                            </p>
                            <video
                              src={urls.playableUrl}
                              controls
                              className="w-full rounded mb-2 max-h-60" // Adjust max height for dialog
                              preload="metadata"
                            />
                            <a
                              href={urls.downloadUrl}
                              download={`generated_short_${i + 1}.mp4`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-blue-600 text-primary-foreground hover:bg-blue-700 h-9 px-3" // Standard button size
                            >
                              Download Short {i + 1}
                            </a>
                          </div>
                        )
                      )}
                    </div>
                  )}

                {/* Conditionally render error for FAILED tasks */}
                {selectedTask.status === "FAILED" &&
                  selectedTask.error?.message && (
                    <div className="mt-4 text-red-400">
                      <span className="font-medium">Error:</span>{" "}
                      {selectedTask.error.message}
                    </div>
                  )}
              </div>
              {/* No explicit footer/close button needed as Dialog handles closing */}
            </>
          )}
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .history-panel-expanded {
          transition:
            max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1),
            opacity 0.3s,
            transform 0.3s;
        }
        .history-panel-collapsed {
          transition:
            max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1),
            opacity 0.3s,
            transform 0.3s;
        }
      `}</style>
    </div>
  );
}

export default HistoryPanel;
