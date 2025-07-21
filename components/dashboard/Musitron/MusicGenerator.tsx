"use client"

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileMusic, Mic2, Music4, PenTool } from "lucide-react";

export default function MusicGenerator() {
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title) {
      toast.error("Please enter a title");
      return;
    }
    if (!style) {
      toast.error("Please enter a style of music");
      return;
    }
    if (!instrumental && !lyrics) {
      toast.error("Please enter lyrics or enable instrumental mode");
      return;
    }

    setLoading(true);

    try {
      const payload: any = {
        title,
        instrumental,
        style,
      };
      if (!instrumental) {
        payload.lyrics = lyrics;
      }
      // Optionally add songDescription if you want to support simple mode

      const res = await fetch("/api/services/musitron/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to start music generation");
      }

      toast.success("Music generation started!");
      // Optionally: reset form or trigger analytics/task refresh here
    } catch (err: any) {
      toast.error(err.message || "Failed to start music generation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardContent className="p-6 space-y-6">
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
              disabled={loading}
            >
              {loading ? "Generating Music..." : "Generate Music"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
