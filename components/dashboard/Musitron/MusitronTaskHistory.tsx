"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { MusitronTask } from "@/app/api/services/musitron/types/shared";
import { useQuery } from "@tanstack/react-query";

interface MusitronTaskWithCreator extends MusitronTask {
  createdByName?: string;
}

function formatDate(dateStr: string | Date): string {
  const dt = new Date(dateStr);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statusColor(status: MusitronTask["status"]): string {
  switch (status) {
    case "completed": return "#4ade80";
    case "processing":
    case "listed": return "#D4A652";
    case "failed": return "#f87171";
    default: return "#5F5E5A";
  }
}

function TrackRow({ task, index }: { task: MusitronTaskWithCreator; index: number }) {
  const router = useRouter();
  const isClickable = task.status === "completed" || task.status === "failed";
  const displayTitle = task.title || `Music Task #${task._id?.toString().slice(-6)}`;

  return (
    <div
      onClick={isClickable ? () => router.push(`/dashboard/musitron/task/${task._id}`) : undefined}
      style={{
        display: "grid",
        gridTemplateColumns: "40px 1fr 100px 80px 60px",
        alignItems: "center",
        gap: 12,
        padding: "12px 18px",
        borderBottom: "1px solid #1C1B19",
        cursor: isClickable ? "pointer" : "default",
        transition: "background .15s",
      }}
      className="musitron-th-row"
    >
      {/* Number */}
      <div
        style={{
          fontSize: 13,
          color: "#5F5E5A",
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: "center",
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </div>

      {/* Title + Style */}
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#ECE9E1",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={displayTitle}
        >
          {displayTitle}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "#5F5E5A",
            fontFamily: "'JetBrains Mono', monospace",
            marginTop: 1,
          }}
        >
          {task.style || ""}
        </div>
      </div>

      {/* Date */}
      <div
        style={{
          fontSize: 11,
          color: "#5F5E5A",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {formatDate(task.createdAt)}
      </div>

      {/* Duration placeholder */}
      <div
        style={{
          fontSize: 11,
          color: "#7A776E",
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: "right",
        }}
      >
        --:--
      </div>

      {/* Status */}
      <div style={{ textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: statusColor(task.status),
            animation:
              task.status === "processing" || task.status === "listed"
                ? "thPulse 1.5s ease infinite"
                : "none",
          }}
        />
      </div>
    </div>
  );
}

export function MusitronTaskHistory() {
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["musitron-tasks", currentPage, ITEMS_PER_PAGE],
    queryFn: async () => {
      const response = await fetch(
        `/api/services/musitron/history?page=${currentPage}&limit=${ITEMS_PER_PAGE}`
      );
      if (!response.ok) throw new Error("Failed to fetch Musitron tasks");
      const result = await response.json();
      const list = Array.isArray(result?.data) ? result.data : [];
      const mapped: MusitronTaskWithCreator[] = (list as any[]).map(
        (task: any) => ({
          ...task,
          createdAt: new Date(task.createdAt),
          updatedAt: new Date(task.updatedAt),
          ...(task.completedAt ? { completedAt: new Date(task.completedAt) } : {}),
        })
      );
      return {
        items: mapped,
        pagination: {
          totalItems: Number(result?.pagination?.totalItems) || mapped.length,
          totalPages: Number(result?.pagination?.totalPages) || 1,
          currentPage: Number(result?.pagination?.currentPage) || currentPage,
          itemsPerPage: Number(result?.pagination?.itemsPerPage) || ITEMS_PER_PAGE,
          hasNext: Boolean(result?.pagination?.hasNext),
          hasPrev: Boolean(result?.pagination?.hasPrev),
        },
      };
    },
    refetchInterval: (query) => {
      const hasInProgress = query.state.data?.items?.some(
        (t: MusitronTask) => t.status === "processing" || t.status === "listed"
      );
      return hasInProgress ? 5000 : false;
    },
    staleTime: 1000 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: true,
  });

  const tasksData: MusitronTask[] = Array.isArray(pageData?.items) ? pageData!.items : [];
  const pagination = pageData?.pagination || {
    totalItems: tasksData.length,
    totalPages: 1,
    currentPage,
    itemsPerPage: ITEMS_PER_PAGE,
  };

  const totalPages = Math.max(1, Number(pagination.totalPages) || 1);
  const totalItems = Number(pagination.totalItems) || tasksData.length;

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            color: "#7A776E",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          Task History
        </span>
        <span
          style={{
            padding: "2px 8px",
            background: "rgba(212,166,82,0.08)",
            borderRadius: 10,
            fontSize: 10,
            color: "#D4A652",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {totalItems}
        </span>
      </div>

      {/* Track list table */}
      {tasksData.length > 0 ? (
        <div
          style={{
            background: "#0F0F0E",
            border: "1px solid #1C1B19",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "40px 1fr 100px 80px 60px",
              alignItems: "center",
              gap: 12,
              padding: "10px 18px",
              borderBottom: "1px solid #1C1B19",
              fontSize: 10,
              color: "#5F5E5A",
              fontFamily: "'JetBrains Mono', monospace",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
            }}
          >
            <div>#</div>
            <div>Title</div>
            <div>Date</div>
            <div style={{ textAlign: "right" }}>Duration</div>
            <div style={{ textAlign: "center" }}>Status</div>
          </div>

          {/* Rows */}
          {tasksData.map((task, i) => (
            <TrackRow key={task._id} task={task} index={i + (currentPage - 1) * ITEMS_PER_PAGE} />
          ))}
        </div>
      ) : (
        /* Empty State */
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "60px 32px",
            textAlign: "center",
            border: "2px dashed #282724",
            borderRadius: 12,
            background: "#0F0F0E",
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#5F5E5A"
            strokeWidth="1.5"
            style={{ marginBottom: 12 }}
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <div style={{ fontSize: 14, color: "#B5B2A8", marginBottom: 4 }}>
            No music generated yet
          </div>
          <div style={{ fontSize: 12, color: "#5F5E5A" }}>
            Create your first music using the form to see it appear here.
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            marginTop: 16,
          }}
        >
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1 || isLoading}
            style={{
              ...paginationBtnStyle,
              opacity: currentPage === 1 ? 0.4 : 1,
              cursor: currentPage === 1 ? "not-allowed" : "pointer",
            }}
          >
            &#8592; Prev
          </button>
          <span
            style={{
              fontSize: 11,
              color: "#7A776E",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage >= totalPages || isLoading}
            style={{
              ...paginationBtnStyle,
              opacity: currentPage >= totalPages ? 0.4 : 1,
              cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
            }}
          >
            Next &#8594;
          </button>
        </div>
      )}

      <style>{`
        .musitron-th-row:hover { background: #131312 !important; }
        @keyframes thPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}

const paginationBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 11,
  fontWeight: 600,
  background: "#131312",
  border: "1px solid #1C1B19",
  borderRadius: 6,
  color: "#B5B2A8",
  fontFamily: "'JetBrains Mono', monospace",
  transition: "all .2s",
};
