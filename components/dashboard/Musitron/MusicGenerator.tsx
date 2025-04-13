"use client"

import { useState, useEffect } from "react"
import type { ReactElement } from "react"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { AudioWaveform, Mic, Music2 } from "lucide-react"
import { toast } from "sonner"
import SimpleMode from "./SimpleMode"
import CustomMode from "./CustomMode"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { generateMusic, checkMusicStatus, QueryKeys } from "@/lib/QFunctions"
import MusicCardSkeleton from "@/components/skeletons/MusicSkeleton"

interface GeneratedMusic {
  id: string
  audio_url: string
  source_audio_url: string
  stream_audio_url: string
  source_stream_audio_url: string
  image_url: string
  source_image_url: string
  prompt: string
  model_name: string
  title: string
  tags: string
  createTime: string
  duration: number
}

export interface MusicGeneratorProps {
  onMusicGenerated: (music: GeneratedMusic[]) => void
}

export default function MusicGenerator({ onMusicGenerated }: MusicGeneratorProps): ReactElement {
  const queryClient = useQueryClient()
  const [customMode, setCustomMode] = useState(false)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null)

  // Music generation mutation
  const musicMutation = useMutation({
    mutationFn: generateMusic,
    onSuccess: (data) => {
      setCurrentTaskId(data.taskId)
      setGenerationStartTime(Date.now())
      toast.success("Music generation started! This may take a few minutes...")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to generate music")
    },
  })

  // Status polling query
  const { data: statusData } = useQuery({
    queryKey: QueryKeys.musicStatus(currentTaskId || ""),
    queryFn: () => checkMusicStatus(currentTaskId!),
    enabled: !!currentTaskId,
    refetchInterval: currentTaskId ? 5000 : false,
    gcTime: 5000,
  })

  // Handle status updates and check for timeout
  useEffect(() => {
    if (!statusData || !currentTaskId || !generationStartTime) return

    // Check for timeout (3 minutes)
    const elapsedTime = (Date.now() - generationStartTime) / 1000
    if (elapsedTime > 180) {
      // 3 minutes timeout
      setCurrentTaskId(null)
      setGenerationStartTime(null)
      toast.error("Generation timed out. Please try again.")
      queryClient.removeQueries({
        queryKey: QueryKeys.musicStatus(currentTaskId),
      })
      return
    }

    if (statusData.status === "complete" && statusData.data) {
      // Log the received data to help with debugging
      console.log("Generated music data received:", statusData.data)

      if (!statusData.data.length) {
        toast.error("No music data received from the server. Please try again.")
        setCurrentTaskId(null)
        setGenerationStartTime(null)
        return
      }

      try {
        // First update UI with generated music
        onMusicGenerated(statusData.data)
        
        // Only after a small delay, reset the loading state to ensure smooth transition
        setTimeout(() => {
          console.log("Transitioning from skeleton to MusicCard")
          setCurrentTaskId(null)
          setGenerationStartTime(null)
          toast.success(`Music "${statusData?.data?.[0]?.title || "track"}" generated successfully!`)
        }, 500)
  
        // Forcefully update the UI by invalidating queries
        queryClient.invalidateQueries()
        queryClient.removeQueries({
          queryKey: QueryKeys.musicStatus(currentTaskId),
        })
      } catch (error) {
        console.error("Error in generation completion:", error)
        toast.error("There was an error displaying your generated music")
        setCurrentTaskId(null)
        setGenerationStartTime(null)
      }
    } else if (statusData.status === "failed") {
      setCurrentTaskId(null)
      setGenerationStartTime(null)
      toast.error(statusData.error || "Failed to generate music")
      queryClient.removeQueries({
        queryKey: QueryKeys.musicStatus(currentTaskId),
      })
    }
  }, [statusData, currentTaskId, generationStartTime, queryClient, onMusicGenerated])

  const handleSubmit = async (formData: {
    [key: string]: string | number | boolean
  }): Promise<void> => {
    musicMutation.mutate({
      customMode,
      ...formData,
    })
  }

  const isLoading = musicMutation.isPending || !!currentTaskId

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 flex items-center gap-3">
          <AudioWaveform className="h-8 w-8 text-yellow-500" />
          Musitron
        </h1>
        <p className="mt-3 text-lg text-zinc-400 font-light">Transform your ideas into unique musical compositions</p>
      </div>

      {/* Preview Card (shown during loading) */}

      {/* Main Card */}
      <Card
        className={`bg-black/40 border-zinc-800 backdrop-blur-xl ${isLoading ? "opacity-40 pointer-events-none" : ""}`}
      >
        <CardContent className="p-6 space-y-6">
          {/* Mode Switch */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-black/20">
            <div className="flex items-center gap-3">
              {customMode ? (
                <Mic className="h-5 w-5 text-yellow-500" />
              ) : (
                <Music2 className="h-5 w-5 text-yellow-500" />
              )}
              <span className="text-zinc-100">{customMode ? "Custom Mode" : "Simple Mode"}</span>
            </div>
            <Switch
              checked={customMode}
              onCheckedChange={setCustomMode}
              className="bg-zinc-700 data-[state=checked]:bg-yellow-600"
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
      {isLoading && (
        <div className="space-y-6 animate-slow-fade">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music2 className="h-5 w-5 text-zinc-400" />
              <h2 className="text-xl font-medium text-zinc-100">
                Generating Music...
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MusicCardSkeleton />
            <div className="hidden md:block">
              <MusicCardSkeleton />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
