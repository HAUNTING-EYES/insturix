import { useState, useEffect } from "react";
import { ReactElement } from "react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AudioWaveform, Mic, Music2 } from "lucide-react";
import { toast } from "sonner";
import SimpleMode from "./SimpleMode";
import CustomMode from "./CustomMode";

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

export interface MusicGeneratorProps {
  onMusicGenerated: (music: GeneratedMusic[]) => void;
}

export default function MusicGenerator({
  onMusicGenerated,
}: MusicGeneratorProps): ReactElement {
  const [loading, setLoading] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [generatedMusic, setGeneratedMusic] = useState<GeneratedMusic[] | null>(
    null
  );

  const [startTime, setStartTime] = useState<Date | null>(null);

  const handleSubmit = async (
    formData: { title?: string } & { [key: string]: string | number | boolean }
  ): Promise<void> => {
    setLoading(true);
    setPollCount(0);
    setStatusMessage("");
    setStartTime(new Date());
    setGeneratedMusic(null);

    try {
      const response = await fetch("/api/services/musicotron", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customMode,
          ...formData,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.taskId) {
        throw new Error(data.error || "Failed to generate music");
      }

      console.log("Task ID received:", data.taskId);
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

  useEffect(() => {
    if (!currentTaskId) return;

    const counterInterval = setInterval(() => {
      setPollCount((prev) => {
        if (prev >= 180) {
          // 3 minutes timeout
          clearInterval(counterInterval);
          setCurrentTaskId(null);
          setLoading(false);
          setStatusMessage("");
          toast.error("Generation timed out. Please try again.");
          return 0;
        }
        return prev + 1;
      });
    }, 1000);

    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await fetch(
          `/api/services/musicotron/status?taskId=${currentTaskId}`
        );
        const statusData = await statusResponse.json();

        if (statusData.status === "complete" && statusData.data) {
          setGeneratedMusic(statusData.data);
          onMusicGenerated(statusData.data);
          setCurrentTaskId(null);
          setLoading(false);
          setPollCount(0);
          setStatusMessage("");
          toast.success("Music generated successfully!");
        } else if (statusData.status === "failed") {
          setCurrentTaskId(null);
          setLoading(false);
          setPollCount(0);
          setStatusMessage("");
          toast.error(statusData.error || "Failed to generate music");
        } else if (statusData.error) {
          setCurrentTaskId(null);
          setLoading(false);
          setPollCount(0);
          setStatusMessage("");
          toast.error(statusData.error);
          if (statusData.status === 404) {
            toast.error(
              "Generation failed. Please try again with different input."
            );
          }
        } else {
          setStatusMessage(statusData.message || "Processing...");
        }
      } catch (error) {
        console.error("Error polling task status:", error);
        setStatusMessage("Error checking status. Please try again.");
        setCurrentTaskId(null);
        setLoading(false);
        toast.error("Failed to check generation status");
      }
    }, 5000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(counterInterval);
    };
  }, [currentTaskId, onMusicGenerated, startTime]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 flex items-center gap-3">
          <AudioWaveform className="h-8 w-8 text-purple-500" />
          Musicotron
        </h1>
        <p className="mt-3 text-lg text-zinc-400 font-light">
          Transform your ideas into unique musical compositions
        </p>
      </div>

      {/* Main Card */}
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardContent className="p-6 space-y-6">
          {/* Mode Switch */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-black/20">
            <div className="flex items-center gap-3">
              {customMode ? (
                <Mic className="h-5 w-5 text-purple-500" />
              ) : (
                <Music2 className="h-5 w-5 text-purple-500" />
              )}
              <span className="text-zinc-100">
                {customMode ? "Custom Mode" : "Simple Mode"}
              </span>
            </div>
            <Switch
              checked={customMode}
              onCheckedChange={setCustomMode}
              className="bg-zinc-700 data-[state=checked]:bg-purple-600"
            />
          </div>

          {/* Form */}
          {customMode ? (
            <CustomMode onSubmit={handleSubmit} loading={loading} />
          ) : (
            <SimpleMode onSubmit={handleSubmit} loading={loading} />
          )}

          {/* Status and Result Section */}
          {(loading || generatedMusic) && (
            <div className="flex flex-col items-center gap-4 p-4 bg-black/20 rounded-lg">
              {/* Loading State */}
              {loading && (
                <>
                  <div className="flex items-center gap-2">
                    <Loader2 className="animate-spin text-purple-500" />
                    <span>
                      Generating... {pollCount > 0 && `(${pollCount}s)`}
                    </span>
                  </div>
                  {statusMessage && (
                    <span className="text-sm text-zinc-400">
                      {statusMessage}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
