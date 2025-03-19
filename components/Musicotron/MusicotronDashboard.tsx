"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import Image from "next/image";
import { Loader2 } from "lucide-react";

interface GeneratedMusic {
  id: string;
  audio_url: string;
  source_audio_url: string;
  stream_audio_url: string;
  source_stream_audio_url: string;
  image_url: string;
  source_image_url: string;
  prompt: string;
  model_name: string;
  title: string;
  tags: string;
  createTime: string;
  duration: number;
}

export default function MusicotronDashboard() {
  const [loading, setLoading] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [generatedMusic, setGeneratedMusic] = useState<GeneratedMusic[]>([]);
  const [customMode, setCustomMode] = useState(false);
  const [songDescription, setSongDescription] = useState("");
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Poll for task status
  useEffect(() => {
    if (!currentTaskId || !loading) return;

    const pollInterval = setInterval(async () => {
      try {
        console.log("Polling for task:", currentTaskId);
        const response = await fetch(
          `/api/musicotron/status?taskId=${currentTaskId}`
        );
        const data = await response.json();
        console.log("Poll response:", data);

        if (data.status === "complete" && data.data) {
          setGeneratedMusic((prev) => [...prev, ...data.data]);
          setCurrentTaskId(null);
          setLoading(false);
          setPollCount(0);
          setStatusMessage('');
          toast.success("Music generated successfully!");
          clearInterval(pollInterval);
        } else if (data.status === "failed") {
          setCurrentTaskId(null);
          setLoading(false);
          setPollCount(0);
          setStatusMessage('');
          toast.error(data.error || "Failed to generate music");
          clearInterval(pollInterval);
        } else {
          setStatusMessage(data.message || 'Processing...');
          setPollCount((prev) => {
            if (prev >= 60) {
              // Stop after 5 minutes (60 * 5s = 5min)
              setCurrentTaskId(null);
              setLoading(false);
              setStatusMessage('');
              toast.error("Generation timed out. Please try again.");
              clearInterval(pollInterval);
            }
            return prev + 1;
          });
        }
      } catch (error) {
        console.error("Error polling task status:", error);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [currentTaskId, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (customMode) {
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
    } else {
      if (!songDescription) {
        toast.error("Please enter a song description");
        return;
      }
    }

    setLoading(true);
    setPollCount(0);

    try {
      const response = await fetch("/api/musicotron", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customMode,
          songDescription,
          title,
          style,
          lyrics,
          instrumental,
        }),
      });

      const data = await response.json();
      console.log("Generation response:", data);

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate music");
      }

      setCurrentTaskId(data.taskId);
      toast.success("Music generation started! This may take a few minutes...");
    } catch (error) {
      console.error("Error generating music:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "An error occurred while generating music"
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Switch
            checked={customMode}
            onCheckedChange={setCustomMode}
            className="bg-zinc-700"
          />
          <span className="text-lg">Custom Mode</span>
        </div>

        {!customMode ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="songDescription">Song Description</Label>
              <Textarea
                id="songDescription"
                value={songDescription}
                onChange={(e) => setSongDescription(e.target.value)}
                placeholder="Describe the style of music and the topic you want, AI will generate lyrics for you."
                className="h-32 bg-zinc-900 border-none text-white placeholder:text-zinc-500"
                maxLength={399}
                required
              />
              <div className="text-right text-sm text-zinc-500">
                {songDescription.length}/399
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Switch
                checked={instrumental}
                onCheckedChange={setInstrumental}
                className="bg-zinc-700"
              />
              <span className="text-lg">Instrumental</span>
            </div>

            <Button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-6 rounded-full text-lg"
              disabled={loading}
            >
              {loading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="animate-spin" />
                    Generating... {pollCount > 0 && `(${pollCount}s)`}
                  </div>
                  {statusMessage && (
                    <span className="text-sm text-zinc-400">{statusMessage}</span>
                  )}
                </div>
              ) : (
                "Generate Music"
              )}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter a title"
                className="bg-zinc-900 border-none text-white placeholder:text-zinc-500"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="style">Style of Music</Label>
              <Input
                id="style"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="Enter style of music"
                className="bg-zinc-900 border-none text-white placeholder:text-zinc-500"
                maxLength={120}
                required
              />
              <div className="text-right text-sm text-zinc-500">
                {style.length}/120
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Switch
                checked={instrumental}
                onCheckedChange={setInstrumental}
                className="bg-zinc-700"
              />
              <span className="text-lg">Instrumental</span>
            </div>

            {!instrumental && (
              <div className="space-y-2">
                <Label htmlFor="lyrics">Lyrics</Label>
                <Textarea
                  id="lyrics"
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  placeholder="Write your own lyrics, two verses (8 lines) for the best result"
                  className="h-32 bg-zinc-900 border-none text-white placeholder:text-zinc-500"
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
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-6 rounded-full text-lg"
              disabled={loading}
            >
              {loading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="animate-spin" />
                    Generating... {pollCount > 0 && `(${pollCount}s)`}
                  </div>
                  {statusMessage && (
                    <span className="text-sm text-zinc-400">{statusMessage}</span>
                  )}
                </div>
              ) : (
                "Generate Music"
              )}
            </Button>
          </form>
        )}

        {generatedMusic.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4">Generated Music</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {generatedMusic.map((music) => (
                <Card key={music.id} className="bg-zinc-900 border-none">
                  <CardContent className="p-4">
                    <div className="relative w-full h-48 mb-4">
                      <Image
                        src={music.source_image_url || music.image_url}
                        alt={music.title}
                        fill
                        className="object-cover rounded-lg"
                      />
                    </div>
                    <h4 className="font-semibold text-white">{music.title}</h4>
                    <p className="text-sm text-zinc-400">{music.tags}</p>
                    <p className="text-xs text-zinc-500 mt-1">Model: {music.model_name}</p>
                    <div className="mt-2 space-y-2">
                      <audio controls className="w-full bg-zinc-800">
                        <source
                          src={music.source_audio_url || music.audio_url}
                          type="audio/mpeg"
                        />
                        Your browser does not support the audio element.
                      </audio>
                      {music.stream_audio_url && (
                        <audio controls className="w-full bg-zinc-800">
                          <source
                            src={music.source_stream_audio_url || music.stream_audio_url}
                            type="audio/mpeg"
                          />
                          Your browser does not support the audio element.
                        </audio>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      Duration: {Math.floor(music.duration / 60)}:
                      {String(Math.floor(music.duration % 60)).padStart(2, '0')}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
