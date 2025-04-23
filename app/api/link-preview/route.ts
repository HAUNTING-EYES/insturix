import { type NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "URL parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Validate URL format
    new URL(url);

    // Fetch the webpage content
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SocializeLinkPreview/1.0)",
      },
      timeout: 5000, // 5 second timeout
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    const html = response.data;
    const $ = cheerio.load(html);

    // Extract metadata
    const title =
      $("title").text() || $('meta[property="og:title"]').attr("content") || "";
    const description =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      "";

    // Try to get image from OpenGraph tags first, then other common image sources
    let image =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[property="twitter:image"]').attr("content");

    // If no OG image, try to find the first significant image
    if (!image) {
      $("img").each((_, img) => {
        const src = $(img).attr("src");
        const width = Number.parseInt($(img).attr("width") || "0");
        const height = Number.parseInt($(img).attr("height") || "0");

        // Only consider images that are likely to be content (not icons)
        if (src && (width > 100 || height > 100 || !width || !height)) {
          // Convert relative URLs to absolute
          if (src.startsWith("/")) {
            const baseUrl = new URL(url);
            image = `${baseUrl.origin}${src}`;
          } else if (!src.startsWith("http")) {
            image = new URL(src, url).href;
          } else {
            image = src;
          }
          return false; // Break the loop after finding the first suitable image
        }
      });
    }

    // Return the metadata
    return NextResponse.json({
      title,
      description,
      image,
      url,
    });
  } catch (error) {
    console.error("Error fetching link preview:", error);
    return NextResponse.json(
      {
        error: "Failed to generate link preview",
        title: "Preview not available",
        description: "Could not load preview for this link",
        image: null,
      },
      { status: 200 } // Still return 200 to handle gracefully on the client
    );
  }
}
