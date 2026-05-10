"use client";

import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  X, Plus, Trash2, GripVertical, Check,
  FileText, Film, DollarSign, Camera, BookOpen,
  Globe, Music, Search, FileQuestion,
} from "lucide-react";

export interface BlueprintArtifact {
  type: string;
  label: string;
  description?: string;
  priority?: string;
}

interface BlueprintCustomizerProps {
  artifacts: BlueprintArtifact[];
  onSave: (artifacts: BlueprintArtifact[]) => void;
  onCancel: () => void;
}

const PRESET_TYPES = [
  { type: "screenplay", label: "Screenplay" },
  { type: "vfx_brief", label: "VFX Brief" },
  { type: "budget", label: "Budget Estimate" },
  { type: "shot_list", label: "Shot List" },
  { type: "character_bible", label: "Character Bible" },
  { type: "world_bible", label: "World Bible" },
  { type: "score_direction", label: "Score Direction" },
  { type: "research_brief", label: "Research Brief" },
  { type: "interview_questions", label: "Interview Questions" },
  { type: "custom", label: "Custom Document" },
];

const PRIORITY_OPTIONS = ["required", "recommended", "optional"] as const;

const PRIORITY_COLORS: Record<string, string> = {
  required: "bg-[#D4A652]",
  recommended: "bg-[#D4A652]",
  optional: "bg-zinc-500",
};

const DOC_ICONS: Record<string, React.ComponentType<any>> = {
  screenplay: FileText,
  vfx_brief: Film,
  budget: DollarSign,
  shot_list: Camera,
  character_bible: BookOpen,
  world_bible: Globe,
  score_direction: Music,
  research_brief: Search,
  interview_questions: FileQuestion,
  custom: FileText,
};

export function BlueprintCustomizer({ artifacts: initial, onSave, onCancel }: BlueprintCustomizerProps) {
  const [items, setItems] = useState<BlueprintArtifact[]>(() =>
    initial.map(a => ({ ...a }))
  );
  const [showAdd, setShowAdd] = useState(false);

  const toggleItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateField = useCallback(
    (index: number, field: keyof BlueprintArtifact, value: string) => {
      setItems(prev =>
        prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
      );
    },
    []
  );

  const addPreset = useCallback((preset: typeof PRESET_TYPES[number]) => {
    setItems(prev => [
      ...prev,
      { type: preset.type, label: preset.label, description: "", priority: "recommended" },
    ]);
    setShowAdd(false);
  }, []);

  const totalCredits = items.length * 5;

  return (
    <div className="rounded-xl border border-[#1C1B19] bg-[#0B0B0A]/95 backdrop-blur-xl p-4 space-y-3 shadow-2xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#ECE9E1]">Customize Blueprint</h3>
        <button onClick={onCancel} className="p-1 rounded hover:bg-[#1C1B19] transition-colors">
          <X className="h-3.5 w-3.5 text-[#5F5E5A]" />
        </button>
      </div>

      <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
        {items.map((item, i) => {
          const Icon = DOC_ICONS[item.type] || FileText;
          return (
            <div
              key={`${item.type}-${i}`}
              className="group flex items-center gap-2 rounded-lg border border-[#1C1B19] bg-white/3 px-2.5 py-2 hover:border-[#1C1B19] transition-colors"
            >
              <Icon className="h-3.5 w-3.5 text-[#5F5E5A] shrink-0" />

              <input
                type="text"
                value={item.label}
                onChange={e => updateField(i, "label", e.target.value)}
                className="flex-1 bg-transparent text-[11px] text-[#ECE9E1] outline-none placeholder:text-[#454340] min-w-0"
                placeholder="Document name"
              />

              <select
                value={item.priority || "recommended"}
                onChange={e => updateField(i, "priority", e.target.value)}
                className="bg-transparent text-[10px] text-[#7A776E] outline-none cursor-pointer border-none"
              >
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p} value={p} className="bg-[#0F0F0E] text-[#B5B2A8]">
                    {p}
                  </option>
                ))}
              </select>

              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", PRIORITY_COLORS[item.priority || "recommended"])} />

              <button
                onClick={() => toggleItem(i)}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[#D4A652]/20 transition-all"
              >
                <Trash2 className="h-3 w-3 text-[#D4A652]" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add artifact */}
      {showAdd ? (
        <div className="grid grid-cols-2 gap-1 p-2 rounded-lg border border-[#1C1B19] bg-white/3">
          {PRESET_TYPES.filter(p => !items.some(i => i.type === p.type)).map(preset => (
            <button
              key={preset.type}
              onClick={() => addPreset(preset)}
              className="text-[10px] text-left text-[#7A776E] hover:text-[#ECE9E1] px-2 py-1.5 rounded hover:bg-[#0F0F0E] transition-colors"
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={() => setShowAdd(false)}
            className="col-span-2 text-[10px] text-[#454340] hover:text-[#7A776E] pt-1"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-[10px] text-[#5F5E5A] hover:text-[#B5B2A8] transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add document
        </button>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-[#1C1B19]">
        <span className="text-[10px] text-[#5F5E5A]">
          {items.length} document{items.length !== 1 ? "s" : ""} &middot; {totalCredits} credits
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={onCancel}
            className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-[#0F0F0E] text-[#7A776E] hover:bg-[#1C1B19] ring-1 ring-[#1C1B19] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(items)}
            disabled={items.length === 0}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1",
              items.length > 0
                ? "bg-[#D4A652]/20 text-[#D4A652] hover:bg-[#D4A652]/30 ring-1 ring-[#D4A652]/20"
                : "bg-[#0F0F0E] text-[#454340] cursor-not-allowed"
            )}
          >
            <Check className="h-3 w-3" />
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
