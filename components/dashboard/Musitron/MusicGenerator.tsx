"use client";

import { useState, useEffect } from "react";
import type { ReactElement } from "react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { AudioWaveform, Mic, Music2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import SimpleMode from "./SimpleMode";
import CustomMode from "./CustomMode";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { generateMusic, checkMusicStatus, QueryKeys } from "@/lib/QFunctions";

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
  const queryClient = useQueryClient();
  const [customMode, setCustomMode] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(
    null
  );
  const [previewData, setPreviewData] = useState<{
    title?: string;
    style?: string;
    description?: string;
  }>({});

  // Music generation mutation
  const musicMutation = useMutation({
    mutationFn: generateMusic,
    onSuccess: (data) => {
      setCurrentTaskId(data.taskId);
      setGenerationStartTime(Date.now());
      toast.success("Music generation started! This may take a few minutes...");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to generate music");
    },
  });

  // Status polling query
  const { data: statusData } = useQuery({
    queryKey: QueryKeys.musicStatus(currentTaskId || ""),
    queryFn: () => checkMusicStatus(currentTaskId!),
    enabled: !!currentTaskId,
    refetchInterval: currentTaskId ? 5000 : false,
    gcTime: 5000,
  });

  // Handle status updates and check for timeout
  useEffect(() => {
    if (!statusData || !currentTaskId || !generationStartTime) return;

    // Check for timeout (3 minutes)
    const elapsedTime = (Date.now() - generationStartTime) / 1000;
    if (elapsedTime > 180) {
      // 3 minutes timeout
      setCurrentTaskId(null);
      setGenerationStartTime(null);
      toast.error("Generation timed out. Please try again.");
      queryClient.removeQueries({
        queryKey: QueryKeys.musicStatus(currentTaskId),
      });
      return;
    }

    if (statusData.status === "complete" && statusData.data) {
      // Log the received data to help with debugging
      console.log("Generated music data received:", statusData.data);

      if (!statusData.data.length) {
        toast.error(
          "No music data received from the server. Please try again."
        );
        setCurrentTaskId(null);
        setGenerationStartTime(null);
        return;
      }

      // Immediately update UI with generated music
      onMusicGenerated(statusData.data);
      setCurrentTaskId(null);
      setGenerationStartTime(null);
      toast.success(
        `Music "${
          statusData.data[0]?.title || "track"
        }" generated successfully!`
      );

      // Forcefully update the UI by invalidating queries
      queryClient.invalidateQueries();
      queryClient.removeQueries({
        queryKey: QueryKeys.musicStatus(currentTaskId),
      });

      // Clean up preview data
      setPreviewData({});
    } else if (statusData.status === "failed") {
      setCurrentTaskId(null);
      setGenerationStartTime(null);
      toast.error(statusData.error || "Failed to generate music");
      queryClient.removeQueries({
        queryKey: QueryKeys.musicStatus(currentTaskId),
      });
    }
  }, [
    statusData,
    currentTaskId,
    generationStartTime,
    queryClient,
    onMusicGenerated,
  ]);

  const handleSubmit = async (formData: {
    [key: string]: string | number | boolean;
  }): Promise<void> => {
    // Save preview data based on which mode is being used
    if (customMode) {
      setPreviewData({
        title: formData.title as string,
        style: formData.style as string,
      });
    } else {
      setPreviewData({
        title: formData.title as string,
        description: formData.songDescription as string,
      });
    }

    musicMutation.mutate({
      customMode,
      ...formData,
    });
  };

  const isLoading = musicMutation.isPending || !!currentTaskId;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 flex items-center gap-3">
          <AudioWaveform className="h-8 w-8 text-purple-500" />
          Musitron
        </h1>
        <p className="mt-3 text-lg text-zinc-400 font-light">
          Transform your ideas into unique musical compositions
        </p>
      </div>

      {/* Preview Card (shown during loading) */}
      {isLoading && (
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl overflow-hidden relative">
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1 aspect-square rounded-lg overflow-hidden relative bg-gradient-to-br from-purple-900/50 to-black flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 to-black"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-spin">
                  <RefreshCw className="h-12 w-12 text-purple-500" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent">
                <div className="animate-pulse bg-zinc-700 h-4 w-3/4 rounded mb-2"></div>
                <div className="animate-pulse bg-zinc-700 h-3 w-1/2 rounded"></div>
              </div>
            </div>
            <div className="md:col-span-2 flex flex-col justify-center space-y-4">
              <div className="flex items-center gap-3">
                <Music2 className="h-6 w-6 text-purple-500" />
                <div className="text-xl font-medium text-zinc-200">
                  {previewData.title || "Generating your music..."}
                </div>
              </div>

              <div className="space-y-3">
                {previewData.style && (
                  <div className="text-sm text-zinc-400">
                    <span className="font-medium">Style:</span>{" "}
                    {previewData.style}
                  </div>
                )}
                {previewData.description && (
                  <div className="text-sm text-zinc-400">
                    <span className="font-medium">Description:</span>{" "}
                    {previewData.description.length > 100
                      ? `${previewData.description.substring(0, 100)}...`
                      : previewData.description}
                  </div>
                )}
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-600 rounded-full animate-progress"></div>
                </div>
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 text-zinc-400 animate-spin" />
                  <div className="text-xs text-zinc-400">
                    This may take a few minutes... Please wait.
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Card */}
      <Card
        className={`bg-black/40 border-zinc-800 backdrop-blur-xl ${
          isLoading ? "opacity-40 pointer-events-none" : ""
        }`}
      >
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
              disabled={isLoading}
            />
          </div>

          {/* Form */}
          {customMode ? (
            <CustomMode onSubmit={handleSubmit} loading={isLoading} />
          ) : (
            <SimpleMode onSubmit={handleSubmit} loading={isLoading} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
