"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EDIT_PROFILES } from "@/lib/editron/data/edit-profiles";
import type { UseExportPipelineReturn } from "./hooks/useExportPipeline";

interface ProfileSelectionPanelProps {
  pipeline: UseExportPipelineReturn;
}

export function ProfileSelectionPanel({ pipeline }: ProfileSelectionPanelProps) {
  const {
    detectedProfile,
    setDetectedProfile,
    selectedProfileId,
    setSelectedProfileId,
    profileSearchQuery,
    setProfileSearchQuery,
    briefPlatform,
    setBriefPlatform,
    briefTone,
    setBriefTone,
    briefCaptionStyle,
    setBriefCaptionStyle,
    briefBgmMood,
    setBriefBgmMood,
    handlePostProfileSelection,
  } = pipeline;

  if (!detectedProfile) return null;

  return (
    <motion.div
      key="profile-selection"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-4 py-2"
    >
      {/* Detected profile card */}
      <div className="p-4 rounded-lg bg-[#1B1A18]/50 border border-[#282724]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-[#ECE9E1]">{detectedProfile.name}</p>
            <p className="text-[11px] text-[#7A776E] mt-0.5">{detectedProfile.description}</p>
          </div>
          <span
            className={`text-[11px] px-2 py-0.5 rounded ${
              detectedProfile.confidence >= 0.6
                ? "bg-[#5EC97E]/20 text-[#5EC97E]"
                : "bg-[#D4A652]/20 text-[#D4A652]"
            }`}
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {(detectedProfile.confidence * 100).toFixed(0)}% match
          </span>
        </div>

        {/* Reasoning */}
        {detectedProfile.reasoning.length > 0 && (
          <div className="mt-2 space-y-1">
            {detectedProfile.reasoning.slice(0, 4).map((reason, i) => (
              <p key={i} className="text-[10px] text-[#5F5E5A]">
                → {reason}
              </p>
            ))}
          </div>
        )}

        {/* Profile override -- searchable grouped list */}
        <div className="mt-3 space-y-2">
          <input
            type="text"
            placeholder="Search profiles..."
            className="w-full h-8 px-3 text-[11px] bg-[#0F0F0E] border border-[#282724] rounded-md text-[#ECE9E1] placeholder-[#5F5E5A] focus:outline-none focus:ring-1 focus:ring-[#D4A652]"
            onChange={(e) => setProfileSearchQuery(e.target.value.toLowerCase())}
          />
          <div className="max-h-48 overflow-y-auto border border-[#282724] rounded-md bg-[#0F0F0E]">
            {Object.entries(
              Object.entries(EDIT_PROFILES)
                .filter(([, p]) => {
                  if (!profileSearchQuery) return true;
                  return (
                    p.name.toLowerCase().includes(profileSearchQuery) ||
                    p.description.toLowerCase().includes(profileSearchQuery) ||
                    p.category?.toLowerCase().includes(profileSearchQuery)
                  );
                })
                .reduce<Record<string, Array<[string, any]>>>(
                  (groups, entry) => {
                    const cat = entry[1].category || "Other";
                    if (!groups[cat]) groups[cat] = [];
                    groups[cat].push(entry);
                    return groups;
                  },
                  {},
                ),
            ).map(([category, profiles]) => (
              <div key={category}>
                <div className="px-2 py-1 text-[10px] font-semibold text-[#5F5E5A] uppercase tracking-wider bg-[#1B1A18]/50 sticky top-0">
                  {category}
                </div>
                {profiles.map(([id, p]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setSelectedProfileId(id);
                      const prof =
                        EDIT_PROFILES[id as keyof typeof EDIT_PROFILES];
                      if (prof) {
                        setDetectedProfile({
                          ...detectedProfile,
                          profileId: id,
                          name: prof.name,
                          description: prof.description,
                        });
                      }
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#1B1A18] transition-colors ${
                      selectedProfileId === id
                        ? "bg-[#D4A652]/10 text-[#D4A652]"
                        : "text-[#B5B2A8]"
                    }`}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-[#5F5E5A] ml-1.5">
                      -- {p.description?.substring(0, 50)}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Brief Overrides */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div>
          <label className="text-[10px] text-[#5F5E5A] block mb-0.5">Platform</label>
          <select
            value={briefPlatform}
            onChange={(e) => setBriefPlatform(e.target.value)}
            className="w-full h-7 px-2 text-[11px] bg-[#0F0F0E] border border-[#282724] rounded text-[#B5B2A8]"
          >
            <option value="">Auto (from profile)</option>
            <option value="youtube">YouTube</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="linkedin">LinkedIn</option>
            <option value="facebook">Facebook</option>
            <option value="ad">Digital Ad</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-[#5F5E5A] block mb-0.5">Tone</label>
          <select
            value={briefTone}
            onChange={(e) => setBriefTone(e.target.value)}
            className="w-full h-7 px-2 text-[11px] bg-[#0F0F0E] border border-[#282724] rounded text-[#B5B2A8]"
          >
            <option value="">Auto (from profile)</option>
            <option value="professional">Professional</option>
            <option value="energetic">Energetic</option>
            <option value="cinematic">Cinematic</option>
            <option value="minimal">Minimal</option>
            <option value="emotional">Emotional</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-[#5F5E5A] block mb-0.5">Captions</label>
          <select
            value={briefCaptionStyle}
            onChange={(e) => setBriefCaptionStyle(e.target.value)}
            className="w-full h-7 px-2 text-[11px] bg-[#0F0F0E] border border-[#282724] rounded text-[#B5B2A8]"
          >
            <option value="">Auto (from profile)</option>
            <option value="none">None</option>
            <option value="subtitle">Subtitle (clean bottom bar)</option>
            <option value="word-by-word">Word by Word</option>
            <option value="karaoke">Karaoke (progressive highlight)</option>
            <option value="fancy">Fancy / Kinetic (AI-generated)</option>
            <option value="tiktok">TikTok</option>
            <option value="minimal">Minimal</option>
            <option value="bold">Bold</option>
            <option value="hormozi">Hormozi (bold white, yellow keywords)</option>
            <option value="mrbeast">MrBeast (large colorful, pop)</option>
            <option value="ali-abdaal">Ali Abdaal (clean modern)</option>
            <option value="corporate">Corporate (pro bottom bar)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-[#5F5E5A] block mb-0.5">BGM Mood</label>
          <select
            value={briefBgmMood}
            onChange={(e) => setBriefBgmMood(e.target.value)}
            className="w-full h-7 px-2 text-[11px] bg-[#0F0F0E] border border-[#282724] rounded text-[#B5B2A8]"
          >
            <option value="">Auto</option>
            <option value="upbeat">Upbeat</option>
            <option value="calm">Calm</option>
            <option value="dramatic">Dramatic</option>
            <option value="minimal">Minimal</option>
            <option value="cinematic">Cinematic</option>
          </select>
        </div>
      </div>

      <Button
        onClick={() => handlePostProfileSelection()}
        className="w-full mt-3 bg-[#D4A652] hover:bg-[#D4A652]/90 text-[#0B0B0A] font-medium"
      >
        Continue with {detectedProfile.name}{" "}
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </motion.div>
  );
}
