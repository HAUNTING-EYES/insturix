import { Music2Icon } from "lucide-react";
import MusicCard from "./MusicCard";
import { useQueryClient } from "@tanstack/react-query";
import { QueryKeys, type GeneratedMusic } from "@/lib/QFunctions";

interface MusicListProps {
  generatedMusic: GeneratedMusic[];
}

export default function MusicList({ generatedMusic }: MusicListProps) {
  const queryClient = useQueryClient();

  // Prefetch music status when hovering over a card
  const prefetchMusicStatus = (taskId: string) => {
    queryClient.prefetchQuery({
      queryKey: QueryKeys.musicStatus(taskId),
      queryFn: () => null,
      staleTime: 10000, // Consider data fresh for 10 seconds
    });
  };

  if (generatedMusic.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music2Icon className="h-5 w-5 text-zinc-400" />
          <h2 className="text-xl font-medium text-zinc-100">
            Generated Music
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {generatedMusic.map((music) => (
          <div
            key={music.id}
            onMouseEnter={() => prefetchMusicStatus(music.id)}
          >
            <MusicCard music={music} />
          </div>
        ))}
      </div>
    </div>
  );
}
