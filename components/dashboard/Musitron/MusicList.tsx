import { Music2Icon } from "lucide-react";
import MusicCard from "./MusicCard";
import { useQueryClient } from "@tanstack/react-query";
import { QueryKeys, type GeneratedMusic } from "@/lib/QFunctions";
import { useEffect, useState, useRef } from "react";

interface MusicListProps {
  generatedMusic: GeneratedMusic[];
}

export default function MusicList({ generatedMusic }: MusicListProps) {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const prevCountRef = useRef(0);
  const musicIdsRef = useRef<string[]>([]);

  // Check for meaningful changes in music data - now using both length and IDs
  useEffect(() => {
    const currentCount = generatedMusic.length;
    const currentIds = generatedMusic.map(m => m.id).join(',');
    
    // Check if music array has changed by length or by content
    if (currentCount !== prevCountRef.current || currentIds !== musicIdsRef.current.join(',')) {
      console.log(`Music data changed - count: ${prevCountRef.current} → ${currentCount}`);
      prevCountRef.current = currentCount;
      musicIdsRef.current = generatedMusic.map(m => m.id);
      setMounted(true);
    }
  }, [generatedMusic]);

  // Mount as soon as component loads
  useEffect(() => {
    if (!mounted) {
      setMounted(true);
    }
    
    // Cleanup function
    return () => {
      prevCountRef.current = 0;
      musicIdsRef.current = [];
    };
  }, []);

  // Debug log music data
  useEffect(() => {
    if (generatedMusic.length > 0) {
      console.log(
        `Music data in MusicList (${generatedMusic.length} tracks):`,
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

  // Exit early if no music is available (should not happen with proper state management)
  if (!generatedMusic || generatedMusic.length === 0) {
    console.log("No music to display, but rendering empty container for transition");
    // Return empty container with same structure to ensure smooth transition
    return (
      <div className="space-y-6 animate-slow-fade">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music2Icon className="h-5 w-5 text-zinc-400" />
            <h2 className="text-xl font-medium text-zinc-100">
              Generated Music
            </h2>
          </div>
        </div>
        
        {/* Empty grid with same structure */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* No music cards yet */}
        </div>
      </div>
    );
  }

  // Always render once mounted - don't skip rendering based on mounted state
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
