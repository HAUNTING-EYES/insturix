import { Music2Icon } from "lucide-react";
import MusicCard from "./MusicCard";
import { useQueryClient } from "@tanstack/react-query";
import { QueryKeys, type GeneratedMusic } from "@/lib/QFunctions";
import { useEffect, useState } from "react";

interface MusicListProps {
  generatedMusic: GeneratedMusic[];
}

// Use a regular function component instead of memo for better updates
export default function MusicList({ generatedMusic }: MusicListProps) {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);

  // Mount effect
  useEffect(() => {
    console.log("MusicList mounted with", generatedMusic.length, "tracks");
    setMounted(true);
    return () => console.log("MusicList unmounted");
  }, [generatedMusic.length]);

  // Verify music data is valid
  useEffect(() => {
    if (generatedMusic.length > 0) {
      console.log(
        "Music data in MusicList:",
        generatedMusic.map((m) => ({ id: m.id, title: m.title }))
      );
    }
  }, [generatedMusic]);

  // Prefetch music status when hovering over a card
  const prefetchMusicStatus = (taskId: string) => {
    queryClient.prefetchQuery({
      queryKey: QueryKeys.musicStatus(taskId),
      queryFn: () => null,
      staleTime: 10000, // Consider data fresh for 10 seconds
    });
  };

  // Exit early if no music is available
  if (!generatedMusic || generatedMusic.length === 0) {
    console.log("No music to display");
    return null;
  }

  // Ensure component is mounted before rendering
  if (!mounted) return null;

  return (
    <div className="space-y-6 animate-slow-fade">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music2Icon className="h-5 w-5 text-zinc-400" />
          <h2 className="text-xl font-medium text-zinc-100">
            Generated Music ({generatedMusic.length})
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {generatedMusic.map((music) => (
          <div
            key={`music-${music.id}`}
            className="animate-slow-fade"
            onMouseEnter={() => prefetchMusicStatus(music.id)}
          >
            <MusicCard music={music} />
          </div>
        ))}
      </div>
    </div>
  );
}
