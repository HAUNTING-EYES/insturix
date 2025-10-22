import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { SocializeGCSManager } from "@/lib/socialize-gcs";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { url } = await request.json();
        if (!url) {
            return NextResponse.json({ error: "URL is required" }, { status: 400 });
        }

        // Check if it's a GCS URL
        if (!url.includes('storage.googleapis.com')) {
            return NextResponse.json({ error: "Not a GCS URL" }, { status: 400 });
        }

        try {
            const newSignedUrl = await SocializeGCSManager.getSignedUrl(url, 24);
            return NextResponse.json({ newUrl: newSignedUrl });
        } catch (error) {
            console.error("Failed to refresh signed URL:", error);
            return NextResponse.json({ error: "Failed to refresh signed URL" }, { status: 500 });
        }
    } catch (error) {
        console.error("Refresh signed URL failed:", error);
        return NextResponse.json({ error: "Failed to refresh signed URL" }, { status: 500 });
    }
}

