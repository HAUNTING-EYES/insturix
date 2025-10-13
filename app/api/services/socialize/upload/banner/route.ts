import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { SocializeGCSManager } from "@/lib/socialize-gcs";
import { join } from "path";
import * as fs from "fs";

// Force Node.js runtime (Edge can't use fs/Buffer reliably for multipart)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const isConfigured = SocializeGCSManager.isConfigured();
        return NextResponse.json({
            configured: isConfigured,
            message: isConfigured ? "GCS is properly configured" : "GCS is not configured - check environment variables"
        });
    } catch (error) {
        console.error("GCS configuration check failed:", error);
        return NextResponse.json({
            configured: false,
            error: "Failed to check GCS configuration"
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const formData = await request.formData();
        const file = formData.get("banner") as File | null;
        if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

        if (!file.type.startsWith("image/")) {
            return NextResponse.json({ error: "File must be an image" }, { status: 400 });
        }
        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: "File size must be less than 5MB" }, { status: 400 });
        }
        const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"];
        if (!allowed.includes(file.type)) {
            return NextResponse.json({ error: "Unsupported image format. Use JPG, PNG, WebP, or SVG." }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // If GCS not configured, fail fast
        if (!SocializeGCSManager.isConfigured()) {
            return NextResponse.json({ error: "Google Cloud Storage is not configured" }, { status: 500 });
        }

        try {
            const uploadResult = await SocializeGCSManager.uploadBannerImage(
                userId,
                buffer,
                file.type,
                file.name
            );

            // Generate a signed URL for immediate display
            const signedUrl = await SocializeGCSManager.generateSignedUrl(uploadResult.gcsPath, 24);

            return NextResponse.json({
                success: true,
                gcsPath: uploadResult.gcsPath,
                publicUrl: uploadResult.publicUrl,
                signedUrl: signedUrl
            });
        } catch (e) {
            console.error("GCS upload failed:", e);
            return NextResponse.json({ error: "Failed to upload banner image to GCS" }, { status: 500 });
        }
    } catch (error) {
        console.error("Banner upload failed:", error);
        return NextResponse.json({ error: "Failed to upload banner image" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const gcsUrl = searchParams.get("url");
        if (!gcsUrl) return NextResponse.json({ error: "GCS URL required" }, { status: 400 });

        if (!gcsUrl.includes(`user_${userId}`)) {
            return NextResponse.json({ error: "Unauthorized to delete this file" }, { status: 403 });
        }
        if (!SocializeGCSManager.isConfigured()) {
            return NextResponse.json({ error: "Google Cloud Storage is not configured" }, { status: 500 });
        }

        await SocializeGCSManager.deleteBannerImage(gcsUrl);
        return NextResponse.json({ success: true, message: "Banner image deleted" });
    } catch (error) {
        console.error("Banner deletion failed:", error);
        return NextResponse.json({ error: "Failed to delete banner image" }, { status: 500 });
    }
}


