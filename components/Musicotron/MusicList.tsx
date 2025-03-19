import { Button } from "@/components/ui/button";
import { ChevronRight, History } from "lucide-react";
import MusicCard from "./MusicCard";

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

interface MusicListProps {
  generatedMusic: GeneratedMusic[];
}

export default function MusicList({ generatedMusic }: MusicListProps) {
  if (generatedMusic.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-zinc-400" />
          <h2 className="text-xl font-medium text-zinc-100">Generated Music</h2>
        </div>
        <Button variant="ghost" className="text-zinc-400 hover:text-zinc-300">
          View All
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {generatedMusic.map((music) => (
          <MusicCard key={music.id} music={music} />
        ))}
      </div>
    </div>
  );
}