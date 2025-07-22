"use client";

import React, { useEffect, useState } from "react";
import MusicPlayer from "./MusicPlayer";

interface MusicPlayerWrapperProps {
  task: {
    title: string;
    style: string;
    instrumental_only: boolean;
    lyrics?: string;
    createdAt: string;
    _id: string;
    gcs_url?: string;
    status: string;
  };
  signedUrlApi?: string;
}

function getAudioContentType(url: string | undefined) {
  if (!url) return "audio/mpeg";
  if (url.endsWith(".wav")) return "audio/wav";
  if (url.endsWith(".ogg")) return "audio/ogg";
  if (url.endsWith(".mp3")) return "audio/mpeg";
  return "audio/mpeg";
}

export default function MusicPlayerWrapper({ task, signedUrlApi }: MusicPlayerWrapperProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchSignedUrl = async () => {
      if (!task.gcs_url || task.status !== "completed") return;
      try {
        const contentType = getAudioContentType(task.gcs_url);
        const endpoint = signedUrlApi || "/api/services/musitron/gcs/sign";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: task.gcs_url.split("/").pop(),
            contentType,
            gcsUrl: task.gcs_url,
          }),
        });
        const data = await res.json();
        if (data.url) setSignedUrl(data.url);
      } catch {
        setSignedUrl(null);
      }
    };
    fetchSignedUrl();
  }, [task.gcs_url, task.status, signedUrlApi]);

  return (
    <MusicPlayer
      title={task.title}
      style={task.style}
      instrumentalOnly={task.instrumental_only}
      lyrics={task.lyrics}
      createdDate={task.createdAt}
      taskId={task._id}
      audioUrl={signedUrl || undefined}
    />
  );
}