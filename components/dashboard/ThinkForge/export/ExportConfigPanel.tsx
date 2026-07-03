"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  ImageIcon,
  Film,
  Check,
  Sparkles,
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
import type { UseExportPipelineReturn } from "./hooks/useExportPipeline";

interface ExportConfigPanelProps {
  pipeline: UseExportPipelineReturn;
  blocksCount: number;
}

export function ExportConfigPanel({ pipeline, blocksCount }: ExportConfigPanelProps) {
  const {
    title,
    setTitle,
    aspectRatio,
    setAspectRatio,
    generateStoryboard,
    setGenerateStoryboard,
    generateVideos,
    setGenerateVideos,
    artStyle,
    setArtStyle,
    imageModel,
    setImageModel,
    videoModel,
    setVideoModel,
    enableChaining,
    setEnableChaining,
    selectedVoice,
    setSelectedVoice,
    availableVoices,
    previewingVoice,
    error,
    step,
    handleExport,
    handlePreviewVoice,
    estimateCredits,
  } = pipeline;

  /* Film frame container style */
  const filmFrame = (frameNum: string): React.CSSProperties => ({
    border: "1px solid rgba(212,166,82,0.25)",
    borderRadius: 3,
    padding: 10,
    marginBottom: 6,
    position: "relative",
    background: "rgba(212,166,82,0.015)",
  });

  /* Frame number label style */
  const frameLabel: React.CSSProperties = {
    position: "absolute",
    top: 3,
    right: 6,
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    fontSize: 7,
    color: "#454340",
    letterSpacing: "0.06em",
  };

  return (
    <motion.div
      key="configure"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-2 py-1"
    >
      {/* ── Frame 001: Title + Aspect Ratio (side by side) ── */}
      <div style={filmFrame("001")}>
        <span style={frameLabel}>FRM 001</span>
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <div>
            <label className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#5F5E5A] mb-1 block">Project Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-detected from script..."
              className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1] h-[34px] text-[13px]"
            />
          </div>
          <div>
            <label className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#5F5E5A] mb-1 block">Aspect Ratio</label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1] h-[34px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1B1A18] border-[#282724]">
                <SelectItem value="16:9">16:9 (YouTube)</SelectItem>
                <SelectItem value="9:16">9:16 (Shorts/Reels)</SelectItem>
                <SelectItem value="1:1">1:1 (Square)</SelectItem>
                <SelectItem value="4:5">4:5 (Instagram)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Frame 002: Storyboard + Video generation ── */}
      <div style={filmFrame("002")}>
        <span style={frameLabel}>FRM 002</span>

        {/* Storyboard Toggle */}
        <div
          className={`flex items-center gap-2.5 px-2.5 py-2 rounded border cursor-pointer transition-colors ${
            generateStoryboard
              ? "bg-[#5EC97E]/8 border-[#5EC97E]/20"
              : "bg-[#1B1A18] border-[#282724] hover:border-[#282724]"
          }`}
          onClick={() => {
            const next = !generateStoryboard;
            setGenerateStoryboard(next);
            if (!next) setGenerateVideos(false);
          }}
        >
          <ImageIcon className={`h-4 w-4 shrink-0 ${generateStoryboard ? "text-[#5EC97E]" : "text-[#7A776E]"}`} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-[#ECE9E1]">Generate Storyboard</p>
            <p className="text-[10px] text-[#5F5E5A]">AI images (2 credits/scene)</p>
          </div>
          {generateStoryboard && <Check className="h-3.5 w-3.5 text-[#5EC97E] shrink-0" />}
        </div>

        {/* Art Style + Image Model (side by side) */}
        {generateStoryboard && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="pl-6 mt-1.5"
          >
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#5F5E5A] mb-1 block">Art Style</label>
                <Select value={artStyle} onValueChange={setArtStyle}>
                  <SelectTrigger className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1] h-[30px] text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1B1A18] border-[#282724] max-h-72 overflow-y-auto">
                    <SelectItem value="cinematic">Cinematic / Film</SelectItem>
                    <SelectItem value="photorealistic">Photorealistic</SelectItem>
                    <SelectItem value="documentary">Documentary / Raw</SelectItem>
                    <SelectItem value="noir">Noir / Black &amp; White</SelectItem>
                    <SelectItem value="neon-noir">Neon Noir / Blade Runner</SelectItem>
                    <SelectItem value="vintage">Vintage / Retro Film</SelectItem>
                    <SelectItem value="anime">Anime / Manga</SelectItem>
                    <SelectItem value="cartoon">Cartoon / Toon</SelectItem>
                    <SelectItem value="comic-book">Comic Book / Graphic Novel</SelectItem>
                    <SelectItem value="pixel-art">Pixel Art / Retro</SelectItem>
                    <SelectItem value="claymation">Claymation / Stop Motion</SelectItem>
                    <SelectItem value="storybook">Storybook / Fairy Tale</SelectItem>
                    <SelectItem value="watercolor">Watercolor / Painterly</SelectItem>
                    <SelectItem value="oil-painting">Oil Painting / Classical</SelectItem>
                    <SelectItem value="impressionist">Impressionist / Monet</SelectItem>
                    <SelectItem value="sketch">Pencil Sketch / Line Art</SelectItem>
                    <SelectItem value="pop-art">Pop Art / Bold Colors</SelectItem>
                    <SelectItem value="ukiyo">Ukiyo-e / Japanese Woodblock</SelectItem>
                    <SelectItem value="surrealism">Surrealism / Dreamlike</SelectItem>
                    <SelectItem value="expressionism">Expressionism / Angular</SelectItem>
                    <SelectItem value="cyberpunk">Cyberpunk / Neon</SelectItem>
                    <SelectItem value="fantasy">Fantasy / Concept Art</SelectItem>
                    <SelectItem value="horror">Horror / Dark</SelectItem>
                    <SelectItem value="steampunk">Steampunk / Victorian</SelectItem>
                    <SelectItem value="gothic">Gothic / Dark Cathedral</SelectItem>
                    <SelectItem value="concept-art">Concept Art / Matte Painting</SelectItem>
                    <SelectItem value="vaporwave">Vaporwave / Synthwave</SelectItem>
                    <SelectItem value="lo-fi">Lo-Fi / Cozy Nostalgic</SelectItem>
                    <SelectItem value="pastel">Pastel / Soft Dreamy</SelectItem>
                    <SelectItem value="grunge">Grunge / Urban Decay</SelectItem>
                    <SelectItem value="glitch-art">Glitch Art / Digital</SelectItem>
                    <SelectItem value="art-deco">Art Deco / 1920s Glamour</SelectItem>
                    <SelectItem value="action-blockbuster">Action / Blockbuster</SelectItem>
                    <SelectItem value="sci-fi">Sci-Fi / Futuristic</SelectItem>
                    <SelectItem value="thriller">Thriller / Suspense</SelectItem>
                    <SelectItem value="western">Western / Frontier</SelectItem>
                    <SelectItem value="war-film">War Film / Military</SelectItem>
                    <SelectItem value="superhero">Superhero / Marvel Style</SelectItem>
                    <SelectItem value="rom-com">Romantic / Light</SelectItem>
                    <SelectItem value="indie-film">Indie Film / A24</SelectItem>
                    <SelectItem value="3d-render">3D Render</SelectItem>
                    <SelectItem value="isometric">Isometric / Flat 3D</SelectItem>
                    <SelectItem value="minimalist">Minimalist / Flat</SelectItem>
                    <SelectItem value="brutalist">Brutalist / Raw</SelectItem>
                    <SelectItem value="collage">Collage / Mixed Media</SelectItem>
                    <SelectItem value="motion-graphics">Motion Graphics / Flat Design</SelectItem>
                    <SelectItem value="architectural">Architectural / Technical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#5F5E5A] mb-1 block">Image Model</label>
                <Select value={imageModel} onValueChange={setImageModel}>
                  <SelectTrigger className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1] h-[30px] text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1B1A18] border-[#282724]">
                    <SelectItem value="uni-1">UNI-1 by Luma (Best)</SelectItem>
                    <SelectItem value="flux-schnell">FLUX Schnell (Fast)</SelectItem>
                    <SelectItem value="flux-dev">FLUX Dev (Quality)</SelectItem>
                    <SelectItem value="flux-pro">FLUX Pro 1.1</SelectItem>
                    <SelectItem value="imagen4">Google Imagen 4</SelectItem>
                    <SelectItem value="seedream-v4">Seedream V4</SelectItem>
                    <SelectItem value="seedream-v4.5">Seedream V4.5</SelectItem>
                    <SelectItem value="recraft-v3">Recraft V3</SelectItem>
                    <SelectItem value="nano-banana">Nano Banana (Fast)</SelectItem>
                    <SelectItem value="nano-banana-2">Nano Banana 2 (Quality)</SelectItem>
                    <SelectItem value="nano-banana-pro">Nano Banana Pro (Best)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.div>
        )}

        {/* Video Generation Toggle */}
        {generateStoryboard && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-2"
          >
            <div
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded border cursor-pointer transition-colors ${
                generateVideos
                  ? "bg-[#D4A652]/8 border-[#D4A652]/20"
                  : "bg-[#1B1A18] border-[#282724] hover:border-[#282724]"
              }`}
              onClick={() => setGenerateVideos(!generateVideos)}
            >
              <Film className={`h-4 w-4 shrink-0 ${generateVideos ? "text-[#D4A652]" : "text-[#7A776E]"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#ECE9E1]">Generate AI Videos</p>
                <p className="text-[10px] text-[#5F5E5A]">Animate storyboard (3 credits/scene)</p>
              </div>
              {generateVideos && <Check className="h-3.5 w-3.5 text-[#D4A652] shrink-0" />}
            </div>
          </motion.div>
        )}

        {/* Video Model + Scene Chaining (compact row) */}
        {generateStoryboard && generateVideos && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="pl-6 mt-1.5"
          >
            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#5F5E5A] mb-1 block">Video Model</label>
                <Select value={videoModel} onValueChange={setVideoModel}>
                  <SelectTrigger className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1] h-[30px] text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1B1A18] border-[#282724]">
                    <SelectItem value="auto">Auto (best per scene)</SelectItem>
                    <SelectItem value="seedance-2.0">Seedance 2.0 (Best Audio)</SelectItem>
                    <SelectItem value="happy-horse-v1.1">HappyHorse 1.1 (Native Audio)</SelectItem>
                    <SelectItem value="seedance-1.5">Seedance 1.5 Pro</SelectItem>
                    <SelectItem value="kling-2.1">Kling 2.1 Pro</SelectItem>
                    <SelectItem value="kling-2.6">Kling 2.6 Pro (High Motion)</SelectItem>
                    <SelectItem value="veo-3.1">Veo 3.1 (4K Premium)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer pb-[5px]">
                <input
                  type="checkbox"
                  checked={enableChaining}
                  onChange={(e) => setEnableChaining(e.target.checked)}
                  className="w-3 h-3 rounded border-[#282724] bg-[#1B1A18] text-[#D4A652] focus:ring-[#D4A652] focus:ring-offset-0"
                />
                <span className="text-[10px] text-[#7A776E] whitespace-nowrap">Chain scenes</span>
              </label>
            </div>
          </motion.div>
        )}

      </div>{/* End Frame 002 */}

      {/* ── Frame 003: Voice + Credits ── */}
      <div style={filmFrame("003")}>
        <span style={frameLabel}>FRM 003</span>

        {/* Voice Selector with Preview */}
        {availableVoices.length > 0 && (
          <div className="mb-2">
            <label className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#5F5E5A] mb-1 block">Narrator Voice</label>
            <div className="flex gap-1.5">
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                <SelectTrigger className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1] flex-1 h-[30px] text-[12px]">
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent className="bg-[#1B1A18] border-[#282724] max-h-60">
                  {availableVoices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <span className="flex items-center gap-2">
                        <span className={v.gender === "female" ? "text-pink-300" : "text-[#5CB8CC]"}>
                          {v.gender === "female" ? "♀" : "♂"}
                        </span>
                        <span>{v.name}</span>
                        <span className="text-[#5F5E5A] text-[11px]">-- {v.style}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => handlePreviewVoice(selectedVoice)}
                disabled={!selectedVoice || step !== "configure"}
                title="Preview voice"
                style={{
                  width: 30,
                  height: 30,
                  border: "1px solid #282724",
                  borderRadius: 4,
                  background: "transparent",
                  color: "#B5B2A8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 11,
                  flexShrink: 0,
                }}
              >
                {previewingVoice === selectedVoice ? (
                  <span className="h-3.5 w-3.5 rounded-full bg-[#D4A652] animate-pulse" />
                ) : (
                  "▶"
                )}
              </button>
            </div>
          </div>
        )}

        {/* Credit cost estimate */}
        <div className="flex items-center justify-between" style={{ padding: "0 2px" }}>
          <span className="text-[10px]" style={{ color: "#5F5E5A" }}>Estimated cost</span>
          <span
            className="font-mono text-[10px] font-medium"
            style={{ color: "#D4A652" }}
          >
            ~{estimateCredits()} credits
          </span>
        </div>
      </div>{/* End Frame 003 */}

      {error && <p className="text-sm text-[#D4A652]">{error}</p>}

      {/* Footer actions */}
      <div
        className="flex items-center justify-end gap-2"
        style={{ paddingTop: 10, borderTop: "1px solid #1C1B19", marginTop: 8 }}
      >
        <Button variant="ghost" onClick={pipeline.handleClose} className="bg-transparent border border-[#282724] text-[#7A776E] hover:border-[#D4A652] hover:text-[#D4A652] rounded-[4px] h-8 text-[13px]">
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          disabled={blocksCount === 0}
          className="bg-[#D4A652] hover:bg-[#C49840] text-[#0B0B0A] font-semibold rounded-[4px] border-none h-8 text-[13px]"
        >
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          {generateStoryboard && generateVideos
            ? "Generate Full AI Video"
            : generateStoryboard
              ? "Export with Storyboard"
              : "Export to Editor"}
        </Button>
      </div>
    </motion.div>
  );
}
