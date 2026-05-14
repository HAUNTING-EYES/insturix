"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Users,
  Plus,
  Loader2,
  X,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubjectCard } from "./SubjectCard";
import type { UseExportPipelineReturn } from "./hooks/useExportPipeline";

interface ReferenceImagePanelProps {
  pipeline: UseExportPipelineReturn;
}

export function ReferenceImagePanel({ pipeline }: ReferenceImagePanelProps) {
  const {
    subjects,
    approvedSubjectIds,
    suggestedSubjects,
    generatingSuggestedIds,
    scriptSearchQuery,
    setScriptSearchQuery,
    showAddSubject,
    setShowAddSubject,
    addingSubject,
    newSubjectName,
    setNewSubjectName,
    newSubjectCategory,
    setNewSubjectCategory,
    newSubjectDescription,
    setNewSubjectDescription,
    newSubjectScenes,
    setNewSubjectScenes,
    regeneratingSubjectIds,
    error,
    handleGenerateSuggested,
    handleAddSubject,
    handlePhase2,
    setApprovedSubjectIds,
  } = pipeline;

  return (
    <motion.div
      key="review-refs"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="py-2 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-4 w-4 text-[#D4A652]" />
        <p className="text-sm font-medium text-[#ECE9E1] font-sans">
          Review Reference Images ({approvedSubjectIds.size}/{subjects.length}{" "}
          approved)
        </p>
      </div>
      <p className="text-[11px] text-[#5F5E5A]">
        These reference images guide AI for visual consistency. Approve, reject,
        regenerate, or add more from script suggestions below.
      </p>

      {/* Subject grid */}
      <div className="grid grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
        {subjects.map((subject) => (
          <SubjectCard
            key={subject.subjectId}
            subject={subject}
            pipeline={pipeline}
          />
        ))}
      </div>

      {/* Suggested from Script */}
      {suggestedSubjects.length > 0 && (
        <div className="space-y-1.5">
          <p
            className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#5F5E5A]"
          >
            More from your script ({suggestedSubjects.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestedSubjects
              .filter(
                (s) =>
                  !scriptSearchQuery ||
                  s.name
                    .toLowerCase()
                    .includes(scriptSearchQuery.toLowerCase()) ||
                  s.visualDescription
                    .toLowerCase()
                    .includes(scriptSearchQuery.toLowerCase()) ||
                  s.category
                    .toLowerCase()
                    .includes(scriptSearchQuery.toLowerCase()),
              )
              .map((suggested) => (
                <button
                  key={suggested.id}
                  onClick={() => handleGenerateSuggested(suggested)}
                  disabled={generatingSuggestedIds.has(suggested.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#1C1B19] bg-[#131312] hover:border-[#D4A652]/50 hover:bg-[#D4A652]/10 transition-all text-left group disabled:opacity-50"
                  title={suggested.visualDescription}
                >
                  {generatingSuggestedIds.has(suggested.id) ? (
                    <Loader2 className="h-3 w-3 text-[#D4A652] animate-spin flex-shrink-0" />
                  ) : (
                    <Plus className="h-3 w-3 text-[#5F5E5A] group-hover:text-[#D4A652] flex-shrink-0" />
                  )}
                  <span className="text-[11px] text-[#B5B2A8] group-hover:text-[#ECE9E1]">
                    {suggested.name}
                  </span>
                  <span className="text-[9px] text-[#454340] group-hover:text-[#5F5E5A]">
                    {suggested.category}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Search + Manual Add */}
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          <Input
            value={scriptSearchQuery}
            onChange={(e) => setScriptSearchQuery(e.target.value)}
            placeholder={
              suggestedSubjects.length > 0
                ? "Search suggestions or type a new subject..."
                : 'Type a subject to add (e.g. "red sports car")...'
            }
            className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1] text-[11px] h-7 flex-1"
          />
          {!showAddSubject && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowAddSubject(true);
                if (scriptSearchQuery.trim()) {
                  setNewSubjectName(scriptSearchQuery.trim());
                }
              }}
              className="h-7 px-2 text-[10px] border-[#282724] text-[#7A776E] hover:text-[#D4A652] hover:border-[#D4A652]/50 rounded-[7px]"
            >
              <Plus className="h-3 w-3 mr-1" />
              Custom
            </Button>
          )}
        </div>

        {/* Expanded manual add form */}
        {showAddSubject && (
          <div className="rounded-lg border border-[#D4A652]/30 bg-[#D4A652]/5 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#D4A652]">
                Add Custom Subject
              </p>
              <button
                onClick={() => {
                  setShowAddSubject(false);
                  setNewSubjectName("");
                  setNewSubjectCategory("character");
                  setNewSubjectDescription("");
                  setNewSubjectScenes("");
                }}
                className="text-[#5F5E5A] hover:text-[#B5B2A8]"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-mono text-[9px] text-[#5F5E5A] block mb-0.5">
                  Name
                </label>
                <Input
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder="e.g. Main Character"
                  className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1] text-[11px] h-7"
                  autoFocus
                />
              </div>
              <div>
                <label className="font-mono text-[9px] text-[#5F5E5A] block mb-0.5">
                  Category
                </label>
                <Select
                  value={newSubjectCategory}
                  onValueChange={setNewSubjectCategory}
                >
                  <SelectTrigger className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1] text-[11px] h-7">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1]">
                    <SelectItem value="character">Character</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="location">Location</SelectItem>
                    <SelectItem value="object">Object</SelectItem>
                    <SelectItem value="vehicle">Vehicle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="font-mono text-[9px] text-[#5F5E5A] block mb-0.5">
                Visual Description (AI will refine this into a generation prompt)
              </label>
              <textarea
                value={newSubjectDescription}
                onChange={(e) => setNewSubjectDescription(e.target.value)}
                placeholder="Describe the subject — can be brief, AI will expand it using your script context"
                className="w-full bg-[#1B1A18] border border-[#282724] text-[#ECE9E1] text-[11px] rounded p-1.5 resize-none focus:outline-none focus:border-[#D4A652]"
                rows={2}
              />
            </div>
            <Button
              onClick={handleAddSubject}
              disabled={
                addingSubject ||
                !newSubjectName.trim() ||
                !newSubjectDescription.trim()
              }
              className="w-full bg-[#D4A652] hover:bg-[#C49840] text-[#0B0B0A] font-semibold text-[11px] h-7 rounded-[7px] border-none"
            >
              {addingSubject ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Generating...
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3 mr-1" />
                  Generate & Add
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-[#D4A652]">{error}</p>}

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1C1B19]">
        <Button
          variant="ghost"
          onClick={() => {
            setApprovedSubjectIds(new Set());
            handlePhase2();
          }}
          className="bg-transparent border border-[#282724] text-[#7A776E] hover:border-[#D4A652] hover:text-[#D4A652] rounded-[7px]"
        >
          Skip References
        </Button>
        <Button
          onClick={() => handlePhase2()}
          disabled={regeneratingSubjectIds.size > 0}
          className="bg-[#D4A652] hover:bg-[#C49840] text-[#0B0B0A] font-semibold rounded-[7px] border-none"
        >
          <ArrowRight className="h-4 w-4 mr-2" />
          Continue with {approvedSubjectIds.size} Reference
          {approvedSubjectIds.size !== 1 ? "s" : ""}
        </Button>
      </div>
    </motion.div>
  );
}
