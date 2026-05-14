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

  return (
    <motion.div
      key="configure"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-4 py-2"
    >
      {/* Project Title */}
      <div>
        <label className="text-sm text-[#7A776E] mb-1 block">Project Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Auto-detected from script..."
          className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1]"
        />
      </div>

      {/* Aspect Ratio */}
      <div>
        <label className="text-sm text-[#7A776E] mb-1 block">Aspect Ratio</label>
        <Select value={aspectRatio} onValueChange={setAspectRatio}>
          <SelectTrigger className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1]">
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

      {/* Storyboard Toggle */}
      <div
        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
          generateStoryboard
            ? "bg-[#5EC97E]/10 border-[#5EC97E]/30"
            : "bg-[#1B1A18] border-[#282724] hover:border-[#282724]"
        }`}
        onClick={() => {
          const next = !generateStoryboard;
          setGenerateStoryboard(next);
          if (!next) setGenerateVideos(false);
        }}
      >
        <ImageIcon className={`h-5 w-5 ${generateStoryboard ? "text-[#5EC97E]" : "text-[#7A776E]"}`} />
        <div className="flex-1">
          <p className="text-sm font-medium text-[#ECE9E1]">Generate Storyboard</p>
          <p className="text-[11px] text-[#5F5E5A]">AI images for each scene (2 credits/scene)</p>
        </div>
        {generateStoryboard && <Check className="h-4 w-4 text-[#5EC97E]" />}
      </div>

      {/* Art Style */}
      {generateStoryboard && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="pl-8"
        >
          <label className="text-sm text-[#7A776E] mb-1 block">Art Style</label>
          <Select value={artStyle} onValueChange={setArtStyle}>
            <SelectTrigger className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1B1A18] border-[#282724] max-h-72 overflow-y-auto">
              {/* Realistic */}
              <SelectItem value="cinematic">Cinematic / Film</SelectItem>
              <SelectItem value="photorealistic">Photorealistic</SelectItem>
              <SelectItem value="documentary">Documentary / Raw</SelectItem>
              <SelectItem value="noir">Noir / Black &amp; White</SelectItem>
              <SelectItem value="neon-noir">Neon Noir / Blade Runner</SelectItem>
              <SelectItem value="vintage">Vintage / Retro Film</SelectItem>
              {/* Animated / Illustrated */}
              <SelectItem value="anime">Anime / Manga</SelectItem>
              <SelectItem value="cartoon">Cartoon / Toon</SelectItem>
              <SelectItem value="comic-book">Comic Book / Graphic Novel</SelectItem>
              <SelectItem value="pixel-art">Pixel Art / Retro</SelectItem>
              <SelectItem value="claymation">Claymation / Stop Motion</SelectItem>
              <SelectItem value="storybook">Storybook / Fairy Tale</SelectItem>
              {/* Stylized */}
              <SelectItem value="watercolor">Watercolor / Painterly</SelectItem>
              <SelectItem value="oil-painting">Oil Painting / Classical</SelectItem>
              <SelectItem value="impressionist">Impressionist / Monet</SelectItem>
              <SelectItem value="sketch">Pencil Sketch / Line Art</SelectItem>
              <SelectItem value="pop-art">Pop Art / Bold Colors</SelectItem>
              <SelectItem value="ukiyo">Ukiyo-e / Japanese Woodblock</SelectItem>
              <SelectItem value="surrealism">Surrealism / Dreamlike</SelectItem>
              <SelectItem value="expressionism">Expressionism / Angular</SelectItem>
              {/* Genre-specific */}
              <SelectItem value="cyberpunk">Cyberpunk / Neon</SelectItem>
              <SelectItem value="fantasy">Fantasy / Concept Art</SelectItem>
              <SelectItem value="horror">Horror / Dark</SelectItem>
              <SelectItem value="steampunk">Steampunk / Victorian</SelectItem>
              <SelectItem value="gothic">Gothic / Dark Cathedral</SelectItem>
              <SelectItem value="concept-art">Concept Art / Matte Painting</SelectItem>
              {/* Modern / Aesthetic */}
              <SelectItem value="vaporwave">Vaporwave / Synthwave</SelectItem>
              <SelectItem value="lo-fi">Lo-Fi / Cozy Nostalgic</SelectItem>
              <SelectItem value="pastel">Pastel / Soft Dreamy</SelectItem>
              <SelectItem value="grunge">Grunge / Urban Decay</SelectItem>
              <SelectItem value="glitch-art">Glitch Art / Digital</SelectItem>
              <SelectItem value="art-deco">Art Deco / 1920s Glamour</SelectItem>
              {/* Cinematic Genres */}
              <SelectItem value="action-blockbuster">Action / Blockbuster</SelectItem>
              <SelectItem value="sci-fi">Sci-Fi / Futuristic</SelectItem>
              <SelectItem value="thriller">Thriller / Suspense</SelectItem>
              <SelectItem value="western">Western / Frontier</SelectItem>
              <SelectItem value="war-film">War Film / Military</SelectItem>
              <SelectItem value="superhero">Superhero / Marvel Style</SelectItem>
              <SelectItem value="rom-com">Romantic / Light</SelectItem>
              <SelectItem value="indie-film">Indie Film / A24</SelectItem>
              {/* Technical */}
              <SelectItem value="3d-render">3D Render</SelectItem>
              <SelectItem value="isometric">Isometric / Flat 3D</SelectItem>
              <SelectItem value="minimalist">Minimalist / Flat</SelectItem>
              <SelectItem value="brutalist">Brutalist / Raw</SelectItem>
              <SelectItem value="collage">Collage / Mixed Media</SelectItem>
              <SelectItem value="motion-graphics">Motion Graphics / Flat Design</SelectItem>
              <SelectItem value="architectural">Architectural / Technical</SelectItem>
            </SelectContent>
          </Select>
        </motion.div>
      )}

      {/* Image Model */}
      {generateStoryboard && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="pl-8"
        >
          <label className="text-sm text-[#7A776E] mb-1 block">Image Model</label>
          <Select value={imageModel} onValueChange={setImageModel}>
            <SelectTrigger className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1B1A18] border-[#282724]">
              <SelectItem value="uni-1">UNI-1 by Luma (Best Quality)</SelectItem>
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
        </motion.div>
      )}

      {/* Video Generation Toggle */}
      {generateStoryboard && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
        >
          <div
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              generateVideos
                ? "bg-[#9088D4]/10 border-[#9088D4]/30"
                : "bg-[#1B1A18] border-[#282724] hover:border-[#282724]"
            }`}
            onClick={() => setGenerateVideos(!generateVideos)}
          >
            <Film className={`h-5 w-5 ${generateVideos ? "text-[#9088D4]" : "text-[#7A776E]"}`} />
            <div className="flex-1">
              <p className="text-sm font-medium text-[#ECE9E1]">Generate AI Videos</p>
              <p className="text-[11px] text-[#5F5E5A]">
                Animate storyboard images into video clips (3 credits/scene)
              </p>
            </div>
            {generateVideos && <Check className="h-4 w-4 text-[#9088D4]" />}
          </div>
        </motion.div>
      )}

      {/* Video Model */}
      {generateStoryboard && generateVideos && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="pl-8"
        >
          <label className="text-sm text-[#7A776E] mb-1 block">Video Model</label>
          <Select value={videoModel} onValueChange={setVideoModel}>
            <SelectTrigger className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1B1A18] border-[#282724]">
              <SelectItem value="auto">Auto (best per scene) -- Default</SelectItem>
              <SelectItem value="seedance-2.0">Seedance 2.0 (Best Audio-Video)</SelectItem>
              <SelectItem value="seedance-1.5">Seedance 1.5 Pro (Native Audio)</SelectItem>
              <SelectItem value="kling-2.1">Kling 2.1 Pro</SelectItem>
              <SelectItem value="kling-2.6">Kling 2.6 Pro (High Motion)</SelectItem>
              <SelectItem value="veo-3.1">Google Veo 3.1 (4K Premium)</SelectItem>
            </SelectContent>
          </Select>
          {videoModel === "auto" && (
            <p className="text-[11px] text-[#5F5E5A] mt-1">
              Auto mode picks the best model per scene based on mood and motion.
              For maximum visual consistency across scenes, select a specific model instead.
            </p>
          )}

          {/* Scene Chaining Toggle */}
          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enableChaining}
              onChange={(e) => setEnableChaining(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-[#282724] bg-[#1B1A18] text-[#5EC97E] focus:ring-[#5EC97E] focus:ring-offset-0"
            />
            <span className="text-[11px] text-[#7A776E]">Scene chaining</span>
            <span className="text-[10px] text-[#454340]">
              -- smooth transitions between scenes (Kling/Luma only)
            </span>
          </label>
        </motion.div>
      )}

      {/* Voice Selector with Preview */}
      {availableVoices.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
        >
          <label className="text-sm text-[#7A776E] mb-1 block">Narrator Voice</label>
          <div className="flex gap-2">
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1] flex-1">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handlePreviewVoice(selectedVoice)}
              disabled={!selectedVoice || step !== "configure"}
              className="border-[#282724] text-[#B5B2A8] hover:bg-[#282724] px-3"
              title="Preview voice"
            >
              {previewingVoice === selectedVoice ? (
                <span className="h-4 w-4 rounded-full bg-[#D4A652] animate-pulse" />
              ) : (
                <span className="text-sm">{"▶"}</span>
              )}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Credit cost estimate */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-[#5F5E5A]">Estimated cost</span>
        <span
          className="text-[11px] font-medium text-[#D4A652]"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          ~{estimateCredits()} credits
        </span>
      </div>

      {error && <p className="text-sm text-[#D4A652]">{error}</p>}

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1C1B19]">
        <Button variant="ghost" onClick={pipeline.handleClose} className="text-[#7A776E]">
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          disabled={blocksCount === 0}
          className="bg-[#D4A652] hover:bg-[#D4A652]/90 text-[#0B0B0A] font-medium"
        >
          <Sparkles className="h-4 w-4 mr-2" />
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
