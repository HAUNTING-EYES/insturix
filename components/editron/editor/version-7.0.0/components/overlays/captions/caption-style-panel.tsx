"use client";

import React, { useState } from "react";
import { CaptionOverlay, CaptionStyles, HighlightEffect, HighlightAnimation, CaptionDisplayMode, CaptionDisplayConfig, DEFAULT_DISPLAY_CONFIGS } from "../../../types";
import { captionTemplates } from "../../../templates/caption-templates";
import { defaultDisplayConfig } from "./default-caption-styles";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Type, Sparkles, Layout, Layers, Settings2, Film } from "lucide-react";
import { cn } from "@/lib/utils";

interface CaptionStylePanelProps {
  localOverlay: CaptionOverlay;
  setLocalOverlay: (overlay: CaptionOverlay) => void;
}

// Display mode options
const displayModes: { value: CaptionDisplayMode; label: string; description: string }[] = [
  { value: "word-by-word", label: "Word by Word", description: "TikTok style - 1 word at a time" },
  { value: "phrase", label: "Phrase", description: "Reels/Shorts - 3-4 words" },
  { value: "karaoke", label: "Karaoke", description: "All words, highlight active" },
  { value: "subtitle", label: "Subtitle", description: "Full sentences" },
];

// Available fonts (same as text overlays)
const fonts = [
  { value: "font-sans", label: "Inter (Sans-serif)" },
  { value: "font-serif", label: "Merriweather (Serif)" },
  { value: "font-mono", label: "Roboto Mono (Monospace)" },
  { value: "font-retro", label: "VT323 (Retro)" },
  { value: "font-league-spartan", label: "League Spartan" },
  { value: "font-bungee-inline", label: "Bungee Inline" },
];

const fontWeights = [
  { value: 300, label: "Light" },
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semi Bold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Extra Bold" },
];

const textAlignOptions = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const effects: { value: HighlightEffect; label: string }[] = [
  { value: "none", label: "None" },
  { value: "box", label: "Box Background" },
  { value: "glow", label: "Glow" },
  { value: "underline", label: "Underline" },
  { value: "pop", label: "Pop Shadow" },
];

const animations: { value: HighlightAnimation; label: string }[] = [
  { value: "none", label: "None" },
  { value: "scale", label: "Scale Up" },
  { value: "bounce", label: "Bounce" },
  { value: "pulse", label: "Pulse" },
];

// Collapsible section component
const CollapsibleSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, icon, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg bg-muted/30 border overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <span className="text-muted-foreground">{icon}</span>
        <h4 className="text-xs font-medium text-foreground flex-1">{title}</h4>
      </button>
      {isOpen && <div className="px-3 pb-3 space-y-4">{children}</div>}
    </div>
  );
};

