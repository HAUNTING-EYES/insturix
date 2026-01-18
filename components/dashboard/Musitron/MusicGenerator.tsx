"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { FileMusic, Mic2, Music4, PenTool } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCostBadge } from "@/components/shared/CreditCostBadge";
import { useCredits } from "@/hooks/useCredits";

/**
 * Model capabilities configuration. 
 * Add new models or update capabilities here to automatically sync UI logic.
 */
const MUSIC_MODELS_CONFIG: Record<string, { 
  label: string, 
  hasDuration: boolean, 
  description: string,
  minDuration?: number,
  maxDuration?: number
}> = {
  "sonauto/v2/text-to-music": {
    label: "Sonauto V2",
    hasDuration: false,
    description: "Best for viral hits (Sonauto); creates full songs with realistic, expressive vocals/lyrics, controllable via BPM and customizable text."
  },
  "fal-ai/stable-audio/v2.5": {
    label: "Stable Audio 2.5",
    hasDuration: true,
    minDuration: 5,
    maxDuration: 240,
    description: "Best for video background music; generates high-quality, structured instrumental tracks (up to 3 minutes) with distinct intro/outro sections in seconds."
  },
  "fal-ai/minimax-music/v2": {
    label: "MiniMax Music V2",
    hasDuration: false,
    description: "Best for complex compositions; excels at high-fidelity instrumentals and multi-language vocals that rival human performances, ideal for audiophiles."
  },
};

const MUSIC_MODELS = Object.entries(MUSIC_MODELS_CONFIG).map(([value, config]) => ({
  value,
  label: config.label
}));

