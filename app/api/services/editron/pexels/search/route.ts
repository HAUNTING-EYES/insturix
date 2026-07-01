import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const PEXELS_IMAGE_SEARCH_URL = "https://api.pexels.com/v1/search";
const PEXELS_VIDEO_SEARCH_URL = "https://api.pexels.com/videos/search";
const MAX_QUERY_LENGTH = 120;
const MAX_PER_PAGE = 80;

const ALLOWED_TYPES = new Set(["images", "videos"]);
const ALLOWED_ORIENTATIONS = new Set(["landscape", "portrait", "square"]);
const ALLOWED_VIDEO_SIZES = new Set(["large", "medium", "small"]);

function clampPerPage(value: string | null): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) {
    return 30;
  }
  return Math.min(Math.max(parsed, 1), MAX_PER_PAGE);
}

function optionalAllowlistedValue(value: string | null, allowed: Set<string>): string | null {
  if (!value) {
    return null;
  }
  return allowed.has(value) ? value : null;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Pexels search is not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  if (!type || !ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid Pexels search type" }, { status: 400 });
  }

  const query = (searchParams.get("query") || "").trim();
  if (!query) {
    return NextResponse.json({ error: "Missing Pexels search query" }, { status: 400 });
  }

  const upstreamParams = new URLSearchParams({
    query: query.slice(0, MAX_QUERY_LENGTH),
    per_page: String(clampPerPage(searchParams.get("per_page"))),
  });

  const orientation = optionalAllowlistedValue(searchParams.get("orientation"), ALLOWED_ORIENTATIONS);
  if (orientation) {
    upstreamParams.set("orientation", orientation);
  }

  if (type === "videos") {
    const size = optionalAllowlistedValue(searchParams.get("size"), ALLOWED_VIDEO_SIZES);
    if (size) {
      upstreamParams.set("size", size);
    }
  }

  const upstreamUrl = `${type === "videos" ? PEXELS_VIDEO_SEARCH_URL : PEXELS_IMAGE_SEARCH_URL}?${upstreamParams}`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
        Authorization: apiKey,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!upstreamResponse.ok) {
      return NextResponse.json({ error: "Pexels search failed" }, { status: 502 });
    }

    return NextResponse.json(await upstreamResponse.json(), {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Pexels search proxy failed:", error);
    return NextResponse.json({ error: "Pexels search failed" }, { status: 502 });
  }
}