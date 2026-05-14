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

  return (
    <div
      className={`relative rounded-lg border overflow-hidden transition-all ${
        isApproved
          ? "border-[#5EC97E]/40 bg-[#5EC97E]/5"
          : "border-[#D4A652]/30 bg-[#D4A652]/5"
      }`}
    >
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
            <Loader2 className="h-5 w-5 text-[#9088D4] animate-spin" />
            <span className="text-[10px] text-[#7A776E]">Regenerating...</span>
          </div>
        )}

        {/* Approve/reject toggle */}
        <button
          onClick={() => {
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
          className={`absolute top-1.5 right-1.5 p-1 rounded-full transition-colors ${
            isApproved
              ? "bg-[#5EC97E] text-[#ECE9E1]"
              : "bg-[#D4A652]/80 text-white hover:bg-[#D4A652]"
          }`}
          title={isApproved ? "Approved — click to reject" : "Rejected — click to approve"}
        >
          {isApproved ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        </button>

        {/* Top-left: Upload + Regenerate + Delete */}
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          <label
            className={`p-1 rounded-full bg-emerald-700/80 text-emerald-300 hover:bg-emerald-600 hover:text-[#ECE9E1] transition-colors cursor-pointer ${isRegenerating ? "opacity-50 pointer-events-none" : ""}`}
            title="Upload your own image"
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
            disabled={isRegenerating}
            className="p-1 rounded-full bg-[#282724]/80 text-[#7A776E] hover:bg-[#454340] hover:text-[#ECE9E1] transition-colors"
            title="Regenerate (random)"
          >
            <RefreshCw className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => handleDeleteSubject(subject.subjectId)}
            className="p-1 rounded-full bg-[#282724]/80 text-[#D46A5C] hover:bg-[#D46A5C] hover:text-[#ECE9E1] transition-colors"
            title="Remove this subject"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>

        {/* Bottom-right: Edit description + Feedback */}
        <div className="absolute bottom-1.5 right-1.5 flex gap-1">
          <button
            onClick={() => handleStartEditDescription(subject.subjectId)}
            disabled={isRegenerating}
            className={`p-1 rounded-full transition-colors ${
              isEditing
                ? "bg-[#5CB8CC] text-[#ECE9E1]"
                : "bg-[#282724]/80 text-[#7A776E] hover:bg-[#454340] hover:text-[#ECE9E1]"
            }`}
            title="Edit description & regenerate"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={() => toggleFeedbackPrompt(subject.subjectId)}
            disabled={isRegenerating}
            className={`p-1 rounded-full transition-colors ${
              showFeedback
                ? "bg-[#9088D4] text-[#ECE9E1]"
                : "bg-[#282724]/80 text-[#7A776E] hover:bg-[#454340] hover:text-[#ECE9E1]"
            }`}
            title="Quick feedback"
          >
            <MessageSquare className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-2">
        <p className="text-[11px] font-medium text-[#ECE9E1] truncate">{subject.name}</p>
        <p className="text-[10px] text-[#5F5E5A]">
          {subject.category} · Scenes {subject.scenesAppearingIn?.join(", ")}
        </p>
        {subject.visualDescription && !isEditing && (
          <p className="text-[9px] text-[#454340] mt-0.5 line-clamp-2">
            {subject.visualDescription}
          </p>
        )}
      </div>

      {/* Edit description UI */}
      {isEditing && (
        <div className="px-2 pb-2 space-y-1">
          <p className="text-[10px] text-[#5CB8CC] font-medium">
            Edit description & regenerate:
          </p>
          <textarea
            value={editingDescription}
            onChange={(e) => setEditingDescription(e.target.value)}
            className="w-full bg-[#1B1A18] border border-[#282724] text-[#ECE9E1] text-[11px] rounded p-1.5 resize-none focus:outline-none focus:border-[#5CB8CC]"
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
              disabled={!editingDescription.trim() || isRegenerating}
              className="bg-[#5CB8CC] hover:bg-[#5CB8CC]/80 text-white h-6 px-2 text-[10px]"
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
                if (e.key === "Enter" && feedbackText.trim()) {
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
              disabled={!feedbackText.trim() || isRegenerating}
              className="bg-[#9088D4] hover:bg-[#9088D4]/80 text-white h-7 px-2"
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
