import { Card, CardContent } from "@/components/ui/card";
import { Clock, Music2 } from "lucide-react";
import Image from "next/image";

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

interface MusicCardProps {
  music: GeneratedMusic;
}

export default function MusicCard({ music }: MusicCardProps) {
  return (
    <Card className="group bg-black/40 border-zinc-800 backdrop-blur-xl hover:bg-black/50 transition-all duration-300">
      <CardContent className="p-4">
        <div className="relative w-full h-48 mb-4 rounded-lg overflow-hidden">
          <Image
            src={music.source_image_url || music.image_url}
            alt={music.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>
        
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-zinc-100">{music.title}</h4>
            <p className="text-sm text-zinc-400 flex items-center gap-2">
              <Music2 className="h-4 w-4" />
              {music.tags}
            </p>
          </div>

          <div className="space-y-2">
            <audio 
              controls 
              className="w-full [&::-webkit-media-controls-panel]:bg-zinc-900 [&::-webkit-media-controls-current-time-display]:text-zinc-100 [&::-webkit-media-controls-time-remaining-display]:text-zinc-100"
            >
              <source src={music.source_audio_url || music.audio_url} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
            
            {music.stream_audio_url && (
              <audio 
                controls 
                className="w-full [&::-webkit-media-controls-panel]:bg-zinc-900 [&::-webkit-media-controls-current-time-display]:text-zinc-100 [&::-webkit-media-controls-time-remaining-display]:text-zinc-100"
              >
                <source src={music.source_stream_audio_url || music.stream_audio_url} type="audio/mpeg" />
                Your browser does not support the audio element.
              </audio>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {Math.floor(music.duration / 60)}:{String(Math.floor(music.duration % 60)).padStart(2, "0")}
            </span>
            <span>Model: {music.model_name}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}