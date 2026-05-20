"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCredits } from "@/hooks/useCredits";
import { ChannelStrip } from "./ChannelStrip";
import { getCreditCost } from "@/lib/config/creditCosts";

/**
 * Model capabilities configuration.
 * Add new models or update capabilities here to automatically sync UI logic.
 */
const MUSIC_MODELS_CONFIG: Record<
  string,
  {
    label: string;
    hasDuration: boolean;
    description: string;
    minDuration?: number;
    maxDuration?: number;
    channelNumber: number;
    knobRotation: number;
  }
> = {
  "sonauto/v2/text-to-music": {
    label: "Sonauto V2",
    hasDuration: false,
    description:
      "Best for viral hits; creates full songs with realistic, expressive vocals/lyrics, controllable via BPM and customizable text.",
    channelNumber: 1,
    knobRotation: -40,
  },
  "fal-ai/stable-audio/v2.5": {
    label: "Stable Audio",
    hasDuration: true,
    minDuration: 5,
    maxDuration: 240,
    description:
      "Best for video background music; generates high-quality, structured instrumental tracks (up to 4 minutes) with distinct intro/outro sections.",
    channelNumber: 2,
    knobRotation: 15,
  },
  "fal-ai/minimax-music/v2": {
    label: "MiniMax V2",
    hasDuration: false,
    description:
      "Best for complex compositions; excels at high-fidelity instrumentals and multi-language vocals that rival human performances.",
    channelNumber: 3,
    knobRotation: 60,
  },
};

