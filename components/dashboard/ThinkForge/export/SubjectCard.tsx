"use client";

import React from "react";
import {
  Check,
  X,
  Upload,
  RefreshCw,
  Trash2,
  Pencil,
  MessageSquare,
  Loader2,
  ImageIcon,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SubjectRef } from "./types";
import type { UseExportPipelineReturn } from "./hooks/useExportPipeline";

interface SubjectCardProps {
  subject: SubjectRef;
  pipeline: UseExportPipelineReturn;
}

export function SubjectCard({ subject, pipeline }: SubjectCardProps) {
  const {
    approvedSubjectIds,
    setApprovedSubjectIds,
    regeneratingSubjectIds,
    feedbackSubjectId,
    feedbackText,
    setFeedbackText,
    editingSubjectId,
    editingDescription,
    setEditingDescription,
    handleRegenerateSubject,
    handleUploadSubjectImage,
    handleDeleteSubject,
    handleStartEditDescription,
    handleSaveDescriptionAndRegenerate,
    toggleFeedbackPrompt,
  } = pipeline;

  const isApproved = approvedSubjectIds.has(subject.subjectId);
  const isRegenerating = regeneratingSubjectIds.has(subject.subjectId);
  const showFeedback = feedbackSubjectId === subject.subjectId;
  const isEditing = editingSubjectId === subject.subjectId;
  const isMissingRequiredEvidence = Boolean(subject.requiresBrandEvidence && !subject.imageUrl);
  const isBrandEvidenceLocked = Boolean(subject.requiresBrandEvidence);
  const regenerateDisabled = isBrandEvidenceLocked || isRegenerating;
  const uploadTitle = isMissingRequiredEvidence ? "Upload brand evidence" : "Upload your own image";
  const regenerateTitle = isBrandEvidenceLocked
    ? "Brand-owned references need real evidence, not AI regeneration"
    : "Regenerate (random)";
  const provenanceLabel =
    subject.referenceProvenanceLabel ||
    (isMissingRequiredEvidence
      ? "Evidence required"
      : subject.referenceProvenance === "brand-vault"
        ? "Brand Vault"
        : subject.referenceProvenance === "website-screenshot"
          ? "Website screenshot"
          : subject.referenceProvenance === "uploaded"
            ? "Uploaded"
            : subject.referenceProvenance === "generated"
              ? "Generated"
              : subject.imageUrl
                ? "Legacy reference"
                : undefined);
  const provenanceColor = isMissingRequiredEvidence
    ? "#D46A5C"
    : subject.referenceProvenance === "brand-vault" ||
        subject.referenceProvenance === "website-screenshot" ||
        subject.referenceProvenance === "uploaded"
      ? "#5EC97E"
      : "#D4A652";

  /* Mini sprocket row for subject film frames */
  const miniSprockets = (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "0 6px", height: 5, alignItems: "center", background: "#131312" }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ width: 4, height: 2.5, borderRadius: 1, background: "#454340" }} />
      ))}
    </div>
  );

  return (
    <div
      style={{
        border: "1px solid rgba(212,166,82,0.25)",
        borderRadius: 3,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Top sprockets */}
      {miniSprockets}

      {/* Image */}
      <div className="aspect-square bg-[#1B1A18] relative">
        {subject.imageUrl ? (
          <img
            src={subject.imageUrl}
            alt={subject.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#454340]">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}

        {/* Regenerating overlay */}
        {isRegenerating && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center flex-col gap-1">
            <Loader2 className="h-5 w-5 text-[#D4A652] animate-spin" />
            <span className="text-[10px] text-[#7A776E]">Regenerating...</span>
          </div>
        )}

        {/* Approve/reject toggle */}
        <button
          onClick={() => {
            if (isMissingRequiredEvidence) return;
            setApprovedSubjectIds((prev) => {
              const next = new Set(prev);
              if (next.has(subject.subjectId)) {
                next.delete(subject.subjectId);
              } else {
                next.add(subject.subjectId);
              }
              return next;
            });
          }}
          disabled={isMissingRequiredEvidence}
          className={`absolute top-1.5 right-1.5 p-1 rounded-full transition-colors ${
            isMissingRequiredEvidence
              ? "bg-[#D46A5C]/20 text-[#D46A5C] cursor-not-allowed"
              : isApproved
                ? "bg-[#5EC97E] text-[#ECE9E1]"
                : "bg-[#D4A652]/80 text-white hover:bg-[#D4A652]"
          }`}
          title={
            isMissingRequiredEvidence
              ? "Brand evidence required before approval"
              : isApproved
                ? "Approved - click to reject"
                : "Rejected - click to approve"
          }
        >
          {isApproved ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        </button>

        {/* Top-left: Upload + Regenerate + Delete */}
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          <label
            className={`p-1 rounded-full transition-colors cursor-pointer ${
              isMissingRequiredEvidence
                ? "bg-[#D46A5C]/25 text-[#D46A5C] hover:bg-[#D46A5C]/40 hover:text-[#ECE9E1]"
                : "bg-[#D4A652]/30 text-[#D4A652] hover:bg-[#D4A652]/50 hover:text-[#ECE9E1]"
            } ${isRegenerating ? "opacity-50 pointer-events-none" : ""}`}
            title={uploadTitle}
          >
            <Upload className="h-3 w-3" />
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadSubjectImage(subject.subjectId, file);
                e.target.value = "";
              }}
            />
          </label>
          <button
            onClick={() => handleRegenerateSubject(subject.subjectId)}
            disabled={regenerateDisabled}
            className={`p-1 rounded-full transition-colors ${
              isBrandEvidenceLocked
                ? "bg-[#1B1A18]/80 text-[#454340] cursor-not-allowed"
                : "bg-[#282724]/80 text-[#7A776E] hover:bg-[#454340] hover:text-[#ECE9E1]"
            }`}
            title={regenerateTitle}
          >
            <RefreshCw className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => handleDeleteSubject(subject.subjectId)}
            className="p-1 rounded-full bg-transparent border border-[#D46A5C]/30 text-[#D46A5C] hover:bg-[#D46A5C]/10 transition-colors"
            title="Remove this subject"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>

        {/* Bottom-right: Edit description + Feedback */}
        <div className="absolute bottom-1.5 right-1.5 flex gap-1">
          <button
            onClick={() => handleStartEditDescription(subject.subjectId)}
            disabled={regenerateDisabled}
            className={`p-1 rounded-full transition-colors ${
              isBrandEvidenceLocked
                ? "bg-[#1B1A18]/80 text-[#454340] cursor-not-allowed"
                : isEditing
                  ? "bg-[#D4A652] text-[#0B0B0A]"
                  : "bg-[#282724]/80 text-[#7A776E] hover:bg-[#454340] hover:text-[#ECE9E1]"
            }`}
            title={regenerateTitle}
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={() => toggleFeedbackPrompt(subject.subjectId)}
            disabled={regenerateDisabled}
            className={`p-1 rounded-full transition-colors ${
              isBrandEvidenceLocked
                ? "bg-[#1B1A18]/80 text-[#454340] cursor-not-allowed"
                : showFeedback
                  ? "bg-[#D4A652] text-[#0B0B0A]"
                  : "bg-[#282724]/80 text-[#7A776E] hover:bg-[#454340] hover:text-[#ECE9E1]"
            }`}
            title={regenerateTitle}
          >
            <MessageSquare className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Bottom sprockets */}
      {miniSprockets}

      {/* Info */}
      <div style={{ padding: "6px 8px", background: "#131312" }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: "#ECE9E1" }} className="truncate">{subject.name}</p>
        <p style={{ fontSize: 9, color: "#5F5E5A", marginTop: 1 }}>
          {subject.category} · Scenes {subject.scenesAppearingIn?.join(", ")}
        </p>
        {provenanceLabel && (
          <p className="font-mono text-[8px] uppercase tracking-[0.08em] mt-1" style={{ color: provenanceColor }}>
            {provenanceLabel}
          </p>
        )}
        {isMissingRequiredEvidence && (
          <p className="text-[9px] text-[#D46A5C] mt-1 line-clamp-2">
            {subject.evidenceRequiredReason || "Brand evidence required before storyboard generation."}
          </p>
        )}
        {subject.visualDescription && !isEditing && (
          <p className="text-[9px] text-[#454340] mt-0.5 line-clamp-2">
            {subject.visualDescription}
          </p>
        )}
      </div>

      {/* Edit description UI */}
      {isEditing && (
        <div className="px-2 pb-2 space-y-1">
          <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#D4A652]">
            Edit description & regenerate
          </p>
          <textarea
            value={editingDescription}
            onChange={(e) => setEditingDescription(e.target.value)}
            className="w-full bg-[#1B1A18] border border-[#1C1B19] text-[#ECE9E1] text-[11px] rounded p-1.5 resize-none focus:outline-none focus:border-[#D4A652]"
            rows={3}
            autoFocus
          />
          <div className="flex gap-1 justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                pipeline.setEditingSubjectId(null);
                pipeline.setEditingDescription("");
              }}
              className="text-[#7A776E] h-6 px-2 text-[10px]"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => handleSaveDescriptionAndRegenerate(subject.subjectId)}
              disabled={!editingDescription.trim() || regenerateDisabled}
              className="bg-[#D4A652] hover:bg-[#C49840] text-[#0B0B0A] h-6 px-2 text-[10px] rounded-[7px] border-none font-semibold"
            >
              {isRegenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Save & Regenerate"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Quick feedback prompt input */}
      {showFeedback && !isEditing && (
        <div className="px-2 pb-2">
          <div className="flex gap-1">
            <Input
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="e.g. make it darker, remove text..."
              className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1] text-[11px] h-7 flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && feedbackText.trim() && !isBrandEvidenceLocked) {
                  handleRegenerateSubject(subject.subjectId, feedbackText.trim());
                }
              }}
              autoFocus
            />
            <Button
              size="sm"
              onClick={() =>
                handleRegenerateSubject(subject.subjectId, feedbackText.trim())
              }
              disabled={!feedbackText.trim() || regenerateDisabled}
              className="bg-[#D4A652] hover:bg-[#C49840] text-[#0B0B0A] h-7 px-2 rounded-[7px] border-none"
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
