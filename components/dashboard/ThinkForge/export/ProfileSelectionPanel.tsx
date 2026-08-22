"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Select, type SelectOption } from "@/components/primitives";
import { EDIT_PROFILES } from "@/lib/editron/data/edit-profiles";
import type { UseExportPipelineReturn } from "./hooks/useExportPipeline";

interface ProfileSelectionPanelProps {
  pipeline: UseExportPipelineReturn;
}

const BRIEF_PLATFORM_OPTIONS: SelectOption[] = [
  { value: "", label: "Auto (from profile)" },
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "facebook", label: "Facebook" },
  { value: "ad", label: "Digital Ad" },
];
const BRIEF_TONE_OPTIONS: SelectOption[] = [
  { value: "", label: "Auto (from profile)" },
  { value: "professional", label: "Professional" },
  { value: "energetic", label: "Energetic" },
  { value: "cinematic", label: "Cinematic" },
  { value: "minimal", label: "Minimal" },
  { value: "emotional", label: "Emotional" },
];
const BRIEF_CAPTION_STYLE_OPTIONS: SelectOption[] = [
  { value: "", label: "Auto (from profile)" },
  { value: "none", label: "None" },
  { value: "subtitle", label: "Subtitle (clean bottom bar)" },
  { value: "word-by-word", label: "Word by Word" },
  { value: "karaoke", label: "Karaoke (progressive highlight)" },
  { value: "fancy", label: "Fancy / Kinetic (AI-generated)" },
  { value: "tiktok", label: "TikTok" },
  { value: "minimal", label: "Minimal" },
  { value: "bold", label: "Bold" },
  { value: "hormozi", label: "Hormozi (bold white, yellow keywords)" },
  { value: "mrbeast", label: "MrBeast (large colorful, pop)" },
  { value: "ali-abdaal", label: "Ali Abdaal (clean modern)" },
  { value: "corporate", label: "Corporate (pro bottom bar)" },
];
const BRIEF_BGM_MOOD_OPTIONS: SelectOption[] = [
  { value: "", label: "Auto" },
  { value: "upbeat", label: "Upbeat" },
  { value: "calm", label: "Calm" },
  { value: "dramatic", label: "Dramatic" },
  { value: "minimal", label: "Minimal" },
  { value: "cinematic", label: "Cinematic" },
];

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
      className="space-y-3 py-2"
    >
      {/* Film-frame profile card */}
      <div
        style={{
          border: "1px solid rgba(212,166,82,0.25)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        {/* Profile header */}
        <div
          style={{
            padding: "10px 12px",
            background: "rgba(212,166,82,0.03)",
            borderBottom: "1px solid rgba(212,166,82,0.1)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: "#ECE9E1" }}>{detectedProfile.name}</p>
            <p style={{ fontSize: 11, color: "#7A776E", marginTop: 2 }}>{detectedProfile.description}</p>
          </div>
          <span
            style={{
              fontSize: 10,
              padding: "2px 7px",
              borderRadius: 3,
              fontFamily: "'JetBrains Mono', monospace",
              background: detectedProfile.confidence >= 0.6 ? "rgba(94,201,126,0.2)" : "rgba(212,166,82,0.2)",
              color: detectedProfile.confidence >= 0.6 ? "#5EC97E" : "#D4A652",
            }}
          >
            {(detectedProfile.confidence * 100).toFixed(0)}% match
          </span>
        </div>

        {/* Profile body */}
        <div style={{ padding: "8px 12px" }}>
          {/* Reasoning */}
          {detectedProfile.reasoning.length > 0 && (
            <div className="space-y-1 mb-2">
              {detectedProfile.reasoning.slice(0, 4).map((reason, i) => (
                <p key={i} style={{ fontSize: 10, color: "#5F5E5A" }}>
                  {"→"} {reason}
                </p>
              ))}
            </div>
          )}

          {/* Profile override -- searchable grouped list */}
          <input
            type="text"
            placeholder="Search profiles..."
            style={{
              width: "100%",
              height: 26,
              padding: "0 8px",
              fontSize: 11,
              background: "#0F0F0E",
              border: "1px solid #282724",
              borderRadius: 3,
              color: "#ECE9E1",
              outline: "none",
              marginTop: 6,
            }}
            onChange={(e) => setProfileSearchQuery(e.target.value.toLowerCase())}
          />
          <div
            style={{
              maxHeight: 110,
              overflowY: "auto",
              border: "1px solid #282724",
              borderRadius: 3,
              background: "#0F0F0E",
              marginTop: 6,
            }}
          >
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
                <div
                  style={{
                    padding: "3px 8px",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#5F5E5A",
                    background: "rgba(27,26,24,0.5)",
                    position: "sticky",
                    top: 0,
                  }}
                >
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
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "5px 10px",
                      fontSize: 11,
                      color: selectedProfileId === id ? "#D4A652" : "#B5B2A8",
                      background: selectedProfileId === id ? "rgba(212,166,82,0.08)" : "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {p.name}
                    <span style={{ color: "#5F5E5A", marginLeft: 6 }}>
                      -- {p.description?.substring(0, 50)}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Brief Overrides grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
        <div>
          <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5F5E5A", display: "block", marginBottom: 2 }}>Platform</label>
          <Select
            size="sm"
            aria-label="Platform"
            value={briefPlatform}
            onChange={setBriefPlatform}
            options={BRIEF_PLATFORM_OPTIONS}
          />
        </div>
        <div>
          <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5F5E5A", display: "block", marginBottom: 2 }}>Tone</label>
          <Select
            size="sm"
            aria-label="Tone"
            value={briefTone}
            onChange={setBriefTone}
            options={BRIEF_TONE_OPTIONS}
          />
        </div>
        <div>
          <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5F5E5A", display: "block", marginBottom: 2 }}>Captions</label>
          <Select
            size="sm"
            aria-label="Captions"
            value={briefCaptionStyle}
            onChange={setBriefCaptionStyle}
            options={BRIEF_CAPTION_STYLE_OPTIONS}
          />
        </div>
        <div>
          <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5F5E5A", display: "block", marginBottom: 2 }}>BGM Mood</label>
          <Select
            size="sm"
            aria-label="BGM Mood"
            value={briefBgmMood}
            onChange={setBriefBgmMood}
            options={BRIEF_BGM_MOOD_OPTIONS}
          />
        </div>
      </div>

      <button
        onClick={() => handlePostProfileSelection()}
        style={{
          width: "100%",
          marginTop: 10,
          padding: "7px 14px",
          borderRadius: 4,
          background: "#D4A652",
          color: "#0B0B0A",
          fontWeight: 600,
          fontSize: 13,
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        Continue with {detectedProfile.name}
        <ArrowRight className="h-4 w-4" />
      </button>
    </motion.div>
  );
}