export default function MusicGenerator() {
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [duration, setDuration] = useState(30);
  const [model, setModel] = useState("sonauto/v2/text-to-music");
  const [instrumental, setInstrumental] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { invalidateCredits } = useCredits();

  const currentModelConfig = MUSIC_MODELS_CONFIG[model];
  const supportsDuration = currentModelConfig?.hasDuration;
  const creditCost = getCreditCost("musitron", "music_generation", { model });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title) {
      toast({ title: "Validation Error", description: "Please enter a title", variant: "destructive" });
      return;
    }
    if (!style) {
      toast({ title: "Validation Error", description: "Please enter a style of music", variant: "destructive" });
      return;
    }
    if (!duration || isNaN(Number(duration)) || Number(duration) < 5 || Number(duration) > 240) {
      toast({ title: "Validation Error", description: "Please enter a valid duration between 5 and 240 seconds", variant: "destructive" });
      return;
    }
    if (!instrumental && !lyrics && model !== "fal-ai/stable-audio/v2.5") {
      toast({ title: "Validation Error", description: "Please enter lyrics or enable instrumental mode", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      const payload: any = { title, instrumental, style, duration: Number(duration), model };
      if (!instrumental) payload.lyrics = lyrics;

      const res = await fetch("/api/services/musitron/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseData = await res.json();

      if (!res.ok || !responseData.success) {
        const errorMessage = responseData.error?.message || "Failed to start music generation";
        throw new Error(errorMessage);
      }

      toast({ title: "Success", description: "Music generation started!" });

      queryClient.invalidateQueries({ queryKey: ["musitron-analytics"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["musitron-tasks"] });
    } catch (err: any) {
      console.error("Music generation error:", err);

      let errTitle = "Error";
      let description = "Failed to start music generation. Please try again.";

      if (err.message.includes("Failed to fetch") || err.message.includes("Network Error")) {
        errTitle = "Connection Error";
        description = "Unable to connect to the music generation service. Please check your internet connection and try again.";
      } else if (err.message.includes("403") || err.message.includes("Access Denied") || err.message.includes("limit exceeded")) {
        errTitle = "Access Denied";
        description = "You may not have permission to generate music or have reached your usage limit.";
      } else if (err.message.includes("500") || err.message.includes("Internal Server Error") || err.message.includes("Service Error")) {
        errTitle = "Service Error";
        description = "The music generation service is currently experiencing technical difficulties. Please try again later.";
      } else if (err.message.includes("429") || err.message.includes("Too Many Requests")) {
        errTitle = "Too Many Requests";
        description = "Too many music generation requests. Please wait a moment and try again.";
      } else if (err.message.includes("DATABASE_ERROR") || err.message.includes("Database Error")) {
        errTitle = "Service Error";
        description = "The music generation service is currently experiencing technical difficulties. Please try again later.";
      }

      toast({ title: errTitle, description, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleModelChange = (value: string) => {
    setModel(value);
    if (value === "fal-ai/stable-audio/v2.5") {
      setLyrics("");
      setInstrumental(true);
    } else {
      setInstrumental(false);
    }
  };

  const displayDuration = supportsDuration
    ? duration
    : model === "fal-ai/minimax-music/v2"
      ? 60
      : 95;

  return (
    <form onSubmit={handleSubmit}>
      {/* Channel Strips — Model Selection */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 24 }}>
        {Object.entries(MUSIC_MODELS_CONFIG).map(([modelId, config]) => (
          <ChannelStrip
            key={modelId}
            modelId={modelId}
            label={config.label}
            channelNumber={config.channelNumber}
            description={config.description}
            creditCost={getCreditCost("musitron", "music_generation", { model: modelId })}
            isActive={model === modelId}
            onSelect={handleModelChange}
            knobRotation={config.knobRotation}
          />
        ))}
      </div>

      {/* Model Description */}
      <div
        style={{
          fontSize: 11,
          color: "#5F5E5A",
          lineHeight: 1.5,
          padding: "10px 12px",
          background: "#131312",
          border: "1px solid #1C1B19",
          borderRadius: 8,
          marginBottom: 18,
        }}
      >
        {currentModelConfig?.description}
      </div>

      {/* Title Field */}
      <FormField label="Track Title" required>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Name your track..."
          maxLength={120}
          style={inputStyle}
          onFocus={inputFocus}
          onBlur={inputBlur}
        />
      </FormField>

      {/* Style Field */}
      <FormField label="Style of Music" required>
        <input
          type="text"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          placeholder="e.g., Cinematic Orchestral, Lo-fi Ambient, Jazz Fusion"
          maxLength={120}
          style={inputStyle}
          onFocus={inputFocus}
          onBlur={inputBlur}
        />
        <div style={charCountStyle}>{style.length}/120</div>
      </FormField>

      {/* Duration (Fader) */}
      <FormField label="Duration">
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <input
            type="range"
            min={currentModelConfig?.minDuration || 5}
            max={currentModelConfig?.maxDuration || 240}
            step={1}
            value={displayDuration}
            disabled={!supportsDuration}
            onChange={(e) => setDuration(Number(e.target.value))}
            style={{
              width: "100%",
              height: 4,
              background: "#1B1A18",
              borderRadius: 2,
              appearance: "none",
              outline: "none",
              cursor: supportsDuration ? "pointer" : "not-allowed",
              opacity: supportsDuration ? 1 : 0.35,
            }}
            className="musitron-fader"
          />
          <div
            style={{
              minWidth: 48,
              textAlign: "right",
              fontSize: 13,
              color: "#D4A652",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 500,
            }}
          >
            {displayDuration}s
          </div>
        </div>
        {!supportsDuration && (
          <div
            style={{
              fontSize: 9,
              color: "#5F5E5A",
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 2,
              marginBottom: 12,
            }}
          >
            Fixed duration for this model
          </div>
        )}
      </FormField>

      {/* Instrumental Toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "#131312",
          border: "1px solid #1C1B19",
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#B5B2A8" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4A652" strokeWidth="2">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          Instrumental Only
        </div>
        <button
          type="button"
          onClick={() => {
            if (model === "fal-ai/stable-audio/v2.5") return;
            setInstrumental(!instrumental);
          }}
          style={{
            position: "relative",
            width: 40,
            height: 22,
            background: instrumental ? "#D4A652" : "#1B1A18",
            border: `1px solid ${instrumental ? "#D4A652" : "#1C1B19"}`,
            borderRadius: 11,
            cursor: model === "fal-ai/stable-audio/v2.5" ? "not-allowed" : "pointer",
            transition: "background .2s",
            opacity: model === "fal-ai/stable-audio/v2.5" ? 0.4 : 1,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 2,
              left: instrumental ? 20 : 2,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: instrumental ? "#0B0B0A" : "#ECE9E1",
              transition: "left .2s cubic-bezier(.16,1,.3,1)",
            }}
          />
        </button>
      </div>

      {/* Lyrics */}
      {!instrumental && model !== "fal-ai/stable-audio/v2.5" && (
        <FormField label="Lyrics" hint="(optional for instrumental)">
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder="Write lyrics or describe the vibe. Two verses (8 lines) for best result..."
            maxLength={2999}
            style={{
              ...inputStyle,
              resize: "vertical",
              minHeight: 80,
            }}
            onFocus={inputFocus as any}
            onBlur={inputBlur as any}
          />
          <div style={charCountStyle}>{lyrics.length}/2999</div>
        </FormField>
      )}

      {/* Generate Button */}
      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          padding: 14,
          border: "none",
          borderRadius: 8,
          cursor: loading ? "not-allowed" : "pointer",
          background: loading
            ? "#282724"
            : "linear-gradient(135deg, #D4A652, #b8872e)",
          color: loading ? "#5F5E5A" : "#0B0B0A",
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: "0.5px",
          transition: "all .2s cubic-bezier(.16,1,.3,1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? (
          <>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ animation: "spin 1s linear infinite" }}
            >
              <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
            </svg>
            Generating...
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="6" />
            </svg>
            Record Track &middot; {creditCost} credit{creditCost !== 1 ? "s" : ""}
          </>
        )}
      </button>

      {/* Fader thumb styles */}
      <style>{`
        .musitron-fader::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 12px;
          background: linear-gradient(180deg, #666, #333);
          border: 1px solid #282724;
          border-radius: 3px;
          cursor: grab;
        }
        .musitron-fader::-moz-range-thumb {
          width: 18px;
          height: 12px;
          background: linear-gradient(180deg, #666, #333);
          border: 1px solid #282724;
          border-radius: 3px;
          cursor: grab;
        }
        .musitron-fader:disabled::-webkit-slider-thumb { cursor: not-allowed; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </form>
  );
}

/* --- Shared form styles --- */

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1B1A18",
  border: "1px solid #1C1B19",
  borderRadius: 6,
  padding: "10px 12px",
  color: "#ECE9E1",
  fontSize: 13,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  outline: "none",
  transition: "border-color .2s, box-shadow .2s",
};

const charCountStyle: React.CSSProperties = {
  textAlign: "right",
  fontSize: 10,
  color: "#5F5E5A",
  fontFamily: "'JetBrains Mono', monospace",
  marginTop: 4,
};

function inputFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "#D4A652";
  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(212,166,82,0.06)";
}

function inputBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "#1C1B19";
  e.currentTarget.style.boxShadow = "none";
}

function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          color: "#7A776E",
          marginBottom: 6,
          letterSpacing: "0.6px",
          textTransform: "uppercase",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {required && (
          <span style={{ color: "#D4A652", fontSize: 8 }}>*</span>
        )}
        {label}
        {hint && (
          <span
            style={{
              color: "#5F5E5A",
              fontWeight: 400,
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
