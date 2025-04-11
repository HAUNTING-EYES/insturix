"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileMusic, Music2, Settings2 } from "lucide-react";
import MusicGenerator from "./MusicGenerator";
import MusicList from "./MusicList";
import History from "@/components/dashboard/Musitron/HistoryForMusitron";

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

export default function MusitronDashboard() {
  const [generatedMusic, setGeneratedMusic] = useState<GeneratedMusic[]>([]);

  const handleMusicGenerated = (newMusic: GeneratedMusic[]) => {
    setGeneratedMusic((prev) => [...prev, ...newMusic]);
  };

  // Calculate stats
  const totalGenerated = generatedMusic.length;
  const totalDuration = generatedMusic.reduce(
    (acc, curr) => acc + curr.duration,
    0
  );
  const avgDuration =
    totalGenerated > 0 ? Math.round(totalDuration / totalGenerated) : 0;

  return (
    <div className="min-h-screen bg-transparent">
      <div className="container mx-auto p-8 bg-transparent">
        <div className="grid lg:grid-cols-3 gap-8 bg-transparent">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-8">
            <MusicGenerator onMusicGenerated={handleMusicGenerated} />
            <MusicList generatedMusic={generatedMusic} />
          </div>

          {/* Stats & Insights */}
          <div className="space-y-8">
            <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-lg font-medium text-zinc-100 flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-purple-500" />
                  Analytics Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-black/20 rounded-lg">
                  <div className="flex items-center gap-3 text-sm font-medium text-zinc-400 mb-1">
                    <FileMusic className="h-4 w-4 text-purple-500" />
                    Generated Music
                  </div>
                  <div className="text-3xl font-semibold text-zinc-100">
                    {totalGenerated}
                  </div>
                  <div className="text-sm text-zinc-500 mt-1">Total tracks</div>
                </div>

                <div className="p-4 bg-black/20 rounded-lg">
                  <div className="flex items-center gap-3 text-sm font-medium text-zinc-400 mb-1">
                    <Music2 className="h-4 w-4 text-purple-500" />
                    Average Duration
                  </div>
                  <div className="text-3xl font-semibold text-zinc-100">
                    {Math.floor(avgDuration / 60)}:
                    {String(Math.floor(avgDuration % 60)).padStart(2, "0")}
                  </div>
                  <div className="text-sm text-zinc-500 mt-1">
                    Minutes per track
                  </div>
                </div>

                <div className="p-4 bg-black/20 rounded-lg">
                  <div className="flex items-center gap-3 text-sm font-medium text-zinc-400 mb-1">
                    <Music2 className="h-4 w-4 text-purple-500" />
                    Total Duration
                  </div>
                  <div className="text-3xl font-semibold text-zinc-100">
                    {Math.floor(totalDuration / 60)}:
                    {String(Math.floor(totalDuration % 60)).padStart(2, "0")}
                  </div>
                  <div className="text-sm text-zinc-500 mt-1">
                    Minutes of music
                  </div>
                </div>
              </CardContent>
            </Card>
            <History />
          </div>
        </div>
      </div>
    </div>
  );
}