export const CaptionStylePanel: React.FC<CaptionStylePanelProps> = ({
  localOverlay,
  setLocalOverlay,
}) => {
  const styles = localOverlay.styles;
  const highlight = styles.highlight || styles.highlightStyle;
  const displayConfig = localOverlay.displayConfig || defaultDisplayConfig;

  const updateStyles = (updates: Partial<CaptionStyles>) => {
    setLocalOverlay({
      ...localOverlay,
      styles: { ...styles, ...updates },
    });
  };

  const updateHighlight = (updates: Partial<typeof highlight>) => {
    setLocalOverlay({
      ...localOverlay,
      styles: {
        ...styles,
        highlight: { ...highlight!, ...updates },
      },
    });
  };

  const updateDisplayConfig = (updates: Partial<CaptionDisplayConfig>) => {
    setLocalOverlay({
      ...localOverlay,
      displayConfig: { ...displayConfig, ...updates },
    });
  };

  const applyDisplayMode = (mode: CaptionDisplayMode) => {
    setLocalOverlay({
      ...localOverlay,
      displayConfig: { ...DEFAULT_DISPLAY_CONFIGS[mode] },
    });
  };

  const applyTemplate = (key: string, template: typeof captionTemplates[string]) => {
    setLocalOverlay({
      ...localOverlay,
      template: key,
      styles: template.styles,
    });
  };

  return (
    <Tabs defaultValue="display" className="w-full">
      {/* Tab Navigation */}
      <TabsList className="w-full grid grid-cols-3 bg-muted/50 backdrop-blur-sm rounded-sm border border-border gap-1 mb-4">
        <TabsTrigger
          value="display"
          className="data-[state=active]:bg-accent data-[state=active]:text-foreground 
            rounded-sm transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <span className="flex items-center gap-2 text-xs">
            <Film className="w-3 h-3" />
            Display
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="templates"
          className="data-[state=active]:bg-accent data-[state=active]:text-foreground 
            rounded-sm transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <span className="flex items-center gap-2 text-xs">
            <Layers className="w-3 h-3" />
            Templates
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="styling"
          className="data-[state=active]:bg-accent data-[state=active]:text-foreground 
            rounded-sm transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <span className="flex items-center gap-2 text-xs">
            <Settings2 className="w-3 h-3" />
            Styling
          </span>
        </TabsTrigger>
      </TabsList>

      {/* Display Tab */}
      <TabsContent value="display" className="space-y-4 mt-0 focus-visible:outline-none">
        {/* Display Mode Selection */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground">Display Mode</Label>
          <div className="grid grid-cols-2 gap-2">
            {displayModes.map((mode) => (
              <button
                key={mode.value}
                onClick={() => applyDisplayMode(mode.value)}
                className={cn(
                  "p-3 text-left rounded-lg border transition-all",
                  displayConfig.mode === mode.value
                    ? "bg-primary/10 border-primary ring-1 ring-primary/20"
                    : "bg-muted/30 border-border hover:border-primary/50"
                )}
              >
                <div className="font-medium text-xs">{mode.label}</div>
                <div className="text-[10px] text-muted-foreground">{mode.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Words Per Group Slider */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Words Per Group</Label>
            <span className="text-xs text-muted-foreground font-mono">{displayConfig.wordsPerGroup}</span>
          </div>
          <Slider
            value={[displayConfig.wordsPerGroup]}
            min={1}
            max={12}
            step={1}
            onValueChange={([value]) => updateDisplayConfig({ wordsPerGroup: value })}
          />
          <p className="text-[10px] text-muted-foreground">
            {displayConfig.wordsPerGroup === 1 ? "Single word" : 
             displayConfig.wordsPerGroup <= 4 ? "Best for Shorts/Reels" :
             displayConfig.wordsPerGroup <= 6 ? "Balanced" : "Best for long-form"}
          </p>
        </div>

        {/* Max Words Per Line */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Max Words Per Line</Label>
            <span className="text-xs text-muted-foreground font-mono">{displayConfig.maxWordsPerLine}</span>
          </div>
          <Slider
            value={[displayConfig.maxWordsPerLine]}
            min={1}
            max={12}
            step={1}
            onValueChange={([value]) => updateDisplayConfig({ maxWordsPerLine: value })}
          />
        </div>

        {/* Progressive Reveal Toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <Label className="text-xs">Show Previous Words</Label>
            <p className="text-[10px] text-muted-foreground">Keep spoken words visible</p>
          </div>
          <Switch
            checked={displayConfig.showPreviousWords}
            onCheckedChange={(checked) => updateDisplayConfig({ showPreviousWords: checked })}
          />
        </div>

        {/* Fade Previous Words Toggle */}
        {displayConfig.showPreviousWords && (
          <div className="flex items-center justify-between py-2">
            <div>
              <Label className="text-xs">Fade Previous Words</Label>
              <p className="text-[10px] text-muted-foreground">Dim words after speaking</p>
            </div>
            <Switch
              checked={displayConfig.fadeOutPreviousWords}
              onCheckedChange={(checked) => updateDisplayConfig({ fadeOutPreviousWords: checked })}
            />
          </div>
        )}

        {/* Position Presets */}
        <div className="space-y-3 pt-2 border-t mt-2">
          <Label className="text-xs text-muted-foreground">Vertical Position</Label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: "top", label: "Top" },
              { value: "center", label: "Center" },
              { value: "bottom", label: "Bottom" },
            ].map((pos) => (
              <button
                key={pos.value}
                onClick={() => setLocalOverlay({ ...localOverlay, position: pos.value as any })}
                className={cn(
                  "py-2 px-3 text-xs rounded border transition-all",
                  localOverlay.position === pos.value
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-muted/30 border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {pos.label}
              </button>
            ))}
          </div>
        </div>
      </TabsContent>

      {/* Templates Tab */}
      <TabsContent value="templates" className="space-y-4 mt-0 focus-visible:outline-none">
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(captionTemplates).map(([key, template]) => {
            const s = template.styles;
            const h = s.highlight;
            return (
              <button
                key={key}
                onClick={() => applyTemplate(key, template)}
                className={cn(
                  "p-3 text-left rounded-lg border transition-all hover:scale-[1.02] overflow-hidden",
                  localOverlay.template === key
                    ? "bg-primary/10 border-primary ring-1 ring-primary/20"
                    : "bg-muted/30 border-border hover:border-primary/50 hover:bg-muted/50"
                )}
              >
                {/* Visual Preview */}
                <div 
                  className="mb-2 p-2 rounded bg-zinc-900 flex items-center justify-center min-h-[40px] overflow-hidden"
                  style={{
                    background: s.background || s.backgroundColor || "#18181b",
                  }}
                >
                  <span
                    className={`${s.fontFamily} inline-block`}
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: s.fontWeight as number,
                      color: s.color,
                      textShadow: s.textShadow,
                    }}
                  >
                    Hello{" "}
                    <span
                      style={{
                        color: h.color,
                        backgroundColor: h.backgroundColor,
                        fontWeight: h.fontWeight as number,
                        padding: "1px 4px",
                        borderRadius: h.borderRadius || "2px",
                        textShadow: h.textShadow,
                      }}
                    >
                      World
                    </span>
                  </span>
                </div>
                <div className="font-medium text-sm">{template.name}</div>
                <div className="text-[10px] text-muted-foreground">{template.preview}</div>
              </button>
            );
          })}
        </div>
      </TabsContent>

      {/* Styling Tab */}
      <TabsContent value="styling" className="space-y-4 mt-0 focus-visible:outline-none">
        {/* Typography Section */}
        <CollapsibleSection
          title="Typography"
          icon={<Type className="w-3.5 h-3.5" />}
          defaultOpen={true}
        >
          {/* Font Family */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Font Family</Label>
            <Select
              value={styles.fontFamily}
              onValueChange={(value) => updateStyles({ fontFamily: value })}
            >
              <SelectTrigger className="w-full text-xs">
                <SelectValue placeholder="Select font" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-zinc-900 border-border shadow-lg">
                {fonts.map((font) => (
                  <SelectItem key={font.value} value={font.value} className={`${font.value} text-xs`}>
                    {font.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Font Size */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs text-muted-foreground">Font Size</Label>
              <span className="text-xs text-muted-foreground font-mono">{parseInt(styles.fontSize) || 32}px</span>
            </div>
            <Slider
              value={[parseInt(styles.fontSize) || 32]}
              min={8}
              max={200}
              step={1}
              onValueChange={([value]) => updateStyles({ fontSize: `${value}px` })}
            />
          </div>

          {/* Font Weight */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Font Weight</Label>
            <Select
              value={String(styles.fontWeight || 500)}
              onValueChange={(value) => updateStyles({ fontWeight: parseInt(value) })}
            >
              <SelectTrigger className="w-full text-xs">
                <SelectValue placeholder="Select weight" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-zinc-900 border-border shadow-lg">
                {fontWeights.map((weight) => (
                  <SelectItem key={weight.value} value={String(weight.value)} className="text-xs">
                    {weight.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Text Color */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Text Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={styles.color}
                onChange={(e) => updateStyles({ color: e.target.value })}
                className="w-8 h-8 rounded border cursor-pointer"
              />
              <input
                type="text"
                value={styles.color}
                onChange={(e) => updateStyles({ color: e.target.value })}
                className="flex-1 px-2 py-1 text-xs rounded border bg-background"
              />
            </div>
          </div>

          {/* Text Align */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Text Align</Label>
            <div className="flex gap-1">
              {textAlignOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateStyles({ textAlign: opt.value as "left" | "center" | "right" })}
                  className={cn(
                    "flex-1 px-3 py-1.5 text-xs rounded border transition-all",
                    styles.textAlign === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 border-border hover:border-primary/50"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Line Height */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs text-muted-foreground">Line Height</Label>
              <span className="text-xs text-muted-foreground">{(styles.lineHeight || 1.4).toFixed(1)}</span>
            </div>
            <Slider
              value={[styles.lineHeight || 1.4]}
              min={0.8}
              max={2.5}
              step={0.1}
              onValueChange={([value]) => updateStyles({ lineHeight: value })}
            />
          </div>

          {/* Letter Spacing */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs text-muted-foreground">Letter Spacing</Label>
              <span className="text-xs text-muted-foreground">{styles.letterSpacing || "0em"}</span>
            </div>
            <Slider
              value={[parseFloat(styles.letterSpacing || "0") * 100]}
              min={-5}
              max={20}
              step={1}
              onValueChange={([value]) => updateStyles({ letterSpacing: `${value / 100}em` })}
            />
          </div>

          {/* Text Shadow */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Text Shadow</Label>
            <input
              type="text"
              value={styles.textShadow || ""}
              onChange={(e) => updateStyles({ textShadow: e.target.value })}
              placeholder="e.g., 2px 2px 4px rgba(0,0,0,0.5)"
              className="w-full px-2 py-1 text-xs rounded border bg-background"
            />
          </div>
        </CollapsibleSection>

        {/* Background & Layout Section */}
        <CollapsibleSection
          title="Background & Layout"
          icon={<Layout className="w-3.5 h-3.5" />}
          defaultOpen={false}
        >
          {/* Background Color */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Background Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={styles.backgroundColor?.replace(/rgba?\([^)]+\)/i, '#000000') || "#000000"}
                onChange={(e) => updateStyles({ backgroundColor: e.target.value })}
                className="w-8 h-8 rounded border cursor-pointer"
              />
              <input
                type="text"
                value={styles.backgroundColor || ""}
                onChange={(e) => updateStyles({ backgroundColor: e.target.value })}
                placeholder="transparent or rgba(0,0,0,0.5)"
                className="flex-1 px-2 py-1 text-xs rounded border bg-background"
              />
            </div>
          </div>

          {/* Background Gradient */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Background Gradient</Label>
            <input
              type="text"
              value={styles.background || ""}
              onChange={(e) => updateStyles({ background: e.target.value })}
              placeholder="e.g., linear-gradient(135deg, #667eea, #764ba2)"
              className="w-full px-2 py-1 text-xs rounded border bg-background"
            />
          </div>

          {/* Backdrop Blur */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Backdrop Blur</Label>
            <input
              type="text"
              value={styles.backdropFilter || ""}
              onChange={(e) => updateStyles({ backdropFilter: e.target.value })}
              placeholder="e.g., blur(8px)"
              className="w-full px-2 py-1 text-xs rounded border bg-background"
            />
          </div>

          {/* Padding */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Padding</Label>
            <input
              type="text"
              value={styles.padding || ""}
              onChange={(e) => updateStyles({ padding: e.target.value })}
              placeholder="e.g., 12px or 8px 16px"
              className="w-full px-2 py-1 text-xs rounded border bg-background"
            />
          </div>

          {/* Border Radius */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Border Radius</Label>
            <input
              type="text"
              value={styles.borderRadius || ""}
              onChange={(e) => updateStyles({ borderRadius: e.target.value })}
              placeholder="e.g., 8px or 50%"
              className="w-full px-2 py-1 text-xs rounded border bg-background"
            />
          </div>
        </CollapsibleSection>

        {/* Word Highlight Section */}
        <CollapsibleSection
          title="Word Highlight"
          icon={<Sparkles className="w-3.5 h-3.5" />}
          defaultOpen={true}
        >
          {/* Highlight Color */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Highlight Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={highlight?.color || "#FFFFFF"}
                onChange={(e) => updateHighlight({ color: e.target.value })}
                className="w-8 h-8 rounded border cursor-pointer"
              />
              <input
                type="text"
                value={highlight?.color || "#FFFFFF"}
                onChange={(e) => updateHighlight({ color: e.target.value })}
                className="flex-1 px-2 py-1 text-xs rounded border bg-background"
              />
            </div>
          </div>

          {/* Highlight Background */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Highlight Background</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={highlight?.backgroundColor?.replace(/rgba?\([^)]+\)/i, '#3B82F6') || "#3B82F6"}
                onChange={(e) => updateHighlight({ backgroundColor: e.target.value })}
                className="w-8 h-8 rounded border cursor-pointer"
              />
              <input
                type="text"
                value={highlight?.backgroundColor || "rgba(59, 130, 246, 0.92)"}
                onChange={(e) => updateHighlight({ backgroundColor: e.target.value })}
                className="flex-1 px-2 py-1 text-xs rounded border bg-background"
              />
            </div>
          </div>

          {/* Highlight Font Weight */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Highlight Font Weight</Label>
            <Select
              value={String(highlight?.fontWeight || 600)}
              onValueChange={(value) => updateHighlight({ fontWeight: parseInt(value) })}
            >
              <SelectTrigger className="w-full text-xs">
                <SelectValue placeholder="Select weight" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-zinc-900 border-border shadow-lg">
                {fontWeights.map((weight) => (
                  <SelectItem key={weight.value} value={String(weight.value)} className="text-xs">
                    {weight.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scale */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs text-muted-foreground">Scale Effect</Label>
              <span className="text-xs text-muted-foreground">{(highlight?.scale || 1).toFixed(2)}x</span>
            </div>
            <Slider
              value={[highlight?.scale || 1]}
              min={1}
              max={1.3}
              step={0.02}
              onValueChange={([value]) => updateHighlight({ scale: value })}
            />
          </div>

          {/* Effect Type */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Effect Type</Label>
            <Select
              value={highlight?.effect || "box"}
              onValueChange={(value) => updateHighlight({ effect: value as HighlightEffect })}
            >
              <SelectTrigger className="w-full text-xs">
                <SelectValue placeholder="Select effect" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-zinc-900 border-border shadow-lg">
                {effects.map((effect) => (
                  <SelectItem key={effect.value} value={effect.value} className="text-xs">
                    {effect.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Animation */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Animation</Label>
            <Select
              value={highlight?.animation || "scale"}
              onValueChange={(value) => updateHighlight({ animation: value as HighlightAnimation })}
            >
              <SelectTrigger className="w-full text-xs">
                <SelectValue placeholder="Select animation" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-zinc-900 border-border shadow-lg">
                {animations.map((anim) => (
                  <SelectItem key={anim.value} value={anim.value} className="text-xs">
                    {anim.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Highlight Text Shadow */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Highlight Text Shadow</Label>
            <input
              type="text"
              value={highlight?.textShadow || ""}
              onChange={(e) => updateHighlight({ textShadow: e.target.value })}
              placeholder="e.g., 2px 2px 4px rgba(0,0,0,0.4)"
              className="w-full px-2 py-1 text-xs rounded border bg-background"
            />
          </div>

          {/* Highlight Padding */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Highlight Padding</Label>
            <input
              type="text"
              value={highlight?.padding || ""}
              onChange={(e) => updateHighlight({ padding: e.target.value })}
              placeholder="e.g., 4px 12px"
              className="w-full px-2 py-1 text-xs rounded border bg-background"
            />
          </div>

          {/* Highlight Border Radius */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Highlight Border Radius</Label>
            <input
              type="text"
              value={highlight?.borderRadius || ""}
              onChange={(e) => updateHighlight({ borderRadius: e.target.value })}
              placeholder="e.g., 6px"
              className="w-full px-2 py-1 text-xs rounded border bg-background"
            />
          </div>
        </CollapsibleSection>
      </TabsContent>
    </Tabs>
  );
};
