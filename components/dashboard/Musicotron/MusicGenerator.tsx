import { useState, useEffect } from "react";
import { ReactElement } from "react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AudioWaveform, Mic, Music2 } from "lucide-react";
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
  const [pollCount, setPollCount] = useState(0);

  // Music generation mutation
  const musicMutation = useMutation({
    mutationFn: generateMusic,
    onSuccess: (data) => {
      setCurrentTaskId(data.taskId);
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

  // Handle status updates
  useEffect(() => {
    if (!statusData) return;

    if (statusData.status === "complete" && statusData.data) {
      onMusicGenerated(statusData.data);
      setCurrentTaskId(null);
      setPollCount(0);
      toast.success("Music generated successfully!");
      queryClient.removeQueries({
        queryKey: QueryKeys.musicStatus(currentTaskId!),
      });
    } else if (statusData.status === "failed") {
      setCurrentTaskId(null);
      setPollCount(0);
      toast.error(statusData.error || "Failed to generate music");
      queryClient.removeQueries({
        queryKey: QueryKeys.musicStatus(currentTaskId!),
      });
    } else {
      setPollCount((prev) => {
        if (prev >= 180) {
          // 3 minutes timeout
          setCurrentTaskId(null);
          toast.error("Generation timed out. Please try again.");
          queryClient.removeQueries({
            queryKey: QueryKeys.musicStatus(currentTaskId!),
          });
          return 0;
        }
        return prev + 1;
      });
    }
  }, [statusData, currentTaskId, queryClient, onMusicGenerated]);

  // Counter effect for timeout
  useEffect(() => {
    if (!currentTaskId) return;

    const counterInterval = setInterval(() => {
      setPollCount((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(counterInterval);
  }, [currentTaskId]);

  const handleSubmit = async (formData: {
    [key: string]: string | number | boolean;
  }): Promise<void> => {
    setPollCount(0);
    musicMutation.mutate({
      customMode,
      ...formData,
    });
  };

  const isLoading = musicMutation.isPending || !!currentTaskId;
  const statusMessage = statusData?.message || "Processing...";

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
            <CustomMode onSubmit={handleSubmit} loading={isLoading} />
          ) : (
            <SimpleMode onSubmit={handleSubmit} loading={isLoading} />
          )}

          {/* Status and Result Section */}
          {isLoading && (
            <div className="flex flex-col items-center gap-4 p-4 bg-black/20 rounded-lg">
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin text-purple-500" />
                <span>Generating... {pollCount > 0 && `(${pollCount}s)`}</span>
              </div>
              {statusMessage && (
                <span className="text-sm text-zinc-400">{statusMessage}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
