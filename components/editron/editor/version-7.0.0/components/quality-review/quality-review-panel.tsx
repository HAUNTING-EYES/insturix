"use client";

import React, { useEffect, useState, useCallback } from "react";
import { AlertTriangle, CheckCircle, Info, RefreshCw, Zap, ChevronRight } from "lucide-react";
import { useEditorContext } from "../../contexts/editor-context";
import { runQualityReview, type QualityReport, type QualityIssue } from "@/lib/editron/services/quality-review-service";

/**
 * Quality Review Panel
 *
 * Shows a quality score (0-100) and list of issues detected in the project.
 * Runs deterministic checks on overlays — zero AI cost.
 * Issues are grouped by severity with "Go to frame" navigation.
 */
export function QualityReviewPanel() {
  const editorCtx = useEditorContext();
  const [report, setReport] = useState<QualityReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Get overlays from the editor state — try multiple paths
  const overlays = editorCtx?.state?.overlays || (editorCtx as any)?.overlays || [];
  const fps = editorCtx?.state?.fps || (editorCtx as any)?.fps || 30;
  const totalFrames = editorCtx?.state?.durationInFrames || (editorCtx as any)?.durationInFrames;

  const runReview = useCallback(() => {
    if (!overlays || overlays.length === 0) return;
    setIsRunning(true);
    try {
      const result = runQualityReview(overlays, fps, totalFrames);
      setReport(result);
    } catch (err) {
      console.error("[QualityReview] Failed:", err);
    } finally {
      setIsRunning(false);
    }
  }, [overlays, fps, totalFrames]);

  // Auto-run on mount and when overlays change
  useEffect(() => {
    runReview();
  }, [overlays, fps, totalFrames]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 50) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-500/10 border-green-500/20";
    if (score >= 50) return "bg-yellow-500/10 border-yellow-500/20";
    return "bg-red-500/10 border-red-500/20";
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical": return <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
      case "warning": return <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />;
      case "info": return <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
      default: return <Info className="h-3.5 w-3.5 text-zinc-400 shrink-0" />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-200">Quality Review</h3>
          <button
            onClick={runReview}
            disabled={isRunning}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Re-run quality check"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Score Badge */}
        {report && (
          <div className={`p-3 rounded-lg border ${getScoreBg(report.overallScore)}`}>
            <div className="flex items-center gap-3">
              <div className={`text-2xl font-bold ${getScoreColor(report.overallScore)}`}>
                {report.overallScore}
              </div>
              <div className="flex-1">
                <div className="text-xs font-medium text-zinc-300">
                  {report.overallScore >= 80 ? "Good quality" : report.overallScore >= 50 ? "Needs attention" : "Critical issues"}
                </div>
                <div className="text-[10px] text-zinc-500">
                  {report.issues.length === 0
                    ? "No issues detected"
                    : `${report.issues.length} issue${report.issues.length > 1 ? "s" : ""} • ${report.autoFixable.length} auto-fixable`}
                </div>
              </div>
              {report.overallScore >= 80 && <CheckCircle className="h-5 w-5 text-green-400" />}
            </div>
          </div>
        )}

        {/* Suggestions */}
        {report?.suggestions && report.suggestions.length > 0 && (
          <div className="space-y-1">
            {report.suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded bg-zinc-800/50">
                <Zap className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                <span className="text-[11px] text-zinc-400">{s}</span>
              </div>
            ))}
          </div>
        )}

        {/* Issues List */}
        {report?.issues && report.issues.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Issues</div>
            {report.issues.map((issue, i) => (
              <IssueRow
                key={i}
                issue={issue}
                onGoToFrame={() => {}} // TODO: wire to player seek when available
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {report && report.issues.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
            <p className="text-sm text-zinc-300">All checks passed</p>
            <p className="text-[10px] text-zinc-500 mt-1">Your project looks ready for export</p>
          </div>
        )}
      </div>
    </div>
  );
}

function IssueRow({
  issue,
  onGoToFrame,
}: {
  issue: QualityIssue;
  onGoToFrame: (frame: number) => void;
}) {
  return (
    <div className="flex items-start gap-2 p-2 rounded bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors group">
      {getSeverityIconStatic(issue.severity)}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-zinc-300">{issue.description}</div>
        {issue.suggestedFix && (
          <div className="text-[10px] text-zinc-500 mt-0.5">Fix: {issue.suggestedFix}</div>
        )}
      </div>
      {issue.frameRange && (
        <button
          onClick={() => onGoToFrame(issue.frameRange!.start)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 transition-all shrink-0"
          title={`Go to frame ${issue.frameRange.start}`}
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function getSeverityIconStatic(severity: string) {
  switch (severity) {
    case "critical": return <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />;
    case "warning": return <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 shrink-0 mt-0.5" />;
    case "info": return <Info className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />;
    default: return <Info className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />;
  }
}

/**
 * Quality Score Badge — compact version for editor header toolbar.
 * Shows score as a colored number that opens the panel on click.
 */
export function QualityScoreBadge({
  overlays,
  fps,
  durationInFrames,
  onClick,
}: {
  overlays: any[];
  fps: number;
  durationInFrames?: number;
  onClick: () => void;
}) {
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    if (!overlays || overlays.length === 0) return;
    try {
      const report = runQualityReview(overlays, fps, durationInFrames);
      setScore(report.overallScore);
    } catch {
      setScore(null);
    }
  }, [overlays, fps, durationInFrames]);

  if (score === null) return null;

  const color = score >= 80 ? "text-green-400 bg-green-500/10" : score >= 50 ? "text-yellow-400 bg-yellow-500/10" : "text-red-400 bg-red-500/10";

  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-xs font-bold ${color} hover:opacity-80 transition-opacity`}
      title={`Quality score: ${score}/100. Click to review.`}
    >
      QC {score}
    </button>
  );
}
