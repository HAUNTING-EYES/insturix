"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { History, Loader, CheckCircle, XCircle } from "lucide-react";
import Image from "next/image";

const placeholderHistory = [
  {
    title: "Video Generation #1",
    thumbnailUrl: "/blogs/one.jpg",
    status: "in progress",
  },
  {
    title: "Video Generation #2",
    thumbnailUrl: "/blogs/two.jpg",
    status: "finished",
  },
  {
    title: "Video Generation #3",
    thumbnailUrl: "/blogs/three.jpg",
    status: "failed",
  },
  {
    title: "Video Generation #4",
    thumbnailUrl: "/blogs/blank_profile.png",
    status: "finished",
  },
  {
    title: "Video Generation #5",
    thumbnailUrl: "/brand/Logo.jpeg",
    status: "in progress",
  },
];

export function HistoryPanel() {
  const [expanded, setExpanded] = useState(false);

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
              <ul className="space-y-3">
                {placeholderHistory.map((item, idx) => {
                  let statusStyles =
                    item.status === "in progress"
                      ? "border-blue-400 bg-zinc-800/80 animate-pulse"
                      : item.status === "finished"
                      ? "border-green-500 bg-zinc-800/90"
                      : "border-red-500 bg-zinc-900/80 opacity-80";
                  let icon =
                    item.status === "in progress" ? (
                      <Loader size={20} className="text-blue-400 animate-spin" />
                    ) : item.status === "finished" ? (
                      <CheckCircle size={20} className="text-green-500" />
                    ) : (
                      <XCircle size={20} className="text-red-500" />
                    );
                  return (
                    <li
                      key={idx}
                      className={`flex items-center gap-3 rounded-lg p-3 border-2 shadow-sm transition-all ${statusStyles} group`}
                      style={{
                        boxShadow:
                          item.status === "finished"
                            ? "0 0 0 2px #22c55e33"
                            : item.status === "failed"
                            ? "0 0 0 2px #ef444433"
                            : undefined,
                      }}
                    >
                      <div className="relative w-14 h-10 rounded overflow-hidden bg-zinc-700 flex-shrink-0 border border-zinc-600">
                        <Image
                          src={item.thumbnailUrl}
                          alt={item.title}
                          fill
                          style={{ objectFit: "cover" }}
                          sizes="56px"
                          className="rounded"
                        />
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-zinc-200 text-sm font-medium truncate">
                          {item.title}
                        </span>
                        <span
                          className={`text-xs mt-0.5 ${
                            item.status === "in progress"
                              ? "text-blue-400"
                              : item.status === "finished"
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          {item.status.charAt(0).toUpperCase() +
                            item.status.slice(1)}
                        </span>
                      </div>
                      <div className="ml-2">{icon}</div>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </Card>
        )}
      </div>
      <style jsx global>{`
        .history-panel-expanded {
          transition: max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s, transform 0.3s;
        }
        .history-panel-collapsed {
          transition: max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s, transform 0.3s;
        }
      `}</style>
    </div>
  );
}

export default HistoryPanel;