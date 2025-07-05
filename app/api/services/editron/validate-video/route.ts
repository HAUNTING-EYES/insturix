// API route for validating YouTube video links for Editron
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

// --- Utility functions (adapted from alyzitron/utils/youtube.ts) ---

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const MAX_DURATION_SECONDS = 120 * 60; // 120 minutes

const youtube = google.youtube({
  version: "v3",
  auth: YOUTUBE_API_KEY,
});

// Parse ISO 8601 duration (e.g., PT1H2M3S)
function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// Extract YouTube Video ID from various URL formats
function extractYouTubeVideoId(url: string): string | null {
  const regexes = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const regex of regexes) {
    const match = url.match(regex);
    if (match && match[1]) return match[1];
  }
  return null;
}

// --- API Route Handler ---

export async function POST(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  req: NextRequest
) {
  return NextResponse.json(
    { message: "Editron video validation is coming soon" },
    { status: 404 }
  );
}