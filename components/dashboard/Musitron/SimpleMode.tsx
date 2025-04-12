"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileMusic, Music, Music4 } from "lucide-react";

interface SimpleModeProps {
  onSubmit: (data: {
    songDescription: string;
    instrumental: boolean;
    title: string;
  }) => void;
  loading: boolean;
}

export default function SimpleMode({ onSubmit, loading }: SimpleModeProps) {
  const [songDescription, setSongDescription] = useState("");
  const [title, setTitle] = useState("");
  const [instrumental, setInstrumental] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!songDescription) {
      toast.error("Please enter a song description");
      return;
    }

    if (!title) {
      toast.error("Please enter a title for your song");
      return;
    }

    onSubmit({
      songDescription,
      instrumental,
      title,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label
          htmlFor="title"
          className="text-sm font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2"
        >
          <Music4 className="h-4 w-4" />
          Song Title
        </Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter a title for your song"
          className="bg-black/20 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500/50 transition-colors"
          required
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="songDescription"
          className="text-sm font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2"
        >
          <Music className="h-4 w-4" />
          Song Description
        </Label>
        <Textarea
          id="songDescription"
          value={songDescription}
          onChange={(e) => setSongDescription(e.target.value)}
          placeholder="Describe the style of music and the topic you want, AI will generate lyrics for you."
          className="h-32 bg-black/20 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500/50 transition-colors"
          maxLength={399}
          required
        />
        <div className="text-right text-sm text-zinc-500">
          {songDescription.length}/399
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg bg-black/20">
        <div className="flex items-center gap-3">
          <FileMusic className="h-5 w-5 text-purple-500" />
          <span className="text-zinc-100">Instrumental Only</span>
        </div>
        <Switch
          checked={instrumental}
          onCheckedChange={setInstrumental}
          className="bg-zinc-700 data-[state=checked]:bg-purple-600"
        />
      </div>

      <Button
        type="submit"
        className={`
          w-full h-14 text-base font-medium tracking-wide rounded-lg
          ${
            loading
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              : "bg-purple-600 hover:bg-purple-700 text-white"
          }
          transition-all duration-300
        `}
        disabled={loading}
      >
        {loading ? "Generating Music..." : "Generate Music"}
      </Button>
    </form>
  );
}
