"use client"

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { FileMusic, Mic2, Music4, PenTool } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormLock } from "./FormLock";

export default function MusicGenerator() {
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [duration, setDuration] = useState(30); // default 30 seconds
  const MIN_DURATION = 5;
  const MAX_DURATION = 240;
  const [instrumental, setInstrumental] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
 
  // Musitron usage stats via musitron-analytics cache
  const { data: apiData } = useQuery({
    queryKey: ["musitron-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/services/musitron/stats");
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });
  const usage = apiData?.usage;
  const isLocked = usage && usage.hasAccess === false;

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
    if (!duration || isNaN(Number(duration)) || Number(duration) < 5 || Number(duration) > 240) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid duration between 5 and 240 seconds",
        variant: "destructive",
      });
      return;
    }
    if (!instrumental && !lyrics) {
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
        const errorMessage = responseData.error?.message || "Failed to start music generation";
        console.log("API Response status:", res.status);
        console.log("API Response data:", responseData);
        throw new Error(errorMessage);
      }

      toast({
        title: "Success",
        description: "Music generation started!",
      });
 
      // On task generation, refresh analytics immediately so locks/limits reflect
      queryClient.invalidateQueries({ queryKey: ["musitron-analytics"], exact: false });
    } catch (err: any) {
      console.error("Music generation error:", err);
      console.log("Error message for debugging:", err.message);
      
      // Show generic error toast for all failures
      let title = "Error";
      let description = "Failed to start music generation. Please try again.";
      
      // Network errors
      if (err.message.includes("Failed to fetch") || err.message.includes("Network Error")) {
        title = "Connection Error";
        description = "Unable to connect to the music generation service. Please check your internet connection and try again.";
      }
      // Permission/limit errors
      else if (err.message.includes("403") || err.message.includes("Access Denied") || err.message.includes("limit exceeded")) {
        title = "Access Denied";
        description = "You may not have permission to generate music or have reached your usage limit.";
      }
      // Server errors
      else if (err.message.includes("500") || err.message.includes("Internal Server Error") || err.message.includes("Service Error")) {
        title = "Service Error";
        description = "The music generation service is currently experiencing technical difficulties. Please try again later.";
      }
      // Rate limiting
      else if (err.message.includes("429") || err.message.includes("Too Many Requests")) {
        title = "Too Many Requests";
        description = "Too many music generation requests. Please wait a moment and try again.";
      }
      // Database errors (from backend)
      else if (err.message.includes("DATABASE_ERROR") || err.message.includes("Database Error")) {
        title = "Service Error";
        description = "The music generation service is currently experiencing technical difficulties. Please try again later.";
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

  return (
    <div className="space-y-6">
      <Card className={`bg-black/40 border-zinc-800 relative overflow-hidden${isLocked ? "" : " backdrop-blur-xl"}`}>
        <CardContent className="min-h-[400px] p-6 space-y-6">
          <div className={isLocked ? "blur-sm" : ""}>
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
            {/* Duration row: full width, single line */}
            <div className="flex flex-col md:flex-row items-center gap-4 w-full">
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
                min={MIN_DURATION}
                max={MAX_DURATION}
                value={duration}
                onChange={(e) => {
                  let val = Number(e.target.value);
                  if (isNaN(val)) val = MIN_DURATION;
                  if (val < MIN_DURATION) val = MIN_DURATION;
                  if (val > MAX_DURATION) val = MAX_DURATION;
                  setDuration(val);
                }}
                placeholder="Enter duration in seconds (e.g., 120)"
                className="w-24 bg-black/20 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500/50 transition-colors"
                required
              />
              <Slider
                min={MIN_DURATION}
                max={MAX_DURATION}
                step={1}
                value={[Number(duration)]}
                onValueChange={([val]) => {
                  if (val < MIN_DURATION) setDuration(MIN_DURATION);
                  else if (val > MAX_DURATION) setDuration(MAX_DURATION);
                  else setDuration(val);
                }}
                className="flex-1"
              />
              <span className="text-xs text-zinc-400 flex items-center">{duration} sec</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-black/20">
              <div className="flex items-center gap-3">
                <FileMusic className="h-5 w-5 text-yellow-500" />
                <span className="text-zinc-100">Instrumental Only</span>
              </div>
              <Switch
                checked={instrumental}
                onCheckedChange={setInstrumental}
                className="bg-zinc-700 data-[state=checked]:bg-purple-600"
              />
            </div>

            {!instrumental && (
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
                  required={!instrumental}
                />
                <div className="text-right text-sm text-zinc-500">
                  {lyrics.length}/2999
                </div>
              </div>
            )}

            <Button
              type="submit"
              className={`
                w-full h-14 text-base font-medium tracking-wide rounded-lg
                ${
                  loading
                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    : "bg-yellow-600 hover:bg-yellow-700 text-white"
                }
                transition-all duration-300
              `}
              disabled={loading || isLocked}
              >
              {loading ? "Generating Music..." : "Generate Music"}
            </Button>
          </form>
          </div>
        </CardContent>
        {usage && usage.hasAccess === false && (
          <FormLock timeUntilReset={usage.timeUntilReset} />
        )}
      </Card>
    </div>
  );
}
