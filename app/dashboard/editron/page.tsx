// Editron Dashboard with YouTube validation and UI update
"use client";

import { useState, FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { ArrowRight, Loader2 } from "lucide-react";
import { HistoryPanel } from "@/components/dashboard/Editron/HistoryPanel";

type VideoDetails = {
  title: string;
  thumbnailUrl: string;
  duration: number;
};

export default function EditronDashboard() {
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoDetails, setVideoDetails] = useState<VideoDetails | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setVideoDetails(null);
    setIsGenerating(false);

    try {
      const res = await fetch("/api/services/editron/validate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputValue }),
      });
      const data = await res.json();

      if (res.ok && data.valid) {
        setVideoDetails(data.videoDetails);
        setIsGenerating(true);
      } else {
        let msg = "Invalid YouTube link.";
        switch (data.error) {
          case "SHORTS_NOT_SUPPORTED":
            msg = "YouTube Shorts are not supported. Please provide a standard video link.";
            break;
          case "VIDEO_PRIVATE":
            msg = "This video is private. Please provide a public video.";
            break;
          case "VIDEO_TOO_LONG":
            msg = "Video is longer than 120 minutes. Please provide a shorter video.";
            break;
          case "INVALID_URL":
            msg = "Invalid YouTube link. Please check the URL.";
            break;
          case "API_ERROR":
            msg = "There was a problem validating the video. Please try again later.";
            break;
        }
        setError(msg);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* History Panel - top right */}
      <div className="absolute top-8 right-8 z-30">
        <HistoryPanel />
      </div>
      {/* Aurora Animated Background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 30%, rgba(0,200,255,0.18) 0%, transparent 70%)," +
            "radial-gradient(ellipse 60% 40% at 80% 70%, rgba(255,0,200,0.14) 0%, transparent 70%)," +
            "radial-gradient(ellipse 60% 60% at 60% 20%, rgba(0,255,180,0.12) 0%, transparent 70%)",
          animation: "auroraMove 12s ease-in-out infinite alternate"
        }}
      />
      <style>
        {`
          @keyframes auroraMove {
            0% {
              filter: blur(0px) brightness(1);
              opacity: 1;
            }
            50% {
              filter: blur(8px) brightness(1.2);
              opacity: 0.85;
            }
            100% {
              filter: blur(16px) brightness(1.1);
              opacity: 1;
            }
          }
        `}
      </style>
      <div className="relative max-w-xl w-full mx-auto space-y-12 z-10">
        <div>
          <h1 className="text-4xl font-semibold text-zinc-100">Editron v0.1</h1>
          <p className="mt-4 text-lg text-zinc-400 font-light">
            Generate YouTube Shorts instantly from your favorite podcasts. Enter the link below:
          </p>
        </div>

        {/* Video Details Card */}
        {videoDetails && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>{videoDetails.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Image
                  src={videoDetails.thumbnailUrl}
                  alt={videoDetails.title}
                  width={160}
                  height={90}
                  className="rounded"
                  unoptimized
                />
                <div>
                  <span className="text-sm text-zinc-500">
                    Duration: {Math.floor(videoDetails.duration / 60)}m {videoDetails.duration % 60}s
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loader for shorts generation */}
        {isGenerating && (
          <div className="flex flex-col items-center gap-2 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="text-blue-400 font-medium">Generating shorts...</span>
          </div>
        )}

        {/* Input Form */}
        {!isGenerating && (
          <form
            className="bg-black/40 border border-zinc-800 rounded-xl p-6 flex items-center gap-4 backdrop-blur-xl"
            onSubmit={handleSubmit}
          >
            <Input
              type="text"
              placeholder="Paste YouTube podcast link here"
              className="bg-black/30 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:ring-2 focus:ring-blue-500"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              disabled={isLoading || isGenerating}
            />
            <Button
              variant="default"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 flex items-center gap-2"
              type="submit"
              disabled={isLoading || isGenerating}
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            </Button>
          </form>
        )}

        {/* Error Message */}
        {error && (
          <div className="text-red-400 text-sm mt-2 text-center">{error}</div>
        )}

        <p className="text-sm text-zinc-500">
          Editron v0.1 (Beta): Currently supports YouTube Short generation from podcasts. Stay tuned for advanced editing features!
        </p>
      </div>
    </div>
  );
}