export default function MusicGenerator() {
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [duration, setDuration] = useState(30); // default 30 seconds
  const [model, setModel] = useState("sonauto/v2/text-to-music");
  const MIN_DURATION = 5;
  const MAX_DURATION = 240;
  const [instrumental, setInstrumental] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { invalidateCredits } = useCredits();
  
  const currentModelConfig = MUSIC_MODELS_CONFIG[model];
  const supportsDuration = currentModelConfig?.hasDuration;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title) {
      toast({
        title: "Validation Error",
        description: "Please enter a title",
        variant: "destructive",
      });
      return;
    }
    if (!style) {
      toast({
        title: "Validation Error",
        description: "Please enter a style of music",
        variant: "destructive",
      });
      return;
    }
    if (
      !duration ||
      isNaN(Number(duration)) ||
      Number(duration) < 5 ||
      Number(duration) > 240
    ) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid duration between 5 and 240 seconds",
        variant: "destructive",
      });
      return;
    }
    if (!instrumental && !lyrics && model !== "fal-ai/stable-audio/v2.5") {
      toast({
        title: "Validation Error",
        description: "Please enter lyrics or enable instrumental mode",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const payload: any = {
        title,
        instrumental,
        style,
        duration: Number(duration),
        model,
      };
      if (!instrumental) {
        payload.lyrics = lyrics;
      }

      const res = await fetch("/api/services/musitron/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseData = await res.json();

      if (!res.ok || !responseData.success) {
        const errorMessage =
          responseData.error?.message || "Failed to start music generation";
        console.log("API Response status:", res.status);
        console.log("API Response data:", responseData);
        throw new Error(errorMessage);
      }

      toast({
        title: "Success",
        description: "Music generation started!",
      });

      // Invalidate both analytics and tasks queries so:
      // 1. Usage limits reflect the new task
      // 2. Task history immediately shows the new task in "listed" status
      // 3. Polling starts automatically (since there's now an in-progress task)
      queryClient.invalidateQueries({
        queryKey: ["musitron-analytics"],
        exact: false,
      });
      queryClient.invalidateQueries({ queryKey: ["musitron-tasks"] });
    } catch (err: any) {
      console.error("Music generation error:", err);
      console.log("Error message for debugging:", err.message);

      // Show generic error toast for all failures
      let title = "Error";
      let description = "Failed to start music generation. Please try again.";

      // Network errors
      if (
        err.message.includes("Failed to fetch") ||
        err.message.includes("Network Error")
      ) {
        title = "Connection Error";
        description =
          "Unable to connect to the music generation service. Please check your internet connection and try again.";
      }
      // Permission/limit errors
      else if (
        err.message.includes("403") ||
        err.message.includes("Access Denied") ||
        err.message.includes("limit exceeded")
      ) {
        title = "Access Denied";
        description =
          "You may not have permission to generate music or have reached your usage limit.";
      }
      // Server errors
      else if (
        err.message.includes("500") ||
        err.message.includes("Internal Server Error") ||
        err.message.includes("Service Error")
      ) {
        title = "Service Error";
        description =
          "The music generation service is currently experiencing technical difficulties. Please try again later.";
      }
      // Rate limiting
      else if (
        err.message.includes("429") ||
        err.message.includes("Too Many Requests")
      ) {
        title = "Too Many Requests";
        description =
          "Too many music generation requests. Please wait a moment and try again.";
      }
      // Database errors (from backend)
      else if (
        err.message.includes("DATABASE_ERROR") ||
        err.message.includes("Database Error")
      ) {
        title = "Service Error";
        description =
          "The music generation service is currently experiencing technical difficulties. Please try again later.";
      }

      toast({
        title: title,
        description: description,
        variant: "destructive",
      });
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

  return (
    <div className="space-y-6">
      <Card
        className="bg-black/40 border-zinc-800 relative overflow-hidden backdrop-blur-xl"
      >
        <CardContent className="min-h-[400px] p-6 space-y-6">
          <div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="title"
                    className="text-sm font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2"
                  >
                    <Music4 className="h-4 w-4 text-yellow-500" />
                    Title
                  </Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter a title for your music"
                    className="bg-black/20 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500/50 transition-colors"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="style"
                    className="text-sm font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2"
                  >
                    <Mic2 className="h-4 w-4 text-yellow-500" />
                    Style of Music
                  </Label>
                  <Input
                    id="style"
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    placeholder="e.g., Jazz, Rock, Classical"
                    className="bg-black/20 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500/50 transition-colors"
                    maxLength={120}
                    required
                  />
                  <div className="text-right text-sm text-zinc-500">
                    {style.length}/120
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="model"
                  className="text-sm font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2"
                >
                  <Music4 className="h-4 w-4 text-yellow-500" />
                  Music Model
                </Label>

                <Select value={model} onValueChange={handleModelChange}>
                  <SelectTrigger className="bg-black/20 border-zinc-800 text-zinc-100 focus:border-purple-500/50">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>

                  <SelectContent
                    position="popper"
                    className="z-100 bg-zinc-900 border-zinc-700"
                  >
                    {MUSIC_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-white/60 mt-2 text-sm font-light">
                  {currentModelConfig?.description}
                </p>
              </div>

              {/* Duration row: with Tooltip support for unsupported models */}
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <div className={`flex flex-col md:flex-row items-center gap-4 w-full ${!supportsDuration ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <Label
                        htmlFor="duration"
                        className="text-sm font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2 min-w-[120px]"
                      >
                        <Music4 className="h-4 w-4 text-yellow-500" />
                        Duration (seconds)
                      </Label>
                      <Input
                        id="duration"
                        type="number"
                        min={currentModelConfig?.minDuration || 30}
                        max={currentModelConfig?.maxDuration || 30}
                        value={supportsDuration ? duration : (model === "fal-ai/minimax-music/v2" ? 60 : 95)}
                        disabled={!supportsDuration}
                        onChange={(e) => {
                          let val = Number(e.target.value);
                          const min = currentModelConfig?.minDuration || 5;
                          const max = currentModelConfig?.maxDuration || 240;
                          if (isNaN(val)) val = min;
                          if (val < min) val = min;
                          if (val > max) val = max;
                          setDuration(val);
                        }}
                        className="w-24 bg-black/20 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500/50 transition-colors disabled:cursor-not-allowed"
                        required
                      />
                      <Slider
                        min={currentModelConfig?.minDuration || 5}
                        max={currentModelConfig?.maxDuration || 240}
                        step={1}
                        value={[supportsDuration ? Number(duration) : (model === "fal-ai/minimax-music/v2" ? 60 : 95)]}
                        disabled={!supportsDuration}
                        onValueChange={([val]) => {
                          const min = currentModelConfig?.minDuration || 5;
                          const max = currentModelConfig?.maxDuration || 240;
                          if (val < min) setDuration(min);
                          else if (val > max) setDuration(max);
                          else setDuration(val);
                        }}
                        className="flex-1"
                      />
                      <span className="text-xs text-zinc-400 flex items-center">
                        {supportsDuration ? duration : (model === "fal-ai/minimax-music/v2" ? 60 : 95)} sec
                      </span>
                    </div>
                  </TooltipTrigger>
                  {!supportsDuration && (
                    <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-xs">
                      <p>The chosen model ({currentModelConfig?.label}) uses a fixed duration and does not support custom length.</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>

              <div className="flex items-center justify-between p-3 rounded-lg bg-black/20">
                <div className="flex items-center gap-3">
                  <FileMusic className="h-5 w-5 text-yellow-500" />
                  <span className="text-zinc-100">Instrumental Only</span>
                </div>
                <Switch
                  disabled={model === "fal-ai/stable-audio/v2.5"}
                  checked={instrumental}
                  onCheckedChange={setInstrumental}
                  className="bg-zinc-700 data-[state=checked]:bg-purple-600"
                />
              </div>

              {!instrumental && model !== "fal-ai/stable-audio/v2.5" && (
                <div className="space-y-2">
                  <Label
                    htmlFor="lyrics"
                    className="text-sm font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2"
                  >
                    <PenTool className="h-4 w-4 text-yellow-500" />
                    Lyrics
                  </Label>
                  <Textarea
                    id="lyrics"
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    placeholder="Write your own lyrics, two verses (8 lines) for the best result"
                    className="h-32 bg-black/20 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500/50 transition-colors"
                    maxLength={2999}
                    required={
                      !instrumental && model !== "fal-ai/stable-audio/v2.5"
                    }
                  />
                  <div className="text-right text-sm text-zinc-500">
                    {lyrics.length}/2999
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <CreditCostBadge 
                  service="musitron" 
                  action="music_generation" 
                  model={model}
                  variant="tooltip" 
                  className="bg-purple-500/10 text-purple-400 border-purple-500/20"
                />
                <Button
                  type="submit"
                  className={`
                  h-14 text-base font-medium tracking-wide rounded-lg px-8
                  ${
                    loading
                      ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                      : "bg-yellow-600 hover:bg-yellow-700 text-white"
                  }
                  transition-all duration-300
                `}
                  disabled={loading}
                >
                  {loading ? "Generating Music..." : "Generate Music"}
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

