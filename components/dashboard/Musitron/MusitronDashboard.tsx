"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileMusic, Music2, Settings2 } from "lucide-react";
import MusicGenerator from "./MusicGenerator";
import MusicList from "./MusicList";
import History from "@/components/dashboard/Musitron/HistoryForMusitron";
import { toast } from "sonner";

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
  const [shouldRefetchHistory, setShouldRefetchHistory] =
    useState<boolean>(false);
  // Ref to track updates without causing re-renders
  const musicUpdateCountRef = useRef(0);

  // Memoized callback to prevent unnecessary re-renders
  const handleMusicGenerated = useCallback((newMusic: GeneratedMusic[]) => {
    if (newMusic && newMusic.length > 0) {
      console.log("Handling new music:", newMusic);
      
      try {
        // Explicitly increment counter to force re-render of MusicList
        musicUpdateCountRef.current += 1;
        
        // Immediately update state with the new music
        setGeneratedMusic((prev) => {
          const existingIds = new Set(prev.map((item) => item.id));
          const uniqueNewMusic = newMusic.filter(
            (item) => !existingIds.has(item.id)
          );

          if (uniqueNewMusic.length === 0) {
            console.log("No unique music to add");
            return prev; // No new unique music to add
          }

          console.log(`Adding ${uniqueNewMusic.length} new tracks`);
          // Add the new music at the beginning for better visibility
          const updatedMusic = [...uniqueNewMusic, ...prev];
          
          // Ensure immediate UI update in the next frame
          window.requestAnimationFrame(() => {
            console.log("Forcing immediate UI refresh for MusicList");
            
            // Force component to re-render with the new data
            musicUpdateCountRef.current += 1;
            
            // Then trigger history refetch after a small delay
            setTimeout(() => {
              console.log("Triggering history refetch");
              setShouldRefetchHistory(true);
            }, 300);
          });
          
          return updatedMusic;
        });
      } catch (error) {
        console.error("Error updating music state:", error);
        toast.error("Error displaying the generated music");
      }
    } else {
      console.warn("Received empty music data");
    }
  }, []);
  
  // Force component update on music changes with dedicated effect
  useEffect(() => {
    if (generatedMusic.length > 0) {
      console.log(`Music state updated with ${generatedMusic.length} tracks`);
      
      // Force re-render if needed
      const forceRerender = setTimeout(() => {
        if (musicUpdateCountRef.current > 0) {
          console.log("Forcing UI update for MusicList");
          // This is just to trigger a re-render if needed
          musicUpdateCountRef.current = musicUpdateCountRef.current;
        }
      }, 500);
      
      return () => clearTimeout(forceRerender);
    }
  }, [generatedMusic]);

  // Reset the refetch flag after it's been consumed
  useEffect(() => {
    if (shouldRefetchHistory) {
      // Reset after a short delay to ensure the refetch has been triggered
      const timer = setTimeout(() => {
        console.log("Resetting shouldRefetchHistory flag");
        setShouldRefetchHistory(false);
      }, 2000); // Increased timeout to ensure history component has time to react

      return () => clearTimeout(timer);
    }
  }, [shouldRefetchHistory]);

  // Calculate stats
  const totalGenerated = generatedMusic.length;
  const totalDuration = generatedMusic.reduce(
    (acc, curr) => acc + (curr.duration || 0),
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

            {/* Music list section - always render it to ensure transitions work */}
            <MusicList
              key={`music-list-${musicUpdateCountRef.current}`}
              generatedMusic={generatedMusic}
            />
          </div>

          {/* Stats & Insights */}
          <div className="space-y-8">
            <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-lg font-medium text-zinc-100 flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-yellow-500" />
                  Analytics Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-black/20 rounded-lg">
                  <div className="flex items-center gap-3 text-sm font-medium text-zinc-400 mb-1">
                    <FileMusic className="h-4 w-4 text-yellow-500" />
                    Generated Music
                  </div>
                  <div className="text-3xl font-semibold text-zinc-100">
                    {totalGenerated}
                  </div>
                  <div className="text-sm text-zinc-500 mt-1">Total tracks</div>
                </div>

                <div className="p-4 bg-black/20 rounded-lg">
                  <div className="flex items-center gap-3 text-sm font-medium text-zinc-400 mb-1">
                    <Music2 className="h-4 w-4 text-yellow-500" />
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
                    <Music2 className="h-4 w-4 text-yellow-500" />
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
            <History shouldRefetch={shouldRefetchHistory} />
          </div>
        </div>
      </div>
    </div>
  );
}
